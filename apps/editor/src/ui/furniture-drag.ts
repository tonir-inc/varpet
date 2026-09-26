import type { CatalogAsset } from '../contracts';

export const FURNITURE_DRAG_TYPE = 'application/x-varpet-furniture';

/** Native drag lifetime survives a scene refresh removing the source card. */
export function bindFurnitureDragCard(card: HTMLButtonElement, asset: CatalogAsset, options: {
  enabled(): boolean;
  add(): void;
  start(asset: CatalogAsset): void;
  end(): void;
}): void {
  card.draggable = true;
  card.style.cursor = 'grab';
  card.title = `Drag ${asset.name} onto the floor, or click to add`;
  let dragging = false;
  let suppressClickUntil = 0;
  card.addEventListener('click', event => {
    if (dragging || (event.detail !== 0 && performance.now() < suppressClickUntil)) { event.preventDefault(); return; }
    options.add();
  });
  card.addEventListener('dragstart', event => {
    if (!options.enabled() || !event.dataTransfer) { event.preventDefault(); return; }
    event.dataTransfer.setData(FURNITURE_DRAG_TYPE, asset.id);
    event.dataTransfer.effectAllowed = 'copy';
    dragging = true;
    card.classList.add('is-dragging');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      if (!dragging) return;
      dragging = false;
      suppressClickUntil = performance.now() + 250;
      clearTimeout(timer);
      controller.abort();
      card.classList.remove('is-dragging');
      options.end();
    };
    const listenerOptions = { capture: true, signal: controller.signal };
    // A successful command replaces the card. Listen on both that original
    // element and window, and defer the drop fallback until its target commits.
    card.addEventListener('dragend', end, listenerOptions);
    window.addEventListener('dragend', end, listenerOptions);
    window.addEventListener('drop', () => { timer = setTimeout(end, 0); }, listenerOptions);
    window.addEventListener('blur', end, listenerOptions);
    window.addEventListener('pagehide', end, listenerOptions);
    options.start(asset);
  });
}
