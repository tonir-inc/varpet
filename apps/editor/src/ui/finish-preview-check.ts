import { FINISH_DRAG_TYPE, FINISH_PRESETS } from '../core/finish-presets';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';
import { getFinishPreview, prepareFinishPreviews } from '../render/finish-previews';
import { renderEntityInspector } from './inspector';
import { createMaterialsUI } from './materials';

/** Browser/GPU regression: actual swatch pixels and both real finish pickers. */
export async function checkFinishPreviews(container: HTMLElement, fallback = false): Promise<string> {
  let count = 0;
  const check = (value: unknown, label: string) => { if (!value) throw new Error(label); count++; };
  const originalContext = HTMLCanvasElement.prototype.getContext;
  if (fallback) {
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof originalContext>) {
      if (String(args[0]).startsWith('webgl')) return null;
      return originalContext.apply(this, args);
    } as typeof originalContext;
  }
  container.innerHTML = '<section><h2>Floor properties</h2><div class="qa-panel" data-properties></div></section><section><h2>Materials</h2><div class="qa-panel" data-materials></div></section><section><h2>Wall paint</h2><div class="qa-panel" data-paint></div></section>';
  const properties = container.querySelector<HTMLElement>('[data-properties]')!;
  const library = container.querySelector<HTMLElement>('[data-materials]')!;
  const paint = container.querySelector<HTMLElement>('[data-paint]')!;
  const store = new EditorStore(demoScene, localCatalog);
  let dragged: string | null = null;
  const roomId = store.scene.rooms[0]!.id;
  const config = {
    getScene: () => store.scene, getCatalog: () => localCatalog,
    execute: (operations: Parameters<EditorStore['execute']>[0]['operations'], label: string) => store.execute({ id: crypto.randomUUID(), source: 'human', baseRevision: store.revision, label, operations }, true).ok,
    refresh: render, advanced() {}, notice() {}, getDoorAngle: () => 0, testDoor() {},
    onFinishDragStart: (preset: { id: string }) => { dragged = preset.id; },
    onFinishDragEnd: () => { dragged = null; },
  };
  function render() { renderEntityInspector(properties, roomId, config); }
  let chosen: string | null = null;
  const materials = createMaterialsUI(library, { onChoose: preset => { chosen = preset?.id ?? null; }, onDragStart() {}, onDragEnd() {} });
  await prepareFinishPreviews();
  HTMLCanvasElement.prototype.getContext = originalContext;
  render();
  renderEntityInspector(paint, 'wall-spine', config);
  const unsubscribe = store.subscribe(render);
  const floorCount = FINISH_PRESETS.filter(p => p.category === 'floor').length;
  try {
    check(properties.querySelectorAll('.finish-swatch').length === floorCount, 'All floor choices have previews');
    const imageSources = new Set<string>();
    for (const preset of FINISH_PRESETS.filter(p => p.category === 'floor')) {
      const inInspector = properties.querySelector<HTMLElement>(`[data-finish-preview="${preset.id}"]`)!;
      const inLibrary = library.querySelector<HTMLElement>(`[data-finish-preview="${preset.id}"]`)!;
      check(inInspector.style.backgroundImage === inLibrary.style.backgroundImage, `${preset.id}: pickers show identical material renders`);
      check(inInspector.getBoundingClientRect().height >= 60, `${preset.id}: sample has enough height for pattern detail`);
      check(inInspector.parentElement!.textContent!.includes(preset.description), `${preset.id}: floor size and finish are visible`);
      const source = getFinishPreview(preset);
      if (fallback) {
        check(source === undefined && !inInspector.classList.contains('has-rendered-preview'), `${preset.id}: no failed WebGL image`);
        check(getComputedStyle(inInspector).backgroundImage !== 'none', `${preset.id}: CSS pattern survives unavailable WebGL`);
      } else {
        check(source?.startsWith('data:image/png'), `${preset.id}: actual material renderer produced a sample`);
        check(getFinishPreview(preset) === source, `${preset.id}: repeated requests reuse the rendered sample`);
        imageSources.add(source!);
        const image = new Image(); image.src = source!; await image.decode();
        check(image.width === 320 && image.height === 200, `${preset.id}: preview preserves framing aspect ratio`);
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set<number>();
        for (let i = 0; i < pixels.length; i += 4) colors.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!);
        check(colors.size > 20, `${preset.id}: preview contains material detail, not a uniform color`);
      }
    }
    if (!fallback) check(imageSources.size === floorCount, 'All floor material samples remain distinct');
    const paintSwatches = [...paint.querySelectorAll<HTMLElement>('.finish-swatch')];
    check(paintSwatches.length === 16, 'Both wall sides retain all paint choices');
    check(paintSwatches.every(swatch => getComputedStyle(swatch).backgroundImage === 'none' && swatch.getBoundingClientRect().height === 30), 'Paint stays compact and has no invented material pattern');
    const floorChoice = properties.querySelector<HTMLButtonElement>('[data-finish="oak"]')!;
    const revision = store.revision; floorChoice.click();
    check(store.revision === revision + 1, 'Clicking the rendered sample applies exactly one checked change');
    check(properties.querySelector('[data-finish="oak"]')!.getAttribute('aria-pressed') === 'true', 'Applied sample retains selected state after rerender');
    store.undo();
    check(properties.querySelector('[data-finish="oak"]')!.getAttribute('aria-pressed') === 'false', 'Undo clears the applied selection');
    store.redo();
    check(properties.querySelector('[data-finish="oak"]')!.getAttribute('aria-pressed') === 'true', 'Redo restores the applied selection');
    library.querySelector<HTMLButtonElement>('[data-finish-id="slate"]')!.click();
    check(chosen === 'slate', 'The Materials card still selects its finish');
    library.querySelector<HTMLButtonElement>('[data-material-category="wall"]')!.click();
    check(chosen === null && !library.querySelector<HTMLButtonElement>('[data-finish-id="sage"]')!.hidden, 'Switching to paint clears the brush and reveals paint choices');
    library.querySelector<HTMLButtonElement>('[data-material-category="floor"]')!.click();
    materials.setActive('oak');
    const dragSource = properties.querySelector<HTMLButtonElement>('[data-finish="slate"]')!;
    const transfer = new DataTransfer();
    const beforeDrag = store.revision;
    dragSource.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    check(transfer.getData(FINISH_DRAG_TYPE) === 'slate' && dragged === 'slate', 'Rendered sample starts a drag with the original finish payload');
    check(dragSource.classList.contains('is-dragging'), 'Dragging keeps its visual feedback');
    window.dispatchEvent(new DragEvent('dragend', { dataTransfer: transfer }));
    check(dragged === null && !dragSource.classList.contains('is-dragging'), 'Drag completion clears the brush and feedback');
    check(store.revision === beforeDrag, 'Preview drag does not mutate the scene');
    return `PASS ${count} finish preview assertions (${fallback ? 'WebGL fallback' : 'actual GPU samples'}).`;
  } finally {
    unsubscribe();
    // Keep both pickers visible for visual QA; the page owns their lifetime.
    window.addEventListener('pagehide', () => materials.dispose(), { once: true });
    HTMLCanvasElement.prototype.getContext = originalContext;
  }
}
