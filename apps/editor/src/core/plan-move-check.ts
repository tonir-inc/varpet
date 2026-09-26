/** Plan gestures use the same semantic commands as the 3D editor. */
import type { BuildingComponent, Operation, SceneDocument, Vec2 } from '../contracts';
import { demoScene, localCatalog } from './demo';
import { createPlanMove, previewPlanMove } from './plan-move';
import { componentPosition, migrateScene } from './renovation';
import { EditorStore } from './store';

let assertions = 0, commandId = 0;
function assert(condition: unknown, message: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(`Plan movement check failed: ${message}`);
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const wallIn = (scene: SceneDocument, id: string) => scene.walls.find(wall => wall.id === id)!;
const objectIn = (scene: SceneDocument, id: string) => scene.objects.find(object => object.id === id)!;
const componentIn = (scene: SceneDocument, id: string) => scene.project!.components.find(component => component.id === id)!;
const source = migrateScene(demoScene);

function gesture(scene: SceneDocument, id: string, endpoint?: 'start' | 'end') {
  const move = createPlanMove(scene, id, endpoint);
  assert(move, `${id} can begin a plan gesture`);
  assert(move.source === scene && move.id === id && !!move.label, 'gesture retains its original snapshot and command identity');
  return move;
}
function preview(scene: SceneDocument, id: string, delta: Vec2, snap = false, endpoint?: 'start' | 'end') {
  const before = JSON.stringify(scene);
  const result = previewPlanMove(gesture(scene, id, endpoint), delta, snap, localCatalog);
  assert(JSON.stringify(scene) === before, `${id} preview cannot mutate its source`);
  assert(result.scene && result.operation && !result.error, `${id} has a valid preview: ${result.error ?? ''}`);
  return { scene: result.scene, operation: result.operation };
}
function undoable(scene: SceneDocument, operation: Operation, expected: SceneDocument): void {
  const store = new EditorStore(scene, localCatalog), original = store.scene;
  const result = store.execute({ id: `plan-check-${commandId++}`, label: 'Move in plan', source: 'human', baseRevision: store.revision, operations: [operation] }, true);
  assert(result.ok, `preview operation commits: ${result.errors.join(' ')}`);
  assert(equal(store.scene, expected), 'committed snapshot exactly matches the preview');
  assert(store.undo().ok && store.scene === original && !store.canUndo, 'one undo restores the original snapshot');
  assert(store.redo().ok && equal(store.scene, expected), 'one redo restores the preview');
}

const objectMove = gesture(source, 'coffee-table');
assert(objectMove.kind === 'object', 'furniture creates an object gesture');
const furniture = preview(source, 'coffee-table', [0.17, -0.11], true);
assert(equal(objectIn(furniture.scene, 'coffee-table').position, [-3, 0, 1.25]), 'furniture snaps its position to 25 cm');
undoable(source, furniture.operation, furniture.scene);
const precise = preview(source, 'coffee-table', [0.137, -0.113]);
assert(near(objectIn(precise.scene, 'coffee-table').position[0], -3.113) && near(objectIn(precise.scene, 'coffee-table').position[2], 1.367), 'unsnapped furniture retains pointer precision');
const elevated = structuredClone(source);
objectIn(elevated, 'coffee-table').position[1] = 1.25;
assert(objectIn(preview(elevated, 'coffee-table', [0.2, 0.3]).scene, 'coffee-table').position[1] === 1.25, 'furniture keeps its elevation');
for (const delta of [[0.25, 0], [-0.25, 0]] as Vec2[]) {
  const result = previewPlanMove(objectMove, delta, false, localCatalog);
  assert(result.scene && near(objectIn(result.scene, 'coffee-table').position[0], -3.25 + delta[0]), 'repeated previews derive from the gesture origin rather than accumulate');
}

const grouped = structuredClone(source);
for (const id of ['coffee-table', 'sofa']) {
  objectIn(grouped, id).groupId = 'living-group';
  grouped.project!.assumptions.push({ id: `recorded-${id}`, entityId: id, property: 'position', value: 'Recorded', status: 'accepted', sourceKind: 'observed', sourceIds: [], rationale: 'Before moving the group', alternatives: [] });
}
const groupSource = new EditorStore(grouped, localCatalog).scene;
const groupPreview = preview(groupSource, 'coffee-table', [0.25, -0.25]);
assert(equal(objectIn(groupPreview.scene, 'sofa').position, [-3, 0, 2.55]), 'moving a group member previews the same translation for every member');
assert(equal(objectIn(groupPreview.scene, 'dining-table'), objectIn(groupSource, 'dining-table')), 'group preview leaves ungrouped furniture unchanged');
assert(groupPreview.scene.project!.assumptions.every(assumption => assumption.status === 'stale'), 'group movement invalidates every moved member assumption');
undoable(groupSource, groupPreview.operation, groupPreview.scene);
const groupNoOp = previewPlanMove(gesture(groupSource, 'coffee-table'), [0, 0], true, localCatalog);
assert(groupNoOp.scene === groupSource && groupNoOp.operation === null, 'group no-op preserves the exact scene and produces no history operation');
const lockedGroup = structuredClone(grouped);
lockedGroup.project!.metadata.sofa = { locked: true };
assert(!createPlanMove(lockedGroup, 'coffee-table'), 'a locked group member prevents moving the group through another member');
const distantGroup = structuredClone(grouped);
objectIn(distantGroup, 'sofa').position[0] = 99.9;
const invalidGroup = previewPlanMove(gesture(distantGroup, 'coffee-table'), [0.25, 0], false, localCatalog);
assert(invalidGroup.scene === null && invalidGroup.operation === null && /out-of-range/.test(invalidGroup.error ?? ''), 'group preview rejects an invalid secondary-member position before commit');

const opening = preview(source, 'door-kitchen', [3, 0.126], true);
assert(opening.operation.type === 'update-opening' && near(opening.operation.patch.offset!, 2.05), 'opening projects the pointer along its host and snaps to 5 cm');
undoable(source, opening.operation, opening.scene);
const unsnappedOpening = preview(source, 'door-kitchen', [3, 0.126]);
assert(unsnappedOpening.operation.type === 'update-opening' && near(unsnappedOpening.operation.patch.offset!, 2.026), 'opening can move without snapping');
const clampedOpening = preview(source, 'door-kitchen', [0, 100], true);
assert(clampedOpening.operation.type === 'update-opening' && near(clampedOpening.operation.patch.offset!, 3.22), 'opening cannot jump through a perpendicular partition');
const clampedWindow = preview(source, 'window-living', [-100, 0], true);
assert(clampedWindow.operation.type === 'update-opening' && near(clampedWindow.operation.patch.offset!, 0.08), 'window stops at the outer wall thickness');

const movedWall = preview(source, 'wall-spine', [0.126, 4], true);
assert(movedWall.operation.type === 'update-wall' && near(wallIn(movedWall.scene, 'wall-spine').start[0], 0.75), 'whole wall snaps perpendicular distance to 5 cm');
assert(equal(wallIn(movedWall.scene, 'wall-spine').start, [0.75, -4]) && equal(wallIn(movedWall.scene, 'wall-spine').end, [0.75, 4]), 'whole wall discards parallel motion');
assert(near(wallIn(movedWall.scene, 'wall-bedroom').start[0], 0.75), 'attached partition follows whole-wall motion');
assert(movedWall.scene.rooms.find(room => room.id === 'room-kitchen')!.polygon.some(point => near(point[0], 0.75)), 'room boundary follows the moved wall');
undoable(source, movedWall.operation, movedWall.scene);
const preciseWall = preview(source, 'wall-spine', [0.126, 4]);
assert(near(wallIn(preciseWall.scene, 'wall-spine').start[0], 0.726), 'unsnapped walls retain exact perpendicular distance');

const endpoint = preview(source, 'wall-north', [-0.126, 0.126], true, 'start');
assert(endpoint.operation.type === 'update-wall' && equal(endpoint.operation.patch.start, [-5.15, 4.15]) && endpoint.operation.patch.end === undefined, 'endpoint snaps its absolute coordinates and updates only that endpoint');
assert(equal(wallIn(endpoint.scene, 'wall-west').end, [-5.15, 4.15]), 'endpoint movement keeps adjoining walls joined');
undoable(source, endpoint.operation, endpoint.scene);
const isolated = migrateScene({
  ...demoScene, objects: [],
  rooms: [{ id: 'test-room', name: 'Test room', color: '#eeeeee', polygon: [[-10, -10], [10, -10], [10, 10], [-10, 10]] }],
  walls: [{ ...structuredClone(demoScene.walls[0]!), id: 'isolated-wall', start: [0, 0], end: [4, 0], openings: [] }],
});
const midpoint = preview(isolated, 'isolated-wall', [0.075, 0.125], true, 'start');
assert(equal(wallIn(midpoint.scene, 'isolated-wall').start, [0.1, 0.15]), 'endpoint rounding at half a snap interval matches opening snapping');
const preciseEndpoint = preview(isolated, 'isolated-wall', [0.137, 0.113], false, 'end');
assert(near(wallIn(preciseEndpoint.scene, 'isolated-wall').end[0], 4.137) && near(wallIn(preciseEndpoint.scene, 'isolated-wall').end[1], 0.113), 'endpoint can move without snapping');
const diagonal = structuredClone(isolated);
// Returning a corner must recover exact alignment, even between grid points.
const offGrid = structuredClone(isolated);
offGrid.walls[0]!.start = [0.013, 0.017];
offGrid.walls[0]!.end = [4.013, 0.317];
const straightened = preview(offGrid, 'isolated-wall', [0.12, -0.26], true, 'end');
assert(wallIn(straightened.scene, 'isolated-wall').end[1] === 0.017, 'endpoint snaps exactly horizontal to its off-grid opposite corner');
undoable(offGrid, straightened.operation, straightened.scene);
const smoothCorner = preview(offGrid, 'isolated-wall', [0.12, -0.26], false, 'end');
assert(near(wallIn(smoothCorner.scene, 'isolated-wall').end[1], 0.057), 'smooth mode bypasses angle and grid snapping');
const outsideCatch = preview(offGrid, 'isolated-wall', [0.12, -0.17], true, 'end');
assert(near(wallIn(outsideCatch.scene, 'isolated-wall').end[1], 0.15), 'outside the angle catch the ordinary grid still applies');
const verticalCorner = preview(offGrid, 'isolated-wall', [-3.96, 2], true, 'end');
assert(wallIn(verticalCorner.scene, 'isolated-wall').end[0] === 0.013, 'endpoint also catches vertical alignment');

const connectedSnap = structuredClone(offGrid);
connectedSnap.walls.push({ ...structuredClone(offGrid.walls[0]!), id: 'snap-neighbour', start: [4.013, 0.317], end: [4.213, 3.017] });
const neighbourSnap = preview(connectedSnap, 'isolated-wall', [0.17, 0.3], true, 'end');
assert(wallIn(neighbourSnap.scene, 'isolated-wall').end[0] === 4.213 && wallIn(neighbourSnap.scene, 'snap-neighbour').start[0] === 4.213, 'corner catches connected neighbour alignment without breaking the junction');
const squareCorner = preview(connectedSnap, 'isolated-wall', [0.19, -0.29], true, 'end');
const squareEnd = wallIn(squareCorner.scene, 'isolated-wall').end;
assert(near(squareEnd[0], 4.213) && near(squareEnd[1], 0.017), 'returning an off-grid shared corner makes both adjoining walls square at once');
const decimalCorner = structuredClone(isolated);
decimalCorner.walls[0]!.start = [0.6, -4]; decimalCorner.walls[0]!.end = [0.6, 0.4];
decimalCorner.walls.push({ ...structuredClone(isolated.walls[0]!), id: 'decimal-neighbour', start: [0.6, 0.4], end: [5, 0.4] });
const decimalMove = preview(decimalCorner, 'isolated-wall', [0.25, 0.03], true, 'end');
assert(equal(wallIn(decimalMove.scene, 'isolated-wall').end, [0.85, 0.4]), 'axis snapping keeps clean free-axis decimals in the inspector');
const decimalReturn = previewPlanMove(gesture(decimalCorner, 'isolated-wall', 'end'), [0.04, 0.03], true, localCatalog);
assert(decimalReturn.operation === null && decimalReturn.scene === decimalCorner, 'returning to a decimal corner is exact and creates no spurious edit');

const slideSnap = structuredClone(isolated);
slideSnap.walls[0]!.start = [0.317, -2]; slideSnap.walls[0]!.end = [0.317, 2];
slideSnap.walls.push({ ...structuredClone(slideSnap.walls[0]!), id: 'slide-neighbour', start: [0.317, 2], end: [0.017, 4] });
const slideReturn = preview(slideSnap, 'isolated-wall', [-0.26, 0], true);
assert(near(wallIn(slideReturn.scene, 'isolated-wall').start[0], 0.017) && near(wallIn(slideReturn.scene, 'isolated-wall').end[0], 0.017), 'whole wall catches exact connected-wall alignment instead of relative grid steps');
undoable(slideSnap, slideReturn.operation, slideReturn.scene);
const smoothSlide = preview(slideSnap, 'isolated-wall', [-0.26, 0], false);
assert(near(wallIn(smoothSlide.scene, 'isolated-wall').start[0], 0.057), 'smooth sliding bypasses alignment');
const almostAligned = structuredClone(slideSnap);
almostAligned.walls[1]!.end[0] = 0.277;
const tangential = previewPlanMove(gesture(almostAligned, 'isolated-wall'), [0, 0.5], true, localCatalog);
assert(tangential.scene === almostAligned && tangential.operation === null, 'tangential motion cannot attract a wall to a nearby alignment');
for (const metadata of [{ elevation: 4 }, { phase: 'remove' as const }]) {
  const excluded = structuredClone(slideSnap);
  excluded.project!.metadata['slide-neighbour'] = metadata;
  const moved = preview(excluded, 'isolated-wall', [-0.26, 0], true);
  assert(near(wallIn(moved.scene, 'isolated-wall').start[0], 0.067), 'removed or vertically separate neighbours do not attract the wall');
}
const teeSnap = structuredClone(slideSnap);
teeSnap.walls[1]!.start = [0.317, 0]; teeSnap.walls[1]!.end = [0.017, 4];
const teeReturn = preview(teeSnap, 'isolated-wall', [-0.26, 0], true);
assert(near(wallIn(teeReturn.scene, 'isolated-wall').start[0], 0.017), 'interior T junctions provide alignment anchors');

const rotatedSnap = structuredClone(isolated);
rotatedSnap.walls[0]!.end = [-2, 2.3];
rotatedSnap.walls.push({ ...structuredClone(isolated.walls[0]!), id: 'rotated-reference', start: [0, 0], end: [3, 3] });
const rotatedCorner = preview(rotatedSnap, 'isolated-wall', [0, -0.25], true, 'end');
const rotatedEnd = wallIn(rotatedCorner.scene, 'isolated-wall').end;
assert(near(rotatedEnd[0] + rotatedEnd[1], 0), 'right angles follow a rotated adjoining wall as well as world axes');
const unrelatedCorner = structuredClone(isolated);
unrelatedCorner.walls[0]!.end = [2, 2];
unrelatedCorner.walls.push({ ...structuredClone(isolated.walls[0]!), id: 'end-only-neighbour', start: [2, 2], end: [0.313, 4] });
const unrelatedMove = preview(unrelatedCorner, 'isolated-wall', [0.416 / Math.SQRT2, -0.416 / Math.SQRT2], true);
assert(near(wallIn(unrelatedMove.scene, 'isolated-wall').start[0], 0.4 / Math.SQRT2), 'whole-wall magnets align the connected junction, never an unrelated corner');

diagonal.walls[0]!.end = [3, 3];
const diagonalMove = preview(diagonal, 'isolated-wall', [-0.1, 0.1], true);
const diagonalStart = wallIn(diagonalMove.scene, 'isolated-wall').start;
assert(near(diagonalStart[0], -0.15 / Math.SQRT2) && near(diagonalStart[1], 0.15 / Math.SQRT2), 'diagonal wall snaps distance along its own normal');
undoable(diagonal, diagonalMove.operation, diagonalMove.scene);

const components = structuredClone(source);
const component = (id: string, kind: BuildingComponent['kind']): BuildingComponent => ({ id, kind, name: id, position: [-2.11, 0.8, -0.12], dimensions: [0.2, 0.2, 0.1], rotation: 0.3, color: '#ffffff', phase: 'existing' });
components.project!.components.push(component('plan-sink', 'sink'), { ...component('plan-outlet', 'outlet'), host: { wallId: 'wall-spine', offset: 3.2, elevation: 1.2, side: -1 } });
const mounted = componentIn(components, 'plan-outlet');
components.project!.routes.push({ id: 'plan-cable', name: 'Cable', system: 'electrical', from: mounted.id, points: [componentPosition(components, mounted), [-2, 1.2, -1]], diameter: 0.01, phase: 'existing' });
const free = preview(components, 'plan-sink', [0.126, -0.126], true);
assert(equal(componentIn(free.scene, 'plan-sink').position, [-2, 0.8, -0.25]), 'free building components snap to 5 cm and keep elevation');
assert(componentIn(free.scene, 'plan-sink').rotation === 0.3, 'free component movement retains rotation');
undoable(components, free.operation, free.scene);
const hosted = preview(components, 'plan-outlet', [6, 0.126], true);
assert(equal(componentIn(hosted.scene, 'plan-outlet').host, { wallId: 'wall-spine', offset: 3.35, elevation: 1.2, side: -1 }), 'mounted components move along the wall while keeping side and elevation');
assert(equal(hosted.scene.project!.routes[0]!.points[0], componentPosition(hosted.scene, componentIn(hosted.scene, 'plan-outlet'))), 'mounted movement synchronizes connected route endpoints');
undoable(components, hosted.operation, hosted.scene);
const preciseHosted = preview(components, 'plan-outlet', [6, 0.126]);
assert(near(componentIn(preciseHosted.scene, 'plan-outlet').host!.offset, 3.326), 'mounted components can move without snapping');
for (const [delta, expected] of [[-100, 0.1], [100, 7.9]]) {
  const result = preview(components, 'plan-outlet', [0, delta!], true);
  assert(near(componentIn(result.scene, 'plan-outlet').host!.offset, expected!), 'mounted component stops within the host wall');
}

for (const [scene, id, endpoint] of [
  [source, 'coffee-table', undefined], [source, 'wall-spine', undefined], [source, 'door-kitchen', undefined],
  [source, 'wall-north', 'start'], [components, 'plan-sink', undefined], [components, 'plan-outlet', undefined],
] as const) {
  const noOp = previewPlanMove(gesture(scene, id, endpoint), [0, 0], true, localCatalog);
  assert(noOp.scene === scene && noOp.operation === null && !noOp.error, `${id} zero motion cannot snap existing geometry or create history`);
  const locked = structuredClone(scene);
  locked.project!.metadata[id] = { ...locked.project!.metadata[id], locked: true };
  assert(!createPlanMove(locked, id, endpoint), `${id} respects its lock`);
}
for (const [id, delta] of [['wall-spine', [0, 1]], ['door-kitchen', [1, 0]]] as const) {
  const result = previewPlanMove(gesture(source, id), [...delta], true, localCatalog);
  assert(result.scene === source && result.operation === null, `${id} perpendicular constraint can produce a no-op`);
}
const lockedHost = structuredClone(components);
lockedHost.project!.metadata['wall-spine']!.locked = true;
assert(!createPlanMove(lockedHost, 'door-kitchen') && !createPlanMove(lockedHost, 'plan-outlet'), 'a host lock prevents opening and mounted-component movement');
assert(!createPlanMove(source, 'room-kitchen') && !createPlanMove(source, 'missing'), 'rooms and unknown entities cannot start move gestures');
assert(!createPlanMove(source, 'coffee-table', 'start'), 'endpoint gestures only apply to walls');
for (const [scene, id, delta, reason] of [
  [source, 'wall-spine', [3, 0], /collapse or reverse room/],
  [source, 'wall-bedroom', [0, -0.5], /opening outside its bounds/],
  [source, 'coffee-table', [Number.NaN, 0], /finite/],
  [source, 'coffee-table', [200, 0], /out-of-range/],
] as const) {
  const before = JSON.stringify(scene);
  const rejected = previewPlanMove(gesture(scene, id), [...delta], false, localCatalog);
  assert(rejected.scene === null && rejected.operation === null && reason.test(rejected.error ?? ''), `${id} invalid preview offers no committable operation: ${rejected.error ?? ''}`);
  assert(JSON.stringify(scene) === before, 'rejected preview leaves the source unchanged');
}
const lockedNeighbour = structuredClone(source);
lockedNeighbour.project!.metadata['room-kitchen']!.locked = true;
const rejectedNeighbour = previewPlanMove(gesture(lockedNeighbour, 'wall-spine'), [0.2, 0], false, localCatalog);
assert(rejectedNeighbour.scene === null && rejectedNeighbour.operation === null && /locked/.test(rejectedNeighbour.error ?? ''), 'a locked connected boundary rejects the whole preview');

console.log(`Plan movement checks passed (${assertions} assertions).`);
