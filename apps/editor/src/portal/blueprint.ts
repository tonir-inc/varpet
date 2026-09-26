import { icon } from '../ui/icons';
import { apartmentTemplates, type ApartmentTemplate } from './templates';
import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';
import type { ArchitectStage, StagePhase } from '../ui/architect-stage';
import { BLUEPRINT_TOTAL_LIMIT, retainBlueprintEvidence, validateBlueprintFile } from './blueprint-evidence';
import { startBlueprintBuild } from './blueprint-build';
import { traceInk, type BlueprintInk } from './blueprint-ink';
import './blueprint.css';

const MAX_TOTAL = BLUEPRINT_TOTAL_LIMIT;
const PHASES: [StagePhase, string, string][] = [
  ['reading', 'Read', 'Getting to know your plan.'],
  ['walls', 'Draw', 'Your space is taking shape.'],
  ['building', 'Build', 'Making room for real life.'],
  ['placing', 'Place', 'Everything finds its place.'],
  ['checking', 'Review', 'A final look at the details.'],
];
/** Blueprint paper, shared by the landing sheet and the 3D construction ground. */
const PAPER = '#155f6d';
/** Longest side of the traced ink, in pixels. */
const INK_SIZE = 960;
const COLUMNS = 9, ROWS = 7;
const ease = 'cubic-bezier(.65,0,.35,1)', easeOut = 'cubic-bezier(.16,1,.3,1)';
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!));
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
interface Point { x: number; y: number }
const centre = (element: Element): Point => { const r = element.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; };

export interface BlueprintLandingOptions {
  showSample(template: ApartmentTemplate): void;
  openProject(scene: SceneDocument, catalog: CatalogProduct[]): Promise<void>;
}

