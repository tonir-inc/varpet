import { mountBlueprintLanding, type BlueprintLandingOptions } from './blueprint';
import { BLUEPRINT_TEST_STATES, createBlueprintTestBuild, getBlueprintTestState, loadBlueprintTestData,
  type BlueprintTestState } from './blueprint-test-data';
import type { StagePhase } from '../ui/architect-stage';
import './blueprint-test-tools.css';

/** Loaded only by the development entry. Every preview mounts the real landing and construction UI. */
export function mountBlueprintTestTools(host: HTMLElement, options: BlueprintLandingOptions): () => void {
  const panel = document.createElement('details');
  panel.className = 'blueprint-test-tools';
  panel.innerHTML = `<summary>Blueprint test states</summary>
    <div class="blueprint-test-controls">
      <label>Load blueprint state<select aria-label="Blueprint test state"><option value="">Live upload</option></select></label>
      <p class="blueprint-test-description"></p>
      <p class="blueprint-test-status" role="status"></p>
      <div><button type="button" data-reload>Reload state</button><button type="button" data-next>Next step</button></div>
      <p class="blueprint-test-note">Local Avani sample. All uploads in test mode use sample results.</p>
      <a href="/" data-exit>Exit test mode</a>
    </div>`;
  document.body.append(panel);
  const select = panel.querySelector('select')!;
  for (const {id, label} of BLUEPRINT_TEST_STATES) select.add(new Option(label, id));
  const summary = panel.querySelector('summary')!;
  const description = panel.querySelector<HTMLElement>('.blueprint-test-description')!;
  const status = panel.querySelector<HTMLElement>('.blueprint-test-status')!;
  const next = panel.querySelector<HTMLButtonElement>('[data-next]')!;
  const reload = panel.querySelector<HTMLButtonElement>('[data-reload]')!;
  let disposed = false, opening = false, generation = 0, cleanup: (() => void) | undefined;
  let data: ReturnType<typeof loadBlueprintTestData> | undefined;
  let current: BlueprintTestState | undefined;
  const landingOptions: BlueprintLandingOptions = {...options, async openProject(scene, catalog, presentation) {
    // The finished stage has transferred to the editor handoff. Keep its mount stable
    // until the import succeeds or returns control to the completion screen.
    opening = true; select.disabled = true; reload.disabled = true; next.disabled = true;
    try { await options.openProject(scene, catalog, presentation); }
    finally {
      opening = false;
      if (!disposed) {
        select.disabled = false; reload.disabled = false;
        next.disabled = !current || current === 'complete' || current === 'error';
      }
    }
  }};

  async function load(state: BlueprintTestState | undefined) {
    if (disposed || opening) return;
    const version = ++generation;
    cleanup?.(); cleanup = undefined;
    host.closest('.portal')?.classList.remove('is-building');
    // Cancel/dispose before replacing the DOM so old callbacks cannot touch the new preview.
    host.replaceChildren();
    current = state; select.value = state ?? '';
    const definition = BLUEPRINT_TEST_STATES.find(item => item.id === state);
    summary.textContent = definition ? `Test data · ${definition.label}` : 'Blueprint test states';
    description.textContent = definition?.description ?? 'Choose a sample checkpoint to inspect the blueprint flow.';
    next.disabled = !state || state === 'complete' || state === 'error';
    panel.querySelector<HTMLElement>('.blueprint-test-note')!.hidden = !state;
    panel.querySelector<HTMLElement>('[data-exit]')!.hidden = !state;
    const url = new URL(location.href);
    if (state) url.searchParams.set('blueprintTest', state); else url.searchParams.delete('blueprintTest');
    history.replaceState(null, '', url);
    if (!state) {
      status.textContent = 'Live upload uses the architect service.';
      cleanup = mountBlueprintLanding(host, landingOptions);
      return;
    }
    status.textContent = 'Loading local test data…';
    try {
      data ??= loadBlueprintTestData().catch(error => { data = undefined; throw error; });
      const fixture = await data;
      if (disposed || version !== generation) return;
      const phase: StagePhase = state === 'complete' ? 'done'
        : state === 'upload' || state === 'selected' || state === 'error' ? 'reading' : state;
      cleanup = mountBlueprintLanding(host, {...landingOptions, preview: {
        build: createBlueprintTestBuild(fixture, state), catalog: fixture.catalog, phase,
        ...(state === 'upload' ? {} : {initial: {plan: fixture.plan, photos: fixture.photos, showBuild: state !== 'selected'}}),
      }});
      status.textContent = 'Test mode · no architect requests. This URL reopens the same checkpoint.';
    } catch (error) {
      if (disposed || version !== generation) return;
      status.textContent = `Could not load test data: ${error instanceof Error ? error.message : String(error)}. Reload to retry.`;
    }
  }

  select.onchange = () => { void load(getBlueprintTestState(select.value)); };
  reload.onclick = () => { void load(current); };
  next.onclick = () => {
    const index = BLUEPRINT_TEST_STATES.findIndex(item => item.id === current);
    if (index >= 0 && index < BLUEPRINT_TEST_STATES.length - 1) void load(BLUEPRINT_TEST_STATES[index + 1]!.id);
  };
  const requested = new URLSearchParams(location.search).get('blueprintTest');
  const initial = getBlueprintTestState(requested);
  // An invalid test URL must stay isolated from the architect, too.
  void load(requested !== null ? initial ?? 'upload' : undefined);
  if (requested !== null && !initial) {
    panel.open = true;
    description.textContent = `Unknown checkpoint “${requested}”. Choose a state below.`;
  }
  return () => { disposed = true; ++generation; cleanup?.(); panel.remove(); };
}
