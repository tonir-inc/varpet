import type * as THREE from 'three';

/**
 * Game-engine style frame profiler (`?profile`, or the backquote key): frame interval, CPU update and
 * submit, per-pass CPU and GPU time (EXT_disjoint_timer_query_webgl2), draw counters, input-to-frame
 * latency, long tasks and a hitch log whose tags say what the frame was doing. Absent unless enabled.
 * CPU zones also go to the Performance panel as `varpet …` measures.
 */

interface FrameRecord {
  id: number; start: number; interval: number; update: number; submit: number;
  cpu: Record<string, number>; gpu: Record<string, number>; gpuPending: number; gpuLost: boolean;
  draws: number; triangles: number; programs: number; textures: number; geometries: number;
  input?: number; tags: string[];
}
interface Hitch { at: number; ms: number; cpu: number; gpu?: number; tags: string[] }
interface Segment { label: string; started: number; children: number }
type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
interface Bench { config: string; avg?: number; p95?: number; cpu?: number; frames: number }
/** What the viewport lets the profiler switch, console-variable style. */
export interface ProfilerControls {
  scale(): number; pixelRatio(): number; setScale(scale: number): void;
  debug(): { ao: boolean; smaa: boolean };
  setDebug(options: { ao?: boolean; smaa?: boolean }): void;
  benchmark(): Promise<void>;
}

