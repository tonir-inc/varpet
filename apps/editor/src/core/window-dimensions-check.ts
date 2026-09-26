import type { EntityMetadata, Operation, SceneDocument } from '../contracts';
import { demoScene } from './demo';
import { migrateScene } from './renovation';
import { serializeScene } from './persistence';
import { EditorStore } from './store';
import { buildWindowDimensionOperations, windowDimensionTargets, type WindowDimensionMatch } from './window-dimensions';

let assertions = 0;
let scenarios = 0;
const failures: string[] = [];
function assert(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
const equal = (actual: unknown, expected: unknown, message: string) => assert(JSON.stringify(actual) === JSON.stringify(expected), message);
function check(name: string, run: () => void): void {
  scenarios++;
  try { run(); } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
}
function rejects(run: () => unknown, pattern: RegExp, message: string): void {
  let error: unknown;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof Error && pattern.test(error.message), message);
}
function scene(version: 1 | 2 = 2): SceneDocument {
  const shell: SceneDocument = {
    ...structuredClone(demoScene), objects: [],
    rooms: [{ id: 'room', name: 'Room', polygon: [[0, 0], [12, 0], [12, 12], [0, 12]], color: '#eeeeee' }],
    walls: [
      { id: 'source-wall', start: [0, 0], end: [12, 0], height: 3, thickness: 0.1, color: '#eeeeee', openings: [
        { id: 'source', kind: 'window', offset: 1, width: 1.6, height: 1.5, sill: 0.8 },
      ] },
      { id: 'target-wall', start: [0, 4], end: [12, 4], height: 3, thickness: 0.1, color: '#eeeeee', openings: [
        { id: 'first', kind: 'window', offset: 1, width: 1, height: 1, sill: 1 },
        { id: 'second', kind: 'window', offset: 4, width: 0.8, height: 1.2, sill: 0.5 },
        { id: 'door', kind: 'door', offset: 8, width: 0.9, height: 2, sill: 0 },
      ] },
      { id: 'matching-wall', start: [0, 8], end: [12, 8], height: 3, thickness: 0.1, color: '#eeeeee', openings: [
        { id: 'matching', kind: 'window', offset: 2, width: 1.6, height: 1.5, sill: 0.9 },
      ] },
    ],
  };
  if (version === 1) return shell;
  const result = migrateScene(shell);
  result.project!.metadata.first = { name: 'Kitchen window', mechanism: 'casement', frameWidth: 0.04, hinge: 'right', swing: -1, notes: 'Keep hardware', phase: 'retain' };
  return result;
}
function execute(store: EditorStore, operations: Operation[]) {
  return store.execute({ id: crypto.randomUUID(), label: 'Match window dimensions', source: 'human', baseRevision: store.revision, operations }, true);
}
const opening = (value: SceneDocument, id: string) => value.walls.flatMap(wall => wall.openings).find(item => item.id === id)!;

check('Height and size matching preserve unrelated geometry and metadata', () => {
  for (const match of ['height', 'size'] as const) {
    const input = scene();
    const store = new EditorStore(input, []);
    const before = serializeScene(store.scene);
    equal(windowDimensionTargets(store.scene, 'source', match).map(target => target.opening.id), ['first', 'second'], 'Only changed other windows are targets');
    const operations = buildWindowDimensionOperations(store.scene, 'source', match);
    assert(serializeScene(store.scene) === before, 'Building the batch does not mutate the frozen source');
    const applied = execute(store, operations);
    assert(applied.ok, applied.errors.join(' '));
    for (const id of ['first', 'second']) equal(opening(store.scene, id), { ...opening(input, id), height: 1.5, ...(match === 'size' ? { width: 1.6 } : {}) }, 'Only the requested size fields change');
    for (const id of ['source', 'door', 'matching']) equal(opening(store.scene, id), opening(input, id), 'Source, doors and already matching windows stay unchanged');
    equal(store.scene.project!.metadata, input.project!.metadata, 'Names, mechanisms, frames, orientation and phases remain in correction mode');
    equal(store.scene.rooms, input.rooms, 'Rooms stay unchanged');
    assert(store.revision === 1 && store.canUndo, 'The complete batch is one command');
    const after = serializeScene(store.scene);
    assert(store.undo().ok && serializeScene(store.scene) === before && !store.canUndo, 'One undo restores every target');
    assert(store.redo().ok && serializeScene(store.scene) === after, 'One redo restores the entire batch');
    equal(buildWindowDimensionOperations(store.scene, 'source', match), [], 'Matching dimensions are a no-op');
  }
});

