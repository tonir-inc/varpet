import * as THREE from 'three';
import type { SceneDocument } from '../contracts';
import { emptyProject } from '../core/renovation';
import { SunOccluders } from './sun-occluders';

let assertions = 0;
function assert(value: unknown, message: string): asserts value { assertions++; if (!value) throw new Error(message); }
const source: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'sun-shell', name: 'Sun shell', units: 'm', upAxis: 'Y', objects: [],
  rooms: [{ id: 'room', name: 'Room', color: '#fff', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]] }],
  walls: [{ id: 'wall', start: [0, 0], end: [6, 0], height: 3, thickness: .2, color: '#fff', openings: [
    { id: 'window', kind: 'window', offset: 1, width: 2, sill: 1, height: 1.6 },
    { id: 'door', kind: 'door', offset: 4.3, width: 1.2, sill: 0, height: 2.1 },
  ] }],
};
const original = JSON.stringify(source);
const rig = new SunOccluders();
const world = new THREE.Scene(); world.add(rig.group);
function meshes(): THREE.Mesh[] { const result: THREE.Mesh[] = []; rig.group.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); }); return result; }
function blocked(origin: [number, number, number], direction: [number, number, number], far = 2): boolean {
  world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize(), 0, far);
  const hits: THREE.Intersection[] = [];
  for (const mesh of meshes()) if (mesh.castShadow) THREE.Mesh.prototype.raycast.call(mesh, ray, hits);
  return hits.length > 0;
}
rig.setScene(source);
assert(blocked([.5, 1.6, -1], [0, 0, 1]), 'Full-height wall blocks sun independently of cutaway presentation');
assert(!blocked([1.5, 1.6, -1], [0, 0, 1]), 'Window glass transmits sun through the actual opening');
assert(blocked([2, 1.6, -1], [0, 0, 1]), 'A real window mullion casts its own shadow');
assert(blocked([1.5, .5, -1], [0, 0, 1]), 'Wall below the window sill blocks sun');
assert(blocked([1.5, 2.8, -1], [0, 0, 1]), 'Wall above the window head blocks sun');
assert(blocked([1.5, 4, 2], [0, -1, 0]), 'The roof blocks overhead sunlight with ceilings hidden');
assert(blocked([4.8, 1, -1], [0, 0, 1]), 'Closed opaque door blocks sun');
rig.setDoorAngle('door', Math.PI / 2);
assert(!blocked([4.8, 1, -1], [0, 0, 1]), 'Door shadow follows its opened leaf');
rig.previewOpeningOffset('window', .5);
assert(!blocked([.8, 1.6, -1], [0, 0, 1]), 'Opening drag moves the sun aperture immediately');
assert(blocked([2.75, 1.6, -1], [0, 0, 1]), 'Opening drag restores the wall at the old aperture');
assert(!blocked([4.8, 1, -1], [0, 0, 1]), 'Opening drag preserves other live door angles');
assert(rig.group.visible && rig.group.userData.studioAO === false, 'Shadow shell stays available to shadows but excluded from ambient occlusion');
assert(meshes().every(mesh => {
  const material = mesh.material as THREE.Material;
  return mesh.castShadow && !mesh.receiveShadow && !material.colorWrite && !material.depthWrite && material.transparent && material.opacity === 0;
}), 'Shadow shell contributes neither visible color nor beauty depth');
assert(new THREE.Raycaster(new THREE.Vector3(.5, 1.6, -1), new THREE.Vector3(0, 0, 1)).intersectObject(rig.group, true).length === 0, 'Invisible shadow geometry cannot intercept selection');

const changed = structuredClone(source);
changed.project = { ...emptyProject(), metadata: { room: { elevation: 1, ceilingHeight: 3 }, wall: { elevation: 1 }, balcony: { zone: 'balcony' }, terrace: { zone: 'terrace' }, removed: { phase: 'remove' } } };
changed.rooms.push({ id: 'balcony', name: 'Balcony', color: '#fff', polygon: [[7, 0], [9, 0], [9, 2], [7, 2]] });
changed.rooms.push({ id: 'terrace', name: 'Terrace', color: '#fff', polygon: [[10, 0], [12, 0], [12, 2], [10, 2]] });
changed.rooms.push({ id: 'removed', name: 'Removed', color: '#fff', polygon: [[13, 0], [15, 0], [15, 2], [13, 2]] });
rig.setScene(changed);
assert(!blocked([1.5, 2.6, -1], [0, 0, 1]), 'Elevated window aperture follows its host wall elevation');
assert(blocked([1.5, 1.6, -1], [0, 0, 1]), 'Elevated sill still blocks the lower ray');
assert(blocked([1.5, 4.5, 2], [0, -1, 0], .75), 'Room elevation and explicit ceiling height position the roof');
assert(!blocked([8, 5, 1], [0, -1, 0], 6), 'Open balcony has no invented roof');
assert(!blocked([11, 5, 1], [0, -1, 0], 6), 'Open terrace has no invented roof');
assert(!blocked([14, 5, 1], [0, -1, 0], 6), 'Removed room does not leave a roof blocker');
changed.project!.metadata.window = { phase: 'remove' };
rig.setScene(changed);
assert(!blocked([2, 2.6, -1], [0, 0, 1]), 'Removed window installation keeps the hole and removes its mullions');
changed.project!.metadata.wall = { phase: 'remove' };
rig.setScene(changed);
assert(!blocked([.5, 1.6, -1], [0, 0, 1]), 'Removed wall does not leave an invisible sun blocker');

const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
for (const mesh of meshes()) { geometries.add(mesh.geometry); materials.add(mesh.material as THREE.Material); }
let disposedGeometry = 0, disposedMaterial = 0;
for (const geometry of geometries) geometry.addEventListener('dispose', () => disposedGeometry++);
for (const material of materials) material.addEventListener('dispose', () => disposedMaterial++);
rig.dispose();
assert(disposedGeometry === geometries.size && disposedMaterial === materials.size, 'Disposal frees every retained shadow geometry and material exactly once');
assert(rig.group.parent === null && rig.group.children.length === 0, 'Disposed shadow shell leaves no world objects');
assert(JSON.stringify(source) === original, 'Sun preview never changes the scene document');
console.log(`Sun occluder checks passed (${assertions} assertions).`);
