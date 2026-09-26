/** Run: node apps/editor/scripts/check-structural-wall-confirmation.mjs */
import type { Operation, SceneDocument, StructuralRole, Wall } from '../contracts';
import { previewSelectionOperations } from './multi-selection';
import { migrateScene } from './renovation';
import { mayChangeWallStructure, structuralWallChanges } from './structural-wall-confirmation';
import { normalizeWallJunctions } from './wall-junctions';

let assertions = 0;
function assert(condition: unknown, message: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(`Structural wall confirmation check failed: ${message}`);
}
const equal = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);
const wall = (id: string, start: Wall['start'], end: Wall['end']): Wall => ({
  id, start, end, height: 3, thickness: 0.2, color: '#ffffff', openings: [],
});
function sceneWith(role: StructuralRole = 'structural', mode: 'correct' | 'renovate' = 'correct'): SceneDocument {
  const scene = migrateScene({
    format: 'varpet.editor', version: 1, id: 'wall-confirmation', name: 'Wall confirmation checks', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Room', color: '#eeeeee', polygon: [[-1, -1], [8, -1], [8, 8], [-1, 8]] }],
    walls: [wall('main', [0, 0], [6, 0])], objects: [],
  });
  scene.walls[0]!.openings = [{ id: 'window', kind: 'window', offset: 1, width: 1.2, height: 1.4, sill: 0.8 }];
  scene.project!.mode = mode;
  scene.project!.metadata.main = { structuralRole: role, name: 'Main wall', phase: 'existing', boundary: 'exterior', locked: false };
  return scene;
}
function inspect(scene: SceneDocument, operations: Operation[], normalize = false) {
  const original = JSON.stringify(scene), command = JSON.stringify(operations);
  const candidate = previewSelectionOperations(scene, operations, [], normalize ? normalizeWallJunctions : undefined);
  const result = structuralWallChanges(scene, candidate, operations);
  assert(JSON.stringify(scene) === original && JSON.stringify(operations) === command, 'inspection preserves the source scene and proposed operations');
  return result;
}
const ids = (changes: ReturnType<typeof inspect>) => changes.map(change => change.id);

for (const mode of ['correct', 'renovate'] as const) for (const role of ['structural', 'unknown'] as const) {
  const scene = sceneWith(role, mode);
  const dimensionChanges: Operation[] = [
    { type: 'update-wall', id: 'main', patch: { height: 3.1 } },
    { type: 'update-wall', id: 'main', patch: { thickness: 0.25 } },
    { type: 'update-wall', id: 'main', patch: { start: [0, 0.2], end: [6, 0.2] } },
    { type: 'set-metadata', id: 'main', patch: { elevation: 0.2 } },
    { type: 'update-opening', id: 'window', patch: { width: 1.3 } },
    { type: 'update-opening', id: 'window', patch: { offset: 1.1 } },
    { type: 'update-opening', id: 'window', patch: { height: 1.5 } },
    { type: 'update-opening', id: 'window', patch: { sill: 0.9 } },
    { type: 'delete-opening', id: 'window' },
    { type: 'add-opening', wallId: 'main', opening: { id: 'new-window', kind: 'window', offset: 3, width: 1, height: 1.4, sill: 0.8 } },
    { type: 'delete-wall', id: 'main' },
    { type: 'split-wall', id: 'main', offset: 3, newId: 'main-second' },
    { type: 'set-metadata', id: 'main', patch: { phase: 'remove' } },
    { type: 'set-metadata', id: 'main', patch: { phase: 'replace' } },
    { type: 'set-metadata', id: 'window', patch: { phase: 'remove' } },
  ];
  for (const operation of dimensionChanges) {
    const changes = inspect(scene, [operation]);
    assert(changes.length === 1 && changes[0]!.id === 'main' && changes[0]!.role === role, `${role} ${mode}: ${operation.type} identifies the affected wall with its truthful role`);
    assert(changes[0]!.name === 'Main wall' && changes[0]!.boundary === 'exterior', 'wall display name and boundary remain available for confirmation copy');
  }
  const appearanceChanges: Operation[][] = [
    [{ type: 'update-wall', id: 'main', patch: { color: '#aabbcc' } }],
    [{ type: 'update-wall', id: 'main', patch: { height: 3, start: [0, 0], end: [6, 0] } }],
    [{ type: 'set-metadata', id: 'main', patch: { name: 'Renamed', notes: 'Measured on site', locked: true } }],
    [{ type: 'set-metadata', id: 'main', patch: { phase: 'retain' } }],
    [{ type: 'set-metadata', id: 'window', patch: { mechanism: 'sliding', hinge: 'right', swing: -1 } }],
    [{ type: 'update-opening', id: 'window', patch: { kind: 'window' } }, { type: 'set-metadata', id: 'window', patch: { mechanism: 'fixed' } }],
    [{ type: 'update-opening', id: 'window', patch: { width: 1.2, height: 1.4, sill: 0.8, offset: 1 } }],
    [
      { type: 'upsert-material', material: { id: 'paint', name: 'Paint', color: '#ccddff', unit: 'm2', unitCost: 0, thickness: 0, wastePercent: 0 } },
      { type: 'upsert-finish', finish: { id: 'paint-finish', entityId: 'main', materialId: 'paint', surface: 'wall-front' } },
    ],
  ];
  for (const operations of appearanceChanges) assert(inspect(scene, operations).length === 0, `${role} ${mode}: appearance, product and unchanged dimensions do not prompt`);
}

