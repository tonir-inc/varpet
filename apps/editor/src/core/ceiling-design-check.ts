import type { CeilingDesign, Operation, SceneDocument, Vec2 } from '../contracts';
import { demoScene, localCatalog } from './demo';
import { EditorStore } from './store';
import { migrateScene } from './renovation';
import { parseScene, serializeScene } from './persistence';
import { validateScene } from './validation';
import { buildCeilingDesignOperations, defaultCeilingDesign, CEILING_PRESETS, layoutCeilingDesign, ceilingDesignRoomAt } from './ceiling-design';
import { floorSupported } from './validation';

let assertions = 0;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); assertions++; };
const execute = (store: EditorStore, operations: Operation[]) => store.execute({ id: crypto.randomUUID(), source: 'human', baseRevision: store.revision, label: 'Ceiling design', operations }, true);
const roomId = 'room-living';
const quiet: CeilingDesign = { style: 'quiet', drop: 0, inset: .55, brightness: 70, temperature: 3000, enabled: true };
const rawOperation = (id: string, design: unknown): Operation => ({ type: 'set-metadata', id, patch: { ceilingDesign: design } } as unknown as Operation);
const store = new EditorStore(demoScene, localCatalog), before = serializeScene(store.scene);
const applied = execute(store, [{ type: 'migrate-project' }, rawOperation(roomId, quiet)]);
assert(applied.ok, `Valid ceiling design must apply atomically: ${applied.errors.join(' ')}`);
assert(store.revision === 1 && store.scene.version === 2, 'Migration and design are one history entry');
const readDesign = (scene: SceneDocument) => (scene.project!.metadata[roomId] as unknown as { ceilingDesign: unknown }).ceilingDesign;
assert(JSON.stringify(readDesign(parseScene(serializeScene(store.scene), localCatalog))) === JSON.stringify(quiet), 'Export and reopen preserve ceiling settings');
store.undo(); assert(serializeScene(store.scene) === before, 'Undo restores old document with no ceiling configuration');
store.redo(); assert(JSON.stringify(readDesign(store.scene)) === JSON.stringify(quiet), 'Redo restores exact design');
assert(execute(store, [{ type: 'capture-baseline' }, { type: 'create-option', id: 'night', name: 'Night' }]).ok, 'Design survives baseline and option capture');
assert(execute(store, [rawOperation(roomId, { ...quiet, temperature: 2700 })]).ok, 'Option can change ceiling temperature');
assert(execute(store, [{ type: 'restore-baseline' }]).ok && JSON.stringify(readDesign(store.scene)) === JSON.stringify(quiet), 'Baseline restores ceiling configuration');
assert(execute(store, [{ type: 'switch-option', id: 'night' }]).ok && (readDesign(store.scene) as typeof quiet).temperature === 2700, 'Option restores its independent settings');
for (const invalid of [42, [], {}, { ...quiet, style: 'unknown' }, { ...quiet, style: new String('quiet') }, { ...quiet, drop: -.1 }, { ...quiet, drop: .61 }, { ...quiet, inset: .01 }, { ...quiet, inset: 3 }, { ...quiet, brightness: 101 }, { ...quiet, brightness: NaN }, { ...quiet, temperature: 2000 }, { ...quiet, enabled: 1 }, { ...quiet, unexpected: true }]) {
  const saved = serializeScene(store.scene), revision = store.revision;
  assert(!execute(store, [rawOperation(roomId, invalid)]).ok, `Reject malformed design ${JSON.stringify(invalid)}`);
  assert(saved === serializeScene(store.scene) && revision === store.revision, 'Invalid design leaves state and history unchanged');
}
assert(!execute(store, [rawOperation('wall-west', quiet)]).ok, 'Only rooms may own ceiling designs');
assert(!execute(store, [rawOperation('missing', quiet)]).ok, 'Missing room is rejected');
assert(execute(store, [rawOperation(roomId, null)]).ok && readDesign(store.scene) === null, 'Explicit null clears the design');
assert(validateScene(migrateScene(demoScene), localCatalog).ok, 'Older v2 documents without ceiling design remain valid');
const locked = migrateScene(demoScene); locked.project!.metadata[roomId]!.locked = true;
const lockedStore = new EditorStore(locked, localCatalog);
assert(!execute(lockedStore, [rawOperation(roomId, quiet)]).ok, 'Raw design commands cannot bypass a room lock');
assert(execute(lockedStore, [{ type: 'set-metadata', id: roomId, patch: { locked: false } }]).ok, 'Metadata unlock remains available');
for (const zone of ['balcony', 'terrace'] as const) {
  const outdoor = migrateScene(demoScene); outdoor.project!.metadata[roomId]!.zone = zone;
  assert(!execute(new EditorStore(outdoor, localCatalog), [rawOperation(roomId, quiet)]).ok, `Open-air ${zone} rejects a ceiling design`);
}
const removed = migrateScene(demoScene); removed.project!.metadata[roomId]!.phase = 'remove';
assert(!execute(new EditorStore(removed, localCatalog), [rawOperation(roomId, quiet)]).ok, 'Removed rooms must be restored before adding a design');
console.log(`Ceiling design contract checks passed: ${assertions} assertions.`);

