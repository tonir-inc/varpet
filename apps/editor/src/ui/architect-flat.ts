import type { BuildingComponent, CatalogAsset, Room, SceneDocument, SceneObject, Wall } from '../contracts';
import { migrateScene } from '../core/renovation';
import './architect-flat.css';

/**
 * "Build with the architect": a developer plan and photos of the flat in, a furnished apartment out.
 * The architect service reads the plan and photos, builds each piece of furniture from the photos,
 * places it and checks the result; the editor then offers it as a proposal to inspect and apply.
 */
export interface ArchitectFlatDeps {
  showModal(title: string, body: string): void;
  isOpen(): boolean;
  notify(message: string, error?: boolean): void;
  build(input: { plan: File; photos: File[]; name: string }, onProgress: (message: string) => void): Promise<unknown>;
  /** Optional: the service's intermediate results, for a live 3D preview. */
  onEvent?(event: Record<string, unknown>): void;
  /** The side panel element that shows the steps and the live log while the architect works. */
  progressHost(): HTMLElement | null;
  /** Called when a build starts: close the dialog, open the panel that holds progressHost. */
  onStarted?(): void;
  onProject(project: unknown): Promise<void>;
}

const STEPS: [string, string][] = [
  ['Reading the plan', 'Walls, doors, windows, kitchen and bathroom'],
  ['Building furniture', 'Each piece made in 3D from your photos'],
  ['Placing furniture', 'Where the photos show it'],
  ['Checking', 'The result compared with your photos'],
];
const stepOf = (message: string): number =>
  /^Checking/.test(message) ? 3 : /^(Placing|Correcting the furniture positions)/.test(message) ? 2
    : /^Building/.test(message) ? 1 : /^(Reading|Correcting the walls|Correcting the furniture list|Starting)/.test(message) ? 0 : -1;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

interface Run { step: number; message: string; started: number; done: boolean; error?: string }
let current: Run | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

const MAX_PHOTOS = 10;
const isImage = (file: File) => file.type.startsWith('image/');

