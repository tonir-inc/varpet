import type { Operation, SceneDocument } from '../contracts';
import { apartmentHeights, buildHeightOperations, roomCeilingHeight, type HeightTarget } from '../core/heights';

interface HeightControlOptions {
  getScene(): SceneDocument;
  execute(operations: Operation[], label: string, onDeferredApply?: () => void): boolean;
  notice(message: string, error?: boolean): void;
  showFullHeight?(): void;
}

export function heightControlMarkup(scene: SceneDocument, target?: HeightTarget, disabled = false): string {
  const values = target?.kind === 'wall' ? [scene.walls.find(wall => wall.id === target.id)!.height]
    : target?.kind === 'room' ? [roomCeilingHeight(scene, scene.rooms.find(room => room.id === target.id)!)] : apartmentHeights(scene);
  const same = values.length > 0 && values.every(value => Math.abs(value - values[0]!) < 1e-5);
  const label = target?.kind === 'wall' ? 'Wall height (m)' : target ? 'Ceiling height (m)' : 'Apartment height (m)';
  const provisional = target?.kind === 'room' && scene.project?.metadata[target.id]?.ceilingHeight === undefined;
  return `<form data-height-form class="property-section"><fieldset ${disabled || !values.length ? 'disabled' : ''}><label class="text-field">${label}<input name="shell-height" aria-label="${label}" type="number" min="0.2" max="${target?.kind === 'room' ? 10 : 6}" step="any" required value="${same ? values[0] : ''}" placeholder="${values.length ? 'Mixed heights' : 'No shell'}"></label>${!target ? `<p class="field-note">${!same && values.length ? `Current heights: ${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)} m. ` : ''}Sets all active walls and room ceilings together. Floor elevations stay in place.</p>` : `<p class="field-note">${provisional ? 'Provisional height from the shell; add a measurement in Renovate. ' : ''}${target.kind === 'room' ? 'Ceiling above this room’s floor. Wall heights are separate.' : 'Full height above this wall’s base.'}</p>`}<button type="submit" class="button full">${target ? 'Apply height' : 'Apply to apartment'}</button></fieldset><p data-height-error class="inspector-error" role="alert" hidden></p><p class="field-note">Cutaway shortens walls on screen.</p><button type="button" class="button full" data-height-view>Show full height</button></form>`;
}

export function bindHeightControl(container: HTMLElement, options: HeightControlOptions, target?: HeightTarget): void {
  const form = container.querySelector<HTMLFormElement>('[data-height-form]');
  if (!form) return;
  form.onsubmit = event => {
    event.preventDefault();
    try {
      const input = form.elements.namedItem('shell-height') as HTMLInputElement;
      const operations = buildHeightOperations(options.getScene(), input.valueAsNumber, target);
      if (!operations.length) { options.notice('This height is already applied.'); return; }
      const applied = options.execute(operations, target ? `Change ${target.kind} height` : 'Change apartment height', options.showFullHeight);
      if (applied) options.showFullHeight?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'This height could not be applied.';
      const output = form.querySelector<HTMLElement>('[data-height-error]')!;
      output.hidden = false; output.textContent = message;
      options.notice(message, true);
    }
  };
  const show = form.querySelector<HTMLButtonElement>('[data-height-view]')!;
  show.hidden = !options.showFullHeight;
  show.onclick = () => options.showFullHeight?.();
}
