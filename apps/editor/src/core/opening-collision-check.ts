/** Opening clearance regressions; existing acceptance checks and fixtures stay unchanged. */
import type { Opening, Operation, SceneDocument, Vec2, Wall } from '../contracts';
import { demoScene, localCatalog } from './demo';
import { openingWallObstacles } from './opening-collision';
import { constrainOpeningOffset, findOpeningMove } from './opening-move';
import { migrateScene } from './renovation';
import { EditorStore } from './store';
import { validateScene } from './validation';

let checks = 0;
function assert(condition: unknown, message: string): asserts condition {
  checks++;
  if (!condition) throw new Error(message);
}
function near(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 1e-7, `${message}: expected ${expected}, got ${actual}`);
}
const opening = (patch: Partial<Opening> = {}): Opening => ({ id: 'opening', kind: 'door', offset: 1, width: 1, height: 2.1, sill: 0, ...patch });
const wall = (id: string, start: Vec2, end: Vec2, openings: Opening[] = []): Wall => ({ id, start, end, openings, height: 3, thickness: 0.2, color: '#eeeeee' });
function sceneFor(blocker: Wall, entry = opening()): SceneDocument {
  return migrateScene({ format: 'varpet.editor', version: 1, id: 'clearance', name: 'Opening clearance', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Room', color: '#eeeeee', polygon: [[-10, -10], [10, -10], [10, 10], [-10, 10]] }],
    walls: [wall('host', [0, 0], [8, 0], [entry]), blocker], objects: [] });
}
const junction = () => wall('partition', [4, 0], [4, 3]);
const obstacles = (scene: SceneDocument) => openingWallObstacles(scene, scene.walls[0]!, scene.walls[0]!.openings[0]!);
function context(scene: SceneDocument) {
  const value = findOpeningMove(scene, 'opening');
  assert(value, 'Valid unlocked opening has a movement context');
  return value;
}
function valid(scene: SceneDocument, message: string): void {
  const result = validateScene(scene, []);
  assert(result.ok, `${message}: ${result.errors.join(' ')}`);
}
function invalid(scene: SceneDocument, message: string): void {
  assert(!validateScene(scene, []).ok, message);
}

// The screenshot's kitchen door reaches the bedroom partition before its neighbour.
const demo = structuredClone(demoScene);
const kitchen = findOpeningMove(demo, 'door-kitchen');
assert(kitchen, 'Demo kitchen door can move');
near(kitchen.minOffset, 0.08, 'Kitchen stops outside the south wall thickness');
near(kitchen.maxOffset, 3.22, 'Kitchen stops before the bedroom wall thickness');
near(constrainOpeningOffset(kitchen, 100, true), 3.22, 'Large snapped drag cannot tunnel through the partition');
near(constrainOpeningOffset(kitchen, -100, false), 0.08, 'Negative drag stops at the outer-wall corner');
const bedroom = findOpeningMove(demo, 'door-bedroom');
assert(bedroom, 'Demo bedroom door can move');
near(bedroom.minOffset, 4.48, 'Door on the opposite side stops after the same partition');
valid({ ...demo, objects: [] }, 'Original demo geometry stays valid');
const blockedDemo = structuredClone(demo);
blockedDemo.walls.find(item => item.id === 'wall-spine')!.openings[0]!.offset = 3.9;
assert(!validateScene(blockedDemo, localCatalog).ok, 'Screenshot door position is rejected');

for (const kind of ['door', 'window'] as const) {
  const entry = opening({ kind, sill: kind === 'window' ? 0.8 : 0, height: kind === 'window' ? 1.2 : 2.1 });
  const scene = sceneFor(junction(), entry);
  valid(scene, `${kind} before T junction is valid`);
  near(context(scene).maxOffset, 2.9, `${kind} movement respects perpendicular wall thickness`);
  scene.walls[0]!.openings[0]!.offset = 2.9;
  valid(scene, `${kind} may touch the partition edge`);
  scene.walls[0]!.openings[0]!.offset = 2.901;
  invalid(scene, `${kind} cannot penetrate the partition`);
  scene.walls[0]!.openings[0]!.offset = 4.1;
  valid(scene, `${kind} on the other side remains valid`);
  near(context(scene).minOffset, 4.1, `${kind} cannot drag backwards through the partition`);
}

const cross = sceneFor(wall('partition', [4, -3], [4, 3]));
near(context(cross).maxOffset, 2.9, 'Crossing wall blocks movement');
const angled = sceneFor(wall('partition', [2, -2], [6, 2]));
near(context(angled).maxOffset, 3 - 0.1 - Math.SQRT2 * 0.1, 'Diagonal wall includes both wall thicknesses');
const reversed = sceneFor(wall('partition', [6, 2], [2, -2]));
near(context(reversed).maxOffset, context(angled).maxOffset, 'Reversing blocker endpoints preserves clearance');
const parallel = sceneFor(wall('partition', [4, 0.15], [6, 0.15]));
near(context(parallel).maxOffset, 3, 'Parallel wall blocks where wall volumes overlap');
const tangent = sceneFor(wall('partition', [4, 0.2], [6, 0.2]));
assert(obstacles(tangent).length === 0, 'Parallel wall touching the host outer face does not block');
near(context(tangent).maxOffset, 7, 'Unobstructed drag reaches the host end');
const separated = sceneFor(wall('partition', [4, 0.21], [6, 0.21]));
assert(obstacles(separated).length === 0, 'Separated parallel wall does not block');

