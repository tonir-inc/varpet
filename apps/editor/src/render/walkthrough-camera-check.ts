import * as THREE from 'three';
import type { Vec2, Vec3 } from '../contracts';
import { WalkthroughControls } from './walkthrough-controls';
import { configureInsideCamera } from './walkthrough-camera';

let assertions = 0;
const failures: string[] = [];
function assert(condition: unknown, message: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(message);
}
function check(name: string, run: () => void): void {
  try { run(); } catch (error) { failures.push(`${name}: ${String(error)}`); }
}
check('inside lens preserves believable room proportions across viewport sizes', () => {
  const configure = configureInsideCamera;
  assert(typeof configure === 'function', 'inside camera has a dedicated lens configuration');
  for (const aspect of [9 / 16, 1, 4 / 3, 16 / 9, 21 / 9, 32 / 9]) {
    const camera = new THREE.PerspectiveCamera(65, 1, 0.03, 250);
    camera.position.set(4, 1.65, 3); camera.lookAt(3, 1.65, -3); camera.zoom = 2;
    const position = camera.position.clone(), orientation = camera.quaternion.clone(); configure(camera, aspect);
    const vertical = camera.getEffectiveFOV(), horizontal = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vertical / 2)) * aspect));
    assert(vertical <= 60 + 1e-8 && horizontal <= 80 + 1e-8, `lens limits distortion for aspect ${aspect}`);
    assert(Math.abs(vertical - 60) < 1e-8 || Math.abs(horizontal - 80) < 1e-8, 'lens uses available view without unnecessary cropping');
    assert(camera.aspect === aspect && camera.zoom === 1, 'inside resize updates aspect and clears unrelated lens zoom');
    assert(camera.position.equals(position) && camera.quaternion.equals(orientation), 'lens resize preserves standing height and look direction');
    assert(camera.near === 0.03 && camera.far === 250, 'lens configuration preserves collision-scale clipping distances');
    const projection = camera.projectionMatrix.clone(); configure(camera, aspect);
    assert(camera.projectionMatrix.equals(projection), 'repeated lens updates are stable');
  }
  for (const aspect of [0, -1, Infinity, NaN]) {
    const camera = new THREE.PerspectiveCamera(); configure(camera, aspect);
    assert(camera.projectionMatrix.elements.every(Number.isFinite), 'transient invalid viewport aspect cannot corrupt projection');
  }
});
class Target extends EventTarget {
  private registered = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    super.addEventListener(type, listener, options);
    if (listener) { const listeners = this.registered.get(type) ?? new Set(); listeners.add(listener); this.registered.set(type, listeners); }
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
    super.removeEventListener(type, listener, options); if (listener) this.registered.get(type)?.delete(listener);
  }
  get listenerCount(): number { return [...this.registered.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}
class FakeDocument extends Target {
  activeElement: unknown = null;
  hidden = false;
  modal = false;
  querySelector(): unknown { return this.modal ? {} : null; }
}
class FakeCanvas extends Target {
  style = { cursor: '' };
  private captures = new Set<number>();
  constructor(private doc: FakeDocument) { super(); }
  focus(): void { this.doc.activeElement = this; this.doc.dispatchEvent(new Event('focusin')); }
  setPointerCapture(id: number): void { this.captures.add(id); }
  hasPointerCapture(id: number): boolean { return this.captures.has(id); }
  releasePointerCapture(id: number): void { this.captures.delete(id); }
}
function event(type: string, properties: Record<string, unknown>): Event {
  const value = new Event(type, { cancelable: true });
  for (const [key, property] of Object.entries(properties)) Object.defineProperty(value, key, { value: property });
  return value;
}
const originalGlobals = new Map(['document', 'window', 'performance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
function harness(reduced = false, collision?: (position: Vec3, delta: Vec2) => Vec3) {
  let now = 0, requests = 0;
  const doc = new FakeDocument(), canvas = new FakeCanvas(doc), media = Object.assign(new Target(), { matches: reduced });
  const win = Object.assign(new Target(), { matchMedia: () => media });
  for (const [key, value] of Object.entries({ document: doc, window: win, performance: { now: () => now } })) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.03, 250); camera.position.y = 1.65;
  const controls = new WalkthroughControls(camera, canvas as unknown as HTMLCanvasElement,
    collision ?? ((position, delta) => [position[0] + delta[0], position[1], position[2] + delta[1]]), () => { requests++; });
  controls.setEnabled(true);
  const key = (type: string, value: string, properties: Record<string, unknown> = {}) => win.dispatchEvent(event(type, { key: value, ...properties }));
  const step = (seconds: number) => { now += seconds * 1000; return controls.update(now); };
  return { camera, controls, canvas, doc, win, media, key, step, requests: () => requests };
}
function withHarness(run: (state: ReturnType<typeof harness>) => void, reduced = false, collision?: (position: Vec3, delta: Vec2) => Vec3): void {
  const state = harness(reduced, collision); try { run(state); } finally { state.controls.dispose(); }
}
check('natural walking starts gently and reaches a brisk navigation pace', () => withHarness(({ camera, key, step }) => {
  key('keydown', 'w'); step(1 / 60);
  assert(-camera.position.z > 0 && -camera.position.z < 0.004, 'first frame accelerates gently instead of instantly moving at full speed');
  for (let i = 1; i < 120; i++) step(1 / 60);
  const start = camera.position.z; for (let i = 0; i < 60; i++) step(1 / 60);
  assert(Math.abs(start - camera.position.z - 2.8) < 0.001, 'settled walking speed is 2.8 m/s');
  assert(camera.position.y === 1.65 && camera.rotation.z === 0, 'walking adds neither eye-height bob nor camera roll');
}));
check('release has a short bounded tail and returns to demand-driven idle', () => withHarness(({ camera, key, step }) => {
  key('keydown', 'w'); for (let i = 0; i < 60; i++) step(1 / 60); key('keyup', 'w');
  const start = camera.position.z; assert(step(1 / 60), 'key release continues the deceleration frame loop');
  assert(camera.position.z < start, 'ordinary key release eases to a stop');
  for (let i = 0; i < 60; i++) step(1 / 60);
  assert(start - camera.position.z < 0.075, 'full-speed release travels under 7.5 cm');
  const stopped = camera.position.clone(); assert(!step(1 / 60), 'settled controls stop requesting animated frames');
  assert(camera.position.equals(stopped), 'settled camera never drifts');
}));
check('frame-rate independent travel and diagonal normalization', () => {
  const travel = (hz: number, diagonal: boolean): number => {
    let distance = 0;
    withHarness(({ camera, key, step }) => { key('keydown', 'w'); if (diagonal) key('keydown', 'd'); for (let i = 0; i < hz * 2; i++) step(1 / hz); distance = Math.hypot(camera.position.x, camera.position.z); });
    return distance;
  };
  const reference = travel(60, false);
  for (const hz of [4, 5, 10, 15, 20, 30, 60, 120]) {
    assert(Math.abs(travel(hz, false) - reference) < 0.001, `travel is consistent at ${hz}Hz`);
    assert(Math.abs(travel(hz, true) - reference) < 0.001, `diagonal input does not accelerate at ${hz}Hz`);
  }
});
check('uneven slow frames retain elapsed movement time', () => {
  const travel = (durations: number[]): number => {
    let distance = 0;
    withHarness(({ camera, key, step }) => {
      key('keydown', 'w'); for (const duration of durations) step(duration);
      distance = -camera.position.z;
    });
    return distance;
  };
  const uneven = Array.from({ length: 10 }, () => [0.01, 0.09, 0.1]).flat();
  assert(Math.abs(travel(uneven) - travel(Array(120).fill(1 / 60))) < 0.001, 'slow and fast frames cover the same distance over two seconds');
});
check('opposing keys settle the render loop', () => withHarness(({ key, step }) => {
  key('keydown', 'w'); key('keydown', 's'); assert(!step(1 / 60), 'opposing keys alone are idle');
}));
check('cancel clears both held keys and velocity', () => {
  for (const reason of ['blur', 'focus', 'modal', 'hidden', 'disabled', 'orient', 'shortcut'] as const) withHarness(({ camera, controls, canvas, doc, win, key, step }) => {
    key('keydown', 'w'); for (let i = 0; i < 30; i++) step(1 / 60);
    if (reason === 'blur') win.dispatchEvent(new Event('blur'));
    if (reason === 'focus') { doc.activeElement = {}; doc.dispatchEvent(new Event('focusin')); }
    if (reason === 'modal') doc.modal = true;
    if (reason === 'hidden') { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }
    if (reason === 'disabled') controls.setEnabled(false);
    if (reason === 'orient') controls.orient();
    if (reason === 'shortcut') key('keydown', 'w', { metaKey: true });
    const stopped = camera.position.clone(); assert(!step(1 / 60), `${reason} cancels frame loop immediately`);
    assert(camera.position.equals(stopped), `${reason} cancels inertial drift immediately`);
    doc.modal = false; doc.hidden = false; canvas.focus();
    assert(!step(1 / 60) && camera.position.equals(stopped), `${reason} never restarts stale movement when focus returns`);
  });
});
check('reduced motion removes acceleration and deceleration', () => withHarness(({ camera, key, step, media }) => {
  key('keydown', 'w'); step(1 / 60);
  assert(Math.abs(camera.position.z + 2.8 / 60) < 1e-8, 'reduced motion responds immediately at configured speed');
  key('keyup', 'w'); const stopped = camera.position.clone();
  assert(!step(1 / 60) && camera.position.equals(stopped), 'reduced motion stops immediately');
  media.matches = false; media.dispatchEvent(new Event('change')); key('keydown', 'w'); step(1 / 60);
  assert(stopped.z - camera.position.z < 0.004, 'preference updates restore gentle acceleration');
}, true));
check('drag look remains direct and level', () => withHarness(({ camera, canvas, controls }) => {
  const before = camera.quaternion.clone();
  canvas.dispatchEvent(event('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 }));
  canvas.dispatchEvent(event('pointermove', { pointerId: 1, clientX: 140, clientY: 112 }));
  assert(before.angleTo(camera.quaternion) > 0.1, 'look applies pointer motion without a later animation frame');
  const angles = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); assert(Math.abs(angles.z) < 1e-9, 'look introduces no roll');
  controls.cancel(); assert(!canvas.hasPointerCapture(1), 'cancel releases pointer capture');
}));
check('collision constrains motion through the release tail', () => withHarness(({ camera, key, step }) => {
  key('keydown', 'w'); for (let i = 0; i < 60; i++) step(1 / 60); key('keyup', 'w'); for (let i = 0; i < 60; i++) step(1 / 60);
  assert(camera.position.z >= -0.2, 'walking and inertial tail cannot cross collision boundary');
}, false, (position, delta) => [position[0] + delta[0], position[1], Math.max(-0.2, position[2] + delta[1])]));
check('long paused frames are bounded and disposal cleans up listeners', () => withHarness(({ camera, controls, canvas, doc, win, media, key, step }) => {
  key('keydown', 'w'); step(5); assert(-camera.position.z <= 0.058, 'a long frame cannot jump through the room');
  controls.dispose(); assert(canvas.listenerCount + doc.listenerCount + win.listenerCount + media.listenerCount === 0, 'disposal removes every input and media-query listener');
  const stopped = camera.position.clone(); key('keydown', 'w'); step(1 / 60); assert(camera.position.equals(stopped), 'disposed controls cannot move');
}));
for (const [key, descriptor] of originalGlobals) {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
}
if (failures.length) throw new Error(`Walkthrough camera checks failed:\n${failures.join('\n')}`);
console.log(`Walkthrough camera checks passed (${assertions} assertions).`);
