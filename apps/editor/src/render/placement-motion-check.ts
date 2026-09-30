import * as THREE from 'three';
import { PlacementMotion } from './placement-motion';

let assertions = 0;
function assert(value: unknown, message: string): void { assertions++; if (!value) throw new Error(`Placement motion: ${message}`); }
let now = 0;
const parent = new THREE.Group(), root = new THREE.Group(), visual = new THREE.Group();
parent.add(root); root.add(visual);
root.position.set(2, 0, 3); root.scale.set(2, 2, .5);
const savedRoot = root.matrix.clone(); root.updateMatrix(); savedRoot.copy(root.matrix);
const motion = new PlacementMotion(parent, () => {}, () => now);
motion.lift('piece', visual, [1, 2, 1]);
now = 50; assert(motion.update(now), 'pickup requests intermediate frames');
const halfway = visual.position.y;
assert(halfway > 0 && halfway * root.scale.y < .04, 'pickup has bounded world-space lift');
now = 100; assert(!motion.update(now), 'held lift returns renderer to idle');
assert(Math.abs(visual.position.y * root.scale.y - .04) < 1e-8, 'scaled object lift is capped at four centimetres');
assert(visual.scale.equals(new THREE.Vector3(1, 1, 1)), 'pickup preserves dimensions');
now = 120; motion.land('piece', visual, [1, 2, 1]);
let previous = visual.position.y;
for (const offset of [0, 30, 60, 90, 120, 150, 180]) {
  now = 120 + offset; motion.update(now);
  assert(visual.position.y >= 0 && visual.position.y <= previous, 'landing descends once without rebound');
  assert(visual.scale.equals(new THREE.Vector3(1, 1, 1)), 'landing never deforms precision dimensions');
  previous = visual.position.y;
}
assert(visual.position.y === 0 && !motion.update(301), 'landing settles exactly and returns to idle');
root.updateMatrix(); assert(root.matrix.equals(savedRoot), 'presentation leaves checked root transform unchanged');
assert(parent.children.length === 1, 'settled landing removes contact geometry');
now = 400; motion.lift('piece', visual, [1, 2, 1]);
now = 440; motion.update(now); const interrupted = visual.position.y;
motion.land('piece', visual, [1, 2, 1]);
assert(visual.position.y === interrupted, 'interrupted pickup lands from currently displayed height');
now = 470; motion.update(now); const landingHeight = visual.position.y;
motion.lift('piece', visual, [1, 2, 1]);
assert(visual.position.y === landingHeight, 'pickup interrupts landing without a jump');
motion.stop('piece');
assert(visual.position.lengthSq() === 0 && parent.children.length === 1 && !motion.update(900), 'cancel clears offsets, pulses and pending frames');
motion.dispose();
console.log(`Placement motion checks passed (${assertions} assertions).`);
