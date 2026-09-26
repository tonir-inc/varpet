import { icon } from '../ui/icons';
import { apartmentTemplates, type ApartmentTemplate } from './templates';
import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';
import type { ArchitectStage, StagePhase } from '../ui/architect-stage';
import { BLUEPRINT_TOTAL_LIMIT, blueprintTransportFiles, retainBlueprintEvidence, validateBlueprintFile } from './blueprint-evidence';
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
        <p>Drop your blueprint. Watch your home take shape.</p></div>
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
        <p class="blueprint-build-note">A few minutes to build. Yours to review and make your own.</p>
      </div>
      <p class="blueprint-error" role="alert" hidden></p>
      <div class="blueprint-bottom"><span>${icon('layers')} Your plan</span><i></i><span>${icon('walls')} A space in 3D</span><i></i><span>${icon('home')} Make it yours</span></div>
      <details class="blueprint-samples"><summary>No plan handy? <span>Try a sample ${icon('arrow')}</span></summary><div>${apartmentTemplates.map((template, index) => `<button type="button" data-sample="${index}">${escape(template.name)}<span>${template.area} m² ${icon('arrow')}</span></button>`).join('')}</div></details>
    </section>
    <section class="blueprint-flow" aria-label="Your apartment taking shape" style="--paper:${PAPER}" hidden>
      <div class="blueprint-stage"></div>
      <div class="blueprint-flow-top"><button type="button" class="blueprint-back">${icon('undo')} Back to my plan</button><span class="blueprint-flow-name"></span><span class="blueprint-live"><i></i>CREATING YOUR SPACE</span></div>
      <div class="blueprint-flow-heading"><p class="blueprint-eyebrow">FROM YOUR PLAN, INTO YOUR SPACE</p><h2 role="status">Getting to know your plan.</h2><p class="blueprint-flow-message">Placing your blueprint on the drawing board…</p></div>
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
  let controller: AbortController | undefined, stage: ArchitectStage | undefined;
  let completed: {scene: SceneDocument; catalog: CatalogProduct[]} | undefined;
  const photoUrls: string[] = [];
  const report = (message: string) => { error.textContent = message; error.hidden = false; };
  const validate = validateBlueprintFile;
  // Warm the build while the plan is being drawn, so the handoff never waits on a download.
  const warmBuild = () => Promise.all([
    import('../ui/architect-stage'), import('../adapters/architect-http'), import('../adapters/database-catalog'), import('../adapters/built-catalog'), import('../core/persistence'),
  ]);
  function renderPhotos() {
    photoUrls.splice(0).forEach(URL.revokeObjectURL);
    q('.blueprint-photo-list').innerHTML = photos.map((photo, i) => {
      const url = URL.createObjectURL(photo); photoUrls.push(url);
      return `<span><img src="${url}" alt="${escape(photo.name)}"><button type="button" data-remove-photo="${i}" aria-label="Remove ${escape(photo.name)}">${icon('close')}</button></span>`;
    }).join('');
    q('.blueprint-photo-list').querySelectorAll<HTMLButtonElement>('[data-remove-photo]').forEach(button => {
      button.onclick = () => { photos.splice(Number(button.dataset.removePhoto), 1); renderPhotos(); };
    });
  }
  function addPhotos(files: File[]) {
    try {
      files.forEach(validate);
      if (photos.length + files.length > 10) throw new Error('Add up to 10 room photos. Remove a photo to make space.');
      if ([plan, ...photos, ...files].reduce((sum, file) => sum + (file?.size ?? 0), 0) > MAX_TOTAL) throw new Error('Keep the plan and photos under 12 MB in total.');
      photos.push(...files); renderPhotos(); error.hidden = true;
    } catch (cause) { report((cause as Error).message); }
  }
  async function chooseFiles(files: File[]) {
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
      plan = candidate; ink = traced; error.hidden = true;
      void warmBuild();
      if (files.length > 1) addPhotos(files.filter(file => file !== candidate));
      await revealPlan(probe, traced, candidate.name, version);
      URL.revokeObjectURL(url);
      if (disposed || version !== selection) return;
      build.disabled = false;
    } catch (cause) {
      if (url) URL.revokeObjectURL(url);
      if (disposed || version !== selection) return;
      build.disabled = !plan;
      report(cause instanceof Error && cause.name !== 'EncodingError' ? cause.message : 'This image could not be read. Try another JPG, PNG or WebP.');
    }
  }

  /** The dropped image lands on the sheet, dissolves into it, and the plan is redrawn in ink. */
  async function revealPlan(image: HTMLImageElement, traced: BlueprintInk, name: string, version: number) {
    const still = reduced();
    const current = () => !disposed && version === selection;
    next.hidden = true; board.classList.add('has-plan');
    area.querySelectorAll('.bp-incoming, .bp-scan').forEach(node => node.remove());
    if (!inkCanvas.hidden && !still) await inkCanvas.animate([{opacity: 1}, {opacity: 0, filter: 'blur(4px)'}], {duration: 260, easing: 'ease-in', fill: 'forwards'}).finished;
    if (!current()) return;
    if (!drop.hidden && !still) await drop.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateY(-10px) scale(.97)'}], {duration: 240, easing: 'ease-in'}).finished;
    if (!current()) return;
    drop.hidden = true;
    inkCanvas.getAnimations().forEach(animation => animation.cancel());
    inkCanvas.width = traced.width; inkCanvas.height = traced.height; inkCanvas.hidden = false;
    setTitle(name);
    if (still) { paintInk(traced, 1, 1); showNext(false); return; }

    // The paper lands, settles, and melts into the sheet while a reading line passes over it.
    const incoming = image.cloneNode() as HTMLImageElement;
    incoming.className = 'bp-incoming'; incoming.alt = ''; area.append(incoming);
    const scan = document.createElement('i'); scan.className = 'bp-scan'; area.append(scan);
    const landing = incoming.animate([
      {opacity: 0, transform: 'translateY(-7%) scale(1.22) rotate(-5deg)', filter: 'drop-shadow(0 40px 40px #0006)'},
      {opacity: 1, transform: 'translateY(0) scale(1.02) rotate(-1.2deg)', filter: 'drop-shadow(0 18px 24px #0005)', offset: .38},
      {opacity: 1, transform: 'scale(1) rotate(0)', filter: 'drop-shadow(0 2px 3px #0003) brightness(1)', offset: .56},
      {opacity: 0, transform: 'scale(.992)', filter: 'drop-shadow(0 0 0 #0000) brightness(1.8) blur(3px)'},
    ], {duration: 1700, easing: easeOut, fill: 'forwards'});
    scan.animate([{top: '0%', opacity: 0}, {opacity: 1, offset: .12}, {opacity: 1, offset: .85}, {top: '100%', opacity: 0}], {duration: 1300, delay: 700, easing: ease, fill: 'both'});
    paintInk(traced, 0, 0);
    await new Promise(resolve => setTimeout(resolve, 900));
    if (!current()) { incoming.remove(); scan.remove(); return; }
    const drawing = drawInk(traced, 2600, current);
    await landing.finished; incoming.remove();
    await drawing; scan.remove();
    if (current()) showNext(true);
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
  async function drawInk(traced: BlueprintInk, duration: number, current: () => boolean) {
    const ctx = inkCanvas.getContext('2d')!;
    const data = ctx.createImageData(traced.width, traced.height);
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

  drop.onclick = () => picker.click();
  q('[data-change]').onclick = () => picker.click();
  picker.onchange = () => { void chooseFiles([...picker.files ?? []]); picker.value = ''; };
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
    void chooseFiles([...event.dataTransfer.files]);
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
    event.preventDefault(); void chooseFiles(images);
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
    q('.blueprint-flow-heading h2').textContent = phase === 'done' ? 'A plan. Now a place.' : PHASES[index]![2];
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
  function stop() { ++run; controller?.abort(); controller = undefined; stage?.dispose(); stage = undefined; }
  function back() {
    stop(); completed = undefined; flow.hidden = true; welcome.hidden = false; board.style.visibility = '';
    flow.classList.remove('is-entering', 'is-handoff');
    flow.querySelectorAll('.bp-ghost').forEach(node => node.remove());
    flow.getAnimations().forEach(animation => animation.cancel());
    host.closest('.portal')?.classList.remove('is-building');
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

  async function startBuild() {
    if (!plan || !ink || disposed) return;
    stop(); const version = run; controller = new AbortController();
    const signal = controller.signal;
    completed = undefined; flow.hidden = false; flowError.hidden = true;
    flow.classList.add('is-entering');
    q('.blueprint-complete').hidden = true; q('.blueprint-flow-bottom').hidden = false;
    q('.blueprint-live').hidden = false;
    q('.blueprint-flow-name').textContent = plan.name;
    q('.blueprint-flow-message').textContent = 'Placing your blueprint on the drawing board…';
    updatePhase('reading'); q('.blueprint-back').focus({preventScroll: true});
    try {
      const [{createArchitectStage}, {buildFurnishedFlat}, {resolveSceneProducts}, {resolveFurnitureProducts}, {parseScene}] = await warmBuild();
      if (disposed || version !== run) return;
      const sheet = document.createElement('canvas');
      sheet.width = inkCanvas.width; sheet.height = inkCanvas.height; sheet.getContext('2d')!.drawImage(inkCanvas, 0, 0);
      stage = createArchitectStage(q('.blueprint-stage'), {onPhase: updatePhase, holdOnFinish: true, blueprint: {ink: sheet, paper: PAPER, insets}});
      stage.start(plan, photos);
      void handoff(version);
      const url = import.meta.env.VITE_ARCHITECT_URL || 'http://127.0.0.1:8788';
      const raw = await buildFurnishedFlat({...blueprintTransportFiles(plan, photos), name: plan.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My apartment'}, message => {
        if (version !== run) return;
        q('.blueprint-flow-message').textContent = message; stage?.progress(message);
      }, {url, signal, onEvent: event => { if (version === run) stage?.event(event as never); }});
      if (disposed || version !== run) return;
      q('.blueprint-flow-message').textContent = 'Checking your apartment before you step inside…';
      const catalog = await resolveSceneProducts(raw, new Map(), ids => resolveFurnitureProducts(ids, {url}));
      if (disposed || version !== run) return;
      const assets = catalog.map(product => product.asset);
      const reviewed = parseScene(JSON.stringify(raw), assets);
      const scene = parseScene(JSON.stringify(await retainBlueprintEvidence(reviewed, plan, photos)), assets);
      if (disposed || version !== run) return;
      await stage!.finish();
      if (disposed || version !== run) return;
      completed = {scene, catalog};
      updatePhase('done'); q('.blueprint-flow-message').textContent = 'Built from your blueprint. Ready for your ideas.';
      q('.blueprint-live').hidden = true; q('.blueprint-flow-bottom').hidden = true;
      q('.blueprint-complete').hidden = false; q('[data-open]').focus();
    } catch (cause) {
      if (disposed || version !== run || signal.aborted) return;
      stage?.dispose(); stage = undefined;
      welcome.hidden = true; building(); board.style.visibility = ''; flow.querySelectorAll('.bp-ghost').forEach(node => node.remove());
      flow.classList.remove('is-entering', 'is-handoff');
      q('.blueprint-live').hidden = true; q('.blueprint-flow-bottom').hidden = true;
      q('.blueprint-flow-heading h2').textContent = 'Your plan is still here.';
      q('.blueprint-flow-message').textContent = 'We couldn’t finish this build. Your uploaded files are ready to try again.';
      flowError.querySelector('p')!.textContent = cause instanceof TypeError ? 'The architect is unavailable. Check the connection and try again.' : cause instanceof Error ? cause.message : 'The build could not be completed.';
      flowError.hidden = false; q('[data-retry]').focus();
    }
  }
  build.onclick = () => void startBuild(); q('[data-retry]').onclick = () => void startBuild();
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
