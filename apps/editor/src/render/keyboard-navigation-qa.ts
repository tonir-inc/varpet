/** Browser-only checks use the real viewport and an isolated, unsaved local demo. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createViewport } from './viewport';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';

const output = document.querySelector<HTMLPreElement>('#result')!;
const input = document.querySelector<HTMLInputElement>('#typing')!;
const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
const dialogInput = document.querySelector<HTMLInputElement>('#dialog-typing')!;
const store = new EditorStore(demoScene, localCatalog);
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined;
let frames = 0;
const targets = new WeakMap<THREE.Camera, THREE.Vector3>();
const orbits = new WeakMap<THREE.Camera, OrbitControls>();
let transformControls: TransformControls | undefined;
const originalRender = THREE.Mesh.prototype.onBeforeRender;
const originalOrbitUpdate = OrbitControls.prototype.update;
const originalTransformHelper = TransformControls.prototype.getHelper;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  originalRender.apply(this, args);
  if (args[1].background && (args[2] instanceof THREE.PerspectiveCamera || args[2] instanceof THREE.OrthographicCamera)) {
    camera = args[2]; frames++;
  }
};
OrbitControls.prototype.update = function (...args) {
  const changed = originalOrbitUpdate.apply(this, args);
  targets.set(this.object, this.target.clone());
  orbits.set(this.object, this);
  return changed;
};
TransformControls.prototype.getHelper = function () {
  transformControls = this;
  return originalTransformHelper.call(this);
};
const errors: string[] = [];
let edits = 0;
let interacting = false;
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {},
  onInteraction(active) { interacting = active; },
  onTransform() { edits++; }, onComponentTransform() { edits++; },
  onWallMove() { edits++; }, onWallEndpoint() { edits++; }, onOpeningMove() { edits++; },
  onError: error => errors.push(error),
});
viewport.setScene(store.scene, localCatalog);
const canvas = document.querySelector<HTMLCanvasElement>('#view canvas')!;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function key(type: string, value: string, target: EventTarget = canvas, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    key: value, code: value.startsWith('Arrow') ? value : `Key${value.toUpperCase()}`,
    bubbles: true, cancelable: true, ...options,
  });
  target.dispatchEvent(event); return event;
}
const results: string[] = [];
function check(ok: unknown, message: string): void {
  if (!ok) throw new Error(message);
  results.push(`PASS ${message}`); output.textContent = results.join('\n');
}
function snapshot() {
  if (!camera) throw new Error('No main-scene camera has rendered');
  return { camera, position: camera.position.clone(), target: targets.get(camera)?.clone(),
    orientation: camera.quaternion.clone(), zoom: camera.zoom };
}
function forwardDirection(): THREE.Vector3 {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera!.quaternion);
  right.y = 0; right.normalize();
  return new THREE.Vector3(right.z, 0, -right.x);
}
function navigationOrbit(): OrbitControls {
  const orbit = camera && orbits.get(camera);
  if (!orbit) throw new Error('No exterior orbit controls have updated');
  return orbit;
}
async function travel(values: string[], duration = 120) {
  canvas.focus();
  const before = snapshot(), started = performance.now();
  for (const value of values) key('keydown', value);
  await delay(duration);
  for (const value of values) key('keyup', value);
  const seconds = (performance.now() - started) / 1000;
  const after = snapshot();
  return { before, after, seconds, delta: after.position.clone().sub(before.position) };
}
async function stopped(message: string, duration = 140): Promise<void> {
  const before = snapshot(); await delay(duration);
  check(camera!.position.distanceTo(before.position) < 1e-8, message);
}
async function freshPerspective(): Promise<void> {
  viewport.setSelection(null); viewport.setTool('select'); viewport.setView('perspective'); viewport.focus();
  await delay(650); canvas.focus();
}

document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement;
  button.disabled = true; results.length = 0; output.textContent = 'Running checks…';
  try {
    await freshPerspective();
    const saved = JSON.stringify(store.scene);
    check(camera instanceof THREE.PerspectiveCamera, 'The real exterior perspective camera rendered');
    check(document.activeElement === canvas, 'The visible scene canvas can receive keyboard focus');

    for (const [value, forward, sideways] of [['w', 1, 0], ['ArrowUp', 1, 0], ['s', -1, 0], ['ArrowDown', -1, 0],
      ['a', 0, -1], ['ArrowLeft', 0, -1], ['d', 0, 1], ['ArrowRight', 0, 1]] as const) {
      const heading = forwardDirection();
      const right = new THREE.Vector3(-heading.z, 0, heading.x);
      const expected = heading.multiplyScalar(forward).addScaledVector(right, sideways);
      const moved = await travel([value]);
      check(moved.delta.length() > 0.02 && moved.delta.clone().normalize().dot(expected) > 0.999,
        `${value} moves in the expected ground direction relative to the camera`);
      check(moved.before.target && moved.after.target
        && moved.after.target.clone().sub(moved.before.target).distanceTo(moved.delta) < 1e-8
        && Math.abs(moved.after.position.y - moved.before.position.y) < 1e-8
        && moved.after.orientation.angleTo(moved.before.orientation) < 1e-7 && moved.after.zoom === moved.before.zoom,
      `${value} translates the orbit target equally while preserving height, orientation and zoom`);
    }
    const straight = await travel(['w'], 180);
    const straightSpeed = straight.delta.length() / straight.seconds;
    check(Math.abs(straightSpeed - 5) < 0.4, `Exterior travel is 5 m/s (${straightSpeed.toFixed(2)} measured)`);
    const diagonal = await travel(['w', 'd'], 180);
    const diagonalSpeed = diagonal.delta.length() / diagonal.seconds;
    check(Math.abs(diagonalSpeed - 5) < 0.4, `Diagonal travel stays at 5 m/s (${diagonalSpeed.toFixed(2)} measured)`);
    const aliases = await travel(['w', 'ArrowUp'], 180);
    check(Math.abs(aliases.delta.length() / aliases.seconds - 5) < 0.4, 'Holding both aliases does not double movement speed');
    await stopped('Releasing the last movement key stops immediately without camera drift');

    canvas.focus(); key('keydown', 'w'); await delay(90);
    check(interacting, 'Holding W reports an active viewport interaction');
    const beforeWheel = snapshot(), wheelRect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120,
      clientX: wheelRect.left + wheelRect.width / 2, clientY: wheelRect.top + wheelRect.height / 2 }));
    check(camera!.position.distanceTo(beforeWheel.position) > 0.02, 'The wheel zooms the real camera while W is held');
    check(interacting, 'Finishing a wheel gesture preserves the active keyboard interaction');
    const wheeled = snapshot(); await delay(140);
    const afterWheel = snapshot();
    check(wheeled.target && afterWheel.target && afterWheel.target.distanceTo(wheeled.target) > 0.02
      && afterWheel.position.clone().sub(wheeled.position).distanceTo(afterWheel.target.clone().sub(wheeled.target)) < 1e-8,
    'Held W continues translating the camera and orbit target after wheel zoom');
    key('keyup', 'w');
    check(!interacting, 'Releasing W after wheel zoom ends the interaction');
    await stopped('Releasing W after wheel zoom stops immediately');

    // Exercise the real controls through their public methods and lifecycle events.
    // Native pointer capture is verified separately in the interactive browser.
    const orbit = navigationOrbit();
    canvas.focus(); key('keydown', 'w'); await delay(90);
    orbit.dispatchEvent({ type: 'start' });
    const oldHeading = forwardDirection(); orbit.rotateLeft(Math.PI / 3);
    const turnedHeading = forwardDirection(), turned = snapshot(); await delay(140);
    const afterTurn = snapshot();
    const turnedDelta = afterTurn.position.clone().sub(turned.position);
    check(oldHeading.dot(turnedHeading) < 0.8 && turnedDelta.length() > 0.02
      && turnedDelta.clone().normalize().dot(turnedHeading) > 0.999,
    'Held W follows the changed heading while an orbit gesture remains active');
    check(turned.target && afterTurn.target
      && afterTurn.target.clone().sub(turned.target).distanceTo(turnedDelta) < 1e-8 && interacting,
    'Orbit and W preserve equal camera/target travel and report an active interaction');
    orbit.dispatchEvent({ type: 'end' });
    check(interacting, 'Releasing the mouse first keeps the held keyboard interaction active');
    const mouseReleased = snapshot(); await delay(110);
    check(camera!.position.distanceTo(mouseReleased.position) > 0.02, 'W keeps moving after the orbit gesture ends');
    key('keyup', 'w');
    check(!interacting, 'Releasing W last ends the combined orbit and keyboard interaction');
    await stopped('Releasing both inputs leaves the camera still');

    orbit.dispatchEvent({ type: 'start' });
    canvas.focus(); const beforeOrbitKey = snapshot(); key('keydown', 'w'); await delay(110);
    check(camera!.position.distanceTo(beforeOrbitKey.position) > 0.02, 'W can start moving during an existing camera gesture');
    const beforePan = snapshot(); orbit.pan(24, 8);
    const panned = snapshot(); await delay(110);
    check(panned.position.distanceTo(beforePan.position) > 0.02
      && camera!.position.distanceTo(panned.position) > 0.02 && interacting,
    'Mouse pan and held W both move the camera during one gesture');
    key('keyup', 'w');
    check(interacting, 'Releasing W first keeps the unfinished mouse interaction active');
    await stopped('Releasing W stops keyboard travel while the mouse gesture remains active');
    const afterKeyboardRelease = snapshot(); orbit.rotateLeft(Math.PI / 10);
    check(camera!.quaternion.angleTo(afterKeyboardRelease.orientation) > 0.02 && interacting,
      'The mouse can continue rotating after W is released');
    orbit.dispatchEvent({ type: 'end' });
    check(!interacting, 'Releasing the mouse last ends the combined interaction');
    await stopped('Ending the combined gesture leaves no remaining movement');

    input.focus(); const beforeTyping = snapshot();
    const typed = key('keydown', 'w', input); await delay(140); key('keyup', 'w', input);
    check(!typed.defaultPrevented && camera!.position.distanceTo(beforeTyping.position) < 1e-8,
      'Typing in an input leaves the camera and normal input handling alone');

    canvas.focus(); key('keydown', 'w'); await delay(90); input.focus();
    await stopped('Moving focus away from the canvas clears held movement');
    canvas.focus(); key('keydown', 'w', canvas, { repeat: true });
    await stopped('Refocusing the canvas does not restart a canceled held key'); key('keyup', 'w');

    canvas.focus(); key('keydown', 'd'); orbit.dispatchEvent({ type: 'start' });
    await delay(90); window.dispatchEvent(new Event('blur'));
    await stopped('Window blur clears held movement immediately'); key('keyup', 'd');
    check(!interacting, 'Window blur ends both mouse and keyboard interaction state');

    for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
      canvas.focus(); const before = snapshot();
      const blocked = key('keydown', 'w', canvas, options); await delay(80); key('keyup', 'w');
      check(!blocked.defaultPrevented && camera!.position.distanceTo(before.position) < 1e-8,
        `${Object.keys(options)[0]} leaves camera navigation inactive`);
    }

    canvas.focus(); key('keydown', 's'); await delay(90); dialog.showModal();
    await stopped('Opening a modal clears held movement');
    const beforeDialog = snapshot();
    const dialogTyped = key('keydown', 'w', dialogInput); await delay(100); key('keyup', 'w', dialogInput);
    check(!dialogTyped.defaultPrevented && camera!.position.distanceTo(beforeDialog.position) < 1e-8,
      'Typing in a modal does not move the camera');
    dialog.close(); canvas.focus();
    key('keydown', 's', canvas, { repeat: true }); await stopped('Closing a modal does not restore held movement'); key('keyup', 's');

    // An open dialog also gates movement when it did not steal focus (for example, show()).
    canvas.focus(); key('keydown', 'a'); await delay(90); dialog.setAttribute('open', '');
    await stopped('An open dialog clears movement even while the canvas keeps focus');
    dialog.removeAttribute('open'); key('keyup', 'a');

    canvas.focus(); key('keydown', 'w'); await delay(90);
    const rect = canvas.getBoundingClientRect();
    // Shift avoids an artificial pointer-capture request for this synthetic cancellation gesture.
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1,
      pointerId: 71, pointerType: 'mouse', clientX: rect.left + 4, clientY: rect.top + 4, shiftKey: true }));
    await stopped('A selection gesture cancels held camera movement');
    key('keydown', 'd'); await stopped('An active selection gesture blocks fresh keyboard movement'); key('keyup', 'd');
    // No native pointer exists for this synthetic down, so clear the gesture through
    // the viewport instead of asking Three.js to release nonexistent pointer capture.
    viewport.cancelInteraction();
    key('keydown', 'w', canvas, { repeat: true }); await stopped('A selection gesture cannot restart movement from a held repeat'); key('keyup', 'w');

    viewport.setSelection(store.scene.objects[0]!.id); viewport.setTool('move');
    canvas.focus(); key('keydown', 'w'); await delay(90);
    check(transformControls?.object, 'A real furniture transform handle is attached for the edit-gesture check');
    transformControls!.dispatchEvent({ type: 'mouseDown', mode: 'translate' });
    await stopped('An object-edit gesture cancels held camera movement');
    key('keydown', 'd'); await stopped('An active object-edit gesture blocks fresh keyboard movement'); key('keyup', 'd');
    check(interacting, 'Blocking keyboard travel keeps the object-edit interaction active');
    viewport.cancelInteraction(); key('keyup', 'w');
    check(!interacting, 'Canceling the object-edit gesture ends its interaction without a scene edit');
    viewport.setSelection(null); viewport.setTool('select');

    canvas.focus(); key('keydown', 's'); await delay(90); canvas.style.display = 'none';
    await stopped('A hidden canvas clears held movement'); canvas.style.display = ''; key('keyup', 's');

    await freshPerspective();
    viewport.focus('room-living'); await delay(90);
    const framing = await travel(['d'], 160);
    check(framing.delta.length() > 0.02, 'Keyboard navigation takes over during camera framing');
    await stopped('Interrupted framing cannot resume after the movement key is released', 550);

    canvas.focus(); key('keydown', 'w'); navigationOrbit().dispatchEvent({ type: 'start' });
    await delay(90); viewport.setView('top'); await delay(650);
    check(camera instanceof THREE.OrthographicCamera, 'Top uses the real orthographic camera');
    await stopped('Switching exterior view clears held movement after framing settles'); key('keyup', 'w');
    check(!interacting, 'Switching view clears both mouse and keyboard interaction state');
    const topForward = forwardDirection();
    const top = await travel(['ArrowUp'], 160);
    check(top.delta.length() > 0.02 && top.delta.clone().normalize().dot(topForward) > 0.999
      && Math.abs(top.after.position.y - top.before.position.y) < 1e-8
      && top.after.orientation.angleTo(top.before.orientation) < 1e-7 && top.after.zoom === top.before.zoom,
    'Top arrow navigation pans on the floor while preserving camera height, orientation and zoom');
    check(top.before.target && top.after.target
      && top.after.target.clone().sub(top.before.target).distanceTo(top.delta) < 1e-8,
    'Top arrow navigation translates its orbit target equally');

    await freshPerspective(); viewport.setSelection('room-living'); viewport.setTool('move');
    canvas.focus(); key('keydown', 'd'); await delay(100);
    const outside = snapshot(); viewport.setView('inside'); key('keyup', 'd'); await delay(550);
    check(camera instanceof THREE.PerspectiveCamera && Math.abs(camera!.position.y - 1.65) < 1e-7,
      'Entering Inside switches to the existing grounded walking camera');
    await stopped('Entering Inside does not inherit an exterior held key');
    const insideStart = snapshot(); canvas.focus(); key('keydown', 's'); await delay(180); key('keyup', 's'); await delay(400);
    check(camera!.position.distanceTo(insideStart.position) > 0.02 && Math.abs(camera!.position.y - 1.65) < 1e-7,
      'Inside S walking remains active at standing eye height');
    viewport.setView('perspective'); await delay(550);
    check(camera!.position.distanceTo(outside.position) < 1e-7,
      'Leaving Inside restores the exterior camera after keyboard navigation');
    const returned = await travel(['ArrowLeft']);
    check(returned.delta.length() > 0.02, 'Exterior keyboard navigation works again after leaving Inside');

    check(JSON.stringify(store.scene) === saved && store.revision === 0 && !store.canUndo && !store.canRedo && edits === 0,
      'Navigation does not alter scene JSON, revision, history or editing callbacks');
    await delay(650); const settledFrames = frames; await delay(220);
    check(frames === settledFrames, 'The real renderer returns to idle after navigation');
    check(errors.length === 0, `The real renderer completed without reported errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
    output.textContent = `${results.join('\n')}\nCOMPLETE ${results.length} browser checks.`;
  } catch (error) {
    output.textContent = `${results.join('\n')}\nFAIL ${String(error)}${errors.length ? `\nRenderer: ${errors.join('; ')}` : ''}`;
  } finally {
    for (const value of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) key('keyup', value);
    if (dialog.open) dialog.close(); dialog.removeAttribute('open'); canvas.style.display = '';
    viewport.cancelInteraction(); button.disabled = false;
  }
};
