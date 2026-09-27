import * as THREE from 'three';
import type { CatalogAsset, SceneDocument } from '../contracts';
import { makeStructure } from '../render/structure';
import { AssetLoader, disposeObject, lightModelUrl, makeFurniture, poseWallDecoration } from '../render/assets';

/** Event-driven 3D view, with no editor controls or scene mutations. */
export function renderApartmentPreview(host: HTMLElement, document: SceneDocument): () => void {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.setClearColor(0, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {display:'block', width:'100%', height:'100%'});
  host.append(canvas);
  const scene = new THREE.Scene();
  const model = makeStructure(document);
  model.ceilings.visible = false;
  model.dimensions.visible = false;
  scene.add(model.group);
  scene.add(new THREE.HemisphereLight('#ffffff', '#8f93a6', 2));
  const light = new THREE.DirectionalLight('#fff1dc', 3);
  light.position.set(-5, 12, 6);
  scene.add(light);
  const bounds = model.bounds;
  const center = bounds.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 200);
  camera.position.copy(center).add(new THREE.Vector3(14, 19, 17));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  model.updateWalls(camera, 'cutaway', false, performance.now(), true);
  let left=Infinity, right=-Infinity, bottom=Infinity, top=-Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);
    left=Math.min(left,p.x);right=Math.max(right,p.x);bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);
  }
  function render() {
    const width=host.clientWidth, height=host.clientHeight;
    if (!width || !height) return;
    const aspect=width/height, span=Math.max((top-bottom)*1.1, (right-left)*1.1/aspect);
    const cx=(left+right)/2, cy=(bottom+top)/2;
    camera.left=cx-span*aspect/2;camera.right=cx+span*aspect/2;
    camera.top=cy+span/2;camera.bottom=cy-span/2;
    camera.updateProjectionMatrix();renderer.setSize(width,height,false);renderer.render(scene,camera);
  }
  const observer = new ResizeObserver(render);
  observer.observe(host);
  render();
  return () => {observer.disconnect();disposeObject(model.group);renderer.dispose();renderer.forceContextLoss();canvas.remove();};
}

/* ---------------------------------------------------------------------------------------------
 * Furnished previews for catalog cards: many cards, one WebGL context.
 *
 * Each card owns a THREE.Scene and a plain 2D canvas. A single shared renderer draws a card's scene
 * into the corner of its own buffer and the pixels are copied to the card straight away, so the page
 * never holds more than one GL context however many cards are shown. A card whose scene is released
 * (off screen, or over the live-scene cap) keeps its last frame and is rebuilt when it is needed again.
 * ------------------------------------------------------------------------------------------- */

export interface FurnishedPreview {
  /** Hover or focus: a slow orbit. */
  setActive(active: boolean): void;
  /** In view: keep a live scene. Out of view: the scene may be released; the last frame stays. */
  setVisible(visible: boolean): void;
  /** The 2D canvas holding the card's current frame (for hand-off transitions). */
  readonly canvas: HTMLCanvasElement;
  /** Resolves after the first frame (walls and stand-in furniture) is drawn. */
  readonly ready: Promise<void>;
  dispose(): void;
}

export interface FurnishedPreviewOptions {
  /** Raise the model out of its plan the first time it is drawn. */
  rise?: boolean;
  reducedMotion?: () => boolean;
  /** A real furniture model replaced its stand-in. */
  onModel?(): void;
}

/** Scenes kept on the GPU at once; the rest keep their last frame. */
export const MAX_LIVE_PREVIEW_SCENES = 6;
const MAX_BUFFER = 2048;
const ORBIT_PERIOD_MS = 36000;
const RISE_MS = 1300;

