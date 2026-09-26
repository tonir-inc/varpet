/** Browser-only QA: samples real rendered cameras against an inspector-sized overlay. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createViewport } from './viewport';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';

type Rect = { left: number; top: number; right: number; bottom: number };
type Sample = { position: THREE.Vector3; target: THREE.Vector3; quaternion: THREE.Quaternion; zoom: number };
const output = document.querySelector<HTMLPreElement>('#result')!;
const container = document.querySelector<HTMLDivElement>('#view')!;
const wardrobe = 'bedroom-wardrobe';
const results: string[] = [], errors: string[] = [];
window.addEventListener('error', event => errors.push(`Uncaught: ${event.message}`));
window.addEventListener('unhandledrejection', event => errors.push(`Unhandled rejection: ${String(event.reason)}`));
let reduced = false;
const preferenceListeners = new Set<() => void>();
const matchMedia = window.matchMedia.bind(window);
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? {
  get matches() { return reduced; }, media: query, onchange: null,
  addEventListener(_event: string, listener: () => void) { preferenceListeners.add(listener); },
  removeEventListener(_event: string, listener: () => void) { preferenceListeners.delete(listener); },
} as unknown as MediaQueryList : matchMedia(query);
function setReduced(value: boolean): void { reduced = value; for (const listener of preferenceListeners) listener(); }

let orbit: OrbitControls | undefined;
const originalUpdate = OrbitControls.prototype.update;
OrbitControls.prototype.update = function (...args) { orbit = this; return originalUpdate.apply(this, args); };
let transform: TransformControls | undefined;
const originalSetMode = TransformControls.prototype.setMode;
TransformControls.prototype.setMode = function (...args) { transform = this; return originalSetMode.apply(this, args); };
const store = new EditorStore(demoScene, localCatalog);
const viewport = createViewport(container, {
  onSelect: id => viewport.setSelection(id), onInteraction() {}, onError: message => errors.push(message), onTransform() {},
});
viewport.setScene(store.scene, localCatalog); viewport.setSelection(wardrobe); viewport.setTool('move');
OrbitControls.prototype.update = originalUpdate;
TransformControls.prototype.setMode = originalSetMode;

let world: THREE.Scene | undefined, renderedCamera: THREE.Camera | undefined;
let samples: Sample[] = [];
let renderCount = 0;
let probe: THREE.Mesh | undefined;
transform?.object?.traverse(node => { if (!probe && node instanceof THREE.Mesh) probe = node; });
if (probe) probe.onBeforeRender = (_renderer, scene, camera) => {
  if (!(scene instanceof THREE.Scene) || !scene.background || !orbit) return;
  world = scene; renderedCamera = camera; renderCount++;
  samples.push(snapshot());
};
function snapshot(): Sample {
  if (!orbit) throw new Error('Real OrbitControls unavailable');
  const camera = orbit.object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  return { position: camera.position.clone(), target: orbit.target.clone(), quaternion: camera.quaternion.clone(), zoom: camera.zoom };
}
function available(): Rect { return { left: 24, top: 80, right: container.clientWidth - 316, bottom: container.clientHeight - 80 }; }
function reveal(): void {
  const api = viewport as typeof viewport & { revealSelection?: (rect: Rect) => void };
  if (typeof api.revealSelection !== 'function') throw new Error('Selection reveal is missing: opening the inspector does not keep the wardrobe visible');
  api.revealSelection(available());
}
function projected(ids: string[]): Rect {
  if (!world || !renderedCamera) throw new Error('No camera frame was rendered');
  const box = new THREE.Box3();
  for (const id of ids) {
    let root: THREE.Object3D | undefined;
    world.traverse(node => { if (node.userData.objectId === id) root = node; });
    if (!root) throw new Error(`Missing rendered object ${id}`);
    box.union(new THREE.Box3().setFromObject(root));
  }
  const points: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    points.push(new THREE.Vector3(x, y, z).project(renderedCamera));
  }
  return { left: Math.min(...points.map(p => (p.x + 1) * container.clientWidth / 2)),
    right: Math.max(...points.map(p => (p.x + 1) * container.clientWidth / 2)),
    top: Math.min(...points.map(p => (1 - p.y) * container.clientHeight / 2)),
    bottom: Math.max(...points.map(p => (1 - p.y) * container.clientHeight / 2)) };
}
function fits(bounds: Rect): boolean {
  const safe = available(), epsilon = 1;
  return bounds.left >= safe.left - epsilon && bounds.right <= safe.right + epsilon && bounds.top >= safe.top - epsilon && bounds.bottom <= safe.bottom + epsilon;
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function check(ok: unknown, message: string): void { if (!ok) throw new Error(message); results.push(`PASS ${message}`); output.textContent = results.join('\n'); }
async function reset(view: 'perspective' | 'top' = 'perspective'): Promise<void> {
  setReduced(true); viewport.setView(view); viewport.focus(); viewport.setSelection(wardrobe); viewport.setTool('select');
  await delay(120); setReduced(false); samples = [];
}
function stable(a: Sample, b: Sample): boolean { return a.position.distanceTo(b.position) < 1e-7 && a.target.distanceTo(b.target) < 1e-7 && Math.abs(a.zoom - b.zoom) < 1e-7; }
function withSyntheticPointer(canvas: HTMLCanvasElement, pointerId: number, dispatch: () => void): void {
  const capture = canvas.setPointerCapture, release = canvas.releasePointerCapture;
  canvas.setPointerCapture = function (id) { if (id !== pointerId) capture.call(this, id); };
  canvas.releasePointerCapture = function (id) { if (id !== pointerId) release.call(this, id); };
  try { dispatch(); }
  finally { canvas.setPointerCapture = capture; canvas.releasePointerCapture = release; }
}
document.querySelector<HTMLButtonElement>('#reveal')!.onclick = async () => { try { await reset(); reveal(); } catch (error) { output.textContent = String(error); } };
document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true; results.length = 0;
  try {
    await reset();
    const initialBounds = projected([wardrobe]);
    check(!fits(initialBounds), `fixture begins with wardrobe covered by inspector (object ${JSON.stringify(initialBounds)}, available ${JSON.stringify(available())})`);
    const saved = JSON.stringify(store.scene), revision = store.revision, before = snapshot();
    reveal(); await delay(550);
    const after = snapshot();
    check(fits(projected([wardrobe])), 'wardrobe settles fully inside the available view');
    check(samples.some(s => s.position.distanceTo(before.position) > 0.0001 && s.position.distanceTo(after.position) > 0.0001), 'reveal has intermediate rendered camera positions');
    check(samples.every(s => Math.abs(s.zoom - before.zoom) < 1e-7 && s.quaternion.angleTo(before.quaternion) < 1e-6), 'reveal preserves camera zoom and viewing angle throughout');
    check(samples.every(s => Math.abs(s.position.distanceTo(s.target) - before.position.distanceTo(before.target)) < 1e-6), 'camera and orbit target move together without changing viewing distance');
    const settled = snapshot(); samples = []; reveal(); await delay(500);
    check(stable(settled, snapshot()), 'already visible selection leaves camera unchanged');
    await reset('top'); viewport.setSelection(wardrobe, [wardrobe, 'bedside-table']); reveal(); await delay(550);
    check(fits(projected([wardrobe, 'bedside-table'])), 'Top view reveals the combined furniture selection');
    await reset(); reveal(); await delay(75); viewport.setSelection(null);
    const cleared = snapshot(); await delay(500);
    check(stable(cleared, snapshot()), 'clearing selection cancels its pending camera movement');
    await reset(); reveal(); await delay(75);
    const canvas = container.querySelector('canvas')!, canvasBounds = canvas.getBoundingClientRect();
    // Synthetic pointers have no browser capture token; all real control listeners still run in their normal order.
    withSyntheticPointer(canvas, 99, () => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 99, pointerType: 'mouse', button: 2, clientX: canvasBounds.left + 4, clientY: canvasBounds.top + 4 }));
      canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 99, pointerType: 'mouse' }));
    });
    const interrupted = snapshot(); await delay(500);
    check(stable(interrupted, snapshot()), 'canvas pointer input cancels automatic framing');
    await reset(); reveal(); await delay(65); setReduced(true); await delay(120);
    check(fits(projected([wardrobe])), 'live reduced motion immediately settles the selected object into view');
    const reducedPose = snapshot(); await delay(120);
    check(stable(reducedPose, snapshot()), 'reduced-motion reveal remains settled');
    check(store.revision === revision && JSON.stringify(store.scene) === saved, 'camera reveal never changes scene data or history');
    await delay(350); const idleCount = renderCount; await delay(180);
    check(renderCount === idleCount, 'settled renderer returns to idle');
    check(errors.length === 0 && !!world, `real renderer completed without reported errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
    output.textContent = `${results.join('\n')}\nCOMPLETE ${results.length} browser checks.`;
  } catch (error) { output.textContent = `${results.join('\n')}\nFAIL ${String(error)}`; }
  finally { setReduced(false); button.disabled = false; }
};
