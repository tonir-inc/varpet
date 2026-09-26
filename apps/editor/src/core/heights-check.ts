import { demoScene } from './demo';
import { makeStructure } from '../render/structure';
import { disposeObject } from '../render/assets';

Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
} });
const shell = makeStructure(demoScene);
try {
  for (const ceiling of shell.ceilings.children) {
    if (Math.abs(ceiling.position.y - 2.7) > 1e-6) throw new Error(`Ceiling must meet the 2.7 m shell; got ${ceiling.position.y} m`);
  }
  console.log('Height checks passed: legacy ceilings meet the wall tops.');
} finally {
  disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
}

// Checked configuration uses the same real store as the editor.
import { buildHeightOperations, roomCeilingHeight } from './heights';
import { localCatalog } from './demo';
import { EditorStore } from './store';
import { migrateScene } from './renovation';
import { parseScene, serializeScene } from './persistence';
import { findWalkSpawn } from './walkthrough';
import type { Operation, SceneDocument } from '../contracts';
let assertions = 0;
const assert = (value: unknown, label: string) => { if (!value) throw new Error(label); assertions++; };
const execute = (store: EditorStore, operations: Operation[]) => store.execute({ id: crypto.randomUUID(), source: 'human', baseRevision: store.revision, label: 'Height', operations }, true);
const store = new EditorStore(demoScene, localCatalog);
const original = serializeScene(store.scene);
assert(execute(store, buildHeightOperations(store.scene, 3.1)).ok, 'Whole apartment edit applies');
assert(store.scene.walls.every(wall => wall.height === 3.1), 'Every wall changes');
assert(store.scene.rooms.every(room => store.scene.project?.metadata[room.id]?.ceilingHeight === 3.1), 'Every indoor ceiling changes');
assert(store.scene.version === 2 && store.revision === 1, 'Legacy migration and height are one command');
assert(JSON.stringify(store.scene.walls.map(wall => wall.openings)) === JSON.stringify(demoScene.walls.map(wall => wall.openings)), 'Openings retain dimensions');
const reopened = parseScene(serializeScene(store.scene), localCatalog);
assert(reopened.walls.every(wall => wall.height === 3.1) && reopened.project?.metadata['room-living']?.ceilingHeight === 3.1, 'Export and reopen preserve heights');
store.undo(); assert(serializeScene(store.scene) === original, 'One undo restores the whole legacy document');
store.redo(); assert(store.scene.walls.every(wall => wall.height === 3.1), 'Redo restores heights');
assert(buildHeightOperations(store.scene, 3.1).length === 0, 'Same height is a no-op');
const beforeInvalid = serializeScene(store.scene), revision = store.revision;
for (const invalid of [NaN, Infinity, 0, -2, 7, 2]) {
  let rejected = false;
  try { rejected = !execute(store, buildHeightOperations(store.scene, invalid)).ok; } catch { rejected = true; }
  assert(rejected, `Reject invalid or opening-clipping height ${invalid}`);
}
assert(serializeScene(store.scene) === beforeInvalid && store.revision === revision, 'Rejected height preserves scene and history');
assert(execute(store, buildHeightOperations(store.scene, 3.4, { kind: 'wall', id: 'wall-west' })).ok, 'Individual wall height applies');
assert(store.scene.walls.find(wall => wall.id === 'wall-east')?.height === 3.1 && store.scene.project?.metadata['room-living']?.ceilingHeight === 3.1, 'Wall height preserves other walls and explicit ceilings');
assert(execute(store, buildHeightOperations(store.scene, 2.9, { kind: 'room', id: 'room-bedroom' })).ok, 'Individual ceiling height applies');
const locked = migrateScene(demoScene);
locked.project!.metadata['room-bedroom'] = { locked: true };
let lockRejected = false;
try { buildHeightOperations(locked, 3); } catch { lockRejected = true; }
assert(lockRejected, 'Bulk edit respects room locks');
locked.project!.metadata['room-bedroom'] = {};
locked.project!.metadata['wall-west'] = { locked: true };
lockRejected = false;
try { buildHeightOperations(locked, 3); } catch { lockRejected = true; }
assert(lockRejected, 'Bulk edit respects wall locks');
const removed = migrateScene(demoScene);
removed.project!.metadata['wall-west'] = { phase: 'remove' };
removed.project!.metadata['room-bedroom'] = { phase: 'remove' };
removed.project!.metadata['room-bath'] = { zone: 'balcony' };
assert(!buildHeightOperations(removed, 3).some(op => 'id' in op && ['wall-west', 'room-bedroom', 'room-bath'].includes(op.id)), 'Removed elements and outdoor ceilings stay untouched');

