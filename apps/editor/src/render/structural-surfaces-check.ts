import * as THREE from 'three';
import type { Room, SceneDocument, Vec2, Wall } from '../contracts';
import { disposeObject } from './assets';
import { makeStructure, type StructureProjection } from './structure';
import { StudioStage } from './studio-stage';

let assertions = 0;
const failures: string[] = [];
function assert(value: unknown, message: string): void {
  assertions++;
  if (!value) failures.push(message);
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const sameColor = (a: THREE.Color, b: THREE.Color) => near(a.r, b.r) && near(a.g, b.g) && near(a.b, b.b);
const neutral = (color: THREE.Color) => Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) < 0.035;
// Text annotations need a canvas; no WebGL context is needed for material and picking checks.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
} });

function materialColor(material: THREE.Material): THREE.Color {
  if (!(material instanceof THREE.MeshStandardMaterial)) throw new Error('Expected a physical surface material');
  const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '', fragmentShader: '' };
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
  const finish = shader.uniforms.uFinishBase?.value;
  return (finish instanceof THREE.Color ? finish : material.color).clone();
}
function sample(root: THREE.Object3D, origin: THREE.Vector3, direction: THREE.Vector3) {
  root.updateWorldMatrix(true, true);
  const hit = new THREE.Raycaster(origin, direction).intersectObject(root, true)[0];
  if (!hit?.face || !(hit.object instanceof THREE.Mesh)) throw new Error(`Surface probe missed at ${origin.toArray()}`);
  const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
  if (!material) throw new Error('Surface probe found no material');
  return { color: materialColor(material), surface: hit.object.userData.finishSurface ?? hit.object.userData.finishSurfaces?.[hit.face.materialIndex] };
}
function wallSample(shell: StructureProjection, wall: Wall, t: number, side: 1 | -1, low = false) {
  const tangent = new THREE.Vector3(wall.end[0] - wall.start[0], 0, wall.end[1] - wall.start[1]).normalize();
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(side);
  const midpoint = new THREE.Vector3(wall.start[0] + (wall.end[0] - wall.start[0]) * t, low ? 0.2 : 1.3, wall.start[1] + (wall.end[1] - wall.start[1]) * t);
  const projection = shell.entities.get(wall.id)?.children[low ? 1 : 0];
  if (!projection) throw new Error('Missing wall projection');
  return sample(projection, midpoint.addScaledVector(normal, 0.5), normal.negate());
}
function documentFor(polygon: Vec2[], start: Vec2, end: Vec2, assigned = false): SceneDocument {
  const room: Room = { id: 'room', name: 'Living room', color: assigned ? '#117a91' : '#cb8655', polygon };
  const wall: Wall = { id: 'wall', start, end, height: 2.7, thickness: 0.2, color: assigned ? '#4c82c9' : '#bc425c', openings: [] };
  return {
    format: 'varpet.editor', version: 2, id: 'structural-surfaces', name: 'Structural surfaces', units: 'm', upAxis: 'Y', rooms: [room], walls: [wall], objects: [],
    ...(assigned ? { project: {
      mode: 'correct' as const, currency: 'USD', metadata: {}, components: [], routes: [], sources: [], assumptions: [], tasks: [], options: [],
      materials: [{ id: 'finish', name: 'Strong green', color: '#23a155', unit: 'm2' as const, unitCost: 1, thickness: 0.01, wastePercent: 0 }],
      finishes: [
        { id: 'floor-finish', entityId: 'room', surface: 'floor' as const, materialId: 'finish' },
        { id: 'front-finish', entityId: 'wall', surface: 'wall-front' as const, materialId: 'finish' },
        { id: 'back-finish', entityId: 'wall', surface: 'wall-back' as const, materialId: 'finish' },
      ],
    } } : {}),
  };
}
function dispose(shell: StructureProjection): void {
  disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
}
const rectangle: Vec2[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
const scenarios: { name: string; polygon: Vec2[]; start: Vec2; end: Vec2; probes: { t: number; front: boolean; back: boolean }[] }[] = [
  { name: 'perimeter', polygon: rectangle, start: [0, 0], end: [4, 0], probes: [{ t: 0.5, front: true, back: false }] },
  { name: 'reversed perimeter', polygon: rectangle, start: [4, 0], end: [0, 0], probes: [{ t: 0.5, front: false, back: true }] },
  { name: 'diagonal perimeter', polygon: [[0, 0], [4, 4], [0, 4]], start: [0, 0], end: [4, 4], probes: [{ t: 0.5, front: true, back: false }] },
  { name: 'partition', polygon: rectangle, start: [2, 0], end: [2, 4], probes: [{ t: 0.5, front: true, back: true }] },
  { name: 'concave room boundary', polygon: [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]], start: [0, 1], end: [4, 1], probes: [
    { t: 0.125, front: true, back: true }, { t: 0.75, front: false, back: true },
  ] },
];
let exteriorColor: THREE.Color | undefined;
for (const scenario of scenarios) {
  const original = documentFor(scenario.polygon, scenario.start, scenario.end);
  const assigned = documentFor(scenario.polygon, scenario.start, scenario.end, true);
  const saved = JSON.stringify([original, assigned]);
  const shells = [makeStructure(original), makeStructure(assigned)];
  for (const low of [false, true]) {
    for (const probe of scenario.probes) {
      for (const side of [1, -1] as const) {
        const inside = side === 1 ? probe.front : probe.back;
        const surface = side === 1 ? 'wall-front' : 'wall-back';
        const label = `${scenario.name} ${low ? 'cutaway' : 'full'} ${surface} at ${probe.t}`;
        const base = wallSample(shells[0]!, original.walls[0]!, probe.t, side, low);
        const finished = wallSample(shells[1]!, assigned.walls[0]!, probe.t, side, low);
        if (inside) {
          assert(base.surface === surface && finished.surface === surface, `${label}: room-facing surface remains paintable`);
          assert(sameColor(base.color, new THREE.Color(original.walls[0]!.color)), `${label}: room-facing surface preserves wall color`);
          assert(sameColor(finished.color, new THREE.Color('#23a155')), `${label}: room-facing surface uses its assigned finish`);
        } else {
          assert(base.surface === undefined && finished.surface === undefined, `${label}: exterior face has no paint target`);
          assert(neutral(base.color), `${label}: exterior uses a neutral color`);
          assert(sameColor(base.color, finished.color), `${label}: exterior ignores wall colors and finish assignments`);
          if (exteriorColor) assert(sameColor(base.color, exteriorColor), `${label}: exterior color is consistent across walls`);
          exteriorColor = base.color;
        }
      }
    }
    for (const [index, shell] of shells.entries()) {
      const entity = shell.entities.get('wall')!.children[low ? 1 : 0]!;
      const source = index === 0 ? original : assigned;
      const midpoint = new THREE.Vector3((source.walls[0]!.start[0] + source.walls[0]!.end[0]) / 2, 3, (source.walls[0]!.start[1] + source.walls[0]!.end[1]) / 2);
      const cap = sample(entity, midpoint, new THREE.Vector3(0, -1, 0));
      assert(neutral(cap.color), `${scenario.name}: ${low ? 'cutaway' : 'full'} wall cap stays neutral after finish ${index}`);
      assert(cap.surface === undefined, `${scenario.name}: wall cap has no paint target`);
      if (index === 1) {
        const originalCap = sample(shells[0]!.entities.get('wall')!.children[low ? 1 : 0]!, midpoint, new THREE.Vector3(0, -1, 0));
        assert(sameColor(cap.color, originalCap.color), `${scenario.name}: wall cap ignores interior finish changes`);
      }
    }
  }
  assert(JSON.stringify([original, assigned]) === saved, `${scenario.name}: projection does not change authored scene data`);
  shells.forEach(dispose);
}

