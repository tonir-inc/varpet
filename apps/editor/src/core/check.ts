/** Independent domain verification. Run: pnpm dlx tsx apps/editor/src/core/check.ts */
import type { CatalogAsset, EditCommand, Room, SceneDocument } from '../contracts';
import { catalogAdapter, designerAdapter, structureAdapter } from '../adapters/mock';
import { demoScene, localCatalog } from './demo';
import { loadLocal, parseScene, saveLocal, serializeScene, STORAGE_KEY } from './persistence';
import { EditorStore } from './store';
import { validateScene } from './validation';

let assertions = 0;
function assert(condition: unknown, description: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(`Domain check failed: ${description}`);
}
function throws(action: () => unknown, description: string): void {
  let didThrow = false;
  try { action(); } catch { didThrow = true; }
  assert(didThrow, description);
}
function rectangle(id: string, x1: number, z1: number, x2: number, z2: number): Room {
  return { id, name: id, color: '#dddddd', polygon: [[x1, z1], [x2, z1], [x2, z2], [x1, z2]] };
}

const initial = validateScene(demoScene, localCatalog);
assert(initial.ok && initial.warnings.length === 0, `demo is valid and collision-free: ${initial.errors.join(' ')} ${initial.warnings.join(' ')}`);
const store = new EditorStore(demoScene, localCatalog);
const command = (id: string, operations: EditCommand['operations'], source: EditCommand['source'] = 'human'): EditCommand =>
  ({ id, label: id, source, baseRevision: store.revision, operations });
let events = 0;
const unsubscribe = store.subscribe(change => {
  events++;
  assert(change.scene === store.scene && change.revision === store.revision, 'subscription observes the committed revision');
});
const restyle = command('restyle', [{ type: 'update', id: 'sofa', patch: { color: '#be775d' } }], 'designer');
assert(!store.execute(restyle, false).ok && store.revision === 0, 'unapproved proposals cannot mutate');
assert(store.execute(restyle, true).ok && Number(store.revision) === 1, 'approved proposal commits once');
assert(!store.execute({ ...restyle, baseRevision: store.revision }, true).ok, 'command IDs are replay protected');
assert(!store.execute({ ...restyle, id: 'stale', baseRevision: 0 }, true).ok, 'stale proposals are rejected');
assert(!store.execute({ ...restyle, id: 'bad-source', source: ['human'] as unknown as EditCommand['source'], baseRevision: store.revision }, true).ok, 'source must be a string');
assert(!store.execute({ ...restyle, id: 'bad-source-object', source: { toString: 'human' } as unknown as EditCommand['source'], baseRevision: store.revision }, true).ok, 'untrusted source does not coerce or throw');
const beforeInvalid = store.scene;
assert(!store.execute(command('bad-batch', [
  { type: 'update', id: 'sofa', patch: { color: '#111111' } },
  { type: 'update', id: 'bed', patch: { position: [50, 0, 50] } },
]), true).ok, 'invalid transaction is rejected');
assert(store.scene === beforeInvalid && Number(store.revision) === 1 && events === 1, 'invalid transaction has no partial mutation, history or notification');
const snapshot = store.scene;
throws(() => { snapshot.objects[0]!.position[0] = 999; }, 'external snapshot vectors are immutable');
assert(Object.isFrozen(store.scene) && Object.isFrozen(store.scene.rooms[0]!.polygon), 'snapshot is deeply frozen');
assert(store.undo().ok && Number(store.revision) === 2, 'undo advances revision');
assert(store.scene.objects.find(object => object.id === 'sofa')!.color === undefined, 'undo restores exact prior values');
assert(store.redo().ok && Number(store.revision) === 3, 'redo advances revision');
assert(store.undo().ok && Number(store.revision) === 4, 'second undo works');
assert(store.execute(command('new-branch', [{ type: 'update', id: 'sofa', patch: { name: 'My sofa' } }]), true).ok && !store.canRedo, 'new edit clears redo branch');
assert(!store.execute(command('missing-object', [{ type: 'delete', id: 'missing' }]), true).ok, 'missing object mutation rejects');
assert(!store.execute(command('illegal-patch', [{ type: 'update', id: 'sofa', patch: { assetId: 'not-allowed' } as never }]), true).ok, 'patch cannot change identity or asset');
unsubscribe();
const oldEvents = events;
store.undo();
assert(events === oldEvents, 'unsubscribe removes listener');

const exported = serializeScene(store.scene);
assert(serializeScene(parseScene(exported, localCatalog)) === exported, 'JSON export/import is lossless');
for (const bad of ['', '{', 'null', '[]', '{"format":"varpet.editor","version":9}', '{"__proto__":{"polluted":true}}']) throws(() => parseScene(bad, localCatalog), `malformed JSON/schema rejected: ${bad}`);
const brokenAsset = structuredClone(demoScene);
brokenAsset.objects[0]!.assetId = 'missing-asset';
throws(() => parseScene(JSON.stringify(brokenAsset), localCatalog), 'unknown assets reject imports');
for (const badNumber of [NaN, Infinity, -Infinity, 1e99]) {
  const invalid = structuredClone(demoScene);
  invalid.objects[0]!.rotation = badNumber;
  assert(!validateScene(invalid, localCatalog).ok, 'non-finite/extreme rotations rejected');
}
assert(!validateScene(demoScene, [null] as unknown as CatalogAsset[]).ok, 'malformed catalog rejects without throwing');
assert(!validateScene(demoScene, undefined as unknown as CatalogAsset[]).ok, 'missing catalog rejects without throwing');
const malformedCatalog = structuredClone(localCatalog);
malformedCatalog[0]!.color = ['#ffffff'] as never;
assert(!validateScene(demoScene, malformedCatalog).ok, 'catalog colors cannot use coerced values');
const malformedOpening = structuredClone(demoScene);
malformedOpening.walls[0]!.openings[0]!.kind = ['door'] as never;
assert(!validateScene(malformedOpening, localCatalog).ok, 'opening kinds cannot use coerced values');

