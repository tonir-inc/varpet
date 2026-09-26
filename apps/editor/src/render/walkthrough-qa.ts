/** Browser-only checks exercise the real viewport on an isolated demo. */
import * as THREE from 'three';
import { createViewport } from './viewport';
import { configureInsideCamera } from './walkthrough-camera';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';

const output = document.querySelector<HTMLPreElement>('#result')!;
const store = new EditorStore(demoScene, localCatalog);
let camera: THREE.Camera | undefined;
let frames = 0;
const original = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  original.apply(this, args);
  if (args[1].background) { camera = args[2]; frames++; }
};
const errors: string[] = [];
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {}, onInteraction() {}, onTransform() { throw new Error('Walking edited the scene'); }, onError: error => errors.push(error),
});
viewport.setScene(store.scene, localCatalog);
const canvas = document.querySelector('canvas')!;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const key = (type: string, value: string, target: EventTarget = canvas) => target.dispatchEvent(new KeyboardEvent(type, { key: value, code: `Key${value.toUpperCase()}`, bubbles: true }));
const results: string[] = [];
function check(ok: unknown, message: string): void { if (!ok) throw new Error(message); results.push(`PASS ${message}`); output.textContent = results.join('\n'); }
document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true; results.length = 0;
  try {
    viewport.setView('perspective'); await delay(600);
    const outside = camera!.position.clone();
    const saved = JSON.stringify(store.scene);
    viewport.setSelection('room-living'); viewport.setTool('move'); viewport.setView('inside'); await delay(600);
    check(Math.abs(camera!.position.y - 1.65) < 1e-7, 'Inside places the eyes exactly 1.65 m above the floor');
    check(camera instanceof THREE.PerspectiveCamera, 'Inside uses a perspective camera');
    const lens = camera as THREE.PerspectiveCamera;
    const horizontal = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(lens.getEffectiveFOV() / 2)) * lens.aspect));
    const expectedLens = lens.clone(); configureInsideCamera(expectedLens, lens.aspect);
    check(lens.getEffectiveFOV() <= 65 + 1e-7 && horizontal <= 95 + 1e-7 && Math.abs(lens.fov - expectedLens.fov) < 1e-7,
      'Inside uses the aspect-correct lens within 95 horizontal and 65 vertical degrees');
    const start = camera!.position.clone();
    canvas.focus(); key('keydown', 's'); await delay(180); key('keyup', 's');
    const released = camera!.position.clone(); await delay(400);
    check(camera!.position.distanceTo(released) <= 0.075, 'Key-release easing travels at most 7.5 cm');
    check(camera!.position.distanceTo(start) > 0.02, 'S walks backwards rather than changing the editing tool');
    check(Math.abs(camera!.position.y - 1.65) < 1e-7, 'Walking remains grounded at standing eye height');
    const stopped = camera!.position.clone(); await delay(150);
    check(camera!.position.distanceTo(stopped) === 0, 'Releasing movement stops the camera');
    const beforeIdle = frames; await delay(160); check(frames === beforeIdle, 'Walkthrough returns to idle rendering');
    const input = document.querySelector<HTMLInputElement>('#typing')!;
    input.focus(); key('keydown', 'w', input); await delay(130); key('keyup', 'w', input);
    check(camera!.position.distanceTo(stopped) === 0, 'Typing in an input does not move the camera');
    canvas.focus(); key('keydown', 's'); await delay(80); window.dispatchEvent(new Event('blur'));
    const blurred = camera!.position.clone(); await delay(150);
    check(camera!.position.distanceTo(blurred) === 0, 'Window blur clears held movement');
    check(JSON.stringify(store.scene) === saved && store.revision === 0, 'Camera navigation does not change scene JSON or history');
    viewport.setView('perspective'); await delay(550);
    check(camera!.position.distanceTo(outside) < 1e-7, 'Leaving Inside restores the previous exterior camera');
    viewport.setView('top'); await delay(550);
    check(camera instanceof THREE.OrthographicCamera, 'Top camera remains usable after walking');
    store.execute({ id: 'raise', label: 'Elevated floor QA', source: 'human', baseRevision: 0, operations: [{ type: 'migrate-project' }, { type: 'set-metadata', id: 'room-living', patch: { elevation: 0.4 } }] }, true);
    viewport.setScene(store.scene, localCatalog); viewport.setSelection('room-living'); viewport.setView('inside'); await delay(550);
    check(Math.abs(camera!.position.y - 2.05) < 1e-7, 'Raised floors add their elevation to the 1.65 m eye height');
    viewport.focus('room-living'); await delay(500);
    check(Math.abs(camera!.position.y - 2.05) < 1e-7, 'Framing a room in Inside keeps the camera at eye height');
    viewport.setView('perspective'); await delay(500);
    const exited = camera!.position.clone(); canvas.focus(); key('keydown', 'w'); await delay(120); key('keyup', 'w');
    check(camera!.position.distanceTo(exited) === 0, 'Movement listeners are inactive after leaving Inside');
    check(errors.length === 0, 'Real renderer completed without reported errors');
    output.textContent = `${results.join('\n')}\nCOMPLETE ${results.length} browser checks.`;
  } catch (error) { output.textContent = `${results.join('\n')}\nFAIL ${String(error)}`; }
  finally { key('keyup', 'w'); key('keyup', 's'); button.disabled = false; }
};