/** A new front door to the existing architect stream, with an explicit review before opening its result. */
export function mountBlueprintLanding(host: HTMLElement, options: BlueprintLandingOptions): () => void {
  const pasteShortcut = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';
  const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  const reduced = () => reducedQuery?.matches ?? false;
  host.innerHTML = `
    <section class="blueprint-welcome" aria-labelledby="blueprint-title">
      <div class="blueprint-heading"><p class="blueprint-eyebrow"><span></span>A LITTLE PLAN. A WHOLE NEW PERSPECTIVE.</p>
        <h1 id="blueprint-title">It starts with <em>a plan.</em></h1>
        <p>Drop your blueprint. We’ll start reading it right away.</p></div>
      <div class="blueprint-drawing">
        <div class="blueprint-board" style="--paper:${PAPER}">
          <div class="bp-grid" aria-hidden="true"></div>
          <svg class="bp-frame" aria-hidden="true"><rect x="0" y="0" width="100%" height="100%" pathLength="1"/></svg>
          <ol class="bp-cols" aria-hidden="true">${Array.from({length: COLUMNS}, (_, i) => `<li style="--i:${i}">${i + 1}</li>`).join('')}</ol>
          <ol class="bp-rows" aria-hidden="true">${Array.from({length: ROWS}, (_, i) => `<li style="--i:${i}">${String.fromCharCode(65 + i)}</li>`).join('')}</ol>
          <div class="bp-dims" aria-hidden="true"><i class="bp-dim bp-dim-a"></i><i class="bp-dim bp-dim-b"></i><i class="bp-dim bp-dim-c"></i><i class="bp-dim bp-dim-v bp-dim-d"></i><i class="bp-dim bp-dim-v bp-dim-e"></i></div>
          <div class="bp-title" aria-hidden="true"><span>VARPET · FLOOR PLAN</span><strong>Awaiting your plan</strong><span>SHEET 01 / 01</span></div>
          <div class="bp-area">
            <canvas class="bp-ink" hidden></canvas>
            <button class="blueprint-drop" type="button" aria-describedby="blueprint-file-hint">
              <span class="blueprint-upload-mark" aria-hidden="true">${icon('upload')}</span>
              <strong data-idle="Drop your blueprint here" data-over="Release to place it on the sheet">Drop your blueprint here</strong><span>or <u>browse files</u></span>
              <span>Paste an image with <kbd>${pasteShortcut}</kbd></span>
              <small id="blueprint-file-hint">JPG, PNG or WebP · up to 2 MB</small>
            </button>
          </div>
          <input type="file" class="blueprint-file-input" accept="image/jpeg,image/png,image/webp" hidden>
        </div>
      </div>
      <div class="blueprint-next" hidden>
        <div class="blueprint-file"><span>${icon('layers')}<strong></strong></span><button type="button" data-change>Change plan</button></div>
        <div class="blueprint-photos"><button type="button" data-photos>${icon('plus')} Add room photos <span>optional</span></button><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><div class="blueprint-photo-list"></div></div>
        <button type="button" class="portal-button portal-primary blueprint-build" disabled>Bring my plan to life ${icon('arrow')}</button>
        <p class="blueprint-build-note" role="status">A few minutes to build. Yours to review and make your own.</p>
      </div>
      <p class="blueprint-error" role="alert" hidden></p>
      <div class="blueprint-bottom"><span>${icon('layers')} Your plan</span><i></i><span>${icon('walls')} A space in 3D</span><i></i><span>${icon('home')} Make it yours</span></div>
      <details class="blueprint-samples"><summary>No plan handy? <span>Try a sample ${icon('arrow')}</span></summary><div>${apartmentTemplates.map((template, index) => `<button type="button" data-sample="${index}">${escape(template.name)}<span>${template.area} m² ${icon('arrow')}</span></button>`).join('')}</div></details>
    </section>
    <section class="blueprint-flow" aria-label="Your apartment taking shape" style="--paper:${PAPER}" hidden>
      <div class="blueprint-stage"></div>
      <div class="blueprint-flow-top"><button type="button" class="blueprint-back">${icon('undo')} Back to my plan</button><span class="blueprint-flow-name"></span><span class="blueprint-live"><i></i>CREATING YOUR SPACE<time class="blueprint-elapsed" aria-hidden="true">0:00</time></span></div>
      <div class="blueprint-flow-heading"><p class="blueprint-eyebrow">FROM YOUR PLAN, INTO YOUR SPACE</p><h2 role="status">Getting to know your plan.</h2><p class="blueprint-flow-message" role="status"><span class="blueprint-flow-message-text">Reading the plan</span><span class="blueprint-flow-dots" aria-hidden="true" hidden><span>.</span><span>.</span><span>.</span></span></p></div>
      <div class="blueprint-flow-bottom"><ol aria-label="Build progress">${PHASES.map(([phase, label], i) => `<li data-phase="${phase}"><span>${String(i + 1).padStart(2, '0')}</span>${label}</li>`).join('')}</ol><p>Your original plan becomes the foundation for your 3D home.</p></div>
      <div class="blueprint-complete" hidden><p>Tap doors and windows to try them. Open your apartment to correct any detail.</p><button type="button" class="portal-button portal-primary" data-open>Open my apartment ${icon('arrow')}</button></div>
      <div class="blueprint-flow-error" role="alert" hidden><h3>Let’s give that another look.</h3><p></p><button type="button" class="portal-button" data-retry>Try again</button><button type="button" class="portal-text-button" data-return>Change my plan</button></div>
    </section>`;

  const q = <T extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const welcome = q('.blueprint-welcome'), flow = q('.blueprint-flow');
  const board = q('.blueprint-board'), area = q('.bp-area'), picker = q<HTMLInputElement>('.blueprint-file-input');
  const drop = q<HTMLButtonElement>('.blueprint-drop'), inkCanvas = q<HTMLCanvasElement>('.bp-ink');
  const next = q('.blueprint-next'), build = q<HTMLButtonElement>('.blueprint-build');
  const error = q('.blueprint-error'), flowError = q('.blueprint-flow-error');
  const photoInput = q<HTMLInputElement>('.blueprint-photos input');
  let plan: File | null = null, photos: File[] = [], ink: BlueprintInk | undefined;
  let disposed = false, selection = 0, run = 0, dragDepth = 0;
  let reading: ReturnType<typeof startBlueprintBuild> | undefined, stage: ArchitectStage | undefined;
  let completed: {scene: SceneDocument; catalog: CatalogProduct[]} | undefined;
  const photoUrls: string[] = [];
  const flights = new Set<HTMLElement>();
  const report = (message: string) => { error.textContent = message; error.hidden = false; };
  const validate = validateBlueprintFile;
  // Warm the build while the plan is being drawn, so the handoff never waits on a download.
  const warmBuild = () => Promise.all([
    import('../ui/architect-stage'), import('../adapters/database-catalog'), import('../adapters/built-catalog'), import('../core/persistence'),
  ]);
  function startReading() {
    if (!plan || disposed) return;
    reading?.cancel();
    const job = startBlueprintBuild(plan, photos, () => {
      if (disposed || reading !== job) return;
      q('.blueprint-build-note').textContent = job.status === 'ready'
        ? 'Your apartment is ready to preview.' : 'We couldn’t read your plan yet. Continue to try again.';
    });
    reading = job;
    q('.blueprint-build-note').textContent = 'Reading your blueprint while you get ready…';
    return job;
  }
  function renderPhotos() {
    photoUrls.splice(0).forEach(URL.revokeObjectURL);
    q('.blueprint-photo-list').innerHTML = photos.map((photo, i) => {
      const url = URL.createObjectURL(photo); photoUrls.push(url);
      return `<span><img src="${url}" alt="${escape(photo.name)}"><button type="button" data-remove-photo="${i}" aria-label="Remove ${escape(photo.name)}">${icon('close')}</button></span>`;
    }).join('');
    q('.blueprint-photo-list').querySelectorAll<HTMLButtonElement>('[data-remove-photo]').forEach(button => {
      button.onclick = () => { photos.splice(Number(button.dataset.removePhoto), 1); renderPhotos(); startReading(); };
    });
  }
  function addPhotos(files: File[], restart = true) {
    if (!files.length) return;
    try {
      files.forEach(validate);
      if (photos.length + files.length > 10) throw new Error('Add up to 10 room photos. Remove a photo to make space.');
      if ([plan, ...photos, ...files].reduce((sum, file) => sum + (file?.size ?? 0), 0) > MAX_TOTAL) throw new Error('Keep the plan and photos under 12 MB in total.');
      photos.push(...files); renderPhotos(); error.hidden = true;
      if (restart) startReading();
    } catch (cause) { report((cause as Error).message); }
  }
  async function chooseFiles(files: File[], from: Point) {
    if (!files.length || !flow.hidden) return;
    const candidate = files.find(file => /plan|blueprint/i.test(file.name)) ?? files[0]!;
    const version = ++selection;
    let url = '';
    try {
      validate(candidate);
      if (candidate.size + photos.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL) throw new Error('Keep the plan and photos under 12 MB in total.');
      build.disabled = true;
      url = URL.createObjectURL(candidate);
      const probe = new Image(); probe.src = url; await probe.decode();
      if (disposed || version !== selection) { URL.revokeObjectURL(url); return; }
      const traced = inkOf(probe);
      probe.src = ''; URL.revokeObjectURL(url); url = '';
      plan = candidate; ink = traced; error.hidden = true;
      void warmBuild().catch(() => {}); // Submit reports any module-loading failure with a retry.
      if (files.length > 1) addPhotos(files.filter(file => file !== candidate), false);
      startReading();
      await revealPlan(traced, candidate.name, version, from);
      if (disposed || version !== selection) return;
      build.disabled = false;
    } catch (cause) {
      if (url) URL.revokeObjectURL(url);
      if (disposed || version !== selection) return;
      build.disabled = !plan;
      report(cause instanceof Error && cause.name !== 'EncodingError' ? cause.message : 'This image could not be read. Try another JPG, PNG or WebP.');
    }
  }

  /**
   * A clean paper card of the traced plan flies out of wherever the file came from and drops onto
   * the sheet. A developing line then sweeps down it: behind the line the paper is gone and the plan
   * is already a faint blueprint, which the pen inks over. The plan never leaves the screen.
   */
  async function revealPlan(traced: BlueprintInk, name: string, version: number, from: Point) {
    const still = reduced();
    const current = () => !disposed && version === selection;
    next.hidden = true; board.classList.add('has-plan');
    flights.forEach(node => node.remove()); flights.clear();
    const outgoing = [
      !still && !inkCanvas.hidden && inkCanvas.animate([{opacity: 1}, {opacity: 0, filter: 'blur(4px)'}], {duration: 260, easing: 'ease-in', fill: 'forwards'}).finished,
      !still && !drop.hidden && drop.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateY(-10px) scale(.97)'}], {duration: 240, easing: 'ease-in', fill: 'forwards'}).finished,
    ];
    // The card starts its flight at once; the prompt and any earlier drawing clear underneath it.
    const card = still ? undefined : flyIn(traced, from);
    await Promise.all(outgoing);
    if (!current()) return;
    drop.hidden = true;
    inkCanvas.getAnimations().forEach(animation => animation.cancel());
    inkCanvas.width = traced.width; inkCanvas.height = traced.height; inkCanvas.hidden = false;
    inkCanvas.getContext('2d')!.clearRect(0, 0, traced.width, traced.height);
    setTitle(name);
    if (!card) { paintInk(traced, 1, 1); showNext(false); return; }
    await card.landed;
    if (!current()) return;
    inkCanvas.getContext('2d')!.putImageData(ghostInk(traced), 0, 0);
    await card.develop();
    if (!current()) return;
    await drawInk(traced, 2400, current);
    if (current()) showNext(true);
  }

  /**
   * One continuous drop: the card travels on an arc (horizontal and vertical ease differently),
   * tilted and lifted off the page, then lays flat onto the sheet, which gives a little under it.
   * `develop` then turns it into blueprint from the top down; it resolves just before the sweep ends.
   */
  function flyIn(traced: BlueprintInk, from: Point): { landed: Promise<void>; develop(): Promise<void> } {
    const box = area.getBoundingClientRect();
    const fit = Math.min(box.width / traced.width, box.height / traced.height);
    const width = traced.width * fit, height = traced.height * fit;
    const left = box.left + (box.width - width) / 2, top = box.top + (box.height - height) / 2;
    const card = document.createElement('div'); card.className = 'bp-card-x';
    card.innerHTML = '<i class="bp-card-ripple"></i><div class="bp-card-y"><div class="bp-card"><canvas></canvas></div></div><i class="bp-card-scan"></i>';
    Object.assign(card.style, {left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`});
    const paper = card.querySelector('canvas')!;
    paper.width = traced.width; paper.height = traced.height;
    const ctx = paper.getContext('2d')!, image = ctx.createImageData(traced.width, traced.height);
    for (let i = 0; i < traced.alpha.length; i++) { const k = i * 4; image.data[k] = 24; image.data[k + 1] = 58; image.data[k + 2] = 64; image.data[k + 3] = traced.alpha[i]!; }
    ctx.putImageData(image, 0, 0);
    document.body.append(card); flights.add(card);
    const dx = from.x - (left + width / 2), dy = from.y - (top + height / 2);
    const start = Math.min(.9, Math.max(.16, 110 / Math.max(width, height)));
    const flight = 820, land = 300, total = flight + land, at = flight / total;
    card.animate([{transform: `translateX(${dx}px)`}, {transform: 'none'}], {duration: flight, easing: 'cubic-bezier(.3,.8,.35,1)', fill: 'both'});
    card.firstElementChild!.nextElementSibling!.animate([{transform: `translateY(${dy}px)`}, {transform: 'none'}], {duration: flight, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both'});
    const body = card.querySelector<HTMLElement>('.bp-card')!;
    // Same transform list in every frame so the tilt, lift and scale interpolate together.
    const pose = (tilt: number, turn: number, lift: number, scale: number) =>
      `perspective(1600px) translateZ(${lift}px) rotateX(${tilt}deg) rotateZ(${turn}deg) scale(${scale})`;
    const motion = body.animate([
      {transform: pose(26, -9, 0, start), opacity: 0, boxShadow: '0 24px 30px #0e343b2e', easing: 'cubic-bezier(.3,.6,.4,1)'},
      {opacity: 1, offset: .1},
      {transform: pose(10, -2, 40, 1.02), boxShadow: '0 46px 70px #0e343b4d', offset: at * .82, easing: 'cubic-bezier(.5,0,.8,.4)'},
      {transform: pose(0, 0, 0, .988), boxShadow: '0 2px 4px #0e343b47', offset: at + (1 - at) * .35, easing: 'cubic-bezier(.2,.8,.3,1)'},
      {transform: pose(0, 0, 0, 1), opacity: 1, boxShadow: '0 1px 2px #0e343b33'},
    ], {duration: total, fill: 'both'});
    // The sheet takes the weight: a small give, the frame brightens, and a ripple rings out.
    const contact = flight + land * .35;
    board.animate([{transform: 'none'}, {transform: 'scale(.994)', offset: .3}, {transform: 'none'}], {duration: 520, delay: contact - 60, easing: 'cubic-bezier(.3,.7,.4,1)'});
    q('.bp-frame rect').animate([{strokeWidth: 1.4}, {strokeWidth: 2.6, stroke: '#ffffff', offset: .25}, {strokeWidth: 1.4}], {duration: 700, delay: contact - 60, easing: 'ease-out'});
    card.querySelector('.bp-card-ripple')!.animate([{opacity: .75, transform: 'scale(1)'}, {opacity: 0, transform: 'scale(1.07)'}], {duration: 760, delay: contact - 40, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both'});
    const landed = motion.finished.then(() => undefined, () => undefined);
    const develop = () => {
      // The mask is three cards tall: clear, a soft edge at the scan line, then paper; sliding it down wipes the paper away.
      const sweep = 1050;
      Object.assign(body.style, {maskImage: 'linear-gradient(#0000 46%, #000 54%)', maskSize: `100% ${height * 3}px`, maskRepeat: 'no-repeat'});
      body.style.setProperty('-webkit-mask-image', body.style.maskImage);
      body.style.setProperty('-webkit-mask-size', body.style.maskSize);
      body.style.setProperty('-webkit-mask-repeat', 'no-repeat');
      const wipe = {duration: sweep, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'both'} as const;
      body.animate([{maskPosition: `0 ${-height * 1.8}px`, WebkitMaskPosition: `0 ${-height * 1.8}px`}, {maskPosition: '0 0', WebkitMaskPosition: '0 0'}] as Keyframe[], wipe);
      card.querySelector('.bp-card-scan')!.animate([
        {top: '-30%', opacity: 0}, {opacity: 1, offset: .2}, {opacity: 1, offset: .75}, {top: '150%', opacity: 0},
      ], wipe).finished.then(() => { card.remove(); flights.delete(card); }, () => undefined);
      return new Promise<void>(resolve => setTimeout(resolve, sweep * .55));
    };
    return { landed, develop };
  }

  function showNext(animate: boolean) {
    next.hidden = false;
    if (animate) next.animate([{opacity: 0, transform: 'translateY(14px)'}, {opacity: 1, transform: 'none'}], {duration: 520, easing: easeOut});
    build.disabled = false; build.focus({preventScroll: true});
  }
  function setTitle(name: string) {
    q('.bp-title strong').textContent = name; q('.blueprint-file strong').textContent = name;
  }

  /** Reveal every inked pixel up to `t`; the newest strokes glow like a pen tip. */
  function paintInk(traced: BlueprintInk, t: number, settle: number, image?: ImageData) {
    const ctx = inkCanvas.getContext('2d')!;
    const data = image ?? ctx.createImageData(traced.width, traced.height);
    for (let i = 0; i < traced.sequence.length; i++) {
      const p = traced.sequence[i]!, o = traced.order[p]!;
      if (o > t) break;
      const hot = o > settle, k = p * 4;
      data.data[k] = hot ? 255 : 230; data.data[k + 1] = hot ? 255 : 243; data.data[k + 2] = hot ? 255 : 242;
      data.data[k + 3] = hot ? Math.min(255, traced.alpha[p]! + 70) : traced.alpha[p]!;
    }
    ctx.putImageData(data, 0, 0);
    return data;
  }
  /** The whole plan, faint: the blueprint as the paper leaves it, before the pen goes over it. */
  function ghostInk(traced: BlueprintInk) {
    const data = new ImageData(traced.width, traced.height);
    for (let i = 0; i < traced.alpha.length; i++) {
      const k = i * 4; data.data[k] = 200; data.data[k + 1] = 228; data.data[k + 2] = 230; data.data[k + 3] = traced.alpha[i]! * .5;
    }
    return data;
  }
  async function drawInk(traced: BlueprintInk, duration: number, current: () => boolean) {
    const ctx = inkCanvas.getContext('2d')!;
    const data = ghostInk(traced);
    const pixels = data.data, {sequence, order, alpha} = traced;
    let head = 0, tail = 0;
    const start = await nextFrame();
    for (let now = start; ; now = await nextFrame()) {
      if (!current()) return;
      const p = Math.min(1, (now - start) / duration);
      const t = p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      for (; head < sequence.length && order[sequence[head]!]! <= t; head++) {
        const k = sequence[head]! * 4;
        pixels[k] = 255; pixels[k + 1] = 255; pixels[k + 2] = 255; pixels[k + 3] = Math.min(255, alpha[sequence[head]!]! + 70);
      }
      for (; tail < head && (p === 1 || order[sequence[tail]!]! < t - .035); tail++) {
        const i = sequence[tail]!, k = i * 4;
        pixels[k] = 230; pixels[k + 1] = 243; pixels[k + 2] = 242; pixels[k + 3] = alpha[i]!;
      }
      ctx.putImageData(data, 0, 0);
      if (p === 1) return;
    }
  }

  // A chosen or pasted file flies out of the control that asked for it.
  const source = () => centre(!drop.hidden ? q('.blueprint-upload-mark') : !next.hidden ? q('[data-change]') : area);
  let pickedFrom: Point | undefined;
  drop.onclick = () => { pickedFrom = centre(q('.blueprint-upload-mark')); picker.click(); };
  q('[data-change]').onclick = () => { pickedFrom = centre(q('[data-change]')); picker.click(); };
  picker.onchange = () => { void chooseFiles([...picker.files ?? []], pickedFrom ?? source()); picker.value = ''; };
  q('[data-photos]').onclick = () => photoInput.click();
  photoInput.onchange = () => { addPhotos([...photoInput.files ?? []]); photoInput.value = ''; };
  const dropLabel = q('.blueprint-drop strong');
  const setOver = (over: boolean) => {
    board.classList.toggle('is-over', over);
    dropLabel.textContent = over ? dropLabel.dataset.over! : dropLabel.dataset.idle!;
  };
  const onDrag = (event: DragEvent) => {
    if (!flow.hidden || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
    setOver(true);
  };
  const onDrop = (event: DragEvent) => {
    if (!flow.hidden || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault(); dragDepth = 0; setOver(false);
    void chooseFiles([...event.dataTransfer.files], {x: event.clientX, y: event.clientY});
  };
  const onPaste = (event: ClipboardEvent) => {
    if (disposed || !host.isConnected || !flow.hidden || event.defaultPrevented || !event.clipboardData) return;
    if (document.querySelector('dialog[open]') || event.composedPath().some(target =>
      target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select')))) return;
    const clipboard = event.clipboardData;
    let images = [...clipboard.files].filter(file => file.type.startsWith('image/'));
    if (!images.length) images = [...clipboard.items]
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile()).filter((file): file is File => file !== null);
    if (!images.length) return;
    event.preventDefault(); void chooseFiles(images, source());
  };
  welcome.addEventListener('dragenter', event => { onDrag(event); ++dragDepth; });
  welcome.addEventListener('dragleave', () => { if (--dragDepth <= 0) setOver(false); });
  welcome.addEventListener('dragover', onDrag);
  welcome.addEventListener('drop', onDrop);
  window.addEventListener('paste', onPaste);
  q('.blueprint-samples').querySelectorAll<HTMLButtonElement>('[data-sample]').forEach(button => {
    button.onclick = () => options.showSample(apartmentTemplates[Number(button.dataset.sample)]!);
  });

  function updatePhase(phase: StagePhase) {
    const index = phase === 'done' ? PHASES.length : PHASES.findIndex(item => item[0] === phase);
    flow.querySelectorAll<HTMLElement>('[data-phase]').forEach((element, i) => {
      element.classList.toggle('is-current', i === index); element.classList.toggle('is-done', i < index);
      if (i === index) element.setAttribute('aria-current', 'step'); else element.removeAttribute('aria-current');
    });
    swap(q('.blueprint-flow-heading h2'), phase === 'done' ? 'A plan. Now a place.' : PHASES[index]![2]);
  }
  /** Space the 3D view keeps clear of the flow's heading and bottom controls. */
  function insets() {
    // Scoped to the flow: during the editor handover it lives outside this page.
    const heading = flow.querySelector<HTMLElement>('.blueprint-flow-heading')!;
    const bottoms = [...flow.querySelectorAll<HTMLElement>('.blueprint-flow-bottom, .blueprint-complete')].filter(element => !element.hidden);
    const top = heading.offsetTop + heading.offsetHeight + 12;
    const bottom = bottoms.length ? flow.clientHeight - Math.min(...bottoms.map(element => element.offsetTop)) + 8 : 24;
    return {top, bottom};
  }
  function stop(cancelReading = true) {
    ++run; working(false);
    if (cancelReading) { reading?.cancel(); reading = undefined; }
    stage?.dispose(); stage = undefined;
  }
  /** A changed line of text rises into place, so each step of the work reads as progress. */
  function swap(element: HTMLElement, text: string) {
    if (element.textContent === text) return;
    element.textContent = text;
    if (!reduced()) element.animate([{opacity: 0, transform: 'translateY(8px)', filter: 'blur(3px)'}, {opacity: 1, transform: 'none', filter: 'none'}], {duration: 460, easing: easeOut});
  }
  const say = (message: string) => swap(q('.blueprint-flow-message-text'),
    /^Reading (?:the|your) plan\b/i.test(message) ? 'Reading the plan' : message.replace(/(?:…|\.{3})\s*$/, ''));
  /** While the architect works: the live dot breathes, the current step shimmers and time counts up. */
  let clock = 0;
  function working(on: boolean, started = performance.now()) {
    flow.classList.toggle('is-working', on);
    flow.querySelector<HTMLElement>('.blueprint-flow-dots')!.hidden = !on;
    clearInterval(clock); clock = 0;
    if (!on) return;
    const elapsed = q('.blueprint-elapsed');
    const tick = () => { const s = Math.floor((performance.now() - started) / 1000); elapsed.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    tick(); clock = window.setInterval(tick, 1000);
  }
  function back() {
    stop(); completed = undefined; flow.hidden = true; welcome.hidden = false; board.style.visibility = '';
    flow.classList.remove('is-entering', 'is-handoff');
    flow.querySelectorAll('.bp-ghost').forEach(node => node.remove());
    flow.getAnimations().forEach(animation => animation.cancel());
    host.closest('.portal')?.classList.remove('is-building');
    q('.blueprint-build-note').textContent = 'Your plan is here. Continue when you’re ready to build.';
    build.disabled = !plan; build.focus();
  }
  q('.blueprint-back').onclick = back; q('[data-return]').onclick = back;

  const building = () => host.closest('.portal')?.classList.add('is-building');
  /** The drawn sheet grows onto the 3D ground plane, then tips back into perspective. */
  async function handoff(version: number) {
    const target = stage?.planRect();
    const still = reduced() || !target || !ink;
    if (still) { welcome.hidden = true; building(); flow.classList.remove('is-entering'); stage?.enter(); return; }
    const from = board.getBoundingClientRect(), canvasBox = contained(inkCanvas);
    const ghost = board.cloneNode(true) as HTMLElement;
    ghost.classList.add('bp-ghost'); ghost.removeAttribute('style'); ghost.style.setProperty('--paper', PAPER);
    ghost.querySelectorAll('[id], input').forEach(node => node.id ? node.removeAttribute('id') : node.remove());
    Object.assign(ghost.style, {left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`});
    ghost.querySelector<HTMLCanvasElement>('.bp-ink')!.getContext('2d')!.drawImage(inkCanvas, 0, 0);
    flow.append(ghost); board.style.visibility = 'hidden';
    const scale = target.width / canvasBox.width;
    const dx = target.left - from.left - (canvasBox.left - from.left) * scale, dy = target.top - from.top - (canvasBox.top - from.top) * scale;
    const chrome = [...ghost.children].filter(child => !child.classList.contains('bp-area'));
    const move = ghost.animate([{transform: 'none'}, {transform: `translate(${dx}px, ${dy}px) scale(${scale})`}], {duration: 1150, easing: ease, fill: 'forwards'});
    ghost.style.backgroundImage = 'none';
    ghost.animate([{backgroundColor: PAPER, boxShadow: '0 30px 80px #0e343b40'}, {backgroundColor: `${PAPER}00`, boxShadow: '0 0 0 #0e343b00'}], {duration: 650, delay: 120, easing: 'ease-in-out', fill: 'forwards'});
    chrome.forEach(child => child.animate([{opacity: 1}, {opacity: 0}], {duration: 520, delay: 120, easing: 'ease-in', fill: 'forwards'}));
    // Blueprint paper floods the page from behind the sheet; the page itself never fades to blank.
    flow.animate([{backgroundColor: `${PAPER}00`}, {backgroundColor: PAPER}], {duration: 650, delay: 120, easing: 'ease-in-out', fill: 'both'});
    await move.finished;
    if (disposed || version !== run) return;
    // Both sheets are the same ink on the same paper at the same size: crossfade, then tilt.
    flow.classList.add('is-handoff');
    stage?.enter();
    await ghost.animate([{opacity: 1}, {opacity: 0}], {duration: 380, easing: 'ease-out', fill: 'forwards'}).finished;
    ghost.remove(); board.style.visibility = '';
    if (disposed || version !== run) return;
    // Hide the page's header only now: changing layout under the moving sheet would make it jump.
    welcome.hidden = true; building();
    flow.classList.remove('is-entering', 'is-handoff');
    flow.getAnimations().forEach(animation => animation.cancel());
  }

  async function startBuild(retry = false) {
    if (!plan || !ink || disposed) return;
    if ((!flow.hidden && !retry) || (retry && flowError.hidden)) return;
    stop(false); const version = run;
    const job = !reading || reading.status === 'failed' || retry ? startReading()! : reading;
    const signal = job.signal;
    completed = undefined; flow.hidden = false; flowError.hidden = true;
    flow.classList.add('is-entering');
    q('.blueprint-complete').hidden = true; q('.blueprint-flow-bottom').hidden = false;
    q('.blueprint-live').hidden = false;
    q('.blueprint-flow-name').textContent = plan.name;
    say('Reading the plan');
    working(true, job.started);
    updatePhase('reading'); q('.blueprint-back').focus({preventScroll: true});
    try {
      const [{createArchitectStage}, {resolveSceneProducts}, {resolveFurnitureProducts}, {parseScene}] = await warmBuild();
      if (disposed || version !== run) return;
      const sheet = inkSheet(ink);
      stage = createArchitectStage(q('.blueprint-stage'), {onPhase: updatePhase, holdOnFinish: true, blueprint: {ink: sheet, paper: PAPER, insets}});
      stage.start(job.plan, job.photos);
      // Keep the receiving sheet still until the source lands. Early shell events can reframe it.
      await handoff(version);
      if (disposed || version !== run) return;
      const url = import.meta.env.VITE_ARCHITECT_URL || 'http://127.0.0.1:8788';
      job.attach(message => {
        if (version !== run) return;
        say(message); stage?.progress(message);
      }, event => { if (version === run) stage?.event(event as never); });
      const result = await job.result;
      if (disposed || version !== run) return;
      if (!result.ok) throw result.error;
      const raw = result.project;
      say('Checking your apartment before you step inside…');
      const catalog = await resolveSceneProducts(raw, new Map(), ids => resolveFurnitureProducts(ids, {url}));
      if (disposed || version !== run) return;
      const assets = catalog.map(product => product.asset);
      const reviewed = parseScene(JSON.stringify(raw), assets);
      const scene = parseScene(JSON.stringify(await retainBlueprintEvidence(reviewed, job.plan, job.photos)), assets);
      if (disposed || version !== run) return;
      await stage!.finish();
      if (disposed || version !== run) return;
      completed = {scene, catalog};
      updatePhase('done'); say('Built from your blueprint. Ready for your ideas.'); working(false);
      q('.blueprint-live').hidden = true; q('.blueprint-flow-bottom').hidden = true;
      q('.blueprint-complete').hidden = false; q('[data-open]').focus();
    } catch (cause) {
      if (disposed || version !== run || signal.aborted) return;
      job.cancel(); if (reading === job) reading = undefined;
      stage?.dispose(); stage = undefined;
      welcome.hidden = true; building(); board.style.visibility = ''; flow.querySelectorAll('.bp-ghost').forEach(node => node.remove());
      flow.classList.remove('is-entering', 'is-handoff');
      working(false); q('.blueprint-live').hidden = true; q('.blueprint-flow-bottom').hidden = true;
      q('.blueprint-flow-heading h2').textContent = 'Your plan is still here.';
      say('We couldn’t finish this build. Your uploaded files are ready to try again.');
      flowError.querySelector('p')!.textContent = cause instanceof TypeError ? 'The architect is unavailable. Check the connection and try again.' : cause instanceof Error ? cause.message : 'The build could not be completed.';
      flowError.hidden = false; q('[data-retry]').focus();
    }
  }
  build.onclick = () => void startBuild(); q('[data-retry]').onclick = () => void startBuild(true);
  q<HTMLButtonElement>('[data-open]').onclick = async () => {
    if (!completed) return;
    const button = q<HTMLButtonElement>('[data-open]'); button.disabled = true;
    // The editor replaces this page underneath the finished model: lift the construction view
    // above it and hand it over to the handover, so disposing the landing leaves it running.
    const view = stage; stage = undefined;
    document.body.append(flow); flow.classList.add('is-handing-over');
    try { await options.openProject(completed.scene, completed.catalog); }
    catch (cause) {
      host.append(flow); flow.classList.remove('is-handing-over'); stage = view;
      button.disabled = false; q('.blueprint-complete p').textContent = cause instanceof Error ? cause.message : 'Could not open your apartment. Try again.';
      return;
    }
    await handOver(view, flow, reduced());
  };
  return () => {
    disposed = true; ++selection; stop();
    window.removeEventListener('paste', onPaste);
    flights.forEach(node => node.remove());
    photoUrls.splice(0).forEach(URL.revokeObjectURL);
  };
}