const raised: SceneDocument = migrateScene({ ...structuredClone(demoScene), objects: [], rooms: [{ id: 'raised', name: 'Raised room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], color: '#eeeeee' }], walls: [{ id: 'shared', start: [4, 0], end: [0, 0], height: 3.5, thickness: 0.16, color: '#eeeeee', openings: [] }] });
raised.project!.metadata['raised'] = { elevation: 1 };
assert(roomCeilingHeight(raised, raised.rooms[0]!) === 2.5, 'Height subtracts room elevation from reversed adjacent wall top');
const raisedStore = new EditorStore(raised, []);
assert(execute(raisedStore, buildHeightOperations(raised, 3)).ok, 'Raised apartment edit applies');
assert(raisedStore.scene.walls[0]!.height === 4 && raisedStore.scene.project!.metadata['raised']!.elevation === 1, 'Shared wall reaches the raised ceiling without moving floors');
assert(raisedStore.scene.project!.metadata['raised']!.ceilingHeight === 3, 'Raised ceiling has requested floor-to-ceiling height');
const unknown = structuredClone(raised);
unknown.walls.push({ ...unknown.walls[0]!, id: 'remote', start: [20, 0], end: [24, 0], height: 6 });
unknown.walls.push({ ...unknown.walls[0]!, id: 'overhead', height: 6 }); unknown.project!.metadata['overhead'] = { elevation: 5 };
unknown.walls.push({ ...unknown.walls[0]!, id: 'removed', height: 6 }); unknown.project!.metadata['removed'] = { phase: 'remove' };
unknown.walls.push({ ...unknown.walls[0]!, id: 'below', height: 0.5 });
assert(roomCeilingHeight(unknown, unknown.rooms[0]!) === 2.5, 'Unrelated, overhead, removed and below-floor walls are excluded');
assert(unknown.project!.metadata['raised']!.ceilingHeight === undefined, 'Inference never promotes missing height to measured metadata');
unknown.project!.metadata['raised']!.ceilingHeight = 2.2;
assert(roomCeilingHeight(unknown, unknown.rooms[0]!) === 2.2, 'Explicit ceiling wins');
unknown.project!.metadata['raised']!.ceilingHeight = undefined; unknown.walls = [];
assert(roomCeilingHeight(unknown, unknown.rooms[0]!) === 2.8, 'No supporting shell uses provisional fallback');
const low = structuredClone(raised); low.project!.metadata['raised']!.elevation = 0; low.walls[0]!.height = 1.7;
assert(findWalkSpawn(low, []) === null, 'Walking clearance uses the same inferred low ceiling');
const hosted = migrateScene(demoScene);
hosted.project!.components.push({ id: 'wall-light', name: 'High fixture', kind: 'light', position: [0, 0, 0], dimensions: [0.2, 0.2, 0.2], rotation: 0, color: '#ffffff', phase: 'existing', host: { wallId: 'wall-west', offset: 1, elevation: 2.5, side: 1 } });
const hostedStore = new EditorStore(hosted, localCatalog), beforeHosted = serializeScene(hostedStore.scene);
assert(!execute(hostedStore, buildHeightOperations(hostedStore.scene, 2.5)).ok, 'A height clipping a hosted fixture is rejected');
assert(serializeScene(hostedStore.scene) === beforeHosted && hostedStore.revision === 0, 'Hosted rejection is atomic');

for (const zone of ['balcony', 'terrace'] as const) {
  const outdoor = structuredClone(low);
  outdoor.project!.metadata['raised']!.zone = zone;
  outdoor.walls[0]!.height = 1.1;
  assert(findWalkSpawn(outdoor, []) !== null, `Open-air ${zone} remains walkable with a low parapet`);
}

console.log(`Height configuration checks passed: ${assertions} assertions.`);
