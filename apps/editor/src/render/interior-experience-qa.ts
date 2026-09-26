/** Isolated real-renderer verification; no application document is loaded or saved. */
import * as THREE from 'three';
import type { ViewMode } from '../contracts';
import { createViewport } from './viewport';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';

const output = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLElement>('#status')!;
const diagnostic = document.querySelector<HTMLElement>('#diagnostic')!;
let store = new EditorStore(structuredClone(demoScene), localCatalog);
let camera: THREE.Camera | undefined, world: THREE.Scene | undefined;
let frames = 0, lastFrame = -1, currentView: ViewMode = 'perspective';
let sampleMotion = false;
const movementSamples: THREE.Vector3[] = [];
const errors: string[] = [];
const original = THREE.Mesh.prototype.onBeforeRender;
const captureRender: typeof THREE.Mesh.prototype.onBeforeRender = function (this: THREE.Mesh, ...args) {
  original.apply(this, args);
  if (args[1] instanceof THREE.Scene && args[1].background) {
    world = args[1]; camera = args[2];
    const frame = args[0].info.render.frame;
    if (frame !== lastFrame) { frames++; lastFrame = frame; }
    if (sampleMotion && !movementSamples.at(-1)?.equals(camera.position)) movementSamples.push(camera.position.clone());
  }
};
THREE.Mesh.prototype.onBeforeRender = captureRender;
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {}, onInteraction() {},
  onTransform() { throw new Error('Walking edited the scene'); },
  onError: error => errors.push(error), onViewChange: view => { currentView = view; },
});
viewport.setScene(store.scene, localCatalog);
const canvas = document.querySelector('canvas')!;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const key = (type: string, value: string, target: EventTarget = canvas) => target.dispatchEvent(new KeyboardEvent(type, {
  key: value, code: value === 'Escape' ? 'Escape' : `Key${value.toUpperCase()}`, bubbles: true,
}));
function setView(view: ViewMode): void { if (viewport.setView(view) !== false) currentView = view; }
function showRoom(id: string): void {
  viewport.setSelection(id);
  if (currentView !== 'inside') setView('inside'); else viewport.focus(id);
  canvas.focus();
}
function onEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || currentView !== 'inside' || document.activeElement !== canvas) return;
  event.preventDefault(); setView('perspective');
}
window.addEventListener('keydown', onEscape);
for (const room of ['living', 'kitchen', 'bedroom']) document.querySelector<HTMLButtonElement>(`#${room}`)!.onclick = () => showRoom(`room-${room}`);
document.querySelector<HTMLButtonElement>('#studio')!.onclick = () => setView('perspective');
function meshes(predicate: (mesh: THREE.Mesh) => boolean): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  world?.traverse(object => { if (object instanceof THREE.Mesh && predicate(object)) result.push(object); });
  return result;
}
const glasses = () => meshes(mesh => mesh.name === 'window-glass' || (!Array.isArray(mesh.material)
  && mesh.material.customProgramCacheKey() === 'varpet-thin-window-glass-v1'));
const ceilings = () => meshes(mesh => mesh.userData.shellPart === 'ceiling' || (mesh.geometry instanceof THREE.ShapeGeometry
  && store.scene.rooms.some(room => room.id === mesh.userData.entityId) && Math.abs(mesh.rotation.x + Math.PI / 2) < 1e-8 && mesh.position.y > 1.8));