const RING = 300;
const IDLE_MS = 1000;
const nf = (value: number | undefined, digits = 1) => value === undefined || !Number.isFinite(value) ? '–' : value.toFixed(digits);
function quantile(values: number[], q: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export class FrameProfiler {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly timer: TimerExtension | null;
  private readonly frames: FrameRecord[] = [];
  private readonly hitches: Hitch[] = [];
  private readonly pending: { query: WebGLQuery; frame: FrameRecord; label: string; issued: number }[] = [];
  private readonly spare: WebGLQuery[] = [];
  private readonly stack: Segment[] = [];
  private readonly inputs: number[] = [];
  private frame: FrameRecord | null = null;
  private frameId = 0;
  private lastStart = 0;
  private submitStarted = 0;
  private activeQuery: WebGLQuery | null = null;
  private tagsBefore: string[] = [];
  private previousPrograms = 0;
  private previousTextures = 0;
  private previousGeometries = 0;
  private paused = false;
  private nextExpected = false;
  private lastHadInput = false;
  private readonly benches: Bench[] = [];
  private readonly switches?: HTMLDivElement;
  private lastText = 0;
  private readonly autoReset: boolean;
  private readonly shadowRender: THREE.WebGLShadowMap['render'];
  private readonly observer?: PerformanceObserver;
  private readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly graph: HTMLCanvasElement;
  private readonly gpuName: string;

  constructor(private readonly renderer: THREE.WebGLRenderer, container: HTMLElement, private readonly onClose: () => void, private readonly controls?: ProfilerControls) {
    const context = renderer.getContext();
    this.gl = typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext ? context : null;
    this.timer = (this.gl?.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null) ?? null;
    const debug = this.gl?.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = debug && this.gl ? String(this.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown GPU';
    this.autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    // Shadow maps render inside the scene pass; time them as their own zone and tag real updates.
    const shadowMap = renderer.shadowMap;
    this.shadowRender = shadowMap.render;
    shadowMap.render = (lights, scene, camera) => {
      if (shadowMap.enabled && (shadowMap.autoUpdate || shadowMap.needsUpdate)
        && lights.some(light => { const shadow = (light as THREE.Light & { shadow?: THREE.LightShadow }).shadow; return light.castShadow && !!shadow && (shadow.autoUpdate || shadow.needsUpdate); })) this.tag('shadow map');
      this.begin('shadows');
      try { this.shadowRender.call(shadowMap, lights, scene, camera); } finally { this.end(); }
    };
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      this.observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) this.pushHitch({ at: entry.startTime, ms: entry.duration, cpu: entry.duration, tags: ['long task'] });
      });
      this.observer.observe({ type: 'longtask' });
    }
    this.root = document.createElement('div');
    this.root.className = 'frame-profiler';
    this.root.style.cssText = 'position:absolute;left:12px;top:64px;z-index:40;pointer-events:none;background:rgba(12,16,20,.86);color:#d8e2e8;'
      + 'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;padding:8px 10px;border-radius:6px;min-width:300px;max-width:420px';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px;pointer-events:auto';
    const title = document.createElement('strong'); title.textContent = 'Frame profiler'; title.style.flex = '1';
    const button = (label: string, action: (element: HTMLButtonElement) => void) => {
      const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
      element.style.cssText = 'font:inherit;color:inherit;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:4px;padding:1px 6px;cursor:pointer';
      element.onclick = () => action(element); return element;
    };
    bar.append(title,
      button('Pause', element => { this.paused = !this.paused; element.textContent = this.paused ? 'Resume' : 'Pause'; }),
      button('Copy JSON', element => { void navigator.clipboard?.writeText(JSON.stringify(this.report(), null, 1)).then(() => { element.textContent = 'Copied'; setTimeout(() => { element.textContent = 'Copy JSON'; }, 1200); }); }),
      button('Reset', () => { this.frames.length = 0; this.hitches.length = 0; }),
      button('×', () => this.onClose()));
    this.graph = document.createElement('canvas');
    this.graph.width = 400; this.graph.height = 84; this.graph.style.cssText = 'display:block;width:100%;height:84px;margin:4px 0';
    this.text = document.createElement('pre'); this.text.style.cssText = 'margin:0;white-space:pre-wrap';
    this.root.append(bar);
    if (controls) {
      this.switches = document.createElement('div');
      this.switches.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 4px;pointer-events:auto';
      this.root.append(this.switches); this.renderSwitches();
    }
    this.root.append(this.graph, this.text);
    container.append(this.root);
    for (const type of ['pointermove', 'wheel', 'keydown'] as const) window.addEventListener(type, this.onInput, { capture: true, passive: true });
    // Scripted A/B runs (Playwright) drive the same switches and bench as the HUD.
    (globalThis as { __varpetProfiler?: FrameProfiler }).__varpetProfiler = this;
  }

  /** The viewport's switches, for scripted runs. */
  get switchboard(): ProfilerControls | undefined { return this.controls; }

  private renderSwitches(): void {
    const controls = this.controls, box = this.switches; if (!controls || !box) return;
    const state = controls.debug(), scale = controls.scale();
    const chip = (label: string, active: boolean, action: () => void) => {
      const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
      element.style.cssText = `font:inherit;color:inherit;border-radius:4px;padding:1px 5px;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:${active ? 'rgba(90,169,230,.45)' : 'rgba(255,255,255,.06)'}`;
      element.onclick = () => { action(); this.renderSwitches(); }; return element;
    };
    box.replaceChildren(
      ...[0.5, 0.67, 1].map(value => chip(`${Math.round(value * 100)}%`, Math.abs(scale - value) < 0.01, () => controls.setScale(value))),
      chip('AO', state.ao, () => controls.setDebug({ ao: !state.ao })),
      chip('SMAA', state.smaa, () => controls.setDebug({ smaa: !state.smaa })),
      chip('Bench 360°', false, () => { void this.bench(); }),
    );
  }

  private config(): string {
    const controls = this.controls; if (!controls) return '';
    const state = controls.debug();
    return `${Math.round(controls.scale() * 100)}% (px ${controls.pixelRatio().toFixed(2)}, ${this.renderer.domElement.width}x${this.renderer.domElement.height})${state.ao ? ' AO' : ''}${state.smaa ? ' SMAA' : ''}`;
  }

  /** Orbit once around the flat and record frame spacing: the honest GPU number when timer queries queue. */
  async bench(): Promise<Bench | undefined> {
    if (!this.controls) return undefined;
    const first = this.frameId + 3, config = this.config();
    await this.controls.benchmark();
    const frames = this.frames.filter(frame => frame.id >= first);
    const intervals = frames.map(frame => frame.interval).filter(Number.isFinite);
    this.benches.push({ config, frames: intervals.length, avg: intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : undefined,
      p95: quantile(intervals, 0.95), cpu: quantile(frames.map(frame => frame.update + frame.submit), 0.5) });
    if (this.benches.length > 8) this.benches.shift();
    this.text.textContent = this.summary();
    return this.benches[this.benches.length - 1];
  }

  /** The viewport asks for another frame (animation, benchmark): the next interval is real frame time, not idle. */
  expectNext(): void { this.nextExpected = true; }

  private onInput = (event: Event): void => {
    if (event instanceof PointerEvent && event.type === 'pointermove' && !event.buttons) return;
    this.inputs.push(event.timeStamp);
  };

  /** Start of a requestAnimationFrame callback. */
  beginFrame(now: number): void {
    this.poll();
    if (this.frame) this.endFrame();
    // Only back-to-back frames measure frame time: an animation that asked for more, or input on both frames.
    // The first frame of a drag otherwise reports the idle gap before it as a hitch.
    const continued = this.nextExpected || (this.inputs.length > 0 && this.lastHadInput);
    const interval = continued && this.lastStart && now - this.lastStart < IDLE_MS ? now - this.lastStart : NaN;
    this.lastStart = now; this.nextExpected = false; this.lastHadInput = this.inputs.length > 0;
    this.frame = { id: ++this.frameId, start: now, interval, update: 0, submit: 0, cpu: {}, gpu: {}, gpuPending: 0, gpuLost: false,
      draws: 0, triangles: 0, programs: 0, textures: 0, geometries: 0, tags: this.tagsBefore, ...(this.inputs.length ? { input: now - Math.min(...this.inputs) } : {}) };
    this.tagsBefore = []; this.inputs.length = 0;
  }

  /** What the frame is doing; tags before a frame starts attach to the next frame. */
  tag(label: string): void {
    const tags = this.frame?.tags ?? this.tagsBefore;
    if (!tags.includes(label)) tags.push(label);
  }

  beginSubmit(): void {
    if (!this.frame) return;
    this.submitStarted = performance.now();
    this.frame.update = this.submitStarted - this.frame.start;
    this.renderer.info.reset();
    this.begin('submit');
  }

  endSubmit(): void {
    const frame = this.frame; if (!frame) return;
    this.end();
    frame.submit = performance.now() - this.submitStarted;
    const info = this.renderer.info;
    frame.draws = info.render.calls; frame.triangles = info.render.triangles;
    frame.programs = info.programs?.length ?? 0; frame.textures = info.memory.textures; frame.geometries = info.memory.geometries;
    if (this.previousPrograms && frame.programs > this.previousPrograms) this.tag('shader compile');
    if (this.previousTextures && frame.textures > this.previousTextures) this.tag('texture upload');
    if (this.previousGeometries && frame.geometries > this.previousGeometries) this.tag('geometry upload');
    this.previousPrograms = frame.programs; this.previousTextures = frame.textures; this.previousGeometries = frame.geometries;
    performance.measure('varpet update', { start: frame.start, end: this.submitStarted });
    performance.measure('varpet submit', { start: this.submitStarted, end: this.submitStarted + frame.submit });
    this.endFrame();
  }

  /** A timed zone. GPU queries cannot nest, so a child closes its parent's query and the parent resumes after it. */
  begin(label: string): void {
    if (!this.frame) return;
    const now = performance.now();
    this.stack.push({ label, started: now, children: 0 });
    this.startQuery(label);
  }

  end(): void {
    const frame = this.frame; const segment = this.stack.pop();
    if (!frame || !segment) return;
    const now = performance.now(); const elapsed = now - segment.started;
    // Exclusive CPU time: a pass minus the zones nested inside it (the scene pass minus shadows).
    if (segment.label !== 'submit') frame.cpu[segment.label] = (frame.cpu[segment.label] ?? 0) + elapsed - segment.children;
    const parent = this.stack[this.stack.length - 1];
    if (parent) parent.children += elapsed;
    this.stopQuery();
    if (parent) this.startQuery(parent.label);
  }

  /** Wrap render passes (EffectComposer passes) so each one is a zone; returns the undo. */
  wrapPasses(passes: { pass: { render: (...args: never[]) => void }; label: string }[]): () => void {
    const originals = passes.map(({ pass, label }) => {
      const own = Object.prototype.hasOwnProperty.call(pass, 'render'), original = pass.render;
      pass.render = ((...args: never[]) => { this.begin(label); try { original.apply(pass, args); } finally { this.end(); } }) as typeof pass.render;
      return { pass, own, original };
    });
    return () => {
      for (const { pass, own, original } of originals) {
        if (own) pass.render = original; else delete (pass as { render?: unknown }).render;
      }
    };
  }

  private startQuery(label: string): void {
    const gl = this.gl, timer = this.timer, frame = this.frame;
    if (!gl || !timer || !frame) return;
    this.stopQuery();
    const query = this.spare.pop() ?? gl.createQuery();
    if (!query) return;
    gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    this.activeQuery = query;
    this.pending.push({ query, frame, label: label === 'submit' ? 'other' : label, issued: this.frameId });
    frame.gpuPending++;
  }

  private stopQuery(): void {
    if (!this.gl || !this.timer || !this.activeQuery) return;
    this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
    this.activeQuery = null;
  }

  /** Collect finished GPU timings; results arrive one to three frames late. */
  private poll(): void {
    const gl = this.gl, timer = this.timer;
    if (!gl || !timer || !this.pending.length) return;
    const disjoint = Boolean(gl.getParameter(timer.GPU_DISJOINT_EXT));
    for (let i = 0; i < this.pending.length;) {
      const item = this.pending[i]!;
      if (item.query === this.activeQuery) { i++; continue; }
      const ready = gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE);
      const stale = this.frameId - item.issued > 12;
      if (!ready && !stale) { i++; continue; }
      if (ready && !disjoint) item.frame.gpu[item.label] = (item.frame.gpu[item.label] ?? 0) + gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6;
      else item.frame.gpuLost = true;
      item.frame.gpuPending--;
      this.spare.push(item.query); this.pending.splice(i, 1);
    }
  }

  private endFrame(): void {
    const frame = this.frame; if (!frame) return;
    while (this.stack.length) this.end();
    this.stopQuery();
    this.frame = null;
    if (this.paused) return;
    this.frames.push(frame); if (this.frames.length > RING) this.frames.shift();
    this.drawGraph();
    if (performance.now() - this.lastText > 250) { this.lastText = performance.now(); this.text.textContent = this.summary(); }
    if (this.frames.length % 300 === 0) performance.clearMeasures();
  }

  private refresh(): number {
    const intervals = this.frames.map(frame => frame.interval).filter(Number.isFinite);
    const median = quantile(intervals, 0.5) ?? 16.7;
    // The display period is the shortest steady interval, not the median of a struggling frame loop.
    const period = quantile(intervals, 0.1) ?? median;
    return period < 7.5 ? 1000 / 144 : period < 10 ? 1000 / 120 : period < 14 ? 1000 / 90 : 1000 / 60;
  }

  private gpuTotal(frame: FrameRecord): number | undefined {
    if (!this.timer || frame.gpuPending > 0 || frame.gpuLost) return undefined;
    return Object.values(frame.gpu).reduce((sum, value) => sum + value, 0);
  }

  private pushHitch(hitch: Hitch): void {
    this.hitches.push(hitch); if (this.hitches.length > 40) this.hitches.shift();
  }

  private drawGraph(): void {
    const context = this.graph.getContext('2d'); if (!context) return;
    const { width, height } = this.graph; const scale = height / 50;
    context.clearRect(0, 0, width, height);
    const frames = this.frames.slice(-200); const step = width / 200;
    const period = this.refresh();
    frames.forEach((frame, index) => {
      const x = index * step;
      const hitch = frame.interval > period * 2.5 || frame.update + frame.submit > period * 2;
      context.fillStyle = '#5aa9e6'; context.fillRect(x, height - frame.update * scale, step - 0.5, frame.update * scale);
      context.fillStyle = hitch ? '#ff6b5a' : '#f2a65a';
      context.fillRect(x, height - (frame.update + frame.submit) * scale, step - 0.5, frame.submit * scale);
      const gpu = this.gpuTotal(frame);
      if (gpu !== undefined) { context.fillStyle = '#7ee08a'; context.fillRect(x, height - gpu * scale - 1, step - 0.5, 2); }
      if (Number.isFinite(frame.interval)) { context.fillStyle = '#ffffff'; context.fillRect(x, height - Math.min(50, frame.interval) * scale, step - 0.5, 1); }
    });
    context.font = '9px ui-monospace, monospace';
    for (const [ms, label] of [[1000 / 120, '120'], [1000 / 60, '60'], [1000 / 30, '30 fps']] as const) {
      const y = height - ms * scale;
      context.strokeStyle = 'rgba(255,255,255,.25)'; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      context.fillStyle = 'rgba(255,255,255,.55)'; context.fillText(label, width - 34, y - 2);
    }
  }

  private stats() {
    const frames = this.frames;
    const period = this.refresh();
    const intervals = frames.map(frame => frame.interval).filter(Number.isFinite);
    const recent = frames.slice(-60);
    const gpuFrames = frames.filter(frame => this.gpuTotal(frame) !== undefined).slice(-60);
    const gpuPasses: Record<string, number> = {};
    for (const frame of gpuFrames) for (const [label, ms] of Object.entries(frame.gpu)) gpuPasses[label] = (gpuPasses[label] ?? 0) + ms / gpuFrames.length;
    const cpuPasses: Record<string, number> = {};
    for (const frame of recent) for (const [label, ms] of Object.entries(frame.cpu)) cpuPasses[label] = (cpuPasses[label] ?? 0) + ms / recent.length;
    const last = frames[frames.length - 1];
    // Frames over budget with what they were doing: this answers "sometimes".
    const slow = frames.filter(frame => frame.interval > period * 2.5 || frame.update + frame.submit > period * 2)
      .map(frame => ({ at: frame.start, ms: Number.isFinite(frame.interval) ? frame.interval : frame.update + frame.submit, cpu: frame.update + frame.submit, gpu: this.gpuTotal(frame), tags: frame.tags }));
    const hitches = [...slow, ...this.hitches].sort((a, b) => a.at - b.at).slice(-8);
    return {
      refreshHz: Math.round(1000 / period), fps: intervals.length ? 1000 / (intervals.slice(-60).reduce((a, b) => a + b, 0) / Math.min(60, intervals.length)) : undefined,
      lowFps1: intervals.length ? 1000 / quantile(intervals, 0.99)! : undefined,
      interval: { p50: quantile(intervals, 0.5), p95: quantile(intervals, 0.95), p99: quantile(intervals, 0.99), max: quantile(intervals, 1) },
      update: { p50: quantile(frames.map(frame => frame.update), 0.5), p95: quantile(frames.map(frame => frame.update), 0.95) },
      submit: { p50: quantile(frames.map(frame => frame.submit), 0.5), p95: quantile(frames.map(frame => frame.submit), 0.95), max: quantile(frames.map(frame => frame.submit), 1) },
      gpu: this.timer ? { p50: quantile(gpuFrames.map(frame => this.gpuTotal(frame)!), 0.5), p95: quantile(gpuFrames.map(frame => this.gpuTotal(frame)!), 0.95), passes: gpuPasses } : null,
      cpuPasses,
      gpuBound: quantile(intervals, 0.5) !== undefined ? Math.max(0, quantile(intervals, 0.5)! - (quantile(frames.map(frame => frame.update + frame.submit), 0.5) ?? 0)) : undefined,
      benches: this.benches,
      input: { p50: quantile(frames.flatMap(frame => frame.input ?? []), 0.5), max: quantile(frames.flatMap(frame => frame.input ?? []), 1) },
      counters: last ? { draws: last.draws, triangles: last.triangles, programs: last.programs, textures: last.textures, geometries: last.geometries } : null,
      hitches, frames: frames.length,
    };
  }

  private summary(): string {
    const s = this.stats(); const now = performance.now();
    // Timer queries on ANGLE/Metal include queueing, so absolute GPU ms overstate; the split between passes holds.
    const shares = (record: Record<string, number>) => {
      const total = Object.values(record).reduce((sum, value) => sum + value, 0);
      return total ? Object.entries(record).filter(([, ms]) => ms > 0).sort((a, b) => b[1] - a[1]).map(([label, ms]) => `${label} ${Math.round(ms / total * 100)}%`).join(' · ') : '–';
    };
    const passes = (record: Record<string, number>) => Object.entries(record).sort((a, b) => b[1] - a[1]).map(([label, ms]) => `${label} ${nf(ms)}`).join(' · ');
    const lines = [
      `FPS ${nf(s.fps, 0)}  1% low ${nf(s.lowFps1, 0)}  display ${s.refreshHz} Hz  (${s.frames} frames)`,
      `frame  p50 ${nf(s.interval.p50)}  p95 ${nf(s.interval.p95)}  p99 ${nf(s.interval.p99)}  max ${nf(s.interval.max)} ms`,
      `CPU    update ${nf(s.update.p50)} (p95 ${nf(s.update.p95)})  submit ${nf(s.submit.p50)} (p95 ${nf(s.submit.p95)}, max ${nf(s.submit.max)}) ms`,
      `  cpu  ${passes(s.cpuPasses)}`,
      `GPU    ~${nf(s.gpuBound)} ms per frame beyond the CPU (frame p50 − CPU p50)`,
      s.gpu ? `  gpu share  ${shares(s.gpu.passes)}` : '  gpu share  timer query unavailable',
      s.counters ? `draws ${s.counters.draws}  tris ${(s.counters.triangles / 1000).toFixed(0)}k  programs ${s.counters.programs}  textures ${s.counters.textures}  geometries ${s.counters.geometries}` : '',
      `input→frame  p50 ${nf(s.input.p50)}  max ${nf(s.input.max)} ms`,
      ...(s.benches.length ? ['bench (avg / p95 frame, CPU):', ...s.benches.map(bench => `  ${nf(bench.avg)} / ${nf(bench.p95)} ms, cpu ${nf(bench.cpu)}  ${bench.config}`)] : []),
      s.hitches.length ? 'hitches:' : 'no hitches',
      ...s.hitches.map(hitch => `  -${nf((now - hitch.at) / 1000)}s  ${nf(hitch.ms, 0)} ms (cpu ${nf(hitch.cpu, 0)}${hitch.gpu !== undefined ? `, gpu ${nf(hitch.gpu, 0)}` : ''})  ${hitch.tags.join(', ') || '–'}`),
    ];
    return lines.join('\n');
  }

  report(): unknown {
    const canvas = this.renderer.domElement;
    return {
      at: new Date().toISOString(), gpu: this.gpuName, pixelRatio: this.renderer.getPixelRatio(), config: this.config(),
      note: 'gpu ms come from timer queries, which on ANGLE/Metal include queueing: compare shares and bench frame times, not absolute gpu ms',
      canvas: [canvas.width, canvas.height], devicePixelRatio: window.devicePixelRatio, stats: this.stats(),
      frames: this.frames.map(frame => ({ ...frame, gpuTotal: this.gpuTotal(frame) })),
    };
  }

  dispose(): void {
    this.stopQuery();
    for (const item of this.pending) this.gl?.deleteQuery(item.query);
    for (const query of this.spare) this.gl?.deleteQuery(query);
    this.pending.length = 0; this.spare.length = 0;
    this.renderer.shadowMap.render = this.shadowRender;
    this.renderer.info.autoReset = this.autoReset;
    this.observer?.disconnect();
    for (const type of ['pointermove', 'wheel', 'keydown'] as const) window.removeEventListener(type, this.onInput, { capture: true });
    this.root.remove();
    const global = globalThis as { __varpetProfiler?: FrameProfiler };
    if (global.__varpetProfiler === this) delete global.__varpetProfiler;
    performance.clearMeasures('varpet update'); performance.clearMeasures('varpet submit');
  }
}

/** `?profile` opens the profiler on load; the backquote key toggles it. */
export function profilerRequested(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('profile');
}
