/** Browser QA samples real rendered cameras; expected room volumes come from scene data. */
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
const results: string[] = [], errors: string[] = [];
window.addEventListener('error', event => errors.push(`Uncaught: ${event.message}`));
window.addEventListener('unhandledrejection', event => errors.push(`Unhandled rejection: ${String(event.reason)}`));
let reduced = true;
const preferenceListeners = new Set<() => void>();
const matchMedia = window.matchMedia.bind(window);
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? {
  get matches() { return reduced; }, media: query, onchange: null,
  addEventListener(_event: string, listener: () => void) { preferenceListeners.add(listener); },
  removeEventListener(_event: string, listener: () => void) { preferenceListeners.delete(listener); },
} as unknown as MediaQueryList : matchMedia(query);
function setReduced(value: boolean): void { reduced = value; for (const listener of preferenceListeners) listener(); }

let orbit: OrbitControls | undefined, transform: TransformControls | undefined;
const originalUpdate = OrbitControls.prototype.update;
OrbitControls.prototype.update = function (...args) { orbit = this; return originalUpdate.apply(this, args); };
const originalSetMode = TransformControls.prototype.setMode;
TransformControls.prototype.setMode = function (...args) { transform = this; return originalSetMode.apply(this, args); };
const store = new EditorStore(demoScene, localCatalog);
const viewport = createViewport(container, {
  onSelect: id => { viewport.setSelection(id); if (id && store.scene.rooms.some(room => room.id === id)) reveal(); },
  onInteraction() {}, onError: message => errors.push(message), onTransform() {},
});
viewport.setScene(store.scene, localCatalog); viewport.setSelection('bedroom-wardrobe'); viewport.setTool('move');
OrbitControls.prototype.update = originalUpdate;
TransformControls.prototype.setMode = originalSetMode;

let world: THREE.Scene | undefined, renderedCamera: THREE.Camera | undefined;
let samples: Sample[] = [], renderCount = 0, lastFrame = -1;
const monitored = new WeakSet<THREE.Mesh>();
function monitor(mesh: THREE.Mesh): void {
  if (monitored.has(mesh)) return;
  monitored.add(mesh);
  const original = mesh.onBeforeRender;
  mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    original.call(this, renderer, scene, camera, geometry, material, group);
    if (!(scene instanceof THREE.Scene) || !scene.background || camera !== orbit?.object) return;
    // Follow every visible mesh so a close room framing cannot cull the sole probe.
    if (world !== scene) scene.traverse(node => { if (node instanceof THREE.Mesh) monitor(node); });
    world = scene; renderedCamera = camera;
    if (renderer.info.render.frame === lastFrame) return;
    lastFrame = renderer.info.render.frame; renderCount++; samples.push(snapshot());
  };
}
transform?.object?.traverse(node => { if (node instanceof THREE.Mesh) monitor(node); });

