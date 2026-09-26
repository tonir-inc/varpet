import type { CatalogAsset, Room, SceneDocument, SceneObject, Vec2, Wall } from '../contracts';
import { placementConflicts, type PlacementConflict } from './placement-conflicts';
import { placementIssues } from './validation';
import './door-barriers-check';

let assertions = 0;
function assert(condition: unknown, description: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(`Placement conflict check failed: ${description}`);
}
function near(actual: number, expected: number, description: string): void {
  assert(Math.abs(actual - expected) < 1e-8, `${description}: expected ${expected}, got ${actual}`);
}
const asset: CatalogAsset = { id: 'unit', name: 'Unit', kind: 'cabinet', category: 'Storage', dimensions: [1, 1, 1],
  color: '#aaaaaa', price: 1, source: { type: 'procedural' } };
const rug: CatalogAsset = { ...asset, id: 'rug', kind: 'rug' };
const catalog = [asset, rug];
const object: SceneObject = { id: 'moving', assetId: asset.id, name: 'Moving', position: [1, 0, 1], rotation: 0, scale: [1, 1, 1] };
const rectangle = (id: string, x1: number, z1: number, x2: number, z2: number): Room =>
  ({ id, name: id, color: '#aaaaaa', polygon: [[x1, z1], [x2, z1], [x2, z2], [x1, z2]] });
const scene = (rooms: Room[] = [rectangle('room', 0, 0, 2, 2)]): SceneDocument =>
  ({ format: 'varpet.editor', version: 1, id: 'probe', name: 'Probe', units: 'm', upAxis: 'Y', rooms, walls: [], objects: [object] });
const area = (polygon: Vec2[]) => Math.abs(polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length]!;
  return sum + point[0] * next[1] - point[1] * next[0];
}, 0)) / 2;
const totalArea = (conflicts: PlacementConflict[]) => conflicts.reduce((sum, conflict) => sum + area(conflict.polygon), 0);
const conflictsOf = (document: SceneDocument, candidate: SceneObject, kind: PlacementConflict['kind']) =>
  placementConflicts(document, catalog, candidate).filter(conflict => conflict.kind === kind);

assert(placementConflicts(scene(), catalog, object).length === 0, 'valid furniture has no red area');
let candidate: SceneObject = { ...object, position: [1.75, 0, 1] };
let conflicts = conflictsOf(scene(), candidate, 'support');
near(totalArea(conflicts), 0.25, 'only the overhanging strip is unsupported');
assert(conflicts.every(conflict => conflict.bottom === 0 && conflict.top === 0), 'floor feedback is flat at the candidate elevation');
assert(conflicts.every(conflict => conflict.polygon.every(([x]) => x >= 2 - 1e-8)), 'unsupported polygons do not color the supported floor');
near(totalArea(conflictsOf(scene(), { ...object, position: [3, 0, 1] }, 'support')), 1, 'fully outside footprint is all unsupported');

candidate = { ...object, scale: [2, 1, 2] };
assert(conflictsOf(scene([rectangle('left', 0, 0, 1, 2), rectangle('right', 1, 0, 2, 2)]), candidate, 'support').length === 0,
  'adjacent rooms jointly support a footprint across the seam');
assert(conflictsOf(scene([rectangle('left', 0, 0, 1.2, 2), rectangle('right', 0.8, 0, 2, 2)]), candidate, 'support').length === 0,
  'overlapping floors form one supported union');
near(totalArea(conflictsOf(scene([rectangle('left', 0, 0, 0.9, 2), rectangle('right', 1.1, 0, 2, 2)]), candidate, 'support')), 0.4,
  'a narrow gap between rooms is highlighted without the surrounding floor');
const concave: Room = { id: 'concave', name: 'L', color: '#aaaaaa', polygon: [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]] };
near(totalArea(conflictsOf(scene([concave]), candidate, 'support')), 1, 'concave room notch remains unsupported');
const angle = 0.47;
const rotate = ([x, z]: Vec2): Vec2 => [Math.cos(angle) * x + Math.sin(angle) * z, -Math.sin(angle) * x + Math.cos(angle) * z];
const rotatedPosition = rotate([1, 1]);
near(totalArea(conflictsOf(scene([{ ...concave, polygon: concave.polygon.map(rotate) }]),
  { ...candidate, rotation: angle, position: [rotatedPosition[0], 0, rotatedPosition[1]] }, 'support')), 1,
  'rotating the room and footprint preserves the exact unsupported notch');
