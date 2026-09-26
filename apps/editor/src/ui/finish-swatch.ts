import { getFinishPreset, type FinishPreset } from '../core/finish-presets';
import { getFinishPreview, prepareFinishPreviews } from '../render/finish-previews';
import './finish-swatch.css';

/** Both finish pickers use the room renderer's material, with a CSS fallback. */
export function createFinishSwatch(preset: FinishPreset): HTMLSpanElement {
  const swatch = document.createElement('span');
  swatch.className = `finish-swatch finish-swatch-${preset.pattern}`;
  swatch.dataset.finishPreview = preset.id;
  swatch.setAttribute('aria-hidden', 'true');
  swatch.style.setProperty('--finish-color', preset.color);
  swatch.style.setProperty('--finish-accent', preset.accent);
  swatch.style.setProperty('--finish-repeat-x', `${preset.size[0] * 70}px`);
  swatch.style.setProperty('--finish-repeat-y', `${preset.size[1] * 70}px`);
  const showPreview = () => {
    const preview = getFinishPreview(preset);
    if (!preview) return;
    swatch.style.backgroundImage = `url("${preview}")`;
    swatch.classList.add('has-rendered-preview');
  };
  showPreview();
  if (preset.pattern !== 'solid') void prepareFinishPreviews().then(showPreview);
  return swatch;
}

export function fillFinishSwatches(container: HTMLElement): void {
  for (const slot of container.querySelectorAll<HTMLElement>('[data-finish-preview]')) {
    const preset = getFinishPreset(slot.dataset.finishPreview!);
    if (preset) slot.replaceWith(createFinishSwatch(preset));
  }
}
