/** App-level regression: selection, finishes, history and import share junction topology. */
import type { Operation, SceneDocument } from '../contracts';
import { createApartmentStore } from './apartment-store';
import { demoScene, localCatalog } from './demo';
import { buildFinishOperations, getFinishPreset } from './finish-presets';
import { wallLength } from './geometry';
import { parseScene, serializeScene } from './persistence';
import { createPlanMove, previewPlanMove } from './plan-move';
import { normalizeWallJunctions } from './wall-junctions';
import { migrateScene, projectSnapshot } from './renovation';

let assertions = 0, sequence = 0;
function assert(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;
const store = createApartmentStore(demoScene, localCatalog);
function apply(operations: Operation[]): void {
  const result = store.execute({ id: `junction-app-${sequence++}`, label: 'Wall junction edit', source: 'human', baseRevision: store.revision, operations }, true);
  assert(result.ok, result.errors.join(' '));
}
const initial = serializeScene(store.scene);
const spine = store.scene.walls.find(wall => wall.id === 'wall-spine')!;
const bedroomSpine = store.scene.walls.find(wall => equal(wall.start, [0.6, 0.4]) && equal(wall.end, [0.6, 4]))!;
assert(near(wallLength(spine), 4.4) && !!bedroomSpine && near(wallLength(bedroomSpine), 3.6), 'the screenshot wall opens as two separately identified sections');
assert(store.scene.version === 1 && !store.canUndo && store.revision === 0, 'opening v1 preserves its version and does not invent an edit');
assert(demoScene.walls.length === 7 && wallLength(demoScene.walls[4]!) === 8, 'source demo stays untouched');
assert(spine.openings[0]?.id === 'door-kitchen' && bedroomSpine.openings[0]?.id === 'door-bedroom', 'doors belong to their own selectable section');
assert(near(bedroomSpine.openings[0]!.offset, 0.6), 'door world position survives the section boundary');

const preset = getFinishPreset('sage');
// Use the exported preset catalog's stable identifier rather than a test-only material path.
assert(preset, 'quiet sage wall finish exists');
apply(buildFinishOperations(store.scene, preset, bedroomSpine.id, 'wall-front'));
assert(store.scene.project!.finishes.some(f => f.entityId === bedroomSpine.id), 'paint applies to selected section');
assert(store.scene.project!.finishes.some(f => f.entityId === spine.id && f.surface === 'wall-front'), 'the continuous Living face paints across the divider on its opposite side');
assert(store.undo().ok && serializeScene(store.scene) === initial, 'one undo restores the exact unpainted apartment');

apply(buildFinishOperations(store.scene, preset, bedroomSpine.id, 'wall-back'));
assert(store.scene.project!.finishes.some(f => f.entityId === bedroomSpine.id && f.surface === 'wall-back'), 'the Bedroom side receives its own paint');
assert(!store.scene.project!.finishes.some(f => f.entityId === spine.id), 'paint on the Bedroom side stops at the divider into Kitchen');
assert(store.undo().ok && serializeScene(store.scene) === initial, 'one undo restores independent opposite-side paint');

apply([{ type: 'delete-wall', id: 'wall-bedroom' }]);
assert(near(wallLength(store.scene.walls.find(wall => wall.id === spine.id)!), 8), 'removing the touching divider reconnects the 8 m wall');
assert(!store.scene.walls.some(wall => wall.id === bedroomSpine.id), 'reconnected section has one selectable identity');
assert(store.scene.walls.find(wall => wall.id === spine.id)!.openings.length === 2, 'both doors remain on the reconnected wall');
const connected = serializeScene(store.scene);
assert(store.undo().ok && serializeScene(store.scene) === initial, 'undo restores divider and distinct wall sections in one action');
assert(store.redo().ok && serializeScene(store.scene) === connected, 'redo restores exact reconnection');
assert(serializeScene(parseScene(connected, localCatalog)) === connected, 'project export/import remains lossless');

apply([{ type: 'replace-scene', scene: demoScene }]);
assert(near(wallLength(store.scene.walls.find(wall => wall.id === spine.id)!), 4.4), 'loading an original long-wall scene splits junctions again');
const before = store.scene, revision = store.revision;
const result = store.execute({ id: 'rejected-junction', source: 'human', label: 'Invalid short segment', baseRevision: revision,
  operations: [{ type: 'add-wall', wall: { id: 'tiny-divider', start: [0.6, -3.98], end: [2, -3.98], height: 2.7, thickness: 0.16, color: '#eeeeee', openings: [] } }] }, true);
assert(!result.ok && store.scene === before && store.revision === revision, 'unrepresentable junction rejects atomically');

const move = createPlanMove(store.scene, spine.id)!;
const preview = previewPlanMove(move, [0.1, 0], false, localCatalog, normalizeWallJunctions);
assert(preview.scene && preview.operation, `segment movement preview succeeds: ${preview.error}`);
apply([preview.operation]);
assert(equal(store.scene, preview.scene), 'app drag preview and committed topology agree');
assert(store.undo().ok && store.scene === before, 'segment movement is one reversible command');

const incoming: SceneDocument = structuredClone(demoScene);
incoming.walls = incoming.walls.filter(wall => wall.id !== 'wall-bedroom');
const incomingNormalized = normalizeWallJunctions(incoming);
apply([{ type: 'replace-scene', scene: incomingNormalized }]);
assert(equal(store.scene, incomingNormalized), 'scene replacement normalizes independently of old apartment junctions');

const crossingScene: SceneDocument = {
  ...structuredClone(demoScene), objects: [], walls: [
    { id: 'extend', start: [-2, 0], end: [-1, 0], height: 2.7, thickness: 0.16, color: '#eeeeee', openings: [] },
    { id: 'cross', start: [0, -2], end: [0, 2], height: 2.7, thickness: 0.16, color: '#eeeeee', openings: [] },
  ],
};
const crossingStore = createApartmentStore(crossingScene, []);
const endpoint = createPlanMove(crossingStore.scene, 'extend', 'end')!;
const crossingPreview = previewPlanMove(endpoint, [3, 0], false, [], normalizeWallJunctions);
assert(crossingPreview.scene?.walls.length === 4 && crossingPreview.operation, 'endpoint preview splits both walls at a new crossing');
const crossingCommit = crossingStore.execute({ id: 'extend-crossing', source: 'human', label: 'Extend wall', baseRevision: 0, operations: [crossingPreview.operation] }, true);
assert(crossingCommit.ok && equal(crossingStore.scene, crossingPreview.scene), 'new-crossing preview agrees exactly with one committed edit');
assert(crossingStore.undo().ok && equal(crossingStore.scene, crossingScene), 'undo removes the new crossing and its sections');

const archived = migrateScene({ ...structuredClone(demoScene), objects: [] });
archived.project!.baseline = projectSnapshot(archived);
archived.project!.assumptions.push({ id: 'recorded-spine', entityId: 'wall-spine', property: 'length', value: '8 m', status: 'accepted', sourceKind: 'observed', sourceIds: [], rationale: 'Recorded before segmentation', alternatives: [] });
archived.project!.tasks.push({ id: 'inspect-spine', title: 'Inspect wall', trade: 'General', status: 'todo', entityIds: ['wall-spine'], dependsOn: [], allowance: 0 });
const archivedStore = createApartmentStore(archived, []);
const restored = archivedStore.execute({ id: 'restore-unsplit-baseline', source: 'human', label: 'Restore baseline', baseRevision: 0, operations: [{ type: 'restore-baseline' }] }, true);
assert(restored.ok, `baseline with wall evidence restores after initial segmentation: ${restored.errors.join(' ')}`);
const malformedBefore = archivedStore.scene;
const malformed = archivedStore.execute({ id: 'bad-opening-after-restore', source: 'human', label: 'Malformed imported wall', baseRevision: archivedStore.revision, operations: [
  { type: 'restore-baseline' },
  { type: 'add-wall', wall: { id: 'invalid-opening-wall', start: [-2, -2], end: [2, -2], height: 2.7, thickness: 0.16, color: '#eeeeee', openings: [{ id: 'outside-window', kind: 'window', offset: 5, width: 1, height: 1, sill: 1 }] } },
] }, true);
assert(!malformed.ok && archivedStore.scene === malformedBefore, 'normalization cannot discard an invalid opening to make a transaction pass');
console.log(`Apartment wall junction checks passed (${assertions} assertions).`);