const probeCatalog: CatalogAsset[] = [{ id: 'probe', name: 'Probe', category: 'Checks', kind: 'table', dimensions: [1, 0.5, 1], color: '#aaaaaa', price: 1, source: { type: 'procedural' } }];
const probe: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'probe-scene', name: 'Probe scene', units: 'm', upAxis: 'Y',
  rooms: [rectangle('floor', -2, -2, 2, 2)], walls: [],
  objects: [{ id: 'probe-object', name: 'Probe object', assetId: 'probe', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] }],
};
assert(validateScene(probe, probeCatalog).ok, 'ordinary floor support passes');
probe.rooms = [rectangle('left', -2, -2, 0, 2), rectangle('right', 0, -2, 2, 2)];
assert(validateScene(probe, probeCatalog).ok, 'object can span adjacent floor polygons');
probe.rooms = [rectangle('left', -2, -2, -0.1, 2), rectangle('right', 0.1, -2, 2, 2)];
assert(!validateScene(probe, probeCatalog).ok, 'room gap rejects even when every object corner is supported');
probe.rooms = [rectangle('west', -2, -2, -0.1, 2), rectangle('east', 0.1, -2, 2, 2), rectangle('south', -0.1, -2, 0.1, -0.1), rectangle('north', -0.1, 0.1, 0.1, 2)];
assert(!validateScene(probe, probeCatalog).ok, 'interior floor hole rejects even when every object edge is supported');
probe.rooms = [rectangle('floor', -2, -2, 2, 2)];
probe.objects[0]!.position = [1.45, 0, 1.45];
probe.objects[0]!.rotation = Math.PI / 4;
assert(!validateScene(probe, probeCatalog).ok, 'rotated footprint corners remain inside floor');
probe.objects[0]!.position = [0, 0.5, 0];
assert(!validateScene(probe, probeCatalog).ok, 'unsupported elevated objects reject');
probe.objects[0]!.position = [0, 0, 0];
probe.objects[0]!.rotation = 0;
probe.walls = [{ id: 'divider', start: [0, -2], end: [0, 2], height: 2.7, thickness: 0.16, color: '#dddddd', openings: [] }];
assert(!validateScene(probe, probeCatalog).ok, 'solid wall collisions reject');
probe.walls[0]!.openings = [{ id: 'passage', kind: 'door', offset: 1.4, width: 1.2, height: 2, sill: 0 }];
assert(validateScene(probe, probeCatalog).ok, 'furniture fitting a floor-level door is supported');
probe.walls[0]!.openings[0]!.kind = 'window';
assert(!validateScene(probe, probeCatalog).ok, 'windows are not floor passages');
probe.walls[0]!.openings[0]!.kind = 'door';
probe.walls[0]!.openings[0]!.height = 0.3;
assert(!validateScene(probe, probeCatalog).ok, 'objects cannot penetrate the lintel above a door');
probe.walls = [];
probe.rooms[0]!.polygon = [[-2, -2], [2, 2], [-2, 2], [2, -2]];
assert(!validateScene(probe, probeCatalog).ok, 'self-intersecting floor polygons reject');

const historyStore = new EditorStore({ ...demoScene, objects: [] }, localCatalog);
for (let index = 0; index < 105; index++) {
  const rooms = structuredClone(historyStore.scene.rooms);
  rooms[0]!.name = `Room ${index}`;
  assert(historyStore.execute({ id: `history-${index}`, label: 'Rename room', source: 'human', baseRevision: historyStore.revision, operations: [{ type: 'replace-structure', rooms, walls: historyStore.scene.walls }] }, true).ok, 'history edit succeeds');
}
let undoCount = 0;
while (historyStore.canUndo) { assert(historyStore.undo().ok, 'bounded undo succeeds'); undoCount++; }
assert(undoCount === 100 && historyStore.revision === 205, 'history is bounded to 100 snapshots and revision stays monotonic');

const saved = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => { saved.set(key, value); },
} });
assert(loadLocal(localCatalog) === null, 'empty local storage returns null');
saveLocal(demoScene);
assert(saved.size === 1 && saved.has(STORAGE_KEY) && loadLocal(localCatalog)?.id === demoScene.id, 'save/load use a single versioned key');
saved.set(STORAGE_KEY, '{broken');
throws(() => loadLocal(localCatalog), 'corrupt local storage surfaces actionable error');

const controller = new AbortController();
controller.abort();
for (const work of [catalogAdapter.list(controller.signal), structureAdapter.reconstruct(controller.signal), designerAdapter.propose(demoScene, 0, controller.signal)]) {
  let aborted = false;
  try { await work; } catch (error) { aborted = error instanceof DOMException && error.name === 'AbortError'; }
  assert(aborted, 'mock adapter respects cancellation');
}
const mockStore = new EditorStore(demoScene, localCatalog);
const [proposal, structure] = await Promise.all([designerAdapter.propose(mockStore.scene, mockStore.revision), structureAdapter.reconstruct()]);
assert(mockStore.execute(proposal.command, true).ok, 'mock designer proposes a valid approved change');
assert(mockStore.execute({ id: 'mock-structure', label: 'Import structure', source: 'architect', baseRevision: mockStore.revision, operations: [{ type: 'replace-structure', rooms: structure.rooms, walls: structure.walls }] }, true).ok, 'mock structure preserves compatible furniture');
console.log(`Domain checks passed (${assertions} assertions).`);