for (const wallElevation of [0, 4]) {
  const source = documentFor(rectangle, [0, 0], [4, 0], true);
  source.project!.metadata = { room: { elevation: 4 }, wall: { elevation: wallElevation } };
  const shell = makeStructure(source);
  for (const low of [false, true]) {
    const front = sample(shell.entities.get('wall')!.children[low ? 1 : 0]!,
      new THREE.Vector3(2, wallElevation + (low ? 0.2 : 1.3), 0.5), new THREE.Vector3(0, 0, -1));
    const label = `${low ? 'cutaway' : 'full'} wall elevation ${wallElevation}, room elevation 4`;
    if (wallElevation === 4) {
      assert(front.surface === 'wall-front', `${label}: same-level room-facing wall remains paintable`);
      assert(sameColor(front.color, new THREE.Color('#23a155')), `${label}: same-level interior uses its assigned finish`);
    } else {
      assert(front.surface === undefined, `${label}: upstairs footprint does not make the downstairs wall paintable`);
      assert(neutral(front.color), `${label}: downstairs exterior ignores the upstairs room and finish assignment`);
      assert(exteriorColor !== undefined && sameColor(front.color, exteriorColor), `${label}: downstairs exterior uses the fixed structural color`);
    }
  }
  dispose(shell);
}