function snapshot(): Sample {
  if (!orbit) throw new Error('Real OrbitControls unavailable');
  const camera = orbit.object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  return { position: camera.position.clone(), target: orbit.target.clone(), quaternion: camera.quaternion.clone(), zoom: camera.zoom };
}
function available(): Rect { return { left: 24, top: 80, right: container.clientWidth - 316, bottom: container.clientHeight - 80 }; }
function reveal(): void { viewport.revealSelection(available()); }
function select(id: string): void {
  viewport.setSelection(id); viewport.setTool('select'); reveal();
  document.querySelector('#selected')!.textContent = store.scene.rooms.find(room => room.id === id)?.name ?? id;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-room]')) button.setAttribute('aria-pressed', String(button.dataset.room === id));
}
function projectedRoom(id: string, ceilingHeight?: number): Rect {
  if (!renderedCamera) throw new Error('No room camera frame was rendered');
  const room = store.scene.rooms.find(item => item.id === id);
  if (!room) throw new Error(`Missing authoritative room ${id}`);
  const meta = store.scene.project?.metadata[id];
  const floor = meta?.elevation ?? 0, ceiling = floor + (ceilingHeight ?? meta?.ceilingHeight ?? 2.8);
  const points = room.polygon.flatMap(([x, z]) => [floor, ceiling].map(y => new THREE.Vector3(x, y, z).project(renderedCamera!)));
  if (points.some(point => point.z < -1 || point.z > 1)) throw new Error(`Room ${id} crosses the camera clipping planes`);
  return { left: Math.min(...points.map(p => (p.x + 1) * container.clientWidth / 2)),
    right: Math.max(...points.map(p => (p.x + 1) * container.clientWidth / 2)),
    top: Math.min(...points.map(p => (1 - p.y) * container.clientHeight / 2)),
    bottom: Math.max(...points.map(p => (1 - p.y) * container.clientHeight / 2)) };
}
function fits(bounds: Rect): boolean {
  const safe = available(), epsilon = 1;
  return bounds.left >= safe.left - epsilon && bounds.right <= safe.right + epsilon && bounds.top >= safe.top - epsilon && bounds.bottom <= safe.bottom + epsilon;
}
function occupiesView(bounds: Rect): boolean {
  const safe = available();
  return Math.max((bounds.right - bounds.left) / (safe.right - safe.left), (bounds.bottom - bounds.top) / (safe.bottom - safe.top)) > 0.45;
}
function azimuth(sample: Sample): number { return Math.atan2(sample.position.x - sample.target.x, sample.position.z - sample.target.z); }
function angleDifference(a: number, b: number): number { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }
function elevation(sample: Sample): number {
  const direction = sample.position.clone().sub(sample.target);
  return Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
}
function stable(a: Sample, b: Sample): boolean {
  return a.position.distanceTo(b.position) < 1e-7 && a.target.distanceTo(b.target) < 1e-7 && Math.abs(a.zoom - b.zoom) < 1e-7 && a.quaternion.angleTo(b.quaternion) < 1e-6;
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function check(ok: unknown, message: string): void { if (!ok) throw new Error(message); results.push(`PASS ${message}`); output.textContent = results.join('\n'); }
async function reset(view: 'perspective' | 'top' = 'perspective'): Promise<void> {
  setReduced(true); viewport.setSelection(null); viewport.setTool('select'); viewport.setView(view); viewport.focus();
  await delay(140); setReduced(false); samples = [];
}
function pointerTakeover(): void {
  const canvas = container.querySelector('canvas')!, rect = canvas.getBoundingClientRect();
  const pointerId = 99, capture = canvas.setPointerCapture, release = canvas.releasePointerCapture;
  // Keep real listener ordering; this synthetic pointer alone lacks a native capture token.
  canvas.setPointerCapture = function (id) { if (id !== pointerId) capture.call(this, id); };
  canvas.releasePointerCapture = function (id) { if (id !== pointerId) release.call(this, id); };
  try {
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId, pointerType: 'mouse', button: 2, clientX: rect.left + 4, clientY: rect.top + 4 }));
    canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId, pointerType: 'mouse' }));
  } finally { canvas.setPointerCapture = capture; canvas.releasePointerCapture = release; }
}
for (const room of store.scene.rooms) {
  const button = document.createElement('button'); button.textContent = room.name; button.dataset.room = room.id;
  button.onclick = () => { setReduced(false); select(room.id); }; document.querySelector('#rooms')!.append(button);
}
document.querySelector<HTMLButtonElement>('#overview')!.onclick = () => { viewport.setSelection(null); viewport.focus(); };
document.querySelector<HTMLButtonElement>('#top')!.onclick = () => { viewport.setView('top'); };
document.querySelector<HTMLButtonElement>('#perspective')!.onclick = () => { viewport.setView('perspective'); };
document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true; results.length = 0;
  try {
    const saved = JSON.stringify(store.scene), revision = store.revision;
    await reset();
    const tallShell = structuredClone(store.scene);
    for (const wall of tallShell.walls) wall.height = 5;
    try {
      viewport.setScene(tallShell, localCatalog);
      select('room-bedroom'); await delay(850);
      check(fits(projectedRoom('room-bedroom', 5)), 'room framing includes the 5 m ceiling inferred from adjoining legacy walls');
    } finally { viewport.setScene(store.scene, localCatalog); }
    await reset();
    const before = snapshot(); select('room-bedroom'); await delay(850);
    const after = snapshot(), roomBounds = projectedRoom('room-bedroom');
    check(fits(roomBounds), `selected bedroom floor-to-ceiling volume fits beside Properties (${JSON.stringify(roomBounds)})`);
    check(occupiesView(roomBounds), 'selected room fills a useful portion of the available view');
    check(Math.abs(after.position.distanceTo(after.target) - before.position.distanceTo(before.target)) > 0.2, 'room selection changes viewing distance to frame the room');
    check(samples.some(sample => !stable(sample, before) && !stable(sample, after)), 'room reveal has intermediate GPU-rendered camera positions');
    check(samples.every(sample => angleDifference(azimuth(sample), azimuth(before)) < 1e-5), 'room flight preserves the current perspective azimuth throughout');
    const settled = snapshot(); reveal(); await delay(800);
    check(stable(settled, snapshot()), 'reselecting the settled room leaves its framing stable');
    for (const room of store.scene.rooms) {
      select(room.id); await delay(850);
      check(fits(projectedRoom(room.id)) && occupiesView(projectedRoom(room.id)), `${room.name} frames its complete volume at a useful scale`);
    }
    await reset();
    const grazing = snapshot(), horizontal = grazing.position.clone().sub(grazing.target); horizontal.y = 0; horizontal.normalize();
    orbit!.object.position.copy(grazing.target).addScaledVector(horizontal, 18).add(new THREE.Vector3(0, 1.6, 0)); orbit!.update();
    const grazingAzimuth = azimuth(snapshot()); select('room-kitchen'); await delay(850);
    check(elevation(snapshot()) >= 34.5 * Math.PI / 180 && fits(projectedRoom('room-kitchen')), 'grazing perspective rises to a comfortable overhead room view');
    check(angleDifference(azimuth(snapshot()), grazingAzimuth) < 1e-5, 'raising the viewing angle keeps the user’s chosen side of the room');
    await reset('top'); const topBefore = snapshot(); select('room-bath'); await delay(850);
    check(orbit!.object instanceof THREE.OrthographicCamera && fits(projectedRoom('room-bath')), 'Top selection remains orthographic and fits the full room');
    check(snapshot().zoom > topBefore.zoom + 0.05 && occupiesView(projectedRoom('room-bath')), 'Top selection zooms in to the selected room');
    check(samples.every(sample => sample.quaternion.angleTo(topBefore.quaternion) < 1e-5), 'Top flight preserves the overhead orientation');
    await reset(); select('room-living'); await delay(850); const livingPose = snapshot();
    await reset(); select('room-living'); await delay(85); const retargetStart = snapshot();
    select('room-bath'); const retargetImmediate = snapshot();
    check(retargetStart.position.distanceTo(retargetImmediate.position) < 0.15, 'rapid room selection retargets from the current pose without a jump');
    await delay(850);
    check(fits(projectedRoom('room-bath')) && occupiesView(projectedRoom('room-bath')) && !stable(livingPose, snapshot()), 'rapid room selection settles on the latest room');
    await reset(); select('room-bedroom'); await delay(85); viewport.setSelection(null);
    const cleared = snapshot(); await delay(850);
    check(stable(cleared, snapshot()), 'clearing selection cancels the pending room flight');
    await reset(); select('room-bedroom'); await delay(85); pointerTakeover();
    const interrupted = snapshot(); await delay(850);
    check(stable(interrupted, snapshot()), 'canvas pointer input immediately cancels the room flight');
    await reset(); setReduced(true); select('room-bath'); const immediate = snapshot(); await delay(100);
    check(fits(projectedRoom('room-bath')) && stable(immediate, snapshot()), 'pre-existing reduced motion settles room framing immediately');
    await reset(); select('room-kitchen'); await delay(85); setReduced(true); const liveReduced = snapshot(); await delay(100);
    check(fits(projectedRoom('room-kitchen')) && stable(liveReduced, snapshot()), 'live reduced motion immediately settles an active room flight');
    check(store.revision === revision && JSON.stringify(store.scene) === saved, 'room camera motion never changes scene data or history');
    await delay(400); const idleCount = renderCount; await delay(200);
    check(renderCount === idleCount, 'settled room renderer returns to idle');
    check(errors.length === 0 && !!world, 'real room renderer completed without reported errors');
    output.textContent = `${results.join('\n')}\nCOMPLETE ${results.length} browser checks.`;
  } catch (error) { output.textContent = `${results.join('\n')}\nFAIL ${String(error)}`; }
  finally { setReduced(false); button.disabled = false; }
};
