import * as THREE from 'three';
import type { CeilingStyle, SceneDocument } from '../contracts';
import { layoutCeilingDesign } from '../core/ceiling-design';
import { disposeObject } from './assets';
import { makeCeilingDesigns } from './ceiling-design';

let assertions = 0;
function assert(value: unknown, message: string): asserts value { assertions++; if (!value) throw new Error(`Ceiling render: ${message}`); }
function source(style: CeilingStyle = 'quiet'): SceneDocument {
  return {
    format: 'varpet.editor', version: 1, id: 'ceiling-check', name: 'Ceiling check', units: 'm', upAxis: 'Y', walls: [], objects: [],
    rooms: [{ id: 'room', name: 'Living', color: '#eee', polygon: [[10, 20], [16, 20], [16, 25], [10, 25]] }],
    project: { mode: 'correct', currency: 'AMD', metadata: { room: { elevation: 0.6, ceilingHeight: 3.1, ceilingDesign: { style, drop: 0.18, inset: 0.5, brightness: 80, temperature: 2700, enabled: true } } }, components: [], routes: [], sources: [], assumptions: [], materials: [], finishes: [], tasks: [], options: [] },
  };
}
function lights(root: THREE.Object3D): THREE.Light[] {
  const result: THREE.Light[] = []; root.traverse(child => { if (child instanceof THREE.Light) result.push(child); }); return result;
}
function emitters(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const result = new Set<THREE.MeshStandardMaterial>();
  root.traverse(child => { if (child instanceof THREE.Mesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) if (material instanceof THREE.MeshStandardMaterial && material.userData.ceilingEmitter) result.add(material); });
  return [...result];
}
for (const style of ['quiet', 'soft-glow', 'architectural'] as const) {
  const scene = source(style), original = JSON.stringify(scene), layout = layoutCeilingDesign(scene, scene.rooms[0]!)!;
  const projection = makeCeilingDesigns(scene);
  assert(projection.children.length === 1, `${style} creates a room projection`);
  const room = projection.children[0]!;
  assert(room.userData.entityId === 'room', `${style} geometry selects its room`);
  assert(room.userData.ceilingDesign === true, `${style} identifies the design independently of the shell`);
  const elements = room.children.filter(child => child.userData.ceilingElement);
  assert(elements.length === layout.elements.length, `${style} projects every layout element exactly once`);
  for (const [index, element] of layout.elements.entries()) {
    const object = elements[index]!;
    assert(object.userData.ceilingElement === element.kind && object.position.distanceTo(new THREE.Vector3(...element.position)) < 1e-7 && Math.abs(object.rotation.y - element.rotation) < 1e-7, `${style} element ${index} follows its authored placement`);
    const bounds = new THREE.Box3().setFromObject(object);
    assert(!bounds.isEmpty() && bounds.min.y >= element.position[1] - 1e-5 && bounds.max.y <= element.position[1] + element.dimensions[1] + 1e-5, `${style} element ${index} respects its vertical volume`);
    assert(bounds.min.x >= 10 - 1e-5 && bounds.max.x <= 16 + 1e-5 && bounds.min.z >= 20 - 1e-5 && bounds.max.z <= 25 + 1e-5, `${style} element ${index} stays in the off-origin room`);
    assert(bounds.max.y <= layout.ceilingY + 1e-5, `${style} element ${index} stays below the structural ceiling`);
  }
  assert(lights(projection).length > 0 && lights(projection).every(light => light.intensity > 0), `${style} illuminates real room surfaces`);
  assert(emitters(projection).length > 0 && emitters(projection).every(material => material.emissiveIntensity > 0), `${style} has visible emitting diffusers`);
  if (style === 'quiet') {
    projection.updateMatrixWorld(true);
    const spot = elements[0]!, origin = spot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -1, 0));
    const hits = new THREE.Raycaster(origin, new THREE.Vector3(0, 1, 0)).intersectObject(spot, true);
    const material = (hits[0]?.object as THREE.Mesh | undefined)?.material;
    assert(material && !Array.isArray(material) && material.userData.ceilingEmitter, 'recessed lens is visible through the housing from inside the room');
  }
  if (style === 'soft-glow') {
    projection.updateMatrixWorld(true);
    const panel = elements.find(object => object.userData.ceilingElement === 'panel')!;
    const specification = layout.elements.find(element => element.kind === 'panel')!;
    for (const [x, z] of [[specification.dimensions[0] / 2 - .01, 0], [-specification.dimensions[0] / 2 + .01, 0], [0, specification.dimensions[2] / 2 - .01], [0, -specification.dimensions[2] / 2 + .01]]) {
      const origin = panel.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(x, -1, z));
      const hits = new THREE.Raycaster(origin, new THREE.Vector3(0, 1, 0)).intersectObject(panel, true);
      const material = (hits[0]?.object as THREE.Mesh | undefined)?.material;
      assert(material && !Array.isArray(material) && material.userData.ceilingEmitter, 'floating panel has a real luminous reveal readable from below on every edge');
    }
    assert(lights(projection).some(light => light.userData.indirectApproximation && light instanceof THREE.RectAreaLight && light.rotation.x < 0), 'soft glow supplies bounded diffuse room fill in addition to its upward cove wash');
    assert(lights(projection).filter(light => light instanceof THREE.RectAreaLight && light.rotation.x > 0).length === 4, 'soft glow retains all four physical upward cove sources');
  }
  projection.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    assert([...child.geometry.getAttribute('position').array].every(Number.isFinite), `${style} geometry is finite`);
  });
  assert(JSON.stringify(scene) === original, `${style} projection leaves scene data unchanged`);
  disposeObject(projection);
}

