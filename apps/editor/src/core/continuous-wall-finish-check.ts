/** A visible room-facing wall is one paint target despite structural segmentation. */
import type { FinishAssignment, Operation, Room, SceneDocument, Vec2, Wall } from '../contracts';
import { buildFinishOperations, getFinishPreset, materialForPreset } from './finish-presets';
import { parseScene, serializeScene } from './persistence';
import { migrateScene } from './renovation';
import { EditorStore } from './store';

let assertions = 0, scenarios = 0, commandId = 0;
const failures: string[] = [];
const paint = getFinishPreset('clay')!;
const otherPaint = getFinishPreset('sage')!;
type WallFace = 'wall-front' | 'wall-back';
function assert(condition: unknown, message: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(message);
}
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function check(name: string, run: () => void): void {
  scenarios++;
  try { run(); }
  catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
}
const wall = (id: string, start: Vec2, end: Vec2): Wall => ({ id, start, end, height: 2.7, thickness: 0.16, color: '#eeeeee', openings: [] });
const room = (id: string, x1: number, z1: number, x2: number, z2: number): Room => ({ id, name: id, color: '#dddddd', polygon: [[x1, z1], [x2, z1], [x2, z2], [x1, z2]] });
function apartment(): SceneDocument {
  return {
    format: 'varpet.editor', version: 1, id: 'continuous-wall-regression', name: 'Continuous wall regression', units: 'm', upAxis: 'Y', objects: [],
    rooms: [room('living', -4, 0, 4, 4), room('behind-left', -4, -3, 0, 0), room('behind-right', 0, -3, 4, 0)],
    walls: [
      { ...wall('left', [-4, 0], [0, 0]), openings: [{ id: 'door-left', kind: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }] },
      { ...wall('right', [0, 0], [4, 0]), openings: [{ id: 'door-right', kind: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }] },
      wall('behind-divider', [0, 0], [0, -3]),
    ],
  };
}
function assignments(operations: Operation[]): FinishAssignment[] {
  return operations.flatMap(operation => operation.type === 'upsert-finish' ? [operation.finish] : []);
}
function targets(operations: Operation[]): string[] {
  return assignments(operations).map(finish => `${finish.entityId}/${finish.surface}`).sort();
}
function expectTargets(scene: SceneDocument, entityId: string, surface: WallFace, expected: string[]): void {
  const before = JSON.stringify(scene);
  const actual = targets(buildFinishOperations(scene, paint, entityId, surface));
  assert(equal(actual, [...expected].sort()), `Expected ${expected.join(', ')}; received ${actual.join(', ')}`);
  assert(JSON.stringify(scene) === before, 'Building paint operations never mutates the input document');
}
function apply(store: EditorStore, operations: Operation[]): void {
  const result = store.execute({ id: `continuous-finish-${commandId++}`, label: 'Paint continuous wall face', source: 'human', baseRevision: store.revision, operations }, true);
  assert(result.ok, result.errors.join(' '));
}
function assigned(scene: SceneDocument, entityId: string, surface: WallFace): FinishAssignment | undefined {
  return scene.project?.finishes.find(finish => finish.entityId === entityId && finish.surface === surface);
}

check('Opposite-side T junction is one room-facing paint action with v1 migration, undo, redo and persistence', () => {
  const original = apartment();
  const originalJson = JSON.stringify(original);
  const store = new EditorStore(original, []);
  const before = serializeScene(store.scene);
  const geometry = JSON.stringify({ rooms: store.scene.rooms, walls: store.scene.walls, objects: store.scene.objects });
  const operations = buildFinishOperations(store.scene, paint, 'left', 'wall-front');
  assert(equal(targets(operations), ['left/wall-front', 'right/wall-front']), 'Both connected living-room faces receive paint across the opposite-side T junction');
  assert(operations.filter(operation => operation.type === 'migrate-project').length === 1, 'The v1 scene is migrated exactly once');
  assert(operations.filter(operation => operation.type === 'upsert-material').length === 1, 'The action creates only one shared material');
  apply(store, operations);
  assert(store.scene.version === 2 && store.revision === 1 && store.canUndo, 'All finishes commit together as one renovation edit');
  assert(assigned(store.scene, 'left', 'wall-front')?.materialId === assigned(store.scene, 'right', 'wall-front')?.materialId, 'Both faces reference the same material');
  assert(store.scene.project!.finishes.length === 2, 'Doors, the divider and opposite faces gain no finish assignment');
  assert(JSON.stringify({ rooms: store.scene.rooms, walls: store.scene.walls, objects: store.scene.objects }) === geometry, 'Wall IDs, geometry, rooms and openings remain unchanged');
  assert(JSON.stringify(original) === originalJson, 'The caller-owned original scene remains unchanged');
  const painted = serializeScene(store.scene);
  assert(serializeScene(parseScene(painted, [])) === painted, 'Export/import preserves every face assignment');
  assert(store.undo().ok && serializeScene(store.scene) === before, 'One undo restores the exact unpainted v1 document');
  assert(!store.canUndo, 'No second history entry is needed to undo the other segment');
  assert(store.redo().ok && serializeScene(store.scene) === painted, 'One redo restores every connected assignment');
  assert(buildFinishOperations(store.scene, paint, 'right', 'wall-front').length === 0, 'Reapplying an already-uniform face is a no-op');
});

