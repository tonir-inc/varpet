/** Isolated browser regression for the actual viewport drop lifecycle and history. */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { CatalogAsset, SceneObject, Vec3, ViewMode } from '../contracts';
import { localCatalog, demoScene } from '../core/demo';
import { EditorStore } from '../core/store';
import { createViewport } from './viewport';
import { bindFurnitureDragCard, FURNITURE_DRAG_TYPE } from '../ui/furniture-drag';

const mime = FURNITURE_DRAG_TYPE;
const asset = localCatalog.find(item => item.id === 'nightstand')!;
const initial = structuredClone(demoScene);
initial.id = 'drop-qa'; initial.objects = [];
// Deliberately far from world origin, like an imported developer plan.
for (const room of initial.rooms) for (const p of room.polygon) { p[0] += 30; p[1] += 20; }
for (const wall of initial.walls) for (const p of [wall.start, wall.end]) { p[0] += 30; p[1] += 20; }
const store = new EditorStore(initial, localCatalog);
const output = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLElement>('#status')!;
const card = document.querySelector<HTMLButtonElement>('#card')!;
const nativeEvents = document.createElement('div');
nativeEvents.setAttribute('aria-label', 'Native drag events');
nativeEvents.style.cssText = 'font:11px monospace;white-space:pre-wrap';
output.after(nativeEvents);
let tracingNative = false;
function nativeLog(message: string): void {
  if (!tracingNative) return;
  const line = document.createElement('div');
  line.textContent = `${performance.now().toFixed(1)} ${message}`;
  nativeEvents.append(line);
  while (nativeEvents.childElementCount > 12) nativeEvents.firstElementChild?.remove();
}
let controls: TransformControls;
const originalSetMode = TransformControls.prototype.setMode;
TransformControls.prototype.setMode = function (...args) { controls = this; return originalSetMode.apply(this, args); };
let interacting = false, commits = 0;
let cardAdds = 0, cardStarts = 0, cardEnds = 0;
const errors: string[] = [], results: string[] = [];
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect: id => viewport.setSelection(id), onTransform() {},
  onInteraction(active) { nativeLog(`interaction ${interacting} → ${active}`); interacting = active; },
  onError(message) { nativeLog(`error: ${message}`); errors.push(message); },
  onFurnitureDrop(assetId: string, position: Vec3) {
    if (interacting) throw new Error('Interaction gate remained closed during drop commit');
    const object: SceneObject = { id: crypto.randomUUID(), assetId, name: asset.name, position, rotation: 0, scale: [1, 1, 1] };
    const result = store.execute({ id: crypto.randomUUID(), source: 'human', label: 'Drop furniture', baseRevision: store.revision, operations: [{ type: 'add', object }] }, true);
    if (!result.ok) { errors.push(...result.errors); return; }
    commits++; viewport.setSelection(object.id); viewport.setTool('move'); viewport.animatePlacement(object.id);
  },
} as Parameters<typeof createViewport>[1]) as ReturnType<typeof createViewport> & { setFurnitureDrag?(asset: CatalogAsset | null): void };
store.subscribe(() => { viewport.setScene(store.scene, localCatalog); status.textContent = `${store.scene.objects.length} pieces · revision ${store.revision}`; });
viewport.setScene(store.scene, localCatalog); viewport.setWalls('hidden');
const canvas = document.querySelector<HTMLCanvasElement>('#view canvas')!;
for (const type of ['dragstart', 'dragover', 'drop', 'dragend']) document.addEventListener(type, e => {
  if (!e.isTrusted) return;
  if (type === 'dragstart') { tracingNative = true; nativeEvents.textContent = ''; }
  const event = e as DragEvent;
  const target = event.target instanceof Element ? `${event.target.tagName}#${event.target.id}` : String(event.target);
  nativeLog(`Native ${type} ${event.clientX},${event.clientY} ${target} · types=${[...event.dataTransfer?.types ?? []].join(',')} · pieces=${store.scene.objects.length} active=${interacting} starts/ends=${cardStarts}/${cardEnds}`);
}, true);
for (const type of ['blur', 'focus', 'pointercancel', 'lostpointercapture', 'pointerup', 'keydown']) window.addEventListener(type, event => {
  const target = event.target instanceof Element ? `${event.target.tagName}#${event.target.id}` : String(event.target);
  nativeLog(`${type} on ${target} · interaction=${interacting}${event instanceof KeyboardEvent ? ` · key=${event.key}` : ''}`);
}, true);
bindFurnitureDragCard(card, asset, {
  enabled: () => !interacting,
  add: () => { cardAdds++; nativeLog(`card click-add ${cardAdds}`); },
  start: item => { cardStarts++; nativeLog(`card start ${cardStarts} · asset=${item.id}`); viewport.setFurnitureDrag?.(item); },
  end: () => { cardEnds++; nativeLog(`card end ${cardEnds}`); viewport.setFurnitureDrag?.(null); },
});
document.querySelector<HTMLButtonElement>('#undo')!.onclick = () => { viewport.cancelInteraction(); store.undo(); };
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function check(ok: unknown, message: string) { if (!ok) throw new Error(message); results.push(`PASS ${message}`); output.textContent = results.join('\n'); }
function point(position: Vec3) {
  controls.camera.updateMatrixWorld();
  const projected = new THREE.Vector3(...position).project(controls.camera), rect = canvas.getBoundingClientRect();
  return { clientX: rect.left + (projected.x + 1) * rect.width / 2, clientY: rect.top + (1 - projected.y) * rect.height / 2 };
}
function transfer(id = asset.id) { const data = new DataTransfer(); data.setData(mime, id); data.effectAllowed = 'copy'; return data; }
function event(type: string, position: Vec3, data: DataTransfer) {
  const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data, ...point(position) }); canvas.dispatchEvent(e); return e;
}
function begin() { const data = transfer(); viewport.setFurnitureDrag?.(asset); return data; }
async function view(mode: ViewMode) { viewport.setView(mode); viewport.focus(); await delay(550); }
function lastPosition() { return store.scene.objects.at(-1)?.position; }
function equals(a: Vec3 | undefined, b: Vec3) { return !!a && a.every((n, i) => Math.abs(n - b[i]!) < 1e-6); }
document.querySelector<HTMLButtonElement>('#run')!.onclick = async e => {
  const button = e.currentTarget as HTMLButtonElement; button.disabled = true; results.length = 0;
  try {
    check(typeof viewport.setFurnitureDrag === 'function', 'viewport accepts furniture library drag sessions');
    await view('perspective'); viewport.setSnap(true);
    let revision = store.revision, data = begin();
    const hover = event('dragover', [27.2, 0, 20.05], data);
    // Chromium owns dropEffect during real native DnD; constructed DragEvents
    // leave it at "none" even when the listener accepts and previews the drop.
    const hint = document.querySelector<HTMLElement>('.furniture-drop-hint');
    check(hover.defaultPrevented && hint && !hint.hidden && hint.textContent?.startsWith('Drop to add'), '3D canvas accepts and previews a supported library drop');
    check(interacting && store.revision === revision, 'hover is a transient preview without a scene mutation');
    event('drop', [27.2, 0, 20.05], data);
    check(equals(lastPosition(), [27.25, 0, 20]), `perspective drop follows pointer in translated flat and snaps to 0.25 m (actual=${JSON.stringify(lastPosition())}; expected=[27.25,0,20])`);
    check(store.revision === revision + 1 && !interacting, 'drop commits once and releases the interaction gate');
    const count = store.scene.objects.length, applied = commits;
    event('drop', [27.2, 0, 20.05], data);
    check(store.scene.objects.length === count && commits === applied, 'replayed drop cannot create a duplicate');
    store.undo(); check(store.scene.objects.length === count - 1, 'one undo removes the dropped piece');
    store.redo(); check(equals(lastPosition(), [27.25, 0, 20]), 'redo restores the exact dropped position');

    await view('top'); viewport.setSnap(false); data = begin();
    event('dragover', [27.613, 0, 18.137], data);
    const smoothDrop = event('drop', [27.613, 0, 18.137], data);
    // DragEvent quantizes client coordinates. Compare the placed object's
    // projection to the actual delivered pixel, not the pre-rounded world input.
    const placedPixel = point(lastPosition()!);
    check(Math.hypot(placedPixel.clientX - smoothDrop.clientX, placedPixel.clientY - smoothDrop.clientY) < 1e-4,
      'Top view respects smooth placement at the exact delivered pointer pixel');
    viewport.setSnap(true);
    revision = store.revision; data = begin();
    event('dragover', [36, 0, 20], data); event('drop', [36, 0, 20], data);
    check(store.revision === revision && !interacting, 'drop outside supported room floors does not add a piece');
    data = begin(); event('dragover', [26.5, 0, 20], data); viewport.cancelInteraction(); event('drop', [26.5, 0, 20], data);
    check(store.revision === revision && !interacting, 'Escape-style cancellation leaves no piece or active interaction');
    data = begin(); event('dragover', [26.5, 0, 20], data); window.dispatchEvent(new Event('blur'));
    check(!interacting && store.revision === revision, 'losing window focus cancels the drag');
    data = begin(); event('dragover', [26.5, 0, 20], data); document.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    check(!interacting && store.revision === revision, 'dropping outside the canvas releases the drag session');
    data = begin(); event('dragover', [26.5, 0, 20], data); event('dragleave', [26.5, 0, 20], data);
    event('dragover', [26.5, 0, 20], data); event('drop', [26.5, 0, 20], data);
    check(store.revision === revision + 1 && equals(lastPosition(), [26.5, 0, 20]), 'leaving and reentering the canvas preserves a valid drag');
    revision = store.revision; viewport.setFurnitureDrag?.(asset); data = transfer('unrelated-product');
    event('drop', [26.5, 0, 18], data);
    check(store.revision === revision, 'mismatched drag payload cannot place another asset'); viewport.cancelInteraction();
    data = begin(); event('dragover', [26.5, 0, 18], data); viewport.setView('perspective');
    check(!interacting && store.revision === revision, 'changing view cancels the placement preview');
    const external = new DataTransfer(); external.setData('text/plain', 'nightstand');
    const foreign = event('dragover', [26.5, 0, 18], external);
    check(!foreign.defaultPrevented && store.revision === revision, 'unrelated file/text drags are ignored');

    // Exercise the exact library card binder as well as the viewport session API.
    // Constructing these DragEvents covers lifecycle semantics; the manual card
    // remains available above for a real native pointer drag.
    await view('top');
    revision = store.revision;
    const starts = cardStarts, ends = cardEnds, adds = cardAdds;
    data = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
    check(card.draggable && data.getData(mime) === asset.id && interacting && cardStarts === starts + 1,
      'library card binder starts a session with the furniture payload');
    // Native HTML drag promotion cancels the browser's preceding pointer stream.
    // Chrome can deliver that cancellation to the canvas as the drag enters it;
    // it must not cancel the independent catalog drag/drop session.
    canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
    check(interacting && cardEnds === ends && store.revision === revision,
      'native pointer cancellation during drag promotion preserves the catalog drag');
    const parent = card.parentNode!, sibling = card.nextSibling;
    try {
      card.remove();
      event('dragover', [26.5, 0, 18], data); event('drop', [26.5, 0, 18], data);
      // A source removed during a successful render may receive no bubbling
      // dragend. The window drop fallback must finish after the target commit.
      await delay(0);
      check(store.revision === revision + 1 && equals(lastPosition(), [26.5, 0, 18]),
        'a detached source card still delivers exactly one checked drop');
      check(cardEnds === ends + 1 && !card.classList.contains('is-dragging') && !interacting,
        'drop completion cleans the detached source and interaction without dragend');
      check(cardAdds === adds, 'dropping a library card does not also invoke click-add');
    } finally { parent.insertBefore(card, sibling); }

    revision = store.revision; data = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: data }));
    const pointerClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
    card.dispatchEvent(pointerClick);
    check(!interacting && cardEnds === ends + 2 && !card.classList.contains('is-dragging') && store.revision === revision,
      'canceling the native card drag clears its session without adding furniture');
    check(pointerClick.defaultPrevented && cardAdds === adds,
      'a pointer click immediately following a canceled drag cannot add a stray piece');
    card.click();
    check(cardAdds === adds + 1, 'keyboard click-add remains available immediately after a canceled drag');
    check(errors.length === 2, `only expected floor and mismatched-payload rejections reported (${errors.length} errors)`);
    output.textContent = `${results.join('\n')}\nCOMPLETE ${results.length} browser checks.`;
  } catch (error) { output.textContent = `${results.join('\n')}\nFAIL ${String(error)}`; }
  finally { viewport.cancelInteraction(); button.disabled = false; }
};