const floors = [documentFor(rectangle, [0, 0], [4, 0]), documentFor(rectangle, [0, 0], [4, 0], true)].map(make => makeStructure(make));
const floorProbes = [
  { name: 'top', origin: new THREE.Vector3(2, 1, 2), direction: new THREE.Vector3(0, -1, 0), paintable: true },
  { name: 'underside', origin: new THREE.Vector3(2, -1, 2), direction: new THREE.Vector3(0, 1, 0), paintable: false },
  { name: 'edge', origin: new THREE.Vector3(2, -0.07, -1), direction: new THREE.Vector3(0, 0, 1), paintable: false },
];
for (const probe of floorProbes) {
  const [base, finished] = floors.map(shell => sample(shell.entities.get('room')!, probe.origin, probe.direction));
  assert(base!.surface === (probe.paintable ? 'floor' : undefined) && finished!.surface === (probe.paintable ? 'floor' : undefined), `floor ${probe.name}: only the upward face is a paint target`);
  if (probe.paintable) {
    assert(sameColor(base!.color, new THREE.Color('#cb8655')) && sameColor(finished!.color, new THREE.Color('#23a155')), 'finished floor preserves its chosen color');
  } else {
    assert(neutral(base!.color), `floor ${probe.name}: slab is neutral`);
    assert(sameColor(base!.color, finished!.color), `floor ${probe.name}: slab ignores floor finishes`);
  }
}
const stage = new StudioStage(); stage.update(floors[0]!.bounds);
const cap = stage.group.children.find(object => object instanceof THREE.Mesh && near(new THREE.Box3().setFromObject(object).max.y, floors[0]!.bounds.min.y - 0.14));
if (!(cap instanceof THREE.Mesh)) throw new Error('No stage cap found at the floor slab underside');
const capMaterial = Array.isArray(cap.material) ? cap.material[0] : cap.material;
const capColor = materialColor(capMaterial!);
assert(neutral(capColor), 'stage border has a fixed neutral gray color');
assert(!sameColor(capColor, new THREE.Color('#cb8655')) && !sameColor(capColor, new THREE.Color('#bc425c')), 'stage border is distinct from the interior floor and wall finishes');
stage.update(floors[1]!.bounds);
assert(sameColor(materialColor(capMaterial!), capColor), 'stage border keeps its color when room finishes change');
stage.dispose(); floors.forEach(dispose);

if (failures.length) throw new Error(`Structural surface checks failed (${failures.length}/${assertions}):\n${failures.map(message => `- ${message}`).join('\n')}`);
console.log(`Structural surface checks passed (${assertions} assertions).`);