check('Endpoint reversal maps adjacent front to back', () => {
  const scene = apartment();
  [scene.walls[1]!.start, scene.walls[1]!.end] = [scene.walls[1]!.end, scene.walls[1]!.start];
  expectTargets(scene, 'left', 'wall-front', ['left/wall-front', 'right/wall-back']);
  expectTargets(scene, 'right', 'wall-back', ['left/wall-front', 'right/wall-back']);
});

check('Selecting a reversed first segment maps the rest of the same visible face', () => {
  const scene = apartment();
  [scene.walls[0]!.start, scene.walls[0]!.end] = [scene.walls[0]!.end, scene.walls[0]!.start];
  expectTargets(scene, 'left', 'wall-back', ['left/wall-back', 'right/wall-front']);
});

check('Connected paint reaches all three segments transitively', () => {
  const scene = apartment();
  scene.rooms[0] = room('living', -4, 0, 8, 4);
  scene.walls.push(wall('far-right', [4, 0], [8, 0]));
  expectTargets(scene, 'left', 'wall-front', ['left/wall-front', 'right/wall-front', 'far-right/wall-front']);
});

check('A back-facing continuous room wall groups across a front-side divider', () => {
  const scene = apartment();
  scene.rooms = [room('behind', -4, -4, 4, 0), room('front-left', -4, 0, 0, 3), room('front-right', 0, 0, 4, 3)];
  scene.walls[2] = wall('front-divider', [0, 0], [0, 3]);
  expectTargets(scene, 'right', 'wall-back', ['left/wall-back', 'right/wall-back']);
});

check('Continuous faces group on diagonal walls as well as axis-aligned walls', () => {
  const scene = apartment();
  const rotate = ([x, z]: Vec2): Vec2 => [(x - z) / Math.SQRT2, (x + z) / Math.SQRT2];
  scene.rooms.forEach(item => { item.polygon = item.polygon.map(rotate); });
  scene.walls.forEach(item => { item.start = rotate(item.start); item.end = rotate(item.end); });
  expectTargets(scene, 'left', 'wall-front', ['left/wall-front', 'right/wall-front']);
});

check('Opposite faces in different rooms remain separate', () => {
  const scene = apartment();
  expectTargets(scene, 'left', 'wall-back', ['left/wall-back']);
  expectTargets(scene, 'right', 'wall-back', ['right/wall-back']);
});

check('Different room identities stop propagation even without a modeled divider', () => {
  const scene = apartment();
  scene.rooms = [room('front-left', -4, 0, 0, 4), room('front-right', 0, 0, 4, 4)];
  scene.walls = scene.walls.filter(item => item.id !== 'behind-divider');
  expectTargets(scene, 'left', 'wall-front', ['left/wall-front']);
});

check('A partition projecting onto the painted side stops propagation within one room polygon', () => {
  const scene = apartment();
  scene.walls.push(wall('front-divider', [0, 0], [0, 3]));
  expectTargets(scene, 'left', 'wall-front', ['left/wall-front']);
});

for (const [name, change] of [
  ['gap', (scene: SceneDocument) => { scene.walls[1]!.start = [0.2, 0]; }],
  ['parallel offset', (scene: SceneDocument) => { scene.walls[1]!.start = [0, 0.2]; scene.walls[1]!.end = [4, 0.2]; }],
  ['corner', (scene: SceneDocument) => { scene.walls[1]!.end = [0, 3]; }],
  ['different thickness', (scene: SceneDocument) => { scene.walls[1]!.thickness = 0.3; }],
  ['different height', (scene: SceneDocument) => { scene.walls[1]!.height = 3; }],
  ['different elevation', (scene: SceneDocument) => { scene.project!.metadata.right = { elevation: 0.3 }; }],
] as const) {
  check(`A ${name} does not become part of the same paint target`, () => {
    const scene = migrateScene(apartment());
    change(scene);
    expectTargets(scene, 'left', 'wall-front', ['left/wall-front']);
  });
}