near(totalArea(conflictsOf(scene([rectangle('floor', -2, -2, 2, 2)]),
  { ...object, position: [2, 0, 0], rotation: Math.PI / 4 }, 'support')), 0.5, 'rotated footprint clips exactly at a floor edge');

const wall: Wall = { id: 'wall', start: [0, -2], end: [0, 2], height: 3, thickness: 0.2, color: '#aaaaaa', openings: [] };
const wallScene = scene([rectangle('floor', -3, -3, 3, 3)]); wallScene.walls = [wall];
candidate = { ...object, position: [0, 0, 0] };
conflicts = conflictsOf(wallScene, candidate, 'wall');
near(totalArea(conflicts), 0.2, 'wall feedback is only the intersecting wall strip');
assert(conflicts.length === 1 && conflicts[0]!.entityId === 'wall' && conflicts[0]!.bottom === 0 && conflicts[0]!.top === 1,
  'wall conflict retains its obstacle and intersecting height');
assert(conflictsOf(wallScene, { ...candidate, position: [0.6, 0, 0] }, 'wall').length === 0, 'touching wall face is allowed');
const doorway = structuredClone(wallScene);
doorway.walls[0]!.openings = [{ id: 'door', kind: 'door', offset: 1.5, width: 1, height: 2.1, sill: 0 }];
assert(conflictsOf(doorway, candidate, 'wall').length === 0, 'furniture fits exactly inside a sufficiently tall doorway');
near(totalArea(conflictsOf(doorway, { ...candidate, position: [0, 0, 0.25] }, 'wall')), 0.05,
  'doorway feedback only marks the side penetrating the solid jamb');
assert(conflictsOf(doorway, { ...candidate, scale: [1, 2.5, 1] }, 'wall').length > 0, 'low lintel still blocks tall furniture');
const tallDoorConflicts = conflictsOf(doorway, { ...candidate, scale: [1, 2.5, 1] }, 'wall');
assert(tallDoorConflicts.length === 1, 'a tall object fitting the door width only intersects its lintel');
near(tallDoorConflicts[0]!.bottom, 2.1, 'lintel feedback starts at the door opening top');
near(tallDoorConflicts[0]!.top, 2.5, 'lintel feedback stops at the object top');
const raisedDoorway = structuredClone(doorway);
raisedDoorway.version = 2;
raisedDoorway.project = { mode: 'correct', currency: 'USD', metadata: {}, components: [], routes: [], sources: [], assumptions: [], materials: [], finishes: [], options: [], tasks: [] };
raisedDoorway.walls[0]!.openings[0]!.sill = 0.3;
raisedDoorway.walls[0]!.openings[0]!.height = 1.8;
const sillConflicts = conflictsOf(raisedDoorway, candidate, 'wall');
assert(sillConflicts.length === 1, 'an object crossing a raised threshold only intersects its sill');
near(sillConflicts[0]!.bottom, 0, 'sill feedback starts at the wall base');
near(sillConflicts[0]!.top, 0.3, 'sill feedback stops below the empty doorway');
const bothDoorConflicts = conflictsOf(raisedDoorway, { ...candidate, scale: [1, 2.5, 1] }, 'wall');
assert(bothDoorConflicts.length === 2, 'an object taller than a raised door intersects two separate solid regions');
assert(bothDoorConflicts.every(conflict => conflict.top <= 0.3 || conflict.bottom >= 2.1), 'empty space between sill and lintel is never marked');
raisedDoorway.project.metadata.wall = { elevation: 0.5 };
const elevatedDoorConflicts = conflictsOf(raisedDoorway, { ...candidate, position: [0, 0.6, 0], scale: [1, 2.5, 1] }, 'wall');
assert(elevatedDoorConflicts.length === 2, 'elevated door retains separate sill and lintel feedback');
near(elevatedDoorConflicts[0]!.bottom, 0.6, 'elevated sill feedback respects the object bottom');
near(elevatedDoorConflicts[0]!.top, 0.8, 'elevated sill feedback includes the wall elevation');
near(elevatedDoorConflicts[1]!.bottom, 2.6, 'elevated lintel feedback includes wall elevation');
near(elevatedDoorConflicts[1]!.top, 3.1, 'elevated lintel feedback respects the object top');
doorway.walls[0]!.openings[0]!.kind = 'window';
near(totalArea(conflictsOf(doorway, candidate, 'wall')), 0.2, 'windows retain the existing furniture barrier rule');

