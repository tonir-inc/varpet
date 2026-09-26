import * as THREE from 'three';
import type { CeilingStyle, SceneDocument, Vec2 } from '../contracts';
import { defaultCeilingDesign } from '../core/ceiling-design';
import { emptyProject } from '../core/renovation';
import { disposeObject } from './assets';
import { makeCeilingDesigns, updateCeilingDesignVisibility } from './ceiling-design';
import { makeStructure } from './structure';

let assertions = 0;
const failures: string[] = [];
function assert(value: unknown, message: string): void { assertions++; if (!value) failures.push(message); }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
// Room annotations use a canvas, but these geometry checks need no WebGL context.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
} });

function source(): SceneDocument {
  return {
    format: 'varpet.editor', version: 2, id: 'ceiling-visibility', name: 'Ceiling visibility', units: 'm', upAxis: 'Y', objects: [], walls: [],
    rooms: [{ id: 'room', name: 'Living', color: '#d6bf98', polygon: [[10, 20], [16, 20], [16, 25], [10, 25]] }],
    project: { ...emptyProject(), metadata: { room: { elevation: .6, ceilingHeight: 3.1 } } },
  };
}
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = []; root.traverse(object => { if (object instanceof THREE.Mesh) found.push(object); }); return found;
}
function lights(root: THREE.Object3D): THREE.Light[] {
  const found: THREE.Light[] = []; root.traverse(object => { if (object instanceof THREE.Light) found.push(object); }); return found;
}
function visible(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}
function hits(root: THREE.Object3D, x: number, y: number, z: number, upward: boolean): THREE.Intersection[] {
  root.updateWorldMatrix(true, true);
  return new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, upward ? 1 : -1, 0)).intersectObject(root, true);
}
function checkPhysicalUnderside(ceiling: THREE.Mesh, height: number, label: string): void {
  ceiling.updateWorldMatrix(true, false);
  const positions = ceiling.geometry.getAttribute('position'), normals = ceiling.geometry.getAttribute('normal');
  const index = ceiling.geometry.getIndex(), count = index?.count ?? positions.count;
  const at = (offset: number) => new THREE.Vector3().fromBufferAttribute(positions, index?.getX(offset) ?? offset).applyMatrix4(ceiling.matrixWorld);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(ceiling.matrixWorld);
  for (let offset = 0; offset < count; offset += 3) {
    const a = at(offset), b = at(offset + 1), c = at(offset + 2);
    const facing = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    assert(near(a.y, height) && near(b.y, height) && near(c.y, height), `${label}: triangle ${offset / 3} follows the structural ceiling elevation`);
    assert(near(facing.x, 0) && near(facing.y, -1) && near(facing.z, 0), `${label}: triangle ${offset / 3} physically faces down into the room`);
  }
  for (let vertex = 0; vertex < normals.count; vertex++) {
    const normal = new THREE.Vector3().fromBufferAttribute(normals, vertex).applyNormalMatrix(normalMatrix);
    assert(near(normal.x, 0) && near(normal.y, -1) && near(normal.z, 0), `${label}: shading normal ${vertex} faces down into the room`);
  }
}

const polygons: { name: string; polygon: Vec2[]; probe: Vec2; outside?: Vec2 }[] = [
  { name: 'counterclockwise', polygon: [[10, 20], [16, 20], [16, 25], [10, 25]], probe: [12, 22] },
  { name: 'clockwise', polygon: [[10, 25], [16, 25], [16, 20], [10, 20]], probe: [12, 22] },
  { name: 'concave', polygon: [[10, 20], [16, 20], [16, 22], [12, 22], [12, 25], [10, 25]], probe: [11, 24], outside: [15, 24] },
];
for (const scenario of polygons) {
  const scene = source(); scene.rooms[0]!.polygon = scenario.polygon;
  scene.project!.materials.push({ id: 'ceiling-paint', name: 'Paint', color: '#bbc9dd', unit: 'm2', unitCost: 1, thickness: 0, wastePercent: 0 });
  scene.project!.finishes.push({ id: 'ceiling-finish', entityId: 'room', surface: 'ceiling', materialId: 'ceiling-paint' });
  const original = JSON.stringify(scene), shell = makeStructure(scene), ceiling = meshes(shell.ceilings)[0];
  assert(shell.ceilings.visible, `${scenario.name}: ceiling exists without entering Inside or enabling a layer`);
  assert(meshes(shell.ceilings).length === 1 && ceiling !== undefined, `${scenario.name}: a plain indoor room has one structural ceiling`);
  if (ceiling) {
    assert(ceiling.visible && ceiling.receiveShadow, `${scenario.name}: ceiling is visible and receives interior lighting shadows`);
    const material = ceiling.material;
    assert(!Array.isArray(material) && material instanceof THREE.MeshStandardMaterial, `${scenario.name}: ceiling uses a physical material`);
    if (!Array.isArray(material) && material instanceof THREE.MeshStandardMaterial) {
      assert(material.side === THREE.FrontSide && !material.transparent && material.opacity === 1 && material.depthWrite, `${scenario.name}: underside is opaque and exterior back face is culled`);
      assert(material.color.equals(new THREE.Color('#bbc9dd')), `${scenario.name}: ceiling keeps the assigned finish color`);
    }
    checkPhysicalUnderside(ceiling, 3.7, scenario.name);
    const [x, z] = scenario.probe, below = hits(shell.ceilings, x, 1.7, z, true), above = hits(shell.ceilings, x, 6, z, false);
    assert(below.length > 0 && below.every(hit => near(hit.point.y, 3.7)), `${scenario.name}: camera below sees the ceiling at the authored XZ footprint and height`);
    assert(above.length === 0, `${scenario.name}: camera above sees through the ceiling back face`);
    if (scenario.outside) assert(hits(shell.ceilings, scenario.outside[0], 1.7, scenario.outside[1], true).length === 0, 'Concave ceiling leaves the missing part of the room footprint open');
  }
  assert(JSON.stringify(scene) === original, `${scenario.name}: ceiling projection preserves authored scene data`);
  disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
}