export function openArchitectFlat(deps: ArchitectFlatDeps): void {
  if (current && !current.done) { deps.onStarted?.(); updateProgress(); return; }
  deps.showModal('Build with the architect', `
    <p class="modal-intro">Give the architect your developer's floor plan and a few photos of the flat. It draws the rooms, kitchen and bathroom, builds each piece of furniture from the photos and places it where the photos show it. You review the result before anything changes.</p>
    <form id="af-form" class="af-form">
      <div class="af-drop" data-zone="plan" tabindex="0" role="button" aria-describedby="af-plan-hint">
        <span class="af-label">Floor plan</span>
        <span class="af-hint" id="af-plan-hint">Drop or paste one image of the plan with room sizes, or <u>choose a file</u></span>
        <input id="af-plan" type="file" accept="image/*" hidden>
        <div class="af-thumbs" data-thumbs="plan"></div>
      </div>
      <div class="af-drop" data-zone="photos" tabindex="0" role="button" aria-describedby="af-photos-hint">
        <span class="af-label">Photos of the flat</span>
        <span class="af-hint" id="af-photos-hint">Drop or paste up to ${MAX_PHOTOS} photos of the rooms and furniture, or <u>choose files</u></span>
        <input id="af-photos" type="file" accept="image/*" multiple hidden>
        <div class="af-thumbs" data-thumbs="photos"></div>
      </div>
      <label class="af-field"><span class="af-label">Name</span><input id="af-name" type="text" maxlength="40" placeholder="My flat"></label>
      <p class="af-note">Tip: drop everything at once onto this window; a file with “plan” in its name becomes the plan. Takes about 8 minutes, and you can close this window while the architect works.</p>
      <button class="button primary full" type="submit">Build my apartment</button>
    </form>`);
  let plan: File | null = null;
  let photos: File[] = [];
  const form = document.querySelector<HTMLFormElement>('#af-form')!;
  const urls: string[] = [];
  const render = () => {
    urls.splice(0).forEach(URL.revokeObjectURL);
    const thumb = (file: File, zone: string, index: number) => {
      const url = URL.createObjectURL(file); urls.push(url);
      return `<figure class="af-thumb"><img src="${url}" alt=""><figcaption>${esc(file.name)}</figcaption><button type="button" class="af-remove" data-remove="${zone}" data-index="${index}" aria-label="Remove ${esc(file.name)}">×</button></figure>`;
    };
    form.querySelector('[data-thumbs="plan"]')!.innerHTML = plan ? thumb(plan, 'plan', 0) : '';
    form.querySelector('[data-thumbs="photos"]')!.innerHTML = photos.map((f, i) => thumb(f, 'photos', i)).join('');
    form.querySelector('[data-zone="plan"]')!.classList.toggle('af-filled', !!plan);
    form.querySelector('[data-zone="photos"]')!.classList.toggle('af-filled', photos.length > 0);
  };
  /** zone: where the files were dropped; undefined = anywhere, so sort the plan out of the batch. */
  const add = (files: File[], zone?: 'plan' | 'photos') => {
    files = files.filter(isImage);
    if (!files.length) { deps.notify('Only images can be used for the plan and photos.', true); return; }
    if (zone === 'plan') { plan = files[0]!; photos.push(...files.slice(1)); }
    else if (zone === 'photos') photos.push(...files);
    else {
      const named = files.find(f => /plan/i.test(f.name));
      if (!plan) { plan = named ?? files[0]!; files = files.filter(f => f !== plan); }
      photos.push(...files);
    }
    if (photos.length > MAX_PHOTOS) { deps.notify(`Keeping the first ${MAX_PHOTOS} photos.`); photos = photos.slice(0, MAX_PHOTOS); }
    render();
  };
  for (const zone of ['plan', 'photos'] as const) {
    const box = form.querySelector<HTMLElement>(`[data-zone="${zone}"]`)!;
    const input = box.querySelector<HTMLInputElement>('input[type=file]')!;
    box.onclick = event => { if (!(event.target as HTMLElement).closest('.af-remove')) input.click(); };
    box.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); } };
    input.onchange = () => { add([...input.files ?? []], zone); input.value = ''; };
    box.ondragover = event => { event.preventDefault(); event.stopPropagation(); box.classList.add('af-over'); };
    box.ondragleave = () => box.classList.remove('af-over');
    box.ondrop = event => { event.preventDefault(); event.stopPropagation(); box.classList.remove('af-over'); add([...event.dataTransfer?.files ?? []], zone); };
  }
  // Drop anywhere on the form: sort a whole batch at once (the form is rebuilt each time the dialog opens).
  form.ondragover = event => { event.preventDefault(); form.classList.add('af-dragging'); };
  form.ondragleave = event => { if (!form.contains(event.relatedTarget as Node | null)) form.classList.remove('af-dragging'); };
  form.ondrop = event => { event.preventDefault(); form.classList.remove('af-dragging'); if (event.dataTransfer?.files.length) add([...event.dataTransfer.files]); };
  // Paste: screenshots or copied images.
  const onPaste = (event: ClipboardEvent) => {
    if (!document.body.contains(form)) { document.removeEventListener('paste', onPaste); return; }
    const files = [...event.clipboardData?.files ?? []].filter(isImage)
      .map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}-${i + 1}.png`, { type: f.type }));
    if (!files.length) return;
    event.preventDefault();
    add(files);
  };
  document.addEventListener('paste', onPaste);
  form.onclick = event => {
    const remove = (event.target as HTMLElement).closest<HTMLElement>('.af-remove');
    if (!remove) return;
    event.stopPropagation();
    if (remove.dataset.remove === 'plan') plan = null; else photos.splice(Number(remove.dataset.index), 1);
    render();
  };
  form.onsubmit = event => {
    event.preventDefault();
    const name = document.querySelector<HTMLInputElement>('#af-name')!.value.trim() || 'My flat';
    if (!plan) { deps.notify('Add a floor plan image first: drop it, paste it or choose a file.', true); return; }
    document.removeEventListener('paste', onPaste);
    urls.splice(0).forEach(URL.revokeObjectURL);
    void start(deps, { plan, photos: photos.slice(0, MAX_PHOTOS), name });
  };
}

/** Start a build without the dialog (replay mode). */
export function startArchitectFlat(deps: ArchitectFlatDeps, input: { plan: File; photos: File[]; name: string }): Promise<void> { return start(deps, input); }

async function start(deps: ArchitectFlatDeps, input: { plan: File; photos: File[]; name: string }): Promise<void> {
  current = { step: 0, message: 'Sending your plan and photos', started: Date.now(), done: false };
  resetLivePreview();
  log.splice(0);
  host = deps.progressHost;
  deps.onStarted?.();
  updateProgress();
  timer = setInterval(updateProgress, 1000);
  try {
    const project = await deps.build(input, message => {
      if (!current) return;
      const step = stepOf(message);
      if (step >= 0) current.step = Math.max(current.step, step);
      current.message = message;
      pushLog(message);
      updateProgress();
    });
    current.done = true; current.step = STEPS.length; current.message = 'Your apartment is ready to review';
    updateProgress();
    await deps.onProject(project);
  } catch (error) {
    if (current) { current.done = true; current.error = error instanceof Error ? error.message : String(error); }
    updateProgress();
    deps.notify(`The architect could not finish: ${current?.error ?? ''}`, true);
  } finally {
    clearInterval(timer);
  }
}

let host: () => HTMLElement | null = () => null;
const log: { at: number; text: string; kind: string }[] = [];

function pushLog(text: string, kind = 'step'): void {
  if (log[0]?.text === text) return;
  log.unshift({ at: Date.now(), text, kind });
  log.splice(40);
}

/** Activity from the service (commands run, files written) for the side panel log. */
export function logArchitectActivity(event: Record<string, unknown>): void {
  if (event.type !== 'activity') return;
  const who = String(event.who ?? '').replace(/-/g, ' '), text = String(event.text ?? '');
  const line = event.kind === 'file' ? `${who === 'architect' ? 'Architect' : who} wrote ${text}`
    : event.kind === 'command' ? `${who === 'architect' ? 'Architect' : who}: ${text.replace(/^\/bin\/zsh -lc\s*/, '').replace(/^['"]|['"]$/g, '')}`
    : `${who}: ${text}`;
  pushLog(line, String(event.kind));
  updateProgress();
}

function updateProgress(): void {
  const el = host();
  if (!el || !current) return;
  el.hidden = false;
  const seconds = Math.round((Date.now() - current.started) / 1000);
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  el.innerHTML = `<h3 class="af-panel-title">The architect is building your apartment</h3>
    <ol class="af-steps">${STEPS.map(([title, hint], i) => {
      const state = current!.error && i === current!.step ? 'failed' : i < current!.step ? 'done' : i === current!.step && !current!.done ? 'active' : current!.done && !current!.error ? 'done' : 'waiting';
      return `<li class="af-step af-${state}"><span class="af-dot" aria-hidden="true"></span><div><strong>${title}</strong><span>${hint}</span></div></li>`;
    }).join('')}</ol>
    <p class="af-status" role="status" aria-live="polite">${esc(current.error ? `Stopped: ${current.error}` : current.message)}</p>
    <p class="af-elapsed">${current.done ? 'Finished' : 'Working'} · ${elapsed}</p>
    ${current.done && !current.error ? '<p class="af-note">Your apartment is below. Inspect it in 3D, then apply or dismiss it.</p>' : ''}
    <ol class="af-log" aria-label="What the architect is doing">${log.slice(0, 14).map((entry, i) => `<li class="af-log-${esc(entry.kind)}" style="opacity:${Math.max(0.35, 1 - i * 0.07)}">${esc(entry.text)}</li>`).join('')}</ol>`;
}

/* Live preview: the flat fills up while the architect works. Walls and fixtures first, then each piece
   as its builder finishes (lined up beside the flat, waiting to be carried in), then the placements. */

interface Live {
  rooms: Room[]; walls: Wall[]; components: BuildingComponent[];
  assets: Map<string, CatalogAsset>; objects: SceneObject[] | null; lights: BuildingComponent[];
}
let live: Live | null = null;

export function resetLivePreview(): void { live = null; }

/** Feed one service event; returns true when the preview changed. */
export function applyLiveEvent(event: Record<string, unknown>): boolean {
  if (event.type === 'shell') {
    live = { rooms: event.rooms as Room[], walls: event.walls as Wall[], components: (event.components as BuildingComponent[] | undefined) ?? [],
      assets: live?.assets ?? new Map(), objects: live?.objects ?? null, lights: live?.lights ?? [] };
    return true;
  }
  if (!live) return false;
  if (event.type === 'piece') { const asset = event.asset as CatalogAsset; live.assets.set(asset.id, asset); return true; }
  if (event.type === 'placements') { live.objects = event.objects as SceneObject[]; live.lights = (event.lights as BuildingComponent[]) ?? []; return true; }
  return false;
}

export function liveScene(): { scene: SceneDocument; assets: CatalogAsset[] } | null {
  if (!live || !live.rooms.length) return null;
  const assets = [...live.assets.values()];
  let objects = live.objects;
  if (!objects) {
    // Not placed yet: line the finished pieces up beside the flat.
    const xs = live.rooms.flatMap(r => r.polygon.map(p => p[0])), zs = live.rooms.flatMap(r => r.polygon.map(p => p[1]));
    let z = Math.min(...zs);
    const x0 = Math.max(...xs) + 1.2;
    objects = assets.map(asset => {
      const [w, , d] = asset.dimensions;
      const object: SceneObject = { id: `waiting-${asset.id}`, name: asset.name, assetId: asset.id, position: [x0 + w / 2, 0, z + d / 2], rotation: 0, scale: [1, 1, 1] };
      z += d + 0.35;
      return object;
    });
  }
  const scene = migrateScene({ format: 'varpet.editor', version: 1, id: 'architect-live', name: 'The architect at work', units: 'm', upAxis: 'Y',
    rooms: structuredClone(live.rooms), walls: structuredClone(live.walls), objects: objects.filter(o => live!.assets.has(o.assetId)) });
  scene.project!.components = [...live.components, ...live.lights].map(c => ({ ...structuredClone(c), phase: 'existing' as const }));
  return { scene, assets };
}