const overlapping = scene([rectangle('floor', -3, -3, 3, 3)]);
overlapping.objects = [{ ...candidate, id: 'other', position: [0.75, 0.5, 0] }, candidate];
conflicts = conflictsOf(overlapping, candidate, 'overlap');
near(totalArea(conflicts), 0.25, 'only actual furniture overlap is marked when the moving object comes second');
assert(conflicts[0]?.bottom === 0.5 && conflicts[0]?.top === 1, 'overlap height is the vertical intersection');
overlapping.objects[0]!.position = [0, 1, 0];
assert(conflictsOf(overlapping, candidate, 'overlap').length === 0, 'vertical contact is not overlap');
overlapping.objects[0]!.position = [0, 0, 0]; overlapping.objects[0]!.rotation = Math.PI / 4;
near(totalArea(conflictsOf(overlapping, candidate, 'overlap')), 2 * Math.sqrt(2) - 2, 'rotated footprints use polygon intersection rather than bounding boxes');
overlapping.objects[0]!.assetId = 'rug';
assert(conflictsOf(overlapping, candidate, 'overlap').length === 0, 'rugs do not conflict with furniture on them');
assert(conflictsOf(overlapping, { ...candidate, assetId: 'rug' }, 'overlap').length === 0, 'moving rugs also ignore object overlap');
overlapping.objects = Array.from({ length: 12 }, (_, index) => ({ ...candidate, id: `other-${index}` }));
assert(conflictsOf(overlapping, candidate, 'overlap').length === 12, 'live feedback is not truncated by the persistent issue list limit');

const v2 = structuredClone(wallScene);
v2.version = 2;
v2.project = { mode: 'correct', currency: 'USD', metadata: {}, components: [], routes: [], sources: [], assumptions: [], materials: [], finishes: [], options: [], tasks: [] };
v2.project.metadata.wall = { elevation: 0.5 };
conflicts = conflictsOf(v2, candidate, 'wall');
assert(conflicts[0]?.bottom === 0.5 && conflicts[0]?.top === 1, 'wall elevation clips the conflict height');
v2.project.metadata.wall = { phase: 'remove' };
assert(conflictsOf(v2, candidate, 'wall').length === 0, 'removed walls are ignored');
v2.project.metadata.floor = { elevation: 1 };
near(totalArea(conflictsOf(v2, candidate, 'support')), 1, 'a floor at a different elevation does not support the footprint');
assert(conflictsOf(v2, { ...candidate, position: [0, 1, 0] }, 'support').length === 0, 'matching raised floor supports the candidate');
v2.project.metadata.floor = { phase: 'remove' };
near(totalArea(conflictsOf(v2, candidate, 'support')), 1, 'removed floors do not support furniture');
v2.objects = [{ ...candidate, id: 'removed' }]; v2.project.metadata.removed = { phase: 'remove' };
assert(conflictsOf(v2, candidate, 'overlap').length === 0, 'removed furniture is ignored');
v2.project.metadata.moving = { phase: 'remove' };
assert(placementConflicts(v2, catalog, candidate).length === 0, 'a removed candidate has no placement issues');

for (let step = 0; step < 100; step++) {
  const moving: SceneObject = { ...candidate, position: [Math.sin(step * 1.7) * 3, 0, Math.cos(step * 0.9) * 3],
    rotation: step * 0.13, scale: [0.5 + (step % 5) * 0.3, 1, 0.7 + (step % 7) * 0.2] };
  const document = scene([concave]); document.walls = [wall]; document.objects = [moving];
  const before = JSON.stringify([document, moving, catalog]);
  const issues = placementIssues(document, catalog), feedback = placementConflicts(document, catalog, moving);
  for (const kind of ['support', 'wall'] as const) assert(issues.some(issue => issue.kind === kind) === feedback.some(conflict => conflict.kind === kind),
    `live ${kind} conflicts agree with existing placement validation, case ${step}`);
  assert(JSON.stringify([document, moving, catalog]) === before, `feedback does not mutate inputs, case ${step}`);
}