const partition = sceneWith('partition');
assert(inspect(partition, [{ type: 'update-wall', id: 'main', patch: { thickness: 0.5 } }]).length === 0, 'an exterior partition is not reclassified from its thickness or boundary');
assert(inspect(sceneWith('structural'), [{ type: 'set-metadata', id: 'main', patch: { structuralRole: 'partition' } }, { type: 'update-wall', id: 'main', patch: { height: 3.1 } }])[0]?.role === 'structural', 'same-command reclassification cannot bypass an existing structural classification');
assert(inspect(partition, [{ type: 'set-metadata', id: 'main', patch: { structuralRole: 'structural' } }, { type: 'update-wall', id: 'main', patch: { height: 3.1 } }])[0]?.role === 'structural', 'a new structural classification is respected by the same command');

const connected = sceneWith('partition');
connected.walls.push(wall('connected-main', [6, 0], [6, 5]));
connected.project!.metadata['connected-main'] = { structuralRole: 'structural', phase: 'existing' };
assert(equal(ids(inspect(connected, [{ type: 'update-wall', id: 'main', patch: { start: [0, 0.2], end: [6, 0.2] } }])), ['connected-main']), 'moving a partition warns about its indirectly stretched structural neighbour');
assert(equal(ids(inspect(connected, [
  { type: 'update-wall', id: 'main', patch: { start: [0, 0.2], end: [6, 0.2] } },
  { type: 'update-wall', id: 'connected-main', patch: { start: [6, 0.2], end: [6, 5.2] } },
])), ['connected-main']), 'batch translation uses the store’s connected-wall result');

const toJoin = sceneWith();
toJoin.walls.push(wall('main-next', [6, 0], [8, 0]));
toJoin.project!.metadata['main-next'] = { ...toJoin.project!.metadata.main, name: 'Next wall' };
assert(equal(ids(inspect(toJoin, [{ type: 'join-walls', id: 'main', otherId: 'main-next' }])), ['main', 'main-next']), 'joining identifies both original structural walls');

const legacy = sceneWith();
legacy.version = 1;
delete legacy.project;
assert(inspect(legacy, [{ type: 'update-wall', id: 'main', patch: { height: 3.1 } }])[0]?.role === 'unknown', 'legacy walls without metadata remain explicitly unconfirmed');

const normalized = normalizeWallJunctions(connected);
assert(equal(ids(inspect(normalized, [{ type: 'update-wall', id: 'main', patch: { start: [0, 0.2], end: [6, 0.2] } }], true)), ['connected-main']), 'normalized candidate includes connected structural changes');

const frozen = sceneWith();
const unchanged = structuredClone(frozen);
unchanged.walls[0]!.openings.push({ id: 'second-window', kind: 'window', offset: 4, width: 1, height: 1.4, sill: 0.8 });
frozen.walls[0]!.openings.push({ id: 'second-window', kind: 'window', offset: 4, width: 1, height: 1.4, sill: 0.8 });
unchanged.walls[0]!.openings = [...unchanged.walls[0]!.openings].reverse();
assert(structuralWallChanges(frozen, unchanged, [{ type: 'update-opening', id: 'window', patch: { width: 1.2 } }]).length === 0, 'opening array order is not a physical alteration');

const imported = sceneWith();
imported.walls[0]!.height = 3.2;
assert(inspect(sceneWith(), [{ type: 'replace-scene', scene: imported }]).length === 0, 'a separately reviewed import does not enter the direct wall-edit confirmation');
assert(!mayChangeWallStructure({ type: 'update-wall', id: 'main', patch: { color: '#aabbcc' } }), 'paint skips the expensive geometry preflight');
assert(!mayChangeWallStructure({ type: 'update-opening', id: 'window', patch: { kind: 'window' } }), 'window product edits skip the expensive geometry preflight');
assert(!mayChangeWallStructure({ type: 'switch-option', id: 'saved-option' }), 'saved-option navigation skips the direct wall-edit confirmation');

console.log(`Structural wall confirmation checks passed (${assertions} assertions).`);
