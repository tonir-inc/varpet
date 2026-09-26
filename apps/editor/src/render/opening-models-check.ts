import * as THREE from 'three';
import type { SceneDocument } from '../contracts';
import { emptyProject } from '../core/renovation';
import { validateScene } from '../core/validation';
import { installOpeningModel, openingModel } from './opening-models';
import { makeStructure } from './structure';

let assertions = 0;
function assert(value: unknown, message: string): asserts value { assertions++; if (!value) throw new Error(message); }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
} });

const scene: SceneDocument = {
  format: 'varpet.editor', version: 2, id: 'opening-models', name: 'Opening models', units: 'm', upAxis: 'Y', objects: [],
  rooms: [{ id: 'room', name: 'Room', color: '#eeeeee', polygon: [[0, 0], [10, 0], [10, 8], [0, 8]] }],
  walls: [{ id: 'wall', start: [0, 0], end: [10, 0], height: 3, thickness: 0.2, color: '#eeeeee', openings: [
    { id: 'door', kind: 'door', offset: 1, width: 0.99, height: 2.1, sill: 0, assetId: 'extra:openings:door-flush-white' },
    { id: 'right', kind: 'door', offset: 3, width: 0.9, height: 2.1, sill: 0, assetId: 'extra:openings:door-flush-white' },
    { id: 'slider', kind: 'window', offset: 5, width: 2.4, height: 1.45, sill: 0.9, assetId: 'extra:openings:window-panoramic-slider' },
  ] }], project: emptyProject(),
};
scene.project!.metadata = { right: { hinge: 'right' }, slider: { mechanism: 'sliding' } };

assert(validateScene(scene, []).ok, 'openings with a catalog assetId validate');
const nulled = structuredClone(scene) as unknown as { walls: { openings: Record<string, unknown>[] }[] };
nulled.walls[0]!.openings[0]!.assetId = null;
assert(!validateScene(nulled, []).ok, 'a null assetId is rejected, not ignored');

const door = openingModel('extra:openings:door-flush-white')!;
assert(door?.url.endsWith('.glb') && door.entry.mechanism === 'hinged', 'catalog id resolves to its GLB and manifest entry');
assert(!openingModel('extra:openings:missing') && !openingModel(undefined) && !openingModel('extra:decor:vase'), 'unknown ids fall back');

/** A stand-in for the GLB: a fixed frame and a named moving part hung at the manifest's pivot. */
function model(part: string, width: number): { root: THREE.Group; leaf: THREE.Mesh } {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.1), new THREE.MeshStandardMaterial()));
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 2, 0.04), new THREE.MeshStandardMaterial()); leaf.name = part; root.add(leaf);
  return { root, leaf };
}
const tip = (leaf: THREE.Mesh, x: number) => leaf.localToWorld(new THREE.Vector3(x, 0, 0));

const structure = makeStructure(scene);
const hinged = structure.openings.get('door')!, hingedParts = model('leaf', 0.84);
hingedParts.leaf.position.set(0, 1, 0.06);
installOpeningModel(hinged, scene.walls[0]!.openings[0]!, {}, door.entry, hingedParts.root);
const holder = hinged.group.getObjectByName('opening-model')!;
assert(near(holder.position.x, 0.99 / 2) && near(holder.scale.x, 0.99 / 0.9) && near(holder.scale.y, 1), 'model sits at the hole centre, scaled to the opening');
assert(hinged.leaves.every(leaf => !leaf.parent!.visible || !leaf.visible), 'procedural leaves hide behind the model');
assert(hinged.group.userData.envelope.parent === hinged.group, 'swing envelope is kept');
const closed = tip(hingedParts.leaf, 0.42).z;
hinged.setAngle(Math.PI / 2);
assert(hinged.angle === Math.PI / 2 && tip(hingedParts.leaf, 0.42).z > closed + 0.5, 'opening the door swings the model leaf to the room side (+Z)');

const right = structure.openings.get('right')!, rightParts = model('leaf', 0.84);
installOpeningModel(right, scene.walls[0]!.openings[1]!, { hinge: 'right' }, door.entry, rightParts.root);
assert(right.group.getObjectByName('opening-model')!.scale.x < 0, 'a right-hinged door mirrors the model');
right.setAngle(Math.PI / 2);
assert(tip(rightParts.leaf, 0.42).z > 0.5, 'the mirrored leaf still swings to +Z');

const slider = structure.openings.get('slider')!, sliderParts = model('sash-b', 1.2), sliding = openingModel('extra:openings:window-panoramic-slider')!;
installOpeningModel(slider, scene.walls[0]!.openings[2]!, { mechanism: 'sliding' }, sliding.entry, sliderParts.root);
const before = sliderParts.leaf.getWorldPosition(new THREE.Vector3()).x;
slider.setAngle(Math.PI / 2);
assert(near(sliderParts.leaf.getWorldPosition(new THREE.Vector3()).x, before - 1.12), 'a sliding sash translates along -X');

console.log(`opening model checks passed (${assertions} assertions)`);
