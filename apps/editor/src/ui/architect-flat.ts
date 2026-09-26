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

export function openArchitectFlat(deps: ArchitectFlatDeps): void {
  if (current && !current.done) { renderProgress(deps); return; }
  deps.showModal('Build with the architect', `
    <p class="modal-intro">Give the architect your developer's floor plan and a few photos of the flat. It draws the rooms, kitchen and bathroom, builds each piece of furniture from the photos and places it where the photos show it. You review the result before anything changes.</p>
    <form id="af-form" class="af-form">
      <label class="af-drop"><span class="af-label">Floor plan</span><span class="af-hint">One image of the plan with room sizes</span><input id="af-plan" type="file" accept="image/*" required></label>
      <label class="af-drop"><span class="af-label">Photos of the flat</span><span class="af-hint">Up to 10 photos that show the rooms and furniture</span><input id="af-photos" type="file" accept="image/*" multiple></label>
      <label class="af-field"><span class="af-label">Name</span><input id="af-name" type="text" maxlength="40" placeholder="My flat"></label>
      <p class="af-note">Takes about 8 minutes. You can close this window; the architect keeps working and tells you when it is done.</p>
      <button class="button primary full" type="submit">Build my apartment</button>
    </form>`);
  const form = document.querySelector<HTMLFormElement>('#af-form')!;
  form.onsubmit = event => {
    event.preventDefault();
    const plan = document.querySelector<HTMLInputElement>('#af-plan')!.files?.[0];
    const photos = [...document.querySelector<HTMLInputElement>('#af-photos')!.files ?? []].slice(0, 10);
    const name = document.querySelector<HTMLInputElement>('#af-name')!.value.trim() || 'My flat';
    if (!plan) { deps.notify('Choose a floor plan image first.', true); return; }
    void start(deps, { plan, photos, name });
  };
}

async function start(deps: ArchitectFlatDeps, input: { plan: File; photos: File[]; name: string }): Promise<void> {
  current = { step: 0, message: 'Sending your plan and photos', started: Date.now(), done: false };
  renderProgress(deps);
  timer = setInterval(() => { if (deps.isOpen()) updateProgress(); }, 1000);
  try {
    const project = await deps.build(input, message => {
      if (!current) return;
      const step = stepOf(message);
      if (step >= 0) current.step = Math.max(current.step, step);
      current.message = message;
      if (deps.isOpen()) updateProgress();
    });
    current.done = true; current.step = STEPS.length; current.message = 'Your apartment is ready to review';
    if (deps.isOpen()) updateProgress();
    await deps.onProject(project);
  } catch (error) {
    if (current) { current.done = true; current.error = error instanceof Error ? error.message : String(error); }
    if (deps.isOpen()) updateProgress();
    deps.notify(`The architect could not finish: ${current?.error ?? ''}`, true);
  } finally {
    clearInterval(timer);
  }
}

function renderProgress(deps: ArchitectFlatDeps): void {
  deps.showModal('Build with the architect', `<div class="af-progress" id="af-progress"></div>`);
  updateProgress();
}

function updateProgress(): void {
  const el = document.querySelector<HTMLElement>('#af-progress');
  if (!el || !current) return;
  const seconds = Math.round((Date.now() - current.started) / 1000);
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  el.innerHTML = `
    <ol class="af-steps">${STEPS.map(([title, hint], i) => {
      const state = current!.error && i === current!.step ? 'failed' : i < current!.step ? 'done' : i === current!.step && !current!.done ? 'active' : current!.done && !current!.error ? 'done' : 'waiting';
      return `<li class="af-step af-${state}"><span class="af-dot" aria-hidden="true"></span><div><strong>${title}</strong><span>${hint}</span></div></li>`;
    }).join('')}</ol>
    <p class="af-status" role="status" aria-live="polite">${esc(current.error ? `Stopped: ${current.error}` : current.message)}</p>
    <p class="af-elapsed">${current.done ? 'Finished' : 'Working'} · ${elapsed}</p>
    ${current.done && !current.error ? '<p class="af-note">The apartment is in the Assistant panel. Inspect it in 3D, then apply or dismiss it.</p>' : '<p class="af-note">You can close this window; the architect keeps working.</p>'}`;
}
