import { FINISH_DRAG_TYPE, FINISH_PRESETS, getFinishPreset, type FinishPreset } from '../core/finish-presets';
import { createFinishSwatch } from './finish-swatch';
import './materials.css';

export interface MaterialsCallbacks {
  onChoose(preset: FinishPreset | null): void;
  onDragStart(preset: FinishPreset): void;
  onDragEnd(): void;
}

export interface MaterialsUI {
  setActive(id: string | null): void;
  dispose(): void;
}

/** Construct once: updating selection never replaces a card during a native drag. */
export function createMaterialsUI(container: HTMLElement, callbacks: MaterialsCallbacks): MaterialsUI {
  let activeId: string | null = null;
  let category: FinishPreset['category'] = 'floor';
  let dragging = false;
  const abort = new AbortController();
  const listenerOptions = { signal: abort.signal };
  const root = document.createElement('div');
  root.className = 'materials-library';
  root.innerHTML = `
    <div class="materials-intro"><strong>A new feel, in one drop.</strong><p>Drag a finish onto your room, or select one to paint.</p></div>
    <div class="materials-tabs" role="tablist" aria-label="Surface type">
      <button type="button" role="tab" data-material-category="floor" aria-selected="true" tabindex="0">Floors</button>
      <button type="button" role="tab" data-material-category="wall" aria-selected="false" tabindex="-1">Walls</button>
    </div>
    <div class="materials-section-label"><span data-material-heading>Floor finishes</span><span data-material-count>${FINISH_PRESETS.filter(preset => preset.category === 'floor').length} samples</span></div>
    <div class="materials-grid" role="tabpanel" aria-label="Floor finishes"></div>
    <div class="materials-instruction" aria-live="polite" aria-atomic="true"><span class="materials-instruction-icon" aria-hidden="true">↗</span><div><strong data-material-prompt>Pick a finish</strong><span data-material-detail>Drag it onto a floor in the 3D view.</span></div><button type="button" class="materials-cancel" aria-label="Stop painting" title="Stop painting · Esc" hidden>×</button></div>
    <p class="materials-note">Concept samples · pricing not included</p>`;
  const grid = root.querySelector<HTMLElement>('.materials-grid')!;
  const cards = new Map<string, HTMLButtonElement>();

  for (const preset of FINISH_PRESETS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.draggable = true;
    card.className = 'material-card';
    card.dataset.finishId = preset.id;
    card.dataset.category = preset.category;
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-label', `${preset.name}. ${preset.description}. Select, then click a ${preset.category === 'floor' ? 'floor' : 'wall'}, or drag to apply.`);
    card.title = `${preset.name} · ${preset.description}`;
    const swatch = createFinishSwatch(preset);
    swatch.classList.add('material-swatch');
    const check = document.createElement('span');
    check.className = 'material-check';
    check.textContent = '✓';
    swatch.append(check);
    const title = document.createElement('strong');
    title.className = 'material-name';
    title.textContent = preset.name;
    const description = document.createElement('span');
    description.className = 'material-description';
    description.textContent = preset.description;
    card.append(swatch, title, description);
    card.addEventListener('click', () => {
      if (dragging) return;
      const next = activeId === preset.id ? null : preset;
      setActive(next?.id ?? null);
      callbacks.onChoose(next);
    }, listenerOptions);
    card.addEventListener('dragstart', event => {
      if (!event.dataTransfer) return;
      dragging = true;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData(FINISH_DRAG_TYPE, preset.id);
      event.dataTransfer.setData('text/plain', preset.id);
      event.dataTransfer.setDragImage(swatch, Math.round(swatch.clientWidth / 2), Math.round(swatch.clientHeight / 2));
      card.classList.add('is-dragging');
      callbacks.onDragStart(preset);
    }, listenerOptions);
    card.addEventListener('dragend', () => {
      dragging = false;
      card.classList.remove('is-dragging');
      callbacks.onDragEnd();
    }, listenerOptions);
    cards.set(preset.id, card);
    grid.append(card);
  }

  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-material-category]')];
  const prompt = root.querySelector<HTMLElement>('[data-material-prompt]')!;
  const detail = root.querySelector<HTMLElement>('[data-material-detail]')!;
  const cancel = root.querySelector<HTMLButtonElement>('.materials-cancel')!;
  const instruction = root.querySelector<HTMLElement>('.materials-instruction')!;
  function sync() {
    for (const [id, card] of cards) {
      card.hidden = card.dataset.category !== category;
      card.setAttribute('aria-pressed', String(activeId === id));
    }
    for (const tab of tabs) {
      const selected = tab.dataset.materialCategory === category;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    const heading = category === 'floor' ? 'Floor finishes' : 'Wall paint';
    root.querySelector<HTMLElement>('[data-material-heading]')!.textContent = heading;
    root.querySelector<HTMLElement>('[data-material-count]')!.textContent = `${FINISH_PRESETS.filter(preset => preset.category === category).length} samples`;
    grid.setAttribute('aria-label', heading);
    const preset = activeId ? getFinishPreset(activeId) : undefined;
    prompt.textContent = preset?.name ?? 'Pick a finish';
    detail.textContent = preset ? `Then click a ${preset.category === 'floor' ? 'floor' : 'wall'} · Esc to stop` : `Drag it onto a ${category === 'floor' ? 'floor' : 'wall'} in the 3D view.`;
    cancel.hidden = !preset;
    instruction.classList.toggle('is-active', !!preset);
  }
  function setActive(id: string | null) {
    const preset = id ? getFinishPreset(id) : undefined;
    activeId = preset?.id ?? null;
    if (preset) category = preset.category;
    sync();
  }
  function selectCategory(next: FinishPreset['category']) {
    if (category === next) return;
    category = next;
    activeId = null;
    sync();
    callbacks.onChoose(null);
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => selectCategory(tab.dataset.materialCategory as FinishPreset['category']), listenerOptions);
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'floor' : event.key === 'End' ? 'wall' : category === 'floor' ? 'wall' : 'floor';
      selectCategory(next);
      tabs.find(candidate => candidate.dataset.materialCategory === next)?.focus();
    }, listenerOptions);
  }
  cancel.addEventListener('click', () => { setActive(null); callbacks.onChoose(null); }, listenerOptions);
  container.append(root);
  sync();
  return {
    setActive,
    dispose() { abort.abort(); if (dragging) callbacks.onDragEnd(); root.remove(); },
  };
}