interface Shared { renderer: THREE.WebGLRenderer; loader: AssetLoader; width: number; height: number }
let shared: Shared | null = null;
let sharedUsers = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
/** Light model copies come from the editor server's relay. When it is unreachable, previews keep their stand-ins. */
const modelHost = { ok: 0, failed: 0 };
const modelHostDown = () => modelHost.failed >= 2 && !modelHost.ok;
/** At most two model downloads at once: a slow relay must not hold every connection the page needs. */
const modelQueue: Array<() => Promise<void>> = [];
let modelsLoading = 0;
function queueModel(job: () => Promise<void>): void {
  modelQueue.push(job);
  pumpModels();
}
function pumpModels(): void {
  while (modelsLoading < 2 && modelQueue.length) {
    const job = modelQueue.shift()!;
    modelsLoading++;
    void job().finally(() => { modelsLoading--; pumpModels(); });
  }
}

function acquireShared(): Shared {
  clearTimeout(releaseTimer);
  sharedUsers++;
  if (shared) return shared;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0, 0);
  renderer.setScissorTest(true);
  shared = { renderer, loader: new AssetLoader(48), width: 0, height: 0 };
  return shared;
}
function releaseShared(): void {
  sharedUsers = Math.max(0, sharedUsers - 1);
  if (sharedUsers || !shared) return;
  // A page switching filters releases and re-acquires within a frame; keep the context briefly.
  releaseTimer = setTimeout(() => {
    if (sharedUsers || !shared) return;
    shared.loader.dispose(); shared.renderer.dispose(); shared.renderer.forceContextLoss(); shared = null;
  }, 1500);
}

/** Only a same-origin model is fetched for a card: the relay's light copy of an ABO original, or a site-served file. */
export function previewModelUrl(url: string): string | null {
  const [path = '', fragment] = url.split('#');
  const light = lightModelUrl(path);
  const chosen = light ?? (path.startsWith('/') && !path.startsWith('//') ? path : null);
  return chosen ? chosen + (fragment ? `#${fragment}` : '') : null;
}

interface Card { live(): boolean; visible(): boolean; active(): boolean; seen(): number; release(): void; step(now: number): boolean }
const cards = new Set<Card>();
let frame = 0;
function schedule(): void { if (!frame) frame = requestAnimationFrame(tick); }
function tick(now: number): void {
  frame = 0;
  let again = false;
  for (const card of cards) if (card.step(now)) again = true;
  if (again) schedule();
}
function enforceLiveCap(keep: Card): void {
  const live = [...cards].filter(card => card.live() && card !== keep);
  if (live.length < MAX_LIVE_PREVIEW_SCENES) return;
  // Hidden cards go first, least recently seen first; an active card is never released.
  live.sort((a, b) => Number(a.visible()) - Number(b.visible()) || a.seen() - b.seen());
  for (const card of live) {
    if (live.filter(item => item.live()).length < MAX_LIVE_PREVIEW_SCENES) break;
    if (!card.active()) card.release();
  }
}

