import * as THREE from 'three';
import type { CeilingStyle, SceneDocument } from '../contracts';
import { defaultCeilingDesign, layoutCeilingDesign } from '../core/ceiling-design';
import { demoScene } from '../core/demo';
import { emptyProject } from '../core/renovation';
import { disposeObject } from './assets';
import { makeCeilingDesigns } from './ceiling-design';
import { InteriorDaylight } from './interior-daylight';

let assertions = 0;
function assert(value: unknown, message: string): asserts value { assertions++; if (!value) throw new Error(`Ceiling shadow budget: ${message}`); }
function lightList(root: THREE.Object3D): THREE.Light[] {
  const result: THREE.Light[] = []; root.traverse(object => { if (object instanceof THREE.Light) result.push(object); }); return result;
}
function spots(root: THREE.Object3D): THREE.SpotLight[] { return lightList(root).filter((light): light is THREE.SpotLight => light instanceof THREE.SpotLight); }
function designed(styles: CeilingStyle[]): SceneDocument {
  return {
    format: 'varpet.editor', version: 2, id: 'ceiling-budget', name: 'Ceiling budget', units: 'm', upAxis: 'Y', objects: [], walls: [],
    rooms: styles.map((_, index) => ({ id: `room-${index}`, name: `Room ${index}`, color: '#eeeeee', polygon: [[index * 7, 0], [index * 7 + 6, 0], [index * 7 + 6, 5], [index * 7, 5]] })),
    project: { ...emptyProject(), metadata: Object.fromEntries(styles.map((style, index) => [`room-${index}`, { ceilingHeight: 3, ceilingDesign: defaultCeilingDesign(style) }])) },
  };
}
// Current finish materials have four samplers (both sides of a paint transition).
// PBR additionally uses an environment map and Three r186's DFG lookup texture.
// Area lights use two shared LTC lookup textures. This is not a budget guarantee
// for arbitrary imported physical materials with additional texture extensions.
function currentFinishSamplers(root: THREE.Object3D, windowShadows: number): number {
  return spots(root).filter(light => light.castShadow).length + windowShadows + 1 + 4 + 1 + 1
    + (lightList(root).some(light => light instanceof THREE.RectAreaLight) ? 2 : 0);
}

const demo = structuredClone(demoScene); demo.version = 2; demo.project ??= emptyProject();
demo.project.metadata['room-living'] = { ...demo.project.metadata['room-living'], ceilingDesign: defaultCeilingDesign('quiet') };
const before = JSON.stringify(demo), daylight = new InteriorDaylight(); daylight.setScene(demo);
const windows = spots(daylight.group).filter(light => light.castShadow).length;
assert(windows === 4, 'Regression includes the four actual window daylight shadow sources');
const quiet = makeCeilingDesigns(demo, 'room-living');
assert(currentFinishSamplers(quiet, windows) <= 16, 'Quiet ceiling plus window daylight compiles within sixteen fragment samplers');
assert(spots(quiet).length === 6 && spots(quiet).every(light => light.intensity > 0), 'All six Quiet fixtures still illuminate the living room');
assert(spots(quiet).filter(light => light.castShadow).length === 3, 'Quiet ceiling spends at most three shadow maps');
assert(JSON.stringify(demo) === before, 'Budgeting does not modify the project');
disposeObject(quiet); daylight.dispose();

const many = designed(['quiet', 'quiet', 'quiet']);
const original = JSON.stringify(many), group = makeCeilingDesigns(many, 'room-2');
assert(lightList(group).length === 8 && lightList(group).every(light => light.intensity > 0), 'Shadow budgeting retains the full eight-light illumination budget');
const shadows = spots(group).filter(light => light.castShadow);
assert(shadows.length === 3 && shadows.every(light => light.name.endsWith('room-2')), 'The occupied room receives shadow maps before other rooms');
const occupied = group.children.find(child => child.userData.entityId === 'room-2')!;
const occupiedSpots = spots(occupied), shadowedPositions = occupiedSpots.filter(light => light.castShadow).map(light => light.parent!.position.toArray());
const allPositions = occupiedSpots.map(light => light.parent!.position.toArray());
assert(Math.min(...shadowedPositions.map(position => position[0]!)) === Math.min(...allPositions.map(position => position[0]!))
  && Math.max(...shadowedPositions.map(position => position[0]!)) === Math.max(...allPositions.map(position => position[0]!))
  && Math.min(...shadowedPositions.map(position => position[2]!)) === Math.min(...allPositions.map(position => position[2]!))
  && Math.max(...shadowedPositions.map(position => position[2]!)) === Math.max(...allPositions.map(position => position[2]!)), 'Chosen shadow fixtures span both room axes');
const repeat = makeCeilingDesigns(many, 'room-2');
assert(JSON.stringify(spots(repeat).filter(light => light.castShadow).map(light => light.parent!.position.toArray())) === JSON.stringify(shadowedPositions), 'Identical settings choose the same shadow fixtures');
disposeObject(repeat);
for (const room of many.rooms) {
  const projected = group.children.find(child => child.userData.entityId === room.id)!;
  assert(projected.children.length === layoutCeilingDesign(many, room)!.elements.length, `${room.id} keeps all fixture geometry`);
  const emitters = new Set<THREE.MeshStandardMaterial>();
  projected.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial && material.userData.ceilingEmitter) emitters.add(material);
    }
  });
  assert(emitters.size === 6 && [...emitters].every(material => material.emissiveIntensity > 0), `${room.id} keeps all glowing fixture lenses`);
}
assert(JSON.stringify(many) === original, 'Active-room prioritization leaves project data unchanged');
disposeObject(group);

for (const styles of [['quiet', 'soft-glow'], ['quiet', 'architectural'], ['soft-glow', 'quiet']] as CeilingStyle[][]) {
  const scene = designed(styles), mixed = makeCeilingDesigns(scene, 'room-0');
  assert(lightList(mixed).length === 8, `${styles.join('/')} keeps its eight active sources`);
  assert(lightList(mixed).some(light => light instanceof THREE.RectAreaLight), `${styles.join('/')} includes area-light lookup samplers`);
  assert(currentFinishSamplers(mixed, 4) <= 16, `${styles.join('/')} fits the full current-finish sampler budget`);
  assert(spots(mixed).filter(light => light.castShadow).length <= 3, `${styles.join('/')} limits ceiling shadow maps`);
  disposeObject(mixed);
}
console.log(`Ceiling shadow budget checks passed (${assertions} assertions).`);