const generated = buildCeilingDesignOperations(demoScene, roomId, quiet);
assert(generated.length === 2 && generated[0]!.type === 'migrate-project', 'Builder migrates legacy scene and applies design in one command');
const generatedStore = new EditorStore(demoScene, localCatalog);
assert(execute(generatedStore, generated).ok, 'Generated design operations pass actual store checks');
assert(buildCeilingDesignOperations(generatedStore.scene, roomId, quiet).length === 0, 'Unchanged configuration is a no-op');
const shapes: Vec2[][] = [
  [[0, 0], [6, 0], [6, 4], [0, 4]],
  [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]],
  [[0, 0], [7, 0], [7, 4], [4, 4], [4, 1.5], [3, 1.5], [3, 4], [0, 4]],
  [[0, 0], [6, 0], [3, 5]],
  [[0, 0], [15, 0], [15, 8], ...Array.from({ length: 28 }, (_, i): Vec2 => [14.5 - i / 2, i % 2 ? 8 : 3]), [0, 8]],
];
const designConfigs: CeilingDesign[] = [quiet, { ...quiet, style: 'soft-glow', drop: .16, inset: .35 }, { ...quiet, style: 'architectural', drop: .06, inset: .4 }];
for (const shape of shapes) for (const reverse of [false, true]) for (const config of designConfigs) {
  const polygon = (reverse ? [...shape].reverse() : shape).map(([x, z]): Vec2 => [x - 20, z + 15]);
  const scene = migrateScene({ ...structuredClone(demoScene), rooms: [{ id: roomId, name: 'Ceiling test', polygon, color: '#ffffff' }], walls: [], objects: [] });
  scene.project!.metadata[roomId] = { elevation: .4, ceilingHeight: 3, ceilingDesign: config };
  const layout = layoutCeilingDesign(scene, scene.rooms[0]!)!;
  assert(layout && layout.elements.length > 0 && layout.elements.length <= 16, `${config.style} has a bounded visible layout for concave/reversed/translated shape`);
  assert(Math.abs(layout.ceilingY - 3.4) < 1e-8, 'Ceiling uses floor elevation plus local height');
  for (const [index, element] of layout.elements.entries()) {
    assert(element.position[1] > .4 && element.position[1] + element.dimensions[1] <= layout.ceilingY + 1e-8, 'Full fixture stays between floor and structural ceiling');
    assert(floorSupported({ id: `check-${index}`, name: 'Fixture footprint', assetId: 'footprint', position: [element.position[0], .4, element.position[2]], rotation: element.rotation, scale: [1, 1, 1] }, { id: 'footprint', name: 'Fixture', category: 'test', kind: 'lamp', dimensions: element.dimensions, price: 0, color: '#ffffff', source: { type: 'procedural' } }, scene), 'Complete fixture footprint fits the room, including concave notches');
  }
  scene.project!.metadata[roomId]!.ceilingHeight = 3.5;
  const higher = layoutCeilingDesign(scene, scene.rooms[0]!)!;
  assert(higher.elements.every((element, i) => Math.abs(element.position[1] - layout.elements[i]!.position[1] - .5) < 1e-8), 'All fixtures follow later ceiling height edits');
}
const designed = migrateScene(demoScene); designed.project!.metadata[roomId]!.ceilingDesign = designConfigs[1]!;
const designStore = new EditorStore(designed, localCatalog), saved = serializeScene(designStore.scene);
assert(!execute(designStore, [{ type: 'update-room', id: roomId, patch: { polygon: [[0, 0], [.4, 0], [.4, .4], [0, .4]] } }]).ok, 'Room resize cannot silently erase a design that no longer fits');
assert(saved === serializeScene(designStore.scene), 'Invalid room resize is atomic');
assert(!execute(designStore, [{ type: 'set-metadata', id: roomId, patch: { ceilingHeight: .2 } }]).ok, 'Too-low ceiling cannot engulf decorative fixtures');
assert(saved === serializeScene(designStore.scene), 'Invalid height update is atomic');
assert(execute(designStore, [{ type: 'set-metadata', id: roomId, patch: { zone: 'terrace', ceilingDesign: null } }]).ok, 'Outdoor conversion can explicitly clear design atomically');
for (const scene of [locked, removed]) {
  let rejected = false; try { buildCeilingDesignOperations(scene, roomId, quiet); } catch { rejected = true; }
  assert(rejected, 'Builder rejects locked and removed rooms');
}
const narrow = migrateScene(demoScene); narrow.rooms[0]!.polygon = [[0, 0], [.3, 0], [.3, 4], [0, 4]];
let narrowRejected = false; try { buildCeilingDesignOperations(narrow, narrow.rooms[0]!.id, quiet); } catch { narrowRejected = true; }
assert(narrowRejected, 'Narrow room gets an explicit fit error, never a silently empty layout');
const dark = structuredClone(designed); dark.project!.metadata[roomId]!.ceilingDesign!.enabled = false;
assert(layoutCeilingDesign(dark, dark.rooms[0]!)!.elements.length > 0, 'Lights off keeps physical ceiling geometry');
assert(layoutCeilingDesign(migrateScene(demoScene), demoScene.rooms[0]!) === null, 'Unconfigured old scenes acquire no fixtures');
for (const preset of CEILING_PRESETS) {
  const config = defaultCeilingDesign(preset.id);
  assert(config.style === preset.id && config.enabled, 'All UI presets provide a default enabled configuration');
  config.brightness = 0;
  assert(defaultCeilingDesign(preset.id).brightness > 0, 'Default settings are independent editable copies');
}
const cameraRooms = migrateScene({ ...structuredClone(demoScene), rooms: [
  { id: 'lower', name: 'Lower floor', polygon: [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]], color: '#ffffff' },
  { id: 'raised', name: 'Raised floor', polygon: [[0, 0], [2, 0], [2, 2], [0, 2]], color: '#ffffff' },
], walls: [], objects: [] });
cameraRooms.project!.metadata.lower = { elevation: 0, ceilingHeight: 5 };
cameraRooms.project!.metadata.raised = { elevation: 2, ceilingHeight: 2 };
assert(ceilingDesignRoomAt(cameraRooms, [1, 1.6, 1]) === 'lower', 'Camera selects containing room without a design configuration');
assert(ceilingDesignRoomAt(cameraRooms, [1, 3, 1]) === 'raised', 'Overlapping rooms select the closest eligible floor below the camera');
assert(ceilingDesignRoomAt(cameraRooms, [1, 4.2, 1]) === 'lower', 'Camera above one ceiling can still occupy another containing room');
assert(ceilingDesignRoomAt(cameraRooms, [1, -.1, 1]) === undefined, 'Camera below the floor has no active ceiling room');
assert(ceilingDesignRoomAt(cameraRooms, [1, 5.1, 1]) === undefined, 'Camera above every structural ceiling has no active ceiling room');
assert(ceilingDesignRoomAt(cameraRooms, [3, 1.6, 3]) === undefined, 'Concave missing quadrant is outside despite lying inside bounding box');
assert(ceilingDesignRoomAt(cameraRooms, [1, 1.6, 5]) === 'lower', 'Concave vertical arm contains the camera');
assert(ceilingDesignRoomAt(cameraRooms, [5, 1.6, 1]) === 'lower', 'Concave horizontal arm contains the camera');
cameraRooms.project!.metadata.raised!.phase = 'remove';
assert(ceilingDesignRoomAt(cameraRooms, [1, 3, 1]) === 'lower', 'Removed room never receives the active light budget');
cameraRooms.project!.metadata.raised!.phase = 'existing';
for (const zone of ['balcony', 'terrace'] as const) {
  cameraRooms.project!.metadata.raised!.zone = zone;
  assert(ceilingDesignRoomAt(cameraRooms, [1, 3, 1]) === 'lower', `Open-air ${zone} never receives the active light budget`);
}
cameraRooms.project!.metadata.raised!.zone = 'loggia';
assert(ceilingDesignRoomAt(cameraRooms, [1, 3, 1]) === 'raised', 'Enclosed loggia remains eligible');
const inferredCameraRoom = migrateScene({ ...structuredClone(demoScene), rooms: [cameraRooms.rooms[1]!], objects: [], walls: [{ id: 'low-wall', start: [0, 0], end: [2, 0], height: 2.4, thickness: .1, color: '#ffffff', openings: [] }] });
assert(ceilingDesignRoomAt(inferredCameraRoom, [1, 2.3, 1]) === 'raised', 'Camera uses inferred local structural ceiling height');
assert(ceilingDesignRoomAt(inferredCameraRoom, [1, 2.5, 1]) === undefined, 'Camera above inferred wall-top ceiling is excluded');
assert(ceilingDesignRoomAt(cameraRooms, [NaN, 1, 1]) === undefined, 'Nonfinite camera positions are excluded');
console.log(`Ceiling design checks passed: ${assertions} assertions.`);