function fieldOfView(): { vertical: number; horizontal: number } | null {
  if (!(camera instanceof THREE.PerspectiveCamera)) return null;
  const vertical = camera.getEffectiveFOV();
  return { vertical, horizontal: THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vertical / 2)) * camera.aspect)) };
}
function backgroundKey(): string {
  const background = world?.background;
  return background instanceof THREE.Color ? background.getHexString() : background instanceof THREE.Texture ? background.uuid : 'none';
}
function updateDiagnostic(): void {
  if (!camera || !world) return;
  const fov = fieldOfView(), windows = glasses();
  const daylight = world.getObjectByName('Window daylight preview');
  diagnostic.textContent = `${currentView === 'inside' ? 'Inside' : 'Studio'} · camera Y ${camera.position.y.toFixed(2)} m · ${fov ? `FOV ${fov.horizontal.toFixed(1)}° H / ${fov.vertical.toFixed(1)}° V` : 'orthographic lens'} · ${windows.length} glass panes · daylight ${daylight?.visible ? 'on' : 'off'} · ${frames} rendered frames`;
}
const diagnosticTimer = window.setInterval(updateDiagnostic, 180);
const results: string[] = [];
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
  results.push(`PASS ${message}`); output.textContent = results.join('\n'); status.textContent = `${results.length} checks passed…`;
}
document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement;
  const navigation = [...document.querySelectorAll<HTMLButtonElement>('#living,#kitchen,#bedroom,#studio')];
  button.disabled = true; navigation.forEach(item => { item.disabled = true; });
  results.length = 0; errors.length = 0; output.textContent = 'Running…'; status.textContent = 'Running interior checks…';
  document.querySelector<HTMLDetailsElement>('#checks')!.open = true;
  try {
    setView('perspective'); store = new EditorStore(structuredClone(demoScene), localCatalog); viewport.setScene(store.scene, localCatalog); await delay(700);
    check(camera && world, 'Real Three.js scene and camera were captured during rendering');
    const outside = camera.position.clone(), studioBackground = backgroundKey();
    const saved = JSON.stringify(store.scene);
    showRoom('room-living'); await delay(650);
    check(Math.abs(camera.position.y - 1.65) < 1e-7, 'Inside eyes stand exactly 1.65 m above the floor');
    const fov = fieldOfView();
    check(fov && fov.vertical <= 65 + 1e-7 && fov.horizontal <= 95 + 1e-7, 'Rendered lens stays within 65° vertical and 95° horizontal');
    check(fov.vertical > 20 && fov.horizontal > 40, 'Rendered interior remains a usable room view');
    check(glasses().length >= 4 && glasses().every(mesh => !mesh.castShadow), 'Window glass lets daylight through rather than casting opaque shadows');
    check(world.getObjectByName('Window daylight preview')?.visible, 'Window daylight preview is visible Inside');
    check(ceilings().length === store.scene.rooms.length && ceilings().every(mesh => mesh.castShadow), 'Inside ceilings participate in room shadowing');
    check(ceilings().every(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(material => material.shadowSide === THREE.FrontSide)), 'Thin ceilings cast from above without self-shadowing their underside');
    check(backgroundKey() !== studioBackground, 'Inside replaces the studio background with exterior daylight');
    const start = camera.position.clone(); movementSamples.length = 0; sampleMotion = true;
    canvas.focus(); key('keydown', 's'); await delay(320); key('keyup', 's');
    const release = camera.position.clone(); await delay(400); sampleMotion = false;
    check(camera.position.distanceTo(start) > 0.02, 'Rendered camera walks through the room after pressing S');
    check(movementSamples.length >= 3, 'Walking is rendered over multiple changing camera positions');
    // The fastest allowed frame covers 2.8 m/s × 250 ms; longer stalls discard time.
    check(movementSamples.every((point, index) => index === 0 || point.distanceTo(movementSamples[index - 1]!) <= 0.7 + 1e-8), 'Walking frames remain bounded by the navigation speed and frame-time limit');
    check(camera.position.distanceTo(release) <= 0.075, 'Key-release deceleration travels no more than 7.5 cm');
    check(Math.abs(camera.position.y - 1.65) < 1e-7, 'Movement preserves grounded eye height without head bob');
    const stopped = camera.position.clone(); await delay(180);
    check(camera.position.equals(stopped), 'Walking is completely stopped after the short release tail');
    const beforeIdle = frames; await delay(180); check(frames === beforeIdle, 'Interior returns to idle rendering after movement');
    const input = document.querySelector<HTMLInputElement>('#typing')!;
    input.focus(); key('keydown', 'w', input); await delay(150); key('keyup', 'w', input);
    check(camera.position.equals(stopped), 'Typing outside the canvas cannot move the camera');
    canvas.focus(); key('keydown', 's'); await delay(120); input.focus();
    const unfocused = camera.position.clone(); await delay(200);
    check(camera.position.equals(unfocused), 'Focus loss clears held movement and its release tail immediately');
    canvas.focus(); key('keydown', 's'); await delay(120); window.dispatchEvent(new Event('blur'));
    const blurred = camera.position.clone(); await delay(200);
    check(camera.position.equals(blurred), 'Window blur cancels held movement and inertia immediately');
    check(JSON.stringify(store.scene) === saved && store.revision === 0, 'Navigation leaves scene JSON and edit history unchanged');
    canvas.focus(); key('keydown', 'Escape'); key('keyup', 'Escape'); await delay(550);
    check(currentView === 'perspective' && camera.position.distanceTo(outside) < 1e-7, 'Escape restores the exterior camera through the page navigation handler');
    check(world.getObjectByName('Window daylight preview')?.visible === false, 'Window daylight preview is hidden in Studio');
    check(ceilings().length === store.scene.rooms.length && ceilings().every(mesh => !mesh.castShadow), 'Studio ceilings stop casting interior shadows');
    check(backgroundKey() === studioBackground, 'Studio background is restored after leaving Inside');
    const exited = camera.position.clone(); canvas.focus(); key('keydown', 'w'); await delay(130); key('keyup', 'w');
    check(Math.hypot(camera.position.x - exited.x, camera.position.z - exited.z) > 0.02, 'W moves the exterior camera after leaving Inside');
    check(Math.abs(camera.position.y - exited.y) < 1e-7, 'Exterior movement preserves its restored camera height');
    const exteriorStopped = camera.position.clone(); await delay(150);
    check(camera.position.equals(exteriorStopped), 'Exterior movement stops immediately on key release');
    store.execute({ id: 'raise-interior-qa', label: 'Elevated floor QA', source: 'human', baseRevision: 0,
      operations: [{ type: 'migrate-project' }, { type: 'set-metadata', id: 'room-living', patch: { elevation: 0.4 } }] }, true);
    viewport.setScene(store.scene, localCatalog); const elevated = JSON.stringify(store.scene), elevatedRevision = store.revision;
    showRoom('room-living'); await delay(600);
    check(Math.abs(camera.position.y - 2.05) < 1e-7, 'Raised floor adds 40 cm beneath the same 1.65 m eye height');
    viewport.focus('room-living'); await delay(250);
    check(Math.abs(camera.position.y - 2.05) < 1e-7, 'Room framing preserves standing height on a raised floor');
    check(JSON.stringify(store.scene) === elevated && store.revision === elevatedRevision, 'Raised-floor navigation does not add document edits');
    check(errors.length === 0, 'Real renderer reported no viewport errors');
    output.textContent = `${results.join('\n')}\nCOMPLETE ${results.length} browser checks.`; status.textContent = `COMPLETE ${results.length} browser checks`;
  } catch (error) {
    output.textContent = `${results.join('\n')}\nFAIL ${String(error)}`; status.textContent = `FAIL after ${results.length} checks`;
  } finally {
    sampleMotion = false; key('keyup', 'w'); key('keyup', 's');
    setView('perspective'); store = new EditorStore(structuredClone(demoScene), localCatalog); viewport.setScene(store.scene, localCatalog); showRoom('room-living');
    button.disabled = false; navigation.forEach(item => { item.disabled = false; }); updateDiagnostic();
  }
};
showRoom('room-living');
window.addEventListener('beforeunload', () => {
  clearInterval(diagnosticTimer); window.removeEventListener('keydown', onEscape); viewport.dispose();
  if (THREE.Mesh.prototype.onBeforeRender === captureRender) THREE.Mesh.prototype.onBeforeRender = original;
}, { once: true });