check('Unrelated collinear walls do not receive paint', () => {
  const scene = apartment();
  scene.walls.push(wall('distant', [8, 0], [12, 0]));
  scene.rooms[0] = room('living', -4, 0, 12, 4);
  expectTargets(scene, 'left', 'wall-front', ['left/wall-front', 'right/wall-front']);
});

for (const blocked of ['locked', 'remove'] as const) {
  check(`A connected ${blocked} wall rejects the whole paint action`, () => {
    const scene = migrateScene(apartment());
    scene.project!.metadata.right = blocked === 'locked' ? { locked: true } : { phase: 'remove' };
    const store = new EditorStore(scene, []);
    const before = serializeScene(store.scene);
    let rejection = '';
    try { buildFinishOperations(store.scene, paint, 'left', 'wall-front'); }
    catch (error) { rejection = error instanceof Error ? error.message : String(error); }
    assert(rejection.length > 0, `The ${blocked} connected face must reject before any partial painting`);
    assert(blocked === 'locked' ? /lock/i.test(rejection) : /remov|restor/i.test(rejection), 'The rejection explains the blocked face');
    assert(serializeScene(store.scene) === before && store.revision === 0 && !store.canUndo, 'The rejected action changes neither the document nor history');
  });
}

for (const neighbor of ['unpainted', 'different'] as const) {
  check(`An already-painted clicked segment still fills its ${neighbor} neighbor`, () => {
    const scene = migrateScene(apartment());
    const existing = materialForPreset(paint);
    const other = materialForPreset(otherPaint);
    scene.project!.materials.push(existing, other);
    scene.project!.finishes.push(
      { id: 'left-front-existing', entityId: 'left', surface: 'wall-front', materialId: existing.id },
      { id: 'left-back-existing', entityId: 'left', surface: 'wall-back', materialId: other.id },
      { id: 'right-back-existing', entityId: 'right', surface: 'wall-back', materialId: other.id },
    );
    if (neighbor === 'different') scene.project!.finishes.push({ id: 'right-front-existing', entityId: 'right', surface: 'wall-front', materialId: other.id });
    const store = new EditorStore(scene, []);
    const before = serializeScene(store.scene);
    const opposite = JSON.stringify(store.scene.project!.finishes.filter(finish => finish.surface === 'wall-back'));
    const operations = buildFinishOperations(store.scene, paint, 'left', 'wall-front');
    assert(operations.length > 0, 'A matching clicked segment must not hide its unfinished neighbor');
    assert(operations.every(operation => operation.type !== 'upsert-material'), 'The existing matching paint material is reused');
    apply(store, operations);
    assert(assigned(store.scene, 'right', 'wall-front')?.materialId === existing.id, 'The connected neighbor receives the chosen paint');
    assert(assigned(store.scene, 'left', 'wall-front')?.id === 'left-front-existing', 'The clicked finish keeps its stable assignment ID');
    if (neighbor === 'different') assert(assigned(store.scene, 'right', 'wall-front')?.id === 'right-front-existing', 'Replacing neighbor paint keeps its assignment ID');
    assert(JSON.stringify(store.scene.project!.finishes.filter(finish => finish.surface === 'wall-back')) === opposite, 'Existing opposite-room finishes remain byte-for-byte unchanged');
    assert(store.scene.project!.materials.length === 2, 'Repainting does not add duplicate materials');
    assert(store.scene.project!.finishes.length === 4, 'Each physical wall side has exactly one finish assignment');
    const painted = serializeScene(store.scene);
    assert(store.undo().ok && serializeScene(store.scene) === before, 'One undo restores the partly painted wall');
    assert(store.redo().ok && serializeScene(store.scene) === painted, 'One redo restores the completed wall');
  });
}

check('Floor finish remains confined to the selected room', () => {
  const scene = apartment();
  const operations = buildFinishOperations(scene, getFinishPreset('oak')!, 'behind-left', 'floor');
  assert(equal(targets(operations), ['behind-left/floor']), 'Adjacent floors do not join the wall painting behavior');
});

if (failures.length) throw new Error(`Continuous wall finish regressions failed (${failures.length}):\n${failures.join('\n')}`);
console.log(`Continuous wall finish regressions passed: ${assertions} assertions across ${scenarios} scenarios.`);
