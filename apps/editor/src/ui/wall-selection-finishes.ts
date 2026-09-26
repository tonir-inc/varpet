import type { Operation, SceneDocument } from '../contracts';
import { buildWallSelectionFinishOperations, FINISH_PRESETS, getPresetForMaterial, wallSelectionFinishTargets, type WallSelectionFinishSurface } from '../core/finish-presets';
import { fillFinishSwatches } from './finish-swatch';

interface WallFinishOptions {
  getScene(): SceneDocument;
  execute(operations: Operation[], label: string): boolean;
  notice(message: string, error?: boolean): void;
  refresh(): void;
}

export interface WallFinishSelectionState {
  selection: string;
  surface: WallSelectionFinishSurface;
}

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The shared palette edits only selected walls, in one checked history entry. */
export function renderWallSelectionFinishes(container: HTMLElement, wallIds: readonly string[], config: WallFinishOptions, state: WallFinishSelectionState): void {
  const ids = [...new Set(wallIds)];
  const selection = JSON.stringify([...ids].sort());
  if (state.selection !== selection) { state.selection = selection; state.surface = 'both'; }
  const scene = config.getScene();
  const project = scene.project;
  const targets = wallSelectionFinishTargets(scene, ids, state.surface);
  const finishes = targets.map(target => {
    const assignment = project?.finishes.find(finish => finish.entityId === target.entityId && finish.surface === target.surface);
    const material = project?.materials.find(value => value.id === assignment?.materialId);
    return { material, color: (material?.color ?? scene.walls.find(wall => wall.id === target.entityId)!.color).toLowerCase() };
  });
  const first = finishes[0];
  const mixed = finishes.some(finish => finish.material?.id !== first?.material?.id || finish.color !== first?.color);
  const current = mixed ? undefined : getPresetForMaterial(first?.material);
  const locked = ids.some(id => project?.metadata[id]?.locked);
  const removed = ids.some(id => project?.metadata[id]?.phase === 'remove');
  const reason = locked ? 'Unlock selected walls in Renovate before painting.' : removed ? 'Restore selected walls marked for removal before painting.' : !targets.length ? 'There are no room-facing surfaces on this side of the selection.' : '';
  const status = !targets.length ? 'No paintable surfaces' : mixed ? 'Mixed finishes' : first?.material?.name ?? 'Original';
  container.innerHTML = `<section class="property-section">
    <div class="property-label">Paint selected walls<span aria-live="polite">${esc(status)}</span></div>
    <label class="text-field">Paint sides<select aria-label="Paint sides">
      ${([['both', 'Both room-facing sides'], ['wall-front', 'Wall side A'], ['wall-back', 'Wall side B']] as const).map(([value, label]) => `<option value="${value}" ${state.surface === value ? 'selected' : ''}>${label}</option>`).join('')}
    </select></label>
    <p class="field-note">Choose a color for all ${ids.length} selected walls. Undo restores them together.</p>
    ${reason ? `<p class="inspector-assumption">${esc(reason)}</p>` : ''}
    <div class="inspector-swatches" role="group" aria-label="Paint selected walls">
      ${FINISH_PRESETS.filter(preset => preset.category === 'wall').map(preset => `<button type="button" data-wall-selection-finish="${preset.id}" title="${esc(preset.description)}" aria-label="Paint selected walls: ${esc(preset.name)}" aria-pressed="${current?.id === preset.id && first?.color === preset.color.toLowerCase()}" ${reason ? 'disabled' : ''}><span data-finish-preview="${preset.id}"></span><span class="inspector-finish-caption">${esc(preset.name)}</span></button>`).join('')}
    </div>
  </section>`;
  fillFinishSwatches(container);
  container.querySelector<HTMLSelectElement>('select')!.onchange = event => {
    state.surface = (event.target as HTMLSelectElement).value as WallSelectionFinishSurface;
    renderWallSelectionFinishes(container, ids, config, state);
    container.querySelector<HTMLSelectElement>('select')!.focus();
  };
  container.querySelectorAll<HTMLButtonElement>('[data-wall-selection-finish]').forEach(button => button.onclick = () => {
    if (button.disabled) return;
    const preset = FINISH_PRESETS.find(value => value.id === button.dataset.wallSelectionFinish)!;
    try {
      const operations = buildWallSelectionFinishOperations(config.getScene(), preset, ids, state.surface);
      if (operations.length) config.execute(operations, `Paint ${ids.length} walls · ${preset.name}`);
      config.refresh();
    } catch (error) {
      config.notice(error instanceof Error ? error.message : 'The selected walls could not be painted.', true);
      config.refresh();
    }
  });
}