check('Height-only keeps differing widths and size matching discovers them', () => {
  const input = scene();
  opening(input, 'first').height = 1.5;
  equal(windowDimensionTargets(input, 'source', 'height').map(target => target.opening.id), ['second'], 'Same height is already matched');
  equal(windowDimensionTargets(input, 'source', 'size').map(target => target.opening.id), ['first', 'second'], 'Different width still needs size matching');
});

check('Removed windows and removed host walls are excluded', () => {
  const input = scene();
  input.project!.metadata.first = { phase: 'remove', locked: true };
  input.project!.metadata['matching-wall'] = { phase: 'remove', locked: true };
  opening(input, 'matching').height = 1;
  equal(windowDimensionTargets(input, 'source', 'size').map(target => target.opening.id), ['second'], 'Removed targets and hosts are absent');
  const operations = buildWindowDimensionOperations(input, 'source', 'size');
  equal(operations.map(operation => 'id' in operation ? operation.id : operation.type), ['second'], 'Only the active target is edited');
});

check('Source and target edit guards prevent silent partial application', () => {
  for (const id of ['source', 'source-wall']) {
    for (const metadata of [{ locked: true }, { phase: 'remove' }] as EntityMetadata[]) {
      const input = scene(); input.project!.metadata[id] = metadata;
      rejects(() => buildWindowDimensionOperations(input, 'source', 'height'), /locked|removal|restore/i, 'Locked or removed source and host reject');
    }
  }
  for (const id of ['second', 'target-wall']) {
    const input = scene(); input.project!.metadata[id] = { locked: true };
    const before = serializeScene(input);
    assert(windowDimensionTargets(input, 'source', 'height').length === 2, 'Target count includes locked changed windows');
    rejects(() => buildWindowDimensionOperations(input, 'source', 'height'), /locked/i, 'A locked changed target or host blocks the batch');
    assert(serializeScene(input) === before, 'Rejected batch building preserves all scene data');
  }
  const unchanged = scene(); unchanged.project!.metadata.matching = { locked: true }; unchanged.project!.metadata['matching-wall'] = { locked: true };
  assert(buildWindowDimensionOperations(unchanged, 'source', 'size').length === 2, 'Locked unchanged windows do not block edits elsewhere');
});

check('Invalid source identities and matching modes reject', () => {
  for (const id of ['missing', 'door', 'room']) {
    rejects(() => windowDimensionTargets(scene(), id, 'height'), /window/i, 'Discovery requires an existing window source');
    rejects(() => buildWindowDimensionOperations(scene(), id, 'size'), /window/i, 'Building requires an existing window source');
  }
  rejects(() => buildWindowDimensionOperations(scene(), 'source', 'width' as WindowDimensionMatch), /height|size/i, 'Unknown matching mode rejects');
});

check('Fit, overlap and perpendicular-wall failures roll back every window', () => {
  const cases: { name: string; prepare(value: SceneDocument): void; match: WindowDimensionMatch; error: RegExp }[] = [
    { name: 'height', prepare: value => { opening(value, 'second').sill = 1.8; }, match: 'height', error: /bounds/i },
    { name: 'width', prepare: value => { opening(value, 'second').offset = 11; }, match: 'size', error: /bounds/i },
    { name: 'overlap', prepare: value => { opening(value, 'second').offset = 7; }, match: 'size', error: /overlap/i },
    { name: 'intersecting wall', prepare: value => { value.walls.push({ id: 'obstacle', start: [5.4, 3], end: [5.4, 5], height: 3, thickness: 0.1, color: '#eeeeee', openings: [] }); }, match: 'size', error: /intersects wall/i },
  ];
  for (const scenario of cases) {
    const input = scene(); scenario.prepare(input);
    const store = new EditorStore(input, []);
    const before = serializeScene(store.scene);
    const result = execute(store, buildWindowDimensionOperations(store.scene, 'source', scenario.match));
    assert(!result.ok && result.errors.some(message => scenario.error.test(message)), `Invalid ${scenario.name} is rejected by the real command path`);
    assert(serializeScene(store.scene) === before && store.revision === 0 && !store.canUndo && !store.canRedo, `Invalid ${scenario.name} leaves every window and history unchanged`);
  }
});

