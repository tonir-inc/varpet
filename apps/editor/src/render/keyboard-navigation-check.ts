import * as THREE from 'three';
import { KeyboardNavigationControls } from './keyboard-navigation';

let assertions = 0;
const failures: string[] = [];
function assert(condition: unknown, message: string): void {
  assertions++;
  if (!condition) throw new Error(message);
}
function close(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, got ${actual}`);
}
function closeVector(actual: THREE.Vector3, expected: THREE.Vector3, message: string): void {
  assert(actual.distanceTo(expected) < 1e-8, `${message}: expected ${expected.toArray()}, got ${actual.toArray()}`);
}
function check(name: string, run: () => void): void {
  try { run(); } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
}

class Target extends EventTarget {
  private registered = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    super.addEventListener(type, listener, options);
    if (listener) {
      const listeners = this.registered.get(type) ?? new Set();
      listeners.add(listener); this.registered.set(type, listeners);
    }
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
    super.removeEventListener(type, listener, options);
    if (listener) this.registered.get(type)?.delete(listener);
  }
  get listenerCount(): number { return [...this.registered.values()].reduce((total, listeners) => total + listeners.size, 0); }
}
class FakeDocument extends Target {
  activeElement: unknown = null;
  hidden = false;
  modal = false;
  querySelector(): unknown { return this.modal ? {} : null; }
}
class FakeCanvas extends Target {
  visible = true;
  constructor(private doc: FakeDocument) { super(); }
  getClientRects(): unknown[] { return this.visible ? [{}] : []; }
  focus(): void { this.doc.activeElement = this; this.doc.dispatchEvent(new Event('focusin')); }
}
function keyboardEvent(type: string, key: string, properties: Record<string, unknown>): Event {
  const event = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries({ key, ...properties })) Object.defineProperty(event, name, { value });
  return event;
}
const originalGlobals = new Map(['window', 'document', 'performance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
function harness(top = false) {
  let now = 0, enabled = true;
  const doc = new FakeDocument(), win = new Target(), canvas = new FakeCanvas(doc);
  for (const [name, value] of Object.entries({ window: win, document: doc, performance: { now: () => now } })) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const camera = top ? new THREE.OrthographicCamera(-8, 8, 8, -8, 0.05, 250) : new THREE.PerspectiveCamera(32, 1, 0.05, 250);
  const target = new THREE.Vector3();
  if (top) { camera.up.set(0, 0, -1); camera.position.set(0, 25, 0); }
  else camera.position.set(0, 8, 12);
  camera.lookAt(target); camera.updateMatrixWorld();
  const callbacks = { start: 0, stop: 0, change: 0, render: 0 };
  const controls = new KeyboardNavigationControls(canvas as unknown as HTMLCanvasElement, {
    camera: () => camera, target, enabled: () => enabled,
    start: () => { callbacks.start++; }, stop: () => { callbacks.stop++; },
    change: () => { callbacks.change++; }, render: () => { callbacks.render++; },
  });
  canvas.focus();
  const key = (type: string, value: string, properties: Record<string, unknown> = {}): Event => {
    const event = keyboardEvent(type, value, properties); win.dispatchEvent(event); return event;
  };
  const step = (seconds: number): boolean => { now += seconds * 1000; return controls.update(now); };
  const elapse = (seconds: number): void => { now += seconds * 1000; };
  return { camera, target, controls, doc, win, canvas, callbacks, key, step, elapse, setEnabled: (value: boolean) => { enabled = value; } };
}
function withHarness(run: (state: ReturnType<typeof harness>) => void, top = false): void {
  const state = harness(top); try { run(state); } finally { state.controls.dispose(); }
}

check('all WASD and arrow directions move the exterior camera and its orbit target', () => {
  for (const [key, x, z] of [['w', 0, -1], ['ArrowUp', 0, -1], ['s', 0, 1], ['ArrowDown', 0, 1],
    ['a', -1, 0], ['ArrowLeft', -1, 0], ['d', 1, 0], ['ArrowRight', 1, 0], ['W', 0, -1]] as const) {
    withHarness(({ camera, target, controls, callbacks, key: send, step }) => {
      const before = camera.position.clone(), orientation = camera.quaternion.clone(), zoom = camera.zoom;
      const expected = new THREE.Vector3(x, 0, z).applyQuaternion(orientation).multiplyScalar(0.5);
      assert(send('keydown', key).defaultPrevented, `${key} prevents browser scrolling or shortcuts`);
      assert(controls.active && callbacks.start === 1 && callbacks.render > 0, `${key} starts a renderable navigation interaction`);
      assert(step(0.1), `${key} keeps rendering while held`);
      close(camera.position.x - before.x, expected.x, `${key} camera X`);
      close(camera.position.z - before.z, expected.z, `${key} camera Z`);
      close(camera.position.y - before.y, expected.y, `${key} camera Y follows the look direction`);
      assert(target.distanceTo(camera.position.clone().sub(before)) < 1e-8, `${key} translates orbit target equally`);
      assert(camera.quaternion.equals(orientation) && camera.zoom === zoom, `${key} preserves orientation and zoom`);
      assert(callbacks.change === 1, `${key} reports its camera change`);
      send('keyup', key);
      assert(!controls.active && callbacks.stop === 1, `${key} ends its interaction on release`);
      const stopped = camera.position.clone();
      assert(!step(0.1) && camera.position.equals(stopped), `${key} stops immediately without drift`);
    });
  }
});

check('perspective movement follows the full current look direction', () => withHarness(({ camera, target, key, step }) => {
  camera.position.set(11, 12, 15); camera.lookAt(target); camera.updateMatrixWorld();
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const start = camera.position.clone(); key('keydown', 'w'); step(0.2); key('keyup', 'w');
  closeVector(camera.position.clone().sub(start), forward, 'W advances one metre toward the exact point being viewed');
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const turned = camera.position.clone(); key('keydown', 'd'); step(0.2);
  closeVector(camera.position.clone().sub(turned), right, 'D moves right relative to the view');
}));

check('pitched and vertical views retain full forward, backward and diagonal movement', () => {
  for (const direction of [new THREE.Vector3(1, 1, -1), new THREE.Vector3(-1, -1, -1),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)]) {
    direction.normalize();
    for (const [keys, local] of [[['w'], new THREE.Vector3(0, 0, -1)], [['s'], new THREE.Vector3(0, 0, 1)],
      [['w', 'd'], new THREE.Vector3(1, 0, -1).normalize()], [['s', 'a'], new THREE.Vector3(-1, 0, 1).normalize()]] as const) {
      withHarness(({ camera, target, key, step }) => {
        camera.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction); camera.updateMatrixWorld();
        const orientation = camera.quaternion.clone(), before = camera.position.clone(), beforeTarget = target.clone();
        const expected = local.clone().applyQuaternion(orientation);
        for (const value of keys) key('keydown', value);
        step(0.2);
        const delta = camera.position.clone().sub(before);
        closeVector(delta, expected, `${keys.join('+')} follows the view basis at ${direction.toArray()}`);
        close(delta.length(), 1, 'pitched and vertical movement retains normalized speed');
        closeVector(target.clone().sub(beforeTarget), delta, 'orbit target receives the complete three-dimensional displacement');
        assert(camera.quaternion.equals(orientation), 'pitched movement preserves camera orientation');
      });
    }
  }
});

check('canvas pointer navigation preserves held keys and remains available to orbit controls', () => {
  for (const button of [0, 1, 2]) withHarness(({ canvas, camera, controls, callbacks, key, step }) => {
    key('keydown', 'w'); step(0.1);
    let orbitStarts = 0;
    const observePointer = (): void => { orbitStarts++; };
    canvas.addEventListener('pointerdown', observePointer);
    try {
      const down = new Event('pointerdown', { cancelable: true });
      Object.defineProperty(down, 'button', { value: button });
      canvas.dispatchEvent(down);
      assert(!down.defaultPrevented && orbitStarts === 1, `pointer button ${button} remains available to camera controls`);
      assert(controls.active && callbacks.stop === 0, `pointer button ${button} preserves the held W interaction`);
      const before = camera.position.clone(), expected = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.5);
      assert(step(0.1), `pointer button ${button} keeps movement rendering`);
      closeVector(camera.position.clone().sub(before), expected, `pointer button ${button} keeps W moving at full speed`);
      canvas.dispatchEvent(new Event('pointerup'));
      const releasedPointer = camera.position.clone(); step(0.1);
      closeVector(camera.position.clone().sub(releasedPointer), expected, `ending pointer button ${button} does not release W`);
      key('keyup', 'w');
      assert(callbacks.start === 1 && callbacks.stop === 1, `pointer button ${button} does not restart keyboard interaction`);
    } finally { canvas.removeEventListener('pointerdown', observePointer); }
  });
});

check('held forward input follows live camera rotation during a pointer gesture', () => withHarness(({ canvas, camera, target, controls, callbacks, key, step }) => {
  key('keydown', 'w'); step(0.1); canvas.dispatchEvent(new Event('pointerdown'));
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  camera.position.sub(target).applyQuaternion(turn).add(target); camera.lookAt(target); camera.updateMatrixWorld();
  canvas.dispatchEvent(new Event('pointermove'));
  const before = camera.position.clone(), beforeTarget = target.clone();
  const expected = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.5);
  assert(controls.active && step(0.1), 'rotating the view needs no fresh W press');
  assert(camera.position.clone().sub(before).distanceTo(expected) < 1e-8, 'held W immediately follows the rotated look direction');
  assert(target.clone().sub(beforeTarget).distanceTo(expected) < 1e-8, 'orbit target follows the rotated movement direction');
  assert(camera.position.y < before.y, 'rotated keyboard movement continues along the downward view');
  assert(callbacks.start === 1 && callbacks.stop === 0, 'turning does not break the keyboard interaction');
  key('keyup', 'w'); canvas.dispatchEvent(new Event('pointerup'));
}));

check('held forward input follows pitch changes without a fresh key press', () => withHarness(({ camera, target, controls, callbacks, key, step }) => {
  key('keydown', 'w'); step(0.1);
  for (const direction of [new THREE.Vector3(1, -1, -1), new THREE.Vector3(-1, 1, -1), new THREE.Vector3(0, 1, 0)]) {
    direction.normalize(); camera.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    const before = camera.position.clone(), beforeTarget = target.clone();
    assert(controls.active && step(0.1), 'changing pitch keeps the original W press active');
    closeVector(camera.position.clone().sub(before), direction.clone().multiplyScalar(0.5), 'held W follows the new full look direction immediately');
    closeVector(target.clone().sub(beforeTarget), direction.clone().multiplyScalar(0.5), 'orbit target follows each pitch change');
  }
  assert(callbacks.start === 1 && callbacks.stop === 0, 'pitch changes remain one keyboard interaction');
}));

check('movement keys can start and change while a pointer gesture is already active', () => withHarness(({ canvas, doc, camera, controls, key, step }) => {
  doc.activeElement = {}; doc.dispatchEvent(new Event('focusin'));
  canvas.dispatchEvent(new Event('pointerdown'));
  assert(doc.activeElement === canvas, 'starting a canvas gesture focuses keyboard navigation');
  const start = camera.position.clone(), forward = camera.getWorldDirection(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  key('keydown', 'w'); step(0.1);
  closeVector(camera.position.clone().sub(start), forward.clone().multiplyScalar(0.5), 'W starts during a held pointer gesture');
  canvas.dispatchEvent(new Event('pointermove')); key('keydown', 'd');
  const diagonalStart = camera.position.clone(); step(0.1);
  const diagonal = 0.5 / Math.sqrt(2);
  const delta = camera.position.clone().sub(diagonalStart);
  close(delta.dot(right), diagonal, 'adding D during a drag adds rightward movement');
  close(delta.dot(forward), diagonal, 'adding D during a drag preserves normalized forward movement');
  key('keyup', 'w'); canvas.dispatchEvent(new Event('pointerup'));
  const sidewaysStart = camera.position.clone();
  assert(controls.active && step(0.1), 'ending the pointer gesture leaves D held');
  closeVector(camera.position.clone().sub(sidewaysStart), right.clone().multiplyScalar(0.5), 'D continues after the pointer gesture ends');
  close(camera.position.clone().sub(sidewaysStart).dot(forward), 0, 'released W does not resume after the pointer gesture');
  key('keyup', 'd');
}));

check('an edit gesture still cancels concurrent navigation through the enabled gate', () => withHarness(({ canvas, camera, controls, callbacks, key, step, setEnabled }) => {
  key('keydown', 'w'); step(0.1); canvas.dispatchEvent(new Event('pointerdown'));
  assert(controls.active, 'camera pointer gesture initially retains held movement');
  setEnabled(false);
  const stopped = camera.position.clone();
  assert(!step(0.1) && camera.position.equals(stopped), 'an edit gate stops movement before another frame can translate the camera');
  assert(!controls.active && callbacks.stop === 1, 'an edit gate clears the held keyboard interaction');
  canvas.dispatchEvent(new Event('pointermove')); canvas.dispatchEvent(new Event('pointerup')); setEnabled(true);
  assert(!step(0.1) && camera.position.equals(stopped), 'ending the edit gesture never resumes stale movement');
  key('keydown', 'w', { repeat: true });
  assert(!controls.active && !step(0.1), 'autorepeat cannot revive a key canceled by an edit gesture');
  key('keyup', 'w'); key('keydown', 'w');
  assert(controls.active && step(0.1) && camera.position.z < stopped.z, 'a new physical press resumes movement after editing');
}));

check('Top navigation remains well-defined when looking straight down', () => withHarness(({ camera, target, key, step }) => {
  const start = camera.position.clone(), orientation = camera.quaternion.clone();
  key('keydown', 'w'); step(0.2); key('keyup', 'w'); key('keydown', 'd'); step(0.2);
  assert(camera.position.clone().sub(start).distanceTo(new THREE.Vector3(1, 0, -1)) < 1e-8, 'Top W/D moves up and right on the floor');
  assert(target.distanceTo(new THREE.Vector3(1, 0, -1)) < 1e-8, 'Top orbit target follows the pan');
  assert(camera.quaternion.equals(orientation) && camera.zoom === 1, 'Top navigation preserves projection and orientation');
}, true));

check('diagonals, aliases, repeats and variable frame rates preserve speed', () => {
  const travel = (keys: [string, ...string[]], durations: number[]): number => {
    let distance = 0;
    withHarness(({ camera, key, step, callbacks }) => {
      const start = camera.position.clone();
      for (const value of keys) key('keydown', value);
      key('keydown', keys[0], { repeat: true });
      for (const duration of durations) step(duration);
      distance = camera.position.distanceTo(start);
      assert(callbacks.start === 1, 'additional held keys and autorepeat do not restart the interaction');
    });
    return distance;
  };
  for (const hz of [4, 5, 10, 30, 60, 120]) {
    const durations = Array(hz * 2).fill(1 / hz) as number[];
    close(travel(['w'], durations), 10, `two seconds of movement at ${hz} Hz`);
    close(travel(['w', 'd'], durations), 10, `diagonal movement at ${hz} Hz`);
  }
  close(travel(['w', 'ArrowUp'], [0.1, 0.1]), 1, 'same-direction aliases do not double speed');
  close(travel(['w'], Array.from({ length: 10 }, () => [0.01, 0.09, 0.1]).flat()), 10, 'uneven frames preserve elapsed-time movement');
  close(travel(['w'], [5]), 0.25, 'a suspended frame resumes with bounded movement');
});

check('changing a movement chord between frames retains every interval', () => withHarness(({ camera, target, key, step, elapse, callbacks }) => {
  const start = camera.position.clone(), forward = camera.getWorldDirection(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const distanceAlong = (direction: THREE.Vector3) => camera.position.clone().sub(start).dot(direction);
  key('keydown', 'w'); elapse(0.1); key('keydown', 'd');
  close(distanceAlong(right), 0, 'adding D preserves the earlier straight interval');
  close(distanceAlong(forward), 0.5, 'adding D includes all forward travel since the last frame');
  elapse(0.1); key('keyup', 'w');
  const diagonal = 0.5 / Math.sqrt(2);
  close(distanceAlong(right), diagonal, 'releasing W includes the diagonal interval before release');
  close(distanceAlong(forward), 0.5 + diagonal, 'the diagonal interval retains normalized forward speed');
  step(0.1); key('keyup', 'd');
  close(distanceAlong(right), diagonal + 0.5, 'the remaining D covers its complete interval');
  close(distanceAlong(forward), 0.5 + diagonal, 'released W adds no later forward movement');
  assert(target.distanceTo(camera.position.clone().sub(start)) < 1e-8, 'orbit target follows all between-frame intervals');
  assert(callbacks.start === 1 && callbacks.stop === 1, 'chord changes remain one continuous interaction');
  const stopped = camera.position.clone();
  assert(!step(0.1) && camera.position.equals(stopped), 'the final release leaves no unaccounted travel or drift');
}));

check('opposing inputs settle and releasing one restarts movement', () => withHarness(({ camera, key, step, callbacks }) => {
  const start = camera.position.clone(); key('keydown', 'w'); key('keydown', 's');
  assert(!step(0.1) && camera.position.equals(start), 'opposing forward/backward keys are idle');
  const requested = callbacks.render; key('keyup', 'w');
  assert(callbacks.render > requested, 'releasing one opposing key requests a fresh frame');
  assert(step(0.1) && camera.position.z > start.z, 'remaining S resumes backward travel');
}));

check('navigation consumes S only when canvas movement is available', () => withHarness(({ win, doc, key, step, camera }) => {
  let shortcutCalls = 0;
  const shortcut = () => { shortcutCalls++; }; win.addEventListener('keydown', shortcut);
  try {
    const before = camera.position.clone(); key('keydown', 's'); step(0.1); key('keyup', 's');
    assert(camera.position.z > before.z && shortcutCalls === 0, 'focused S moves without reaching other keyboard handlers');
    doc.activeElement = {}; doc.dispatchEvent(new Event('focusin'));
    assert(!key('keydown', 's').defaultPrevented && Number(shortcutCalls) === 1, 'unfocused S stays available to editor shortcuts');
  } finally { win.removeEventListener('keydown', shortcut); }
}));

check('typing, shortcuts, hidden surfaces and blocked gestures do not navigate', () => {
  for (const reason of ['focus', 'modal', 'hidden', 'canvas', 'disabled', 'metaKey', 'ctrlKey', 'altKey', 'isComposing'] as const) {
    withHarness(({ doc, canvas, controls, camera, key, step, setEnabled }) => {
      const properties: Record<string, unknown> = {};
      if (reason === 'focus') doc.activeElement = {};
      else if (reason === 'modal') doc.modal = true;
      else if (reason === 'hidden') doc.hidden = true;
      else if (reason === 'canvas') canvas.visible = false;
      else if (reason === 'disabled') setEnabled(false);
      else properties[reason] = true;
      const before = camera.position.clone();
      assert(!key('keydown', 'w', properties).defaultPrevented, `${reason} retains normal keyboard behavior`);
      assert(!controls.active && !step(0.1) && camera.position.equals(before), `${reason} cannot move the scene camera`);
    });
  }
});

check('interruptions clear held keys and never resume stale movement', () => {
  for (const reason of ['blur', 'focus', 'modal', 'hidden', 'canvas', 'disabled', 'cancel', 'metaKey', 'ctrlKey', 'altKey', 'isComposing'] as const) {
    withHarness(({ doc, win, canvas, camera, controls, callbacks, key, step, setEnabled }) => {
      key('keydown', 'w'); step(0.1);
      if (reason === 'blur') win.dispatchEvent(new Event('blur'));
      else if (reason === 'focus') { doc.activeElement = {}; doc.dispatchEvent(new Event('focusin')); }
      else if (reason === 'modal') doc.modal = true;
      else if (reason === 'hidden') { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }
      else if (reason === 'canvas') canvas.visible = false;
      else if (reason === 'disabled') setEnabled(false);
      else if (reason === 'cancel') controls.cancel();
      else key('keydown', 'w', { [reason]: true });
      const stopped = camera.position.clone();
      assert(!step(0.1) && camera.position.equals(stopped), `${reason} stops immediately`);
      assert(!controls.active && callbacks.stop === 1, `${reason} ends the navigation interaction once`);
      doc.hidden = false; doc.modal = false; canvas.visible = true; setEnabled(true); canvas.focus();
      assert(!step(0.1) && camera.position.equals(stopped), `${reason} does not retain stale held keys`);
    });
  }
});

check('cancel and disposal are idempotent and remove input listeners', () => withHarness(({ camera, controls, callbacks, win, doc, canvas, key, step }) => {
  key('keydown', 'w'); step(0.1); controls.cancel(); controls.cancel();
  assert(callbacks.stop === 1, 'repeated cancel ends an interaction only once');
  key('keydown', 'd'); step(0.1); controls.dispose(); controls.dispose();
  assert(callbacks.stop === 2 && !controls.active, 'dispose ends a remaining interaction exactly once');
  assert(win.listenerCount + doc.listenerCount + canvas.listenerCount === 0, 'dispose removes every listener');
  const stopped = camera.position.clone();
  assert(!key('keydown', 'w').defaultPrevented && !step(0.1) && camera.position.equals(stopped), 'disposed controls neither consume keys nor move');
}));

for (const [key, descriptor] of originalGlobals) {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
}
if (failures.length) throw new Error(`Keyboard navigation checks failed:\n${failures.join('\n')}`);
console.log(`Keyboard navigation checks passed (${assertions} assertions).`);