// Installed doors and their opening travel are barriers even inside an otherwise empty aperture.
const doors = structuredClone(raisedDoorway);
doors.walls = [{ id: 'door-wall', start: [-2, 0], end: [2, 0], thickness: 0.2, height: 3, color: '#aaaaaa',
  openings: [{ id: 'entry', kind: 'door', offset: 2, width: 1, height: 2, sill: 0 }] }];
doors.project!.metadata = { entry: { mechanism: 'hinged', frameWidth: 0.05, leafThickness: 0.04 } };
const doorCandidate: SceneObject = { ...object, position: [0.5, 0, -0.06], scale: [0.2, 1, 0.1] };
const doorConflicts = (document: SceneDocument, probe: SceneObject) => placementConflicts(document, catalog, probe)
  .filter(conflict => conflict.entityId === 'entry');
assert(doorConflicts(doors, doorCandidate).length > 0, 'closed leaf thickness obstructs furniture on the opposite side of the swing');
const sweeping: SceneObject = { ...doorCandidate, position: [0.5, 0, 0.45], scale: [0.2, 1, 0.2] };
assert(doorConflicts(doors, sweeping).length > 0, 'opening and closing travel marks an obstacle away from the closed leaf');
assert(doorConflicts(doors, { ...sweeping, position: [0.8, 0, 0.8] }).length === 0, 'outside the curved swing stays clear despite overlapping its bounding box');
const partial: SceneObject = { ...doorCandidate, position: [0.5, 0, -0.05], scale: [0.2, 1, 0.2] };
const partialConflicts = doorConflicts(doors, partial);
assert(totalArea(partialConflicts) > 0 && totalArea(partialConflicts) < 0.04, 'only the portion intersecting the door barrier turns red');
assert(partialConflicts.every(conflict => conflict.polygon.every(([x, z]) => x >= 0.4 - 1e-8 && x <= 0.6 + 1e-8 && z >= -0.15 - 1e-8 && z <= 0.05 + 1e-8)),
  'door feedback is clipped to the candidate rather than painting the whole swing');
doors.project!.metadata.entry!.threshold = 0.1;
doors.project!.metadata['door-wall'] = { elevation: 0.5 };
const elevatedSwing = doorConflicts(doors, { ...sweeping, position: [0.5, 0.55, 0.45], scale: [0.2, 3, 0.2] });
near(elevatedSwing[0]!.bottom, 0.6, 'swing conflict starts above wall elevation and threshold');
near(elevatedSwing[0]!.top, 2.45, 'swing conflict ends below the head frame');
assert(doorConflicts(doors, { ...sweeping, scale: [0.2, 0.6, 0.2] }).length === 0, 'touching below a raised leaf has no swing conflict');
doors.project!.metadata.entry!.phase = 'remove';
assert(doorConflicts(doors, sweeping).length === 0, 'removed installed door leaves no door feedback');
delete doors.project!.metadata.entry!.phase;
doors.project!.metadata['door-wall'] = { phase: 'remove' };
assert(doorConflicts(doors, sweeping).length === 0, 'removed host leaves no door feedback');
doors.project!.metadata['door-wall'] = {};
doors.project!.metadata.entry = { mechanism: 'fixed', frameWidth: 0.05, leafThickness: 0.04 };
assert(doorConflicts(doors, doorCandidate).length > 0, 'a fixed door still has a solid leaf');
assert(doorConflicts(doors, sweeping).length === 0, 'a fixed door has no opening sweep');
const originalDoors = JSON.stringify(doors);
doorConflicts(doors, partial);
assert(JSON.stringify(doors) === originalDoors, 'door feedback is read-only');

console.log(`Placement conflict checks passed (${assertions} assertions).`);