check('Version 1 migration is explicit, atomic and undoable', () => {
  const store = new EditorStore(scene(1), []);
  const before = serializeScene(store.scene);
  const operations = buildWindowDimensionOperations(store.scene, 'source', 'size');
  assert(operations[0]?.type === 'migrate-project', 'Legacy migration is an explicit operation');
  assert(execute(store, operations).ok && store.scene.version === 2, 'Migration and dimensions commit together');
  assert(store.undo().ok && serializeScene(store.scene) === before, 'Undo restores the full version 1 document');
  const unchanged = scene(1); for (const target of unchanged.walls.flatMap(wall => wall.openings).filter(item => item.kind === 'window')) target.height = 1.5;
  equal(buildWindowDimensionOperations(unchanged, 'source', 'height'), [], 'No-op matching does not migrate legacy data');
});

check('Assumptions stale through dependencies and renovation review stays intact', () => {
  const input = scene();
  input.project!.mode = 'renovate';
  input.project!.metadata.second = { phase: 'new' };
  input.project!.sources.push({ id: 'measurement', kind: 'measurement', name: 'Window measurement' });
  input.project!.assumptions = [
    { id: 'size-evidence', entityId: 'first', property: 'height', value: '1 m', status: 'accepted', sourceKind: 'inferred', sourceIds: [], rationale: 'Photo', alternatives: [] },
    { id: 'dependent', entityId: 'room', property: 'daylight', value: 'Adequate', status: 'verified', sourceKind: 'inferred', sourceIds: ['measurement'], rationale: 'Opening area', alternatives: [], dependsOn: ['size-evidence'] },
    { id: 'source-evidence', entityId: 'source', property: 'height', value: '1.5 m', status: 'verified', sourceKind: 'measured', sourceIds: ['measurement'], rationale: 'Measurement', alternatives: [] },
  ];
  const store = new EditorStore(input, []);
  assert(execute(store, buildWindowDimensionOperations(store.scene, 'source', 'height')).ok, 'Renovation batch commits');
  equal(store.scene.project!.assumptions.map(assumption => assumption.status), ['stale', 'stale', 'verified'], 'Affected and dependent evidence stales; source evidence remains verified');
  equal(store.scene.project!.metadata.first, { ...input.project!.metadata.first, phase: 'replace', review: 'required' }, 'Existing target preserves hardware and gets renovation review');
  assert(store.scene.project!.metadata.second?.phase === 'new' && store.scene.project!.metadata.second.review === 'required', 'New window stays new and requires review');
  assert(store.scene.project!.metadata['target-wall']?.review === 'required', 'Host follows normal alteration review semantics');
});

check('Command limit includes migration and fails before creating a partial batch', () => {
  function many(count: number, version: 1 | 2): SceneDocument {
    const input = scene(1);
    input.rooms[0]!.polygon = [[0, 0], [80, 0], [80, 80], [0, 80]];
    input.walls = [];
    for (let index = 0; index <= count; index++) {
      const row = Math.floor(index / 16);
      if (index % 16 === 0) input.walls.push({ id: `wall-${row}`, start: [0, row * 4], end: [80, row * 4], height: 3, thickness: 0.1, color: '#eeeeee', openings: [] });
      input.walls[row]!.openings.push({ id: index ? `window-${index}` : 'source', kind: 'window', offset: 1 + index % 16 * 4, width: 1, height: index ? 1 : 1.5, sill: 0.8 });
    }
    return version === 2 ? migrateScene(input) : input;
  }
  for (const [count, version] of [[100, 2], [99, 1]] as const) {
    const input = many(count, version);
    const operations = buildWindowDimensionOperations(input, 'source', 'height');
    assert(operations.length === 100, 'Exactly 100 operations including any migration are allowed');
    assert(execute(new EditorStore(input, []), operations).ok, 'Largest allowed batch passes the store');
  }
  for (const [count, version] of [[101, 2], [100, 1]] as const) {
    const input = many(count, version); const before = serializeScene(input);
    rejects(() => buildWindowDimensionOperations(input, 'source', 'height'), /100|fewer|individually/i, 'Oversize batch explains the bounded edit');
    assert(serializeScene(input) === before, 'Command cap rejection preserves the source');
  }
});

if (failures.length) throw new Error(`Window dimension checks failed (${failures.length}):\n${failures.join('\n')}`);
console.log(`Window dimension checks passed: ${assertions} assertions across ${scenarios} scenarios.`);
