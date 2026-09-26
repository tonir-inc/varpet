/** Connected wall movement regressions. Run: node apps/editor/scripts/check-walls.mjs */
import type { CommandResult, SceneDocument, Vec2, Wall } from '../contracts';
import { demoScene, localCatalog } from './demo';
import { applyRenovationOperation, componentPosition, migrateScene, wallLength } from './renovation';
import { EditorStore } from './store';

let assertions = 0, commandId = 0;
function assert(condition: unknown, description: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(`Wall movement check failed: ${description}`);
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const wallIn = (scene: SceneDocument, id: string) => scene.walls.find(wall => wall.id === id)!;

function move(store: EditorStore, id: string, dx: number, dz: number): CommandResult {
  const wall = wallIn(store.scene, id);
  return store.execute({
    id: `wall-move-check-${commandId++}`, label: 'Move wall', source: 'human', baseRevision: store.revision,
    operations: [{ type: 'update-wall', id, patch: {
      start: [wall.start[0] + dx, wall.start[1] + dz], end: [wall.end[0] + dx, wall.end[1] + dz],
    } }],
  }, true);
}

function rejectsAtomically(scene: SceneDocument, id: string, dx: number, dz: number, reason: RegExp, description: string): void {
  const store = new EditorStore(scene, localCatalog), initial = store.scene;
  let notifications = 0;
  store.subscribe(() => { notifications++; });
  const result = move(store, id, dx, dz);
  assert(!result.ok, `${description}: rejected`);
  assert(result.errors.some(error => reason.test(error)), `${description}: actionable conflict (${result.errors.join(' ')})`);
  assert(store.scene === initial && store.revision === 0, `${description}: exact snapshot and revision preserved`);
  assert(!store.canUndo && !store.canRedo && notifications === 0, `${description}: no history entry or notification`);
}

// Moving the demo's long partition in either direction preserves its two openings,
// stretches the perpendicular bedroom wall and updates all adjoining room boundaries.
for (const delta of [-0.25, 0.25]) {
  const store = new EditorStore(demoScene, localCatalog), initial = JSON.stringify(store.scene);
  const result = move(store, 'wall-spine', delta, 0);
  assert(result.ok, `partition moves ${delta} m: ${result.errors.join(' ')}`);
  const spine = wallIn(store.scene, 'wall-spine'), original = wallIn(demoScene, 'wall-spine');
  assert(near(spine.start[0], 0.6 + delta) && near(spine.end[0], 0.6 + delta), 'both partition endpoints translate equally');
  assert(near(wallLength(spine), wallLength(original)), 'whole-wall movement preserves wall length');
  assert(equal(spine.openings, original.openings), 'whole-wall movement preserves opening dimensions and host offsets');
  assert(near(wallIn(store.scene, 'wall-bedroom').start[0], 0.6 + delta), 'connected T-junction wall follows the partition');
  for (const roomId of ['room-living', 'room-kitchen', 'room-bedroom']) {
    const room = store.scene.rooms.find(candidate => candidate.id === roomId)!;
    const previous = demoScene.rooms.find(candidate => candidate.id === roomId)!;
    assert(room.polygon.every((point, i) => near(point[0], previous.polygon[i]![0] + (near(previous.polygon[i]![0], 0.6) ? delta : 0)) && near(point[1], previous.polygon[i]![1])), `${roomId} follows only its connected boundary`);
  }
  assert(equal(wallIn(store.scene, 'wall-south'), wallIn(demoScene, 'wall-south')) && equal(wallIn(store.scene, 'wall-north'), wallIn(demoScene, 'wall-north')), 'endpoint junctions slide along unchanged outer host walls');
  const committed = JSON.stringify(store.scene);
  assert(store.undo().ok && JSON.stringify(store.scene) === initial && !store.canUndo, 'one undo restores every connected change');
  assert(store.redo().ok && JSON.stringify(store.scene) === committed, 'redo restores the exact connected result');
}

for (const delta of [-0.2, 0.2]) {
  const store = new EditorStore(demoScene, localCatalog);
  const result = move(store, 'wall-bedroom', 0, delta);
  assert(result.ok, `horizontal partition moves ${delta} m: ${result.errors.join(' ')}`);
  assert(near(wallIn(store.scene, 'wall-bath').end[1], 0.4 + delta), 'interior T-junction endpoint follows horizontal movement');
  assert(equal(wallIn(store.scene, 'wall-bath').openings, wallIn(demoScene, 'wall-bath').openings), 'resized neighbouring wall preserves its opening');
}

// Source-wall mounts keep their relative placement; linked route endpoints follow
// their physical position and evidence about affected dependants becomes stale.
const hosted = migrateScene(demoScene);
hosted.project!.components.push({
  id: 'wall-outlet', name: 'Wall outlet', kind: 'outlet', position: [0, 0, 0], rotation: 0,
  dimensions: [0.1, 0.1, 0.04], color: '#ffffff', phase: 'existing',
  host: { wallId: 'wall-spine', offset: 3, elevation: 1, side: 1 },
});
const mountedPosition = componentPosition(hosted, hosted.project!.components[0]!);
hosted.project!.routes.push({ id: 'outlet-cable', name: 'Outlet cable', system: 'electrical', from: 'wall-outlet', points: [mountedPosition, [-2, 1, -1]], diameter: 0.01, phase: 'existing' });
for (const entityId of ['wall-outlet', 'outlet-cable', 'door-kitchen']) hosted.project!.assumptions.push({
  id: `position-${entityId}`, entityId, property: 'position', value: 'Recorded', status: 'accepted',
  sourceKind: 'observed', sourceIds: [], rationale: 'Recorded before the correction', alternatives: [],
});
const hostedStore = new EditorStore(hosted, localCatalog);
assert(move(hostedStore, 'wall-spine', 0.25, 0).ok, 'wall with mounted component and route can move');
const mountedAfter = hostedStore.scene.project!.components[0]!, positionAfter = componentPosition(hostedStore.scene, mountedAfter);
assert(equal(mountedAfter.host, hosted.project!.components[0]!.host), 'mounted component retains its host-relative placement');
assert(near(positionAfter[0], mountedPosition[0] + 0.25) && near(positionAfter[1], mountedPosition[1]) && near(positionAfter[2], mountedPosition[2]), 'mounted component translates with the source wall');
assert(equal(hostedStore.scene.project!.routes[0]!.points, [positionAfter, [-2, 1, -1]]), 'route updates its mounted endpoint and preserves its free endpoint');
assert(hostedStore.scene.project!.assumptions.every(assumption => assumption.status === 'stale'), 'mounted component, opening and route assumptions become stale');

for (const lockedId of ['wall-spine', 'wall-bedroom', 'room-kitchen']) {
  const locked = migrateScene(demoScene);
  locked.project!.metadata[lockedId]!.locked = true;
  rejectsAtomically(locked, 'wall-spine', 0.25, 0, /locked/, `${lockedId} lock`);
}
rejectsAtomically(demoScene, 'wall-bedroom', 0, -0.5, /opening outside its bounds/, 'shortened neighbour cannot fit its opening');

// A large drag must not jump through a room, a connected wall's far end, or the
// end of a hosting segment, even when the resulting individual shapes are valid.
rejectsAtomically(demoScene, 'wall-spine', 3, 0, /collapse or reverse room/, 'room winding inversion');
const wall = (id: string, start: Vec2, end: Vec2): Wall => ({ id, start, end, height: 2.7, thickness: 0.16, color: '#ffffff', openings: [] });
const sceneWithWalls = (walls: Wall[]): SceneDocument => migrateScene({
  ...demoScene, objects: [], walls,
  rooms: [{ id: 'test-room', name: 'Test room', color: '#eeeeee', polygon: [[-10, -10], [10, -10], [10, 10], [-10, 10]] }],
});
rejectsAtomically(sceneWithWalls([wall('moving', [0, -4], [0, 4]), wall('host', [-5, -4], [5, -4])]), 'moving', 6, 0, /disconnect it/, 'T junction cannot move beyond its host');
rejectsAtomically(sceneWithWalls([wall('moving', [0, -4], [0, 4]), wall('attached', [0, 0], [2, 0])]), 'moving', 3, 0, /far end of connected wall/, 'connected wall cannot reverse');

// Diagonal walls still translate when endpoint-connected neighbours can follow.
const diagonal = new EditorStore(sceneWithWalls([wall('moving', [0, 0], [3, 3]), wall('attached', [3, 3], [3, 5])]), localCatalog);
assert(move(diagonal, 'moving', -0.25, 0.25).ok, 'diagonal wall translates perpendicular to its direction');
assert(equal(wallIn(diagonal.scene, 'attached').start, [2.75, 3.25]) && equal(wallIn(diagonal.scene, 'attached').end, [3, 5]), 'diagonal wall moves the shared endpoint and leaves the far endpoint fixed');

// The gesture preview and committed command use the same operation over separate
// snapshots; previewing must leave both persistent geometry and history unchanged.
const previewStore = new EditorStore(demoScene, localCatalog), previewSource = previewStore.scene;
const preview = applyRenovationOperation(structuredClone(previewSource), { type: 'update-wall', id: 'wall-spine', patch: { start: [0.85, -4], end: [0.85, 4] } });
assert(previewStore.scene === previewSource && previewStore.revision === 0 && !previewStore.canUndo, 'preview leaves the authoritative document and history unchanged');
assert(move(previewStore, 'wall-spine', 0.25, 0).ok && equal(previewStore.scene, preview), 'preview and commit produce the same connected scene');

// A room edge can span several collinear walls without vertices at their joints.
// Moving its middle wall must introduce those joints in the edge's own direction.
function segmentedBoundary(clockwise = false): SceneDocument {
  const scene = sceneWithWalls([
    wall('left', [0, 0], [2, 0]), wall('middle', [2, 0], [4, 0]), wall('right', [4, 0], [6, 0]),
  ]);
  scene.rooms[0]!.polygon = clockwise ? [[6, 0], [0, 0], [0, 4], [6, 4]] : [[0, 0], [6, 0], [6, 4], [0, 4]];
  return scene;
}
for (const clockwise of [false, true]) {
  const segmented = new EditorStore(segmentedBoundary(clockwise), localCatalog), initial = JSON.stringify(segmented.scene);
  assert(move(segmented, 'middle', 0, -1).ok, 'a middle boundary segment can move');
  const expected = clockwise ? [[6, 0], [4, -1], [2, -1], [0, 0], [0, 4], [6, 4]] : [[0, 0], [2, -1], [4, -1], [6, 0], [6, 4], [0, 4]];
  assert(equal(segmented.scene.rooms[0]!.polygon, expected), 'room boundary gains moved segment junctions in polygon order');
  assert(equal(wallIn(segmented.scene, 'left').end, [2, -1]) && equal(wallIn(segmented.scene, 'right').start, [4, -1]), 'room and split neighbouring walls share their moved junctions');
  assert(segmented.undo().ok && JSON.stringify(segmented.scene) === initial, 'undo removes inserted room junctions with the wall movement');
}
const noMovement = new EditorStore(segmentedBoundary(), localCatalog), unchangedBoundary = JSON.stringify(noMovement.scene.rooms[0]!.polygon);
assert(move(noMovement, 'middle', 0, 0).ok && JSON.stringify(noMovement.scene.rooms[0]!.polygon) === unchangedBoundary, 'no-op movement does not add room vertices');
const lockedBoundary = segmentedBoundary();
lockedBoundary.project!.metadata['test-room']!.locked = true;
rejectsAtomically(lockedBoundary, 'middle', 0, -1, /locked/, 'segmented room boundary lock');

// Identical plan coordinates at different storeys are not a wall junction.
// A raised wall/room that still overlaps vertically remains connected.
const levels = sceneWithWalls([
  wall('lower-wall', [0, 0], [4, 0]), wall('upper-wall', [0, 0], [4, 0]),
  wall('raised-neighbour', [4, 0], [4, 4]),
]);
levels.rooms[0]!.polygon = [[0, 0], [4, 0], [4, 4], [0, 4]];
levels.rooms.push({ ...structuredClone(levels.rooms[0]!), id: 'upper-room' }, { ...structuredClone(levels.rooms[0]!), id: 'raised-room' });
levels.project!.metadata['upper-wall']!.elevation = 3;
levels.project!.metadata['raised-neighbour']!.elevation = 0.5;
levels.project!.metadata['test-room'] = { elevation: 0, ceilingHeight: 2.7 };
levels.project!.metadata['upper-room'] = { elevation: 3, ceilingHeight: 2.7 };
levels.project!.metadata['raised-room'] = { elevation: 0.5, ceilingHeight: 2.7 };
const levelStore = new EditorStore(levels, localCatalog);
assert(move(levelStore, 'lower-wall', 0, -0.25).ok, 'lower wall moves with vertically overlapping neighbours');
assert(equal(wallIn(levelStore.scene, 'upper-wall'), wallIn(levels, 'upper-wall')), 'vertically disjoint wall at the same XZ coordinates stays fixed');
assert(equal(levelStore.scene.rooms.find(room => room.id === 'upper-room'), levels.rooms.find(room => room.id === 'upper-room')), 'vertically disjoint room boundary stays fixed');
assert(equal(wallIn(levelStore.scene, 'raised-neighbour').start, [4, -0.25]), 'raised neighbour with positive vertical overlap follows');
assert(equal(levelStore.scene.rooms.find(room => room.id === 'raised-room')!.polygon[0], [0, -0.25]), 'raised room with positive vertical overlap follows');
const lockedUpper = structuredClone(levels);
lockedUpper.project!.metadata['upper-wall']!.locked = true;
lockedUpper.project!.metadata['upper-room']!.locked = true;
assert(move(new EditorStore(lockedUpper, localCatalog), 'lower-wall', 0, -0.25).ok, 'locks on a separate vertical level do not block the lower wall');
const justTouching = structuredClone(levels);
justTouching.project!.metadata['upper-wall']!.elevation = 2.7;
justTouching.project!.metadata['upper-room']!.elevation = 2.7;
const touchingStore = new EditorStore(justTouching, localCatalog);
assert(move(touchingStore, 'lower-wall', 0, -0.25).ok && equal(wallIn(touchingStore.scene, 'upper-wall'), wallIn(justTouching, 'upper-wall')), 'walls touching only at their top/bottom plane are independent');
assert(equal(touchingStore.scene.rooms.find(room => room.id === 'upper-room'), justTouching.rooms.find(room => room.id === 'upper-room')), 'room above the source wall top stays fixed');
const upperHost = sceneWithWalls([wall('moving', [0, 0], [4, 0]), wall('upper-host', [-1, 0], [5, 0])]);
upperHost.project!.metadata['upper-host']!.elevation = 3;
assert(move(new EditorStore(upperHost, localCatalog), 'moving', 0, -0.25).ok, 'a higher segment crossing the endpoint in plan is not a T host');

console.log(`Wall movement checks passed (${assertions} assertions).`);