/**
 * The construction camera glides into the editor's first 3D frame, lens and backdrop included,
 * then the construction view fades away over an identical picture of the same apartment.
 */
async function handOver(view: ArchitectStage | undefined, overlay: HTMLElement, still: boolean) {
  try {
    const { editorView } = await import('../main');
    await nextFrame(); await nextFrame();
    await view?.settle(() => {
      const pose = editorView.cameraPose(), element = editorView.element();
      if (!pose || !element.isConnected) return null;
      const {left, top, width, height} = element.getBoundingClientRect();
      return width && height ? {...pose, rect: {left, top, width, height}} : null;
    }, still ? 0 : 1.8);
    await overlay.animate([{opacity: 1}, {opacity: 0}], {duration: still ? 0 : 900, easing: 'ease-in-out', fill: 'forwards'}).finished;
  } finally {
    view?.dispose(); overlay.remove();
  }
}

/** The stage's copy of the plan: ink coverage in alpha, and its pen order in red for the working trace. */
function inkSheet(ink: BlueprintInk): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = ink.width; canvas.height = ink.height;
  const ctx = canvas.getContext('2d')!, image = ctx.createImageData(ink.width, ink.height);
  for (let i = 0; i < ink.alpha.length; i++) {
    const k = i * 4;
    image.data[k] = ink.order[i]! >= 0 ? Math.round(ink.order[i]! * 255) : 0; image.data[k + 3] = ink.alpha[i]!;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Trace the decoded plan at sheet resolution, cropped to its drawing. */
function inkOf(image: HTMLImageElement): BlueprintInk {
  const fit = Math.min(1, INK_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * fit)), height = Math.max(1, Math.round(image.naturalHeight * fit));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
  ctx.drawImage(image, 0, 0, width, height);
  const whole = traceInk(ctx.getImageData(0, 0, width, height).data, width, height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let i = 0; i < whole.alpha.length; i++) if (whole.alpha[i]! > 96) {
    const x = i % width, y = (i - x) / width;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return whole;
  const pad = Math.round(Math.max(width, height) * .015);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  if (x1 - x0 + 1 === width && y1 - y0 + 1 === height) return whole;
  const cropped = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  return traceInk(cropped.data, cropped.width, cropped.height);
}

/** Where an `object-fit: contain` canvas actually draws, in viewport pixels. */
function contained(canvas: HTMLCanvasElement): DOMRect {
  const box = canvas.getBoundingClientRect();
  const scale = Math.min(box.width / canvas.width, box.height / canvas.height);
  const width = canvas.width * scale, height = canvas.height * scale;
  return new DOMRect(box.left + (box.width - width) / 2, box.top + (box.height - height) / 2, width, height);
}