const legacy = source(); delete legacy.project;
const legacyShell = makeStructure(legacy);
assert(legacyShell.ceilings.visible && hits(legacyShell.ceilings, 12, 1, 22, true).some(hit => near(hit.point.y, 2.8)), 'Legacy rooms without a project or ceiling design still have a ceiling at the default height');
disposeObject(legacyShell.group); disposeObject(legacyShell.ceilings); disposeObject(legacyShell.dimensions);

function ceilingEmission(scene: SceneDocument): { color: THREE.Color; radiance: THREE.Color } {
  const shell = makeStructure(scene), material = meshes(shell.ceilings)[0]!.material as THREE.MeshStandardMaterial;
  const result = { color: material.color.clone(), radiance: material.emissive.clone().multiplyScalar(material.emissiveIntensity) };
  disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
  return result;
}
for (const style of ['quiet', 'soft-glow', 'architectural'] as const) {
  const full = source(); full.project!.metadata.room!.ceilingDesign = { ...defaultCeilingDesign(style), brightness: 100, temperature: 2200 };
  const dim = structuredClone(full); dim.project!.metadata.room!.ceilingDesign!.brightness = 25;
  const off = structuredClone(full); off.project!.metadata.room!.ceilingDesign!.enabled = false;
  const zero = structuredClone(full); zero.project!.metadata.room!.ceilingDesign!.brightness = 0;
  const cool = structuredClone(full); cool.project!.metadata.room!.ceilingDesign!.temperature = 6500;
  const finished = structuredClone(full);
  finished.project!.materials.push({ id: 'paint', name: 'Dark green', color: '#1b4a2f', unit: 'm2', unitCost: 1, thickness: 0, wastePercent: 0 });
  finished.project!.finishes.push({ id: 'paint-ceiling', entityId: 'room', surface: 'ceiling', materialId: 'paint' });
  const bright = ceilingEmission(full), quarter = ceilingEmission(dim), switchedOff = ceilingEmission(off), black = ceilingEmission(zero), blue = ceilingEmission(cool), tinted = ceilingEmission(finished);
  assert(bright.radiance.r > 0 && bright.radiance.g > 0 && bright.radiance.b > 0, `${style}: active fixtures provide a bounded local approximation of reflected ceiling light`);
  assert(near(quarter.radiance.r / bright.radiance.r, .25) && near(quarter.radiance.g / bright.radiance.g, .25) && near(quarter.radiance.b / bright.radiance.b, .25), `${style}: ceiling reflected light follows the brightness control`);
  assert(switchedOff.radiance.equals(new THREE.Color(0, 0, 0)) && black.radiance.equals(new THREE.Color(0, 0, 0)), `${style}: disabled or zero-brightness fixtures leave no ceiling glow`);
  assert(blue.radiance.b / blue.radiance.r > bright.radiance.b / bright.radiance.r, `${style}: cool fixtures produce cooler reflected ceiling light`);
  assert(tinted.radiance.r < bright.radiance.r && tinted.radiance.g < bright.radiance.g && tinted.radiance.b < bright.radiance.b, `${style}: a darker ceiling finish reflects less fixture light`);
  for (const channel of ['r', 'g', 'b'] as const) assert(near(tinted.radiance[channel] / tinted.color[channel], bright.radiance[channel] / bright.color[channel]), `${style}: reflected ${channel} channel retains the ceiling finish albedo`);
}
assert(ceilingEmission(source()).radiance.equals(new THREE.Color(0, 0, 0)), 'A plain ceiling without a lighting design receives no invented practical glow');

