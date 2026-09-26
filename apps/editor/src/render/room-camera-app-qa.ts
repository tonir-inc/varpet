/** Real-app regression: room rows must frame the camera even when Properties is hidden. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createInitialScene } from '../core/initial-scene';
import { roomCeilingHeight } from '../core/heights';

type Rect = { left: number; right: number; top: number; bottom: number };
type Sample = { position: THREE.Vector3; target: THREE.Vector3; zoom: number; time: number };
const expectedScene = createInitialScene();
const runtimeErrors: string[] = [];
window.addEventListener('error', event => runtimeErrors.push(`Uncaught: ${event.message}`));
window.addEventListener('unhandledrejection', event => runtimeErrors.push(`Unhandled rejection: ${String(event.reason)}`));

let reduced = false;
const preferenceListeners = new Set<() => void>();
const originalMatchMedia = window.matchMedia.bind(window);
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? {
  get matches() { return reduced; }, media: query, onchange: null,
  addEventListener(_event: string, listener: () => void) { preferenceListeners.add(listener); },
  removeEventListener(_event: string, listener: () => void) { preferenceListeners.delete(listener); },
} as unknown as MediaQueryList : originalMatchMedia(query);
function setReduced(value: boolean): void { reduced = value; for (const listener of preferenceListeners) listener(); }

let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined, orbit: OrbitControls | undefined;
let samples: Sample[] = [], lastFrame = -1;
const originalBeforeRender = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  originalBeforeRender.apply(this, args);
  const [renderer, scene, renderedCamera] = args;
  if (renderer.domElement.parentElement?.id !== 'viewport' || !(scene instanceof THREE.Scene) || !scene.background
    || !(renderedCamera instanceof THREE.PerspectiveCamera || renderedCamera instanceof THREE.OrthographicCamera)
    || renderedCamera !== orbit?.object) return;
  camera = renderedCamera;
  if (renderer.info.render.frame === lastFrame) return;
  lastFrame = renderer.info.render.frame;
  samples.push(snapshot());
};
const originalUpdate = OrbitControls.prototype.update;
OrbitControls.prototype.update = function (...args) {
  if (this.domElement?.parentElement?.id === 'viewport') orbit = this;
  return originalUpdate.apply(this, args);
};
await import('../main');
OrbitControls.prototype.update = originalUpdate;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.style.width = '1440px'; app.style.height = '900px';
const qa = document.createElement('aside');
qa.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:1000;background:#171d25f5;border:1px solid #a68bc6;border-radius:8px;padding:10px;color:white;width:570px;max-width:90vw;font:12px system-ui';
qa.innerHTML = '<strong>Real app room camera QA</strong> <button id="run-room-app-camera" style="padding:6px">Run room integration</button><pre id="room-app-camera-result" style="max-height:220px;overflow:auto;white-space:pre-wrap;margin-top:8px">Ready. Uses the initial empty shell and actual Renovation room rows.</pre>';
document.body.append(qa);
const output = qa.querySelector<HTMLPreElement>('#room-app-camera-result')!;
const button = qa.querySelector<HTMLButtonElement>('#run-room-app-camera')!;
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const result = document.querySelector<T>(selector); if (!result) throw new Error(`Missing UI ${selector}`); return result;
};
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const results: string[] = [];
function check(ok: unknown, message: string): void {
  if (!ok) throw new Error(message); results.push(`PASS ${message}`); output.textContent = results.join('\n');
}
function snapshot(): Sample {
  if (!orbit) throw new Error('Real app OrbitControls unavailable');
  return { position: orbit.object.position.clone(), target: orbit.target.clone(), zoom: (orbit.object as THREE.PerspectiveCamera).zoom, time: performance.now() };
}
function stable(a: Sample, b: Sample): boolean {
  return a.position.distanceTo(b.position) < 1e-6 && a.target.distanceTo(b.target) < 1e-6 && Math.abs(a.zoom - b.zoom) < 1e-6;
}
function available(): Rect {
  const canvas = $('#viewport').getBoundingClientRect(), properties = $('.right-panel').getBoundingClientRect();
  const toolbar = $('.tool-rail').getBoundingClientRect(), dock = $('.folio-dock').getBoundingClientRect();
  return { left: 24, right: properties.width ? properties.left - canvas.left - 24 : canvas.width - 24,
    top: toolbar.bottom - canvas.top + 16, bottom: dock.top - canvas.top - 16 };
}
function projectedRoom(id: string): Rect {
  if (!camera) throw new Error('The app has not rendered a room camera');
  const room = expectedScene.rooms.find(item => item.id === id); if (!room) throw new Error(`Unknown initial room ${id}`);
  const floor = expectedScene.project?.metadata[id]?.elevation ?? 0, ceiling = floor + roomCeilingHeight(expectedScene, room);
  const canvas = $('#viewport'), points = room.polygon.flatMap(([x, z]) => [floor, ceiling].map(y => new THREE.Vector3(x, y, z).project(camera!)));
  if (points.some(point => point.z < -1 || point.z > 1)) throw new Error(`Room ${id} crosses camera clipping planes`);
  return { left: Math.min(...points.map(p => (p.x + 1) * canvas.clientWidth / 2)), right: Math.max(...points.map(p => (p.x + 1) * canvas.clientWidth / 2)),
    top: Math.min(...points.map(p => (1 - p.y) * canvas.clientHeight / 2)), bottom: Math.max(...points.map(p => (1 - p.y) * canvas.clientHeight / 2)) };
}
function fits(id: string): boolean {
  const bounds = projectedRoom(id), safe = available();
  return bounds.left >= safe.left - 1 && bounds.right <= safe.right + 1 && bounds.top >= safe.top - 1 && bounds.bottom <= safe.bottom + 1;
}
function usefulScale(id: string): boolean {
  const bounds = projectedRoom(id), safe = available();
  return Math.max((bounds.right - bounds.left) / (safe.right - safe.left), (bounds.bottom - bounds.top) / (safe.bottom - safe.top)) > 0.45;
}
function selectRoom(id: string): void { $(`#renovation-panel .rv-entity-row[data-id="${id}"]`).click(); }
function selected(id: string): boolean { return $(`#renovation-panel .rv-entity-row[data-id="${id}"]`).getAttribute('aria-pressed') === 'true'; }
function intermediate(before: Sample, after: Sample): boolean { return samples.some(sample => !stable(sample, before) && !stable(sample, after)); }
function checkAnimated(before: Sample, after: Sample, message: string): void {
  if (intermediate(before, after)) { check(true, message); return; }
  const pose = (sample: Sample) => ({ ms: Math.round(sample.time - before.time),
    position: sample.position.toArray().map(value => +value.toFixed(3)),
    target: sample.target.toArray().map(value => +value.toFixed(3)), zoom: +sample.zoom.toFixed(4) });
  const indexes = [...new Set([0, 1, 2, 3, samples.length - 4, samples.length - 3, samples.length - 2, samples.length - 1])]
    .filter(index => index >= 0 && index < samples.length);
  check(false, `${message}\nCamera diagnostics: ${JSON.stringify({ sampleCount: samples.length, reduced, hidden: document.hidden,
    before: pose(before), after: pose(after), rendered: indexes.map(index => pose(samples[index]!)) })}`);
}
function clearSelection(): void { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
function restoreCamera(pose: Sample): void {
  // Move the observed real camera to the recorded overview; selection and inspector stay owned by the UI.
  if (!orbit) throw new Error('Real app OrbitControls unavailable');
  const current = orbit.object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  current.position.copy(pose.position); current.zoom = pose.zoom; current.updateProjectionMatrix();
  orbit.target.copy(pose.target); orbit.update();
}
async function reset(view: 'perspective' | 'top' = 'perspective'): Promise<void> {
  setReduced(true);
  clearSelection();
  if ($('#renovation-tab').getAttribute('aria-expanded') !== 'true') $('#renovation-tab').click();
  $(view === 'top' ? '#top-view' : '#perspective').click(); $('[data-tool="select"]').click(); $('#focus').click();
  await delay(160); setReduced(false); samples = [];
}

button.onclick = async () => {
  button.disabled = true; results.length = 0;
  try {
    await reset();
    const revision = $('#revision').textContent;
    check($('#object-count').textContent === '0' && expectedScene.objects.length === 0, 'real app starts from the initial empty-room shell');
    check(!$('.left-panel').hidden && !$('#renovation-panel').hidden, 'Renovation drawer is open in the actual editor');
    const before = snapshot(); selectRoom('room-bedroom'); await delay(850); const after = snapshot();
    check(selected('room-bedroom'), 'room row selects Bedroom through the real Renovation controls');
    check(!stable(before, after), 'selecting a room in the open Renovation drawer moves the real camera');
    checkAnimated(before, after, 'room selection has intermediate GPU-rendered camera positions');
    check(fits('room-bedroom') && usefulScale('room-bedroom'), 'full Bedroom volume fits the canvas between the actual toolbar and dock at useful scale');

    $('#close-inspector').click();
    check(selected('room-bedroom') && $('.right-panel').offsetWidth === 0, 'closing Properties preserves the selected room and actually hides its panel');
    restoreCamera(before); await delay(100); samples = []; const hiddenBefore = snapshot();
    selectRoom('room-bedroom'); await delay(850); const hiddenAfter = snapshot();
    check(selected('room-bedroom') && $('.right-panel').offsetWidth === 0, 'reselecting the same room keeps Properties closed through the real UI');
    check(!stable(hiddenBefore, hiddenAfter), 'reselecting a room with Properties hidden moves the real camera');
    checkAnimated(hiddenBefore, hiddenAfter, 'hidden-Properties room selection has intermediate GPU-rendered camera positions');
    check(fits('room-bedroom') && usefulScale('room-bedroom'), 'room selection uses the full available canvas when Properties is hidden');

    await reset(); selectRoom('room-living'); await delay(100); const retargetStart = snapshot();
    selectRoom('room-bath');
    check(stable(retargetStart, snapshot()), 'rapid room retargeting begins from the displayed camera pose');
    await delay(850);
    check(selected('room-bath') && fits('room-bath') && usefulScale('room-bath'), 'rapid selection settles on the latest room');

    await reset('top'); const topBefore = snapshot(); selectRoom('room-kitchen'); await delay(850); const topAfter = snapshot();
    check(camera instanceof THREE.OrthographicCamera && topAfter.zoom > topBefore.zoom, 'Top room selection keeps orthographic view and zooms into the room');
    check(fits('room-kitchen') && usefulScale('room-kitchen'), 'Top selection frames the complete room');
    checkAnimated(topBefore, topAfter, 'Top selection has intermediate GPU-rendered camera positions');

    await reset(); const focusBefore = snapshot(); selectRoom('room-bath'); $('#focus').click(); await delay(850);
    check(selected('room-bath') && fits('room-bath') && usefulScale('room-bath'), 'explicit Focus in the same tick frames the selected room with the drawer open');
    checkAnimated(focusBefore, snapshot(), 'explicit room Focus also produces intermediate camera frames');

    $('#close-inspector').click(); $('.tool-rail [data-folio="inspect"]').click(); await delay(850);
    check($('.right-panel').offsetWidth > 0, 'Properties reopens through the real controls');
    check(fits('room-bath') && usefulScale('room-bath'), 'room reframes into the actual space beside visible Properties');

    await reset(); selectRoom('room-bedroom'); await delay(100); clearSelection(); const cleared = snapshot(); await delay(850);
    check(stable(cleared, snapshot()), 'clearing selection cancels an active room animation');
    await reset(); setReduced(true); selectRoom('room-kitchen'); await delay(160); const reducedPose = snapshot(); await delay(120);
    check(fits('room-kitchen') && usefulScale('room-kitchen') && stable(reducedPose, snapshot()), 'reduced motion settles the real app room framing without continued movement');
    check($('#revision').textContent === revision && revision === 'Revision 0' && $<HTMLButtonElement>('#undo').disabled && $<HTMLButtonElement>('#redo').disabled, 'room selection and camera controls preserve revision 0 and empty history');
    check($('#render-error').hidden && runtimeErrors.length === 0, `real renderer and browser report no errors${runtimeErrors.length ? `: ${runtimeErrors.join('; ')}` : ''}`);
    output.textContent = `${results.join('\n')}\nCOMPLETE ${results.length} room app integration checks.`;
  } catch (error) { output.textContent = `${results.join('\n')}\nFAIL ${String(error)}`; }
  finally { setReduced(false); button.disabled = false; }
};

window.addEventListener('pagehide', () => {
  THREE.Mesh.prototype.onBeforeRender = originalBeforeRender;
  window.matchMedia = originalMatchMedia;
}, { once: true });