function createCard(host: HTMLElement, document: SceneDocument, catalog: readonly CatalogAsset[], options: FurnishedPreviewOptions): FurnishedPreview {
  const canvas = window.document.createElement('canvas');
  canvas.className = 'furnished-preview-frame';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
  host.append(canvas);
  const context = canvas.getContext('2d')!;
  const assets = new Map(catalog.map(asset => [asset.id, asset]));
  const reduced = () => options.reducedMotion?.() ?? matchMedia('(prefers-reduced-motion: reduce)').matches;

  let gpu: { scene: THREE.Scene; model: ReturnType<typeof makeStructure>; root: THREE.Group; token: object } | null = null;
  let camera: THREE.OrthographicCamera | null = null;
  let fit: { span: number; aspectSpan: number } | null = null;
  let center = new THREE.Vector3();
  let angle = 0, speed = 0, lastTime = 0;
  let riseStart = options.rise ? -1 : Infinity;
  let isActive = false, isVisible = false, seenAt = 0, dirty = true, disposed = false, drawn = false, wallsMoving = false;
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });

  const base = Math.atan2(17, 14), radius = Math.hypot(14, 17), height = 19;
  function place(target: THREE.OrthographicCamera, at: number): void {
    target.position.set(center.x + Math.cos(base + at) * radius, center.y + height, center.z + Math.sin(base + at) * radius);
    target.lookAt(center); target.updateMatrixWorld();
  }

  function build(): void {
    if (gpu || disposed) return;
    enforceLiveCap(api);
    const scene = new THREE.Scene();
    const model = makeStructure(document);
    model.ceilings.visible = false; model.dimensions.visible = false;
    const root = new THREE.Group();
    root.add(model.group);
    const furniture = new THREE.Group();
    root.add(furniture);
    scene.add(root);
    scene.add(new THREE.HemisphereLight('#ffffff', '#8f93a6', 2));
    const sun = new THREE.DirectionalLight('#fff1dc', 3);
    sun.position.set(-5, 12, 6); scene.add(sun);
    const token = {};
    gpu = { scene, model, root, token };
    for (const object of document.objects) {
      const asset = assets.get(object.assetId);
      if (!asset) continue;
      const holder = new THREE.Group();
      holder.position.fromArray(object.position); holder.rotation.set(0, object.rotation, 0); holder.scale.fromArray(object.scale);
      // A drawn stand-in of the right kind and size first; the catalog model replaces it when it arrives.
      const standIn = makeFurniture(asset.source.type === 'gltf' ? { ...asset, source: { type: 'procedural' } } : asset, object.color ?? asset.color);
      poseWallDecoration(standIn, asset, object);
      holder.add(standIn); furniture.add(holder);
      const url = asset.source.type === 'gltf' ? previewModelUrl(asset.source.url) : null;
      if (!url || modelHostDown()) continue;
      queueModel(async () => {
        // Skipped when the card was released meanwhile or the relay turned out to be unreachable.
        if (!gpu || gpu.token !== token || modelHostDown() || !shared) return;
        try {
          const loaded = await shared.loader.load({ ...asset, source: { type: 'gltf', url } });
          modelHost.ok++;
          if (!gpu || gpu.token !== token) { disposeObject(loaded); return; }
          poseWallDecoration(loaded, asset, object);
          disposeObject(standIn); holder.add(loaded);
          dirty = true; schedule(); options.onModel?.();
        } catch { modelHost.failed++; }
      });
    }
    center = model.bounds.getCenter(new THREE.Vector3());
    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 400);
    // One frustum size for every orbit angle, so turning never zooms.
    let span = 0, aspectSpan = 0;
    const corner = new THREE.Vector3();
    for (let step = 0; step < 24; step++) {
      place(camera, step / 24 * Math.PI * 2);
      let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
      for (const x of [model.bounds.min.x, model.bounds.max.x]) for (const y of [model.bounds.min.y, model.bounds.max.y]) for (const z of [model.bounds.min.z, model.bounds.max.z]) {
        corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        left = Math.min(left, corner.x); right = Math.max(right, corner.x); bottom = Math.min(bottom, corner.y); top = Math.max(top, corner.y);
      }
      span = Math.max(span, top - bottom); aspectSpan = Math.max(aspectSpan, right - left);
    }
    fit = { span, aspectSpan };
    place(camera, angle);
    dirty = true;
  }

  function release(): void {
    if (!gpu) return;
    gpu.token = {};
    disposeObject(gpu.root);
    gpu = null; camera = null;
  }

  function draw(now: number): boolean {
    if (!gpu || !camera || !fit) return false;
    const width = host.clientWidth, heightPx = host.clientHeight;
    if (!width || !heightPx) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.min(MAX_BUFFER, Math.round(width * ratio)), h = Math.min(MAX_BUFFER, Math.round(heightPx * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const gl = acquireShared();
    try {
      if (gl.width < w || gl.height < h) {
        gl.width = Math.max(gl.width, w); gl.height = Math.max(gl.height, h);
        gl.renderer.setSize(gl.width, gl.height, false);
      }
      let animating = false;
      // Rising out of the plan: the whole model grows from the paper, easing to rest.
      if (riseStart < 0) riseStart = reduced() ? Infinity : now;
      const rise = Math.min(1, (now - riseStart) / RISE_MS);
      const eased = riseStart === Infinity ? 1 : 1 - Math.pow(1 - Math.max(0, rise), 3);
      gpu.root.scale.y = Math.max(0.002, eased);
      if (eased < 1) animating = true;
      // Orbit: ease towards the target speed so hover never jerks the view.
      const dt = lastTime ? Math.min(64, now - lastTime) : 16; lastTime = now;
      const target = isActive && !reduced() ? Math.PI * 2 / ORBIT_PERIOD_MS : 0;
      speed += (target - speed) * Math.min(1, dt / 350);
      if (Math.abs(speed) < 1e-7 && !target) speed = 0;
      if (speed) { angle += speed * dt; animating = true; }
      place(camera, angle);
      const aspect = w / h, span = Math.max(fit.span * 1.12, fit.aspectSpan * 1.12 / aspect);
      camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2;
      camera.updateProjectionMatrix();
      wallsMoving = gpu.model.updateWalls(camera, 'cutaway', false, now, reduced() || !drawn);
      if (wallsMoving) animating = true;
      gl.renderer.setViewport(0, 0, w, h); gl.renderer.setScissor(0, 0, w, h);
      gl.renderer.clear();
      gl.renderer.render(gpu.scene, camera);
      context.clearRect(0, 0, w, h);
      // WebGL's origin is bottom-left: the card's frame is the bottom-left corner of the shared buffer.
      context.drawImage(gl.renderer.domElement, 0, gl.height - h, w, h, 0, 0, w, h);
      if (!drawn) { drawn = true; resolveReady(); }
      return animating;
    } finally { releaseShared(); }
  }

  const api: Card = {
    live: () => gpu !== null,
    visible: () => isVisible,
    active: () => isActive,
    seen: () => seenAt,
    release,
    step(now: number): boolean {
      if (disposed) return false;
      if (!gpu) { if (!isVisible) return false; build(); }
      const needs = dirty || speed !== 0 || (isActive && !reduced()) || wallsMoving || (riseStart !== Infinity && gpu !== null && gpu.root.scale.y < 1);
      if (!needs) return false;
      dirty = false;
      return draw(now);
    },
  };
  const observer = new ResizeObserver(() => { dirty = true; schedule(); });
  observer.observe(host);
  acquireShared();
  cards.add(api);

  const handle: FurnishedPreview = {
    canvas, ready,
    setActive(next) { if (isActive === next) return; isActive = next; if (next) seenAt = performance.now(); lastTime = 0; schedule(); },
    setVisible(next) { isVisible = next; if (next) { seenAt = performance.now(); dirty = true; schedule(); } },
    dispose() {
      if (disposed) return;
      disposed = true; observer.disconnect(); release(); cards.delete(api); canvas.remove(); releaseShared();
      resolveReady();
    },
  };
  return handle;
}

/**
 * A furnished apartment preview for a catalog card: the editor's structure renderer plus its furniture,
 * isometric, rising out of the plan on first view and orbiting slowly while active. Drawing starts when
 * the card is made visible with `setVisible(true)`.
 */
export function mountFurnishedPreview(host: HTMLElement, document: SceneDocument, catalog: readonly CatalogAsset[], options: FurnishedPreviewOptions = {}): FurnishedPreview {
  return createCard(host, document, catalog, options);
}

/** Test and QA view of the budget: live scenes and GL contexts in use. */
export function furnishedPreviewStats(): { cards: number; liveScenes: number; contexts: number } {
  return { cards: cards.size, liveScenes: [...cards].filter(card => card.live()).length, contexts: shared ? 1 : 0 };
}