const off = source(); off.project!.metadata.room!.ceilingDesign!.enabled = false;
const offGroup = makeCeilingDesigns(off);
assert(offGroup.children.length === 1 && lights(offGroup).every(light => light.intensity === 0), 'switching off preserves fixtures and stops physical lights');
assert(emitters(offGroup).length > 0 && emitters(offGroup).every(material => material.emissiveIntensity === 0), 'switching off stops all visible emission');
disposeObject(offGroup);
const black = source(); black.project!.metadata.room!.ceilingDesign!.brightness = 0;
const blackGroup = makeCeilingDesigns(black);
assert(lights(blackGroup).every(light => light.intensity === 0) && emitters(blackGroup).every(material => material.emissiveIntensity === 0), 'zero dimmer stops physical and visible light');
disposeObject(blackGroup);
const glowOff = source('soft-glow'); glowOff.project!.metadata.room!.ceilingDesign!.enabled = false;
const glowOffGroup = makeCeilingDesigns(glowOff);
assert(lights(glowOffGroup).every(light => light.intensity === 0) && emitters(glowOffGroup).every(material => material.emissiveIntensity === 0), 'soft glow off stops reveals, cove sources, and approximate bounce');
disposeObject(glowOffGroup);

const full = source(), dim = source(), cool = source();
full.project!.metadata.room!.ceilingDesign!.brightness = 100; dim.project!.metadata.room!.ceilingDesign!.brightness = 25; cool.project!.metadata.room!.ceilingDesign!.temperature = 6500;
const fullGroup = makeCeilingDesigns(full), dimGroup = makeCeilingDesigns(dim), coolGroup = makeCeilingDesigns(cool);
assert(Math.abs(lights(dimGroup)[0]!.intensity / lights(fullGroup)[0]!.intensity - 0.25) < 1e-7, 'dimming scales actual source intensity');
assert(Math.abs(emitters(dimGroup)[0]!.emissiveIntensity / emitters(fullGroup)[0]!.emissiveIntensity - 0.25) < 1e-7, 'dimming scales visible emission');
assert(lights(coolGroup)[0]!.color.b / lights(coolGroup)[0]!.color.r > lights(fullGroup)[0]!.color.b / lights(fullGroup)[0]!.color.r, 'temperature changes actual lighting warmth');
assert(emitters(coolGroup)[0]!.emissive.b > emitters(fullGroup)[0]!.emissive.b, 'temperature changes diffuser emission');
for (const group of [fullGroup, dimGroup, coolGroup]) disposeObject(group);

const legacy = source(); delete legacy.project!.metadata.room!.ceilingDesign;
assert(makeCeilingDesigns(legacy).children.length === 0, 'legacy rooms acquire no unrequested ceiling design');
for (const patch of [{ zone: 'balcony' as const }, { phase: 'remove' as const }]) {
  const scene = source(); Object.assign(scene.project!.metadata.room!, patch);
  assert(makeCeilingDesigns(scene).children.length === 0, 'outdoor and removed rooms acquire no fixtures');
}

const many = source();
for (let index = 1; index < 12; index++) {
  const id = `room-${index}`; many.rooms.push({ ...many.rooms[0]!, id, polygon: many.rooms[0]!.polygon.map(([x, z]) => [x + index * 7, z]) });
  many.project!.metadata[id] = structuredClone(many.project!.metadata.room!);
}
const budgetGroup = makeCeilingDesigns(many, 'room-11');
assert(budgetGroup.children.length === 12, 'light budgeting never removes room geometry');
assert(lights(budgetGroup).length <= 8, 'physical source count is bounded across the apartment');
const selectedRoom = budgetGroup.children.find(child => child.userData.entityId === 'room-11')!;
assert(lights(selectedRoom).length > 0, 'the selected room receives physical lights despite the global budget');
const disabledFirst = structuredClone(many); disabledFirst.project!.metadata.room!.ceilingDesign!.enabled = false;
const disabledBudget = makeCeilingDesigns(disabledFirst);
assert(lights(disabledBudget).filter(light => light.intensity > 0).length === 8, 'disabled fixtures do not consume the active light budget');
disposeObject(disabledBudget);

const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(); let disposedGeometry = 0, disposedMaterial = 0, disposedShadow = 0, shadowMaps = 0;
budgetGroup.traverse(child => {
  if (child instanceof THREE.Mesh) { geometries.add(child.geometry); for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material); }
  if (child instanceof THREE.SpotLight && child.castShadow) { shadowMaps++; child.shadow.map = new THREE.WebGLRenderTarget(2, 2); child.shadow.map.addEventListener('dispose', () => disposedShadow++); }
});
for (const geometry of geometries) geometry.addEventListener('dispose', () => disposedGeometry++);
for (const material of materials) material.addEventListener('dispose', () => disposedMaterial++);
const world = new THREE.Group(); world.add(budgetGroup); disposeObject(budgetGroup);
assert(disposedGeometry === geometries.size && disposedMaterial === materials.size, 'standard object disposal frees every geometry and material');
assert(disposedShadow === shadowMaps, 'standard object disposal frees ceiling shadow resources');
assert(world.children.length === 0, 'standard object disposal removes the design from the scene');
console.log(`Ceiling rendering checks passed (${assertions} assertions).`);