const panelRadiance: THREE.Color[] = [];
for (const [brightness, enabled] of [[100, true], [25, true], [100, false], [0, true]] as const) {
  const scene = source(); scene.project!.metadata.room!.ceilingDesign = { ...defaultCeilingDesign('soft-glow'), brightness, enabled };
  const projection = makeCeilingDesigns(scene), panel = projection.children[0]!.children.find(child => child.userData.ceilingElement === 'panel')!;
  const plaster = meshes(panel).flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    .find((material): material is THREE.MeshStandardMaterial => material instanceof THREE.MeshStandardMaterial && !material.userData.ceilingEmitter)!;
  panelRadiance.push(plaster.emissive.clone().multiplyScalar(plaster.emissiveIntensity));
  disposeObject(projection);
}
assert(panelRadiance[0]!.r > 0 && panelRadiance[0]!.g > 0 && panelRadiance[0]!.b > 0, 'Dropped Soft Glow plaster receives reflected light instead of staying black below its cove');
assert(near(panelRadiance[1]!.r / panelRadiance[0]!.r, .25), 'Dropped panel reflected light follows fixture dimming');
assert(panelRadiance[2]!.equals(new THREE.Color(0, 0, 0)) && panelRadiance[3]!.equals(new THREE.Color(0, 0, 0)), 'Dropped panel glow stops when disabled or dimmed to zero');

const zones = source();
for (const [index, zone] of ['balcony', 'terrace', 'loggia'].entries()) {
  const id = `zone-${zone}`;
  zones.rooms.push({ id, name: zone, color: '#eee', polygon: [[20 + index * 5, 0], [24 + index * 5, 0], [24 + index * 5, 4], [20 + index * 5, 4]] });
  zones.project!.metadata[id] = { zone: zone as 'balcony' | 'terrace' | 'loggia' };
}
const zoneShell = makeStructure(zones), roofIds = meshes(zoneShell.ceilings).map(mesh => mesh.userData.entityId);
assert(roofIds.includes('room') && roofIds.includes('zone-loggia'), 'Indoor rooms and enclosed loggias retain structural ceilings');
assert(!roofIds.includes('zone-balcony') && !roofIds.includes('zone-terrace'), 'Open balconies and terraces receive no invented ceilings');
disposeObject(zoneShell.group); disposeObject(zoneShell.ceilings); disposeObject(zoneShell.dimensions);

for (const style of ['quiet', 'soft-glow', 'architectural'] as const satisfies readonly CeilingStyle[]) {
  const scene = source(); scene.project!.metadata.room!.ceilingDesign = defaultCeilingDesign(style);
  scene.rooms.push({ ...scene.rooms[0]!, id: 'upper-room', polygon: scene.rooms[0]!.polygon.map(([x, z]) => [x + 8, z]) });
  scene.project!.metadata['upper-room'] = { elevation: 3, ceilingHeight: 3.1, ceilingDesign: defaultCeilingDesign(style) };
  const original = JSON.stringify(scene), projection = makeCeilingDesigns(scene), camera = new THREE.PerspectiveCamera();
  const room = projection.children.find(child => child.userData.entityId === 'room')!, upperRoom = projection.children.find(child => child.userData.entityId === 'upper-room')!;
  const objects: THREE.Object3D[] = []; projection.traverse(object => objects.push(object));
  const originalLights = lights(projection), intensities = originalLights.map(light => light.intensity);
  assert(meshes(room).length > 0 && meshes(upperRoom).length > 0 && originalLights.length > 0, `${style}: regression includes actual fixtures and active light sources`);
  assert(near(room.userData.ceilingY, 3.7) && near(upperRoom.userData.ceilingY, 6.1), `${style}: each design tracks its own elevated structural ceiling`);
  camera.position.set(12, 8, 22); camera.updateMatrixWorld(true);
  assert(updateCeilingDesignVisibility(projection, camera), `${style}: moving above both ceilings changes fixture presentation`);
  assert(meshes(projection).every(mesh => !mesh.visible), `${style}: overhead camera sees no ceiling fixture bodies or diffusers`);
  assert(!updateCeilingDesignVisibility(projection, camera), `${style}: unchanged overhead camera does not report another visual change`);
  assert(objects.filter(object => !(object instanceof THREE.Mesh)).every(visible), `${style}: culling fixture meshes keeps their parents, lights, and targets available`);
  assert(lights(projection).every((light, index) => light === originalLights[index] && light.intensity === intensities[index] && visible(light)), `${style}: ceiling cutaway preserves actual illumination without rebuilding lights`);
  camera.position.y = 5; camera.updateMatrixWorld(true);
  assert(updateCeilingDesignVisibility(projection, camera), `${style}: camera between ceiling levels updates visibility`);
  assert(meshes(room).every(mesh => !mesh.visible) && meshes(upperRoom).every(visible), `${style}: mixed room elevations cull only the ceiling above which the camera sits`);
  camera.position.y = 1.7; camera.updateMatrixWorld(true);
  assert(updateCeilingDesignVisibility(projection, camera), `${style}: returning inside restores fixture presentation`);
  assert(meshes(projection).every(visible), `${style}: fixtures and diffusers are visible from inside`);
  assert(!updateCeilingDesignVisibility(projection, camera), `${style}: stable inside camera does not report another visual change`);
  assert(objects.every(object => object === projection || object.parent !== null), `${style}: camera motion never detaches fixture objects`);
  assert(JSON.stringify(scene) === original, `${style}: view changes preserve authored scene data`);
  disposeObject(projection);
}

if (failures.length) throw new Error(`Ceiling visibility checks failed (${failures.length}/${assertions}):\n${failures.map(message => `- ${message}`).join('\n')}`);
console.log(`Ceiling visibility checks passed (${assertions} assertions).`);