const highWindow = sceneFor({ ...junction(), height: 0.8 }, opening({ kind: 'window', offset: 3.5, sill: 1, height: 1 }));
valid(highWindow, 'Window above a low partition remains valid');
assert(obstacles(highWindow).length === 0, 'Low wall does not restrict high-window movement');
highWindow.walls[1]!.height = 1;
valid(highWindow, 'Vertical face tangency remains valid');
highWindow.walls[1]!.height = 1.01;
invalid(highWindow, 'A small positive vertical intersection is blocked');
highWindow.project!.metadata.partition = { elevation: 2 };
valid(highWindow, 'A wall above the window does not block it');
highWindow.project!.metadata.partition = { elevation: 1.9 };
invalid(highWindow, 'Wall elevations are included in vertical collision');
highWindow.project!.metadata.host = { elevation: 3 };
valid(highWindow, 'Host elevation raises the opening above the obstacle');

// An actual hole through the crossing wall clears both openings; sill/lintel remain solid.
const pierced = sceneFor(wall('partition', [3, -3], [3, 3], [opening({ id: 'cross-window', kind: 'window', offset: 2.5, width: 1, sill: 0.5, height: 2 })]),
  opening({ kind: 'window', offset: 2, width: 2, sill: 0.5, height: 2 }));
valid(pierced, 'Aligned openings through intersecting walls do not collide with solid wall');
assert(obstacles(pierced).length === 0, 'Cross-wall opening is removed from obstacle geometry');
pierced.walls[1]!.openings[0]!.height = 1.9;
invalid(pierced, 'A lower lintel in the crossing wall obstructs the opening');
pierced.walls[1]!.openings[0]!.height = 2;
pierced.walls[1]!.openings[0]!.sill = 0.6;
invalid(pierced, 'A higher sill in the crossing wall obstructs the opening');
const removed = sceneFor(junction(), opening({ offset: 3.5 }));
removed.project!.metadata.partition = { phase: 'remove' };
valid(removed, 'Removed walls are excluded from active opening clearance');
assert(obstacles(removed).length === 0, 'Removed walls do not restrict dragging');

const controls = sceneFor(junction());
near(constrainOpeningOffset(context(controls), 1.126, true), 1.15, 'Opening drag retains 5 cm snapping');
near(constrainOpeningOffset(context(controls), 1.126, false), 1.126, 'Unsnapped opening drag retains precision');
near(constrainOpeningOffset(context(controls), Number.NaN, true), 1, 'Non-finite drag offset restores the original offset');
controls.walls[0]!.openings.push(opening({ id: 'neighbour', offset: 2.5, width: 0.5 }));
near(context(controls).maxOffset, 1.5, 'Sibling opening remains the closer movement boundary');
controls.project!.metadata.opening = { locked: true };
assert(!findOpeningMove(controls, 'opening'), 'Locked openings cannot move');
controls.project!.metadata.opening = {};
controls.project!.metadata.host = { locked: true };
assert(!findOpeningMove(controls, 'opening'), 'Openings on locked host walls cannot move');

// Every command producer reaches the same atomic scene validation boundary.
const store = new EditorStore(sceneFor(junction()), []);
let commandId = 0;
const execute = (operations: Operation[]) => store.execute({ id: `clearance-${commandId++}`, label: 'Opening clearance regression', source: 'human', baseRevision: store.revision, operations }, true);
function rejected(operations: Operation[], message: string): void {
  const before = store.scene, revision = store.revision, undo = store.canUndo, redo = store.canRedo;
  assert(!execute(operations).ok, message);
  assert(store.scene === before && store.revision === revision && store.canUndo === undo && store.canRedo === redo, `${message}: document, revision and history remain unchanged`);
}
rejected([{ type: 'update-opening', id: 'opening', patch: { offset: 3.5 } }], 'Inspector or agent cannot move a door into a wall');
rejected([{ type: 'update-opening', id: 'opening', patch: { width: 3 } }], 'Opening resize cannot extend through a wall');
rejected([{ type: 'add-opening', wallId: 'host', opening: opening({ id: 'new-window', kind: 'window', offset: 3.5, sill: 1, height: 1 }) }], 'Adding a window into a crossing wall is rejected');
rejected([{ type: 'update-wall', id: 'partition', patch: { start: [1.5, 0], end: [1.5, 3] } }], 'Moving a wall into an existing door is rejected');
rejected([{ type: 'add-wall', wall: wall('new-wall', [1.5, -2], [1.5, 2]) }], 'Adding a wall through an existing door is rejected');
rejected([{ type: 'set-project', patch: { currency: 'EUR' } }, { type: 'update-opening', id: 'opening', patch: { offset: 3.5 } }], 'Failed geometry transaction rolls back earlier operations');
assert(execute([{ type: 'update-opening', id: 'opening', patch: { offset: 2.9 } }]).ok, 'Valid move to boundary commits');
near(store.scene.walls[0]!.openings[0]!.offset, 2.9, 'Committed offset matches the legal drag boundary');
assert(store.revision === 1 && store.canUndo, 'Completed opening move adds one revision and undo entry');
assert(store.undo().ok, 'Valid opening move can be undone');
near(store.scene.walls[0]!.openings[0]!.offset, 1, 'Undo restores original opening offset');
assert(store.redo().ok, 'Valid opening move can be redone');
near(store.scene.walls[0]!.openings[0]!.offset, 2.9, 'Redo restores legal opening offset');
console.log(`Opening clearance: ${checks} assertions passed.`);
