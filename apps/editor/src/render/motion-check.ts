/** Deterministic presentation-motion checks; no WebGL or real-time sleeps. */
import * as THREE from 'three';
import { MotionTimeline, setProjectionOpacity } from './motion';

let checks = 0;
function assert(condition: unknown, message: string): void {
  checks++;
  if (!condition) throw new Error(message);
}
function near(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, got ${actual}`);
}

let now = 0;
let renders = 0;
let reduced = false;
const timeline = new MotionTimeline(() => { renders++; }, () => reduced, () => now);
let position = 0;
let oldCompletions = 0;
let completions = 0;
timeline.animate('move', 100, eased => { position = 10 * eased; }, () => { oldCompletions++; });
near(position, 0, 'Animation preserves the initial displayed value');
assert(renders === 1, 'Starting motion requests the host render loop');
now = 50;
assert(timeline.update(), 'Motion remains active at its midpoint');
near(position, 8.75, 'Cubic ease-out has reached 87.5 percent halfway through');
now = 60;
timeline.sample('move');
near(position, 9.36, 'Explicit sampling captures the pose at interruption time');
const interruptedAt = position;
timeline.animate('move', 100, eased => { position = interruptedAt + (20 - interruptedAt) * eased; }, () => { completions++; });
near(position, interruptedAt, 'Replacing a job begins at its sampled pose without jumping');
now = 110;
timeline.update();
near(position, interruptedAt + (20 - interruptedAt) * 0.875, 'Replacement follows its own clock');
assert(oldCompletions === 0, 'Superseded jobs never fire stale completion callbacks');
now = 1000;
assert(!timeline.update(), 'A suspended tab catches up and becomes idle in one update');
near(position, 20, 'Settled pose is the exact requested target');
assert(completions === 1, 'Completion fires once');
timeline.update();
assert(completions === 1, 'Idle frames do not repeat completion');

let surface = 0;
const objectKey = {};
timeline.animate(objectKey, 100, eased => { position = eased; });
timeline.animate('surface', 200, eased => { surface = eased; });
now = 1100;
assert(timeline.update(), 'Longer concurrent motion keeps the loop active');
near(position, 1, 'A short concurrent job finishes independently');
near(surface, 0.875, 'Another key advances on the same host frame');
timeline.cancel('surface');
now = 1200;
assert(!timeline.update(), 'Cancelled jobs leave the loop idle');
near(surface, 0.875, 'Cancellation freezes the displayed pose');
timeline.animate('finish', 100, eased => { surface = eased; }, () => { completions++; });
timeline.finish('finish');
near(surface, 1, 'finish settles a key immediately');
assert(completions === 2, 'finish invokes its completion exactly once');
timeline.finish('finish');
assert(completions === 2, 'Finishing a missing key is harmless');

timeline.animate('a', 100, eased => { position = eased; });
timeline.animate('b', 100, eased => { surface = eased; });
timeline.finishAll();
near(position, 1, 'finishAll settles the first projection');
near(surface, 1, 'finishAll settles the second projection');
assert(!timeline.update(), 'finishAll leaves no active work');
reduced = true;
assert(timeline.reduced, 'Injected reduced preference is exposed');
timeline.animate('reduced', 100, eased => { position = eased; }, () => { completions++; });
near(position, 1, 'Reduced motion synchronously shows the final state');
assert(completions === 3 && !timeline.update(), 'Reduced motion completes synchronously without an idle loop');
reduced = false;
timeline.animate('preference', 100, eased => { surface = eased; });
reduced = true;
timeline.update();
near(surface, 1, 'Changing injected preference finishes active work on the next host frame');
reduced = false;
timeline.animate('instant', 0, eased => { position = eased; });
near(position, 1, 'Zero-duration jobs settle immediately');
assert(!timeline.update(), 'Zero-duration jobs do not keep the host loop alive');

timeline.animate('dispose', 100, eased => { position = eased; }, () => { completions++; });
timeline.dispose();
const rendersAtDisposal = renders;
now += 1000;
assert(!timeline.update(), 'Disposal clears active work');
timeline.animate('after-dispose', 100, eased => { position = eased; }, () => { completions++; });
timeline.finishAll();
timeline.sample('dispose');
assert(renders === rendersAtDisposal, 'Disposed timelines never schedule another render');
assert(completions === 3, 'Disposal and later calls never run stale completion callbacks');

// Completion callbacks can enqueue follow-up transitions for the next host frame.
let chainedCompletions = 0;
const chain = new MotionTimeline(() => {}, () => false, () => 0);
const startChained = (): void => {
  chain.animate('chain', 100, eased => { position = eased; }, () => {
    chainedCompletions++;
    if (chainedCompletions === 1) startChained();
  });
};
startChained();
assert(chain.update(100), 'A newly scheduled follow-up remains active for the next host frame');
assert(chainedCompletions === 1, 'A single host update never drains newly scheduled follow-up transitions');
near(position, 0, 'A follow-up transition preserves its initial pose until the next frame');
chain.dispose();

// A live OS preference change must also settle an otherwise sleeping editor immediately.
const oldMatchMedia = globalThis.matchMedia;
let mediaReduced = false;
const listeners = new Set<() => void>();
globalThis.matchMedia = (() => ({
  get matches() { return mediaReduced; },
  addEventListener: (_event: string, listener: () => void) => { listeners.add(listener); },
  removeEventListener: (_event: string, listener: () => void) => { listeners.delete(listener); },
})) as unknown as typeof matchMedia;
let preferenceRenders = 0;
const nativeTimeline = new MotionTimeline(() => { preferenceRenders++; }, undefined, () => 0);
nativeTimeline.animate('native', 100, eased => { position = eased; });
mediaReduced = true;
for (const listener of listeners) listener();
near(position, 1, 'OS preference event immediately settles active motion');
assert(nativeTimeline.reduced && !nativeTimeline.update(), 'OS reduced motion leaves the timeline idle');
assert(preferenceRenders >= 2, 'Preference change requests the exact final rendered state');
nativeTimeline.dispose();
assert(listeners.size === 0, 'Disposal removes the OS preference listener');
if (oldMatchMedia) globalThis.matchMedia = oldMatchMedia;
else Reflect.deleteProperty(globalThis, 'matchMedia');

const projection = new THREE.Group();
const opaque = new THREE.MeshStandardMaterial({ opacity: 0.8, depthWrite: true });
const glass = new THREE.MeshStandardMaterial({ opacity: 0.25, transparent: true, depthWrite: false });
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [opaque, glass]);
mesh.castShadow = true;
const hiddenChild = new THREE.Group();
hiddenChild.visible = false;
projection.add(mesh, hiddenChild);
const shaderHook = opaque.onBeforeCompile;
setProjectionOpacity(projection, 0.5);
near(opaque.opacity, 0.4, 'Projection opacity is relative to the original opaque material');
near(glass.opacity, 0.125, 'Glass keeps its relative transparency');
assert(opaque.transparent && !opaque.depthWrite, 'Fading material blends without writing depth');
assert(!mesh.castShadow, 'A fading projection does not cast an opaque shadow');
assert(mesh.material[0] === opaque && opaque.onBeforeCompile === shaderHook, 'Opacity preserves finish shader material identity');
setProjectionOpacity(projection, 0.25);
near(opaque.opacity, 0.2, 'Repeated opacity samples do not compound opacity');
assert(!hiddenChild.visible, 'Opacity does not reveal individually hidden children');
setProjectionOpacity(projection, 0);
assert(!projection.visible, 'Zero-opacity projections are hidden');
setProjectionOpacity(projection, 1);
assert(projection.visible && mesh.castShadow, 'Final projection restores visibility and original shadows');
near(opaque.opacity, 0.8, 'Final projection restores original opacity');
assert(!opaque.transparent && opaque.depthWrite, 'Final projection restores original opaque depth flags');
near(glass.opacity, 0.25, 'Final projection restores glass opacity');
assert(glass.transparent && !glass.depthWrite, 'Final projection preserves original glass flags');
opaque.dispose();
glass.dispose();
mesh.geometry.dispose();

console.log(`Editor motion checks passed (${checks} assertions).`);
