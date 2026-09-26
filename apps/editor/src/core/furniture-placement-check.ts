import type { CatalogAsset, SceneDocument, SceneObject } from '../contracts';
import { migrateScene } from './renovation';
import { floorSupported, validateScene } from './validation';
import { suggestFurniturePosition } from './furniture-placement';

let assertions = 0;
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  assertions++;
}
const asset: CatalogAsset = { id: 'table', name: 'Table', kind: 'table', category: 'Furniture', dimensions: [1, 1, 1], color: '#999999', price: 0, source: { type: 'procedural' } };
const object: SceneObject = { id: 'new-table', name: asset.name, assetId: asset.id, position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] };
const scene: SceneDocument = { format: 'varpet.editor', version: 1, id: 'translated', name: 'Translated apartment', units: 'm', upAxis: 'Y', rooms: [{ id: 'room', name: 'Room', color: '#ffffff', polygon: [[30, 40], [36, 40], [36, 46], [30, 46]] }], walls: [], objects: [] };
const before = JSON.stringify(scene);
const position = suggestFurniturePosition(scene, [asset], object);
check(position, 'Click-add finds a supported position in an apartment far from world origin');
check(floorSupported({ ...object, position }, asset, scene), 'Suggested furniture footprint fits the actual floor');
check(validateScene({ ...scene, objects: [{ ...object, position }] }, [asset]).ok, 'Translated click-add passes authoritative validation');
check(JSON.stringify(scene) === before && object.position[0] === 0, 'Finding placement does not mutate the document or input object');

const otherRoom = { ...scene.rooms[0]!, id: 'other-room', polygon: [[-36, -46], [-30, -46], [-30, -40], [-36, -40]] as [number, number][] };
const twoRooms = { ...scene, rooms: [...scene.rooms, otherRoom] };
const selectedPosition = suggestFurniturePosition(twoRooms, [asset], object, otherRoom.id);
check(selectedPosition && selectedPosition[0] < -30, 'Click-add prefers the selected room');

const occupied = { ...scene, objects: [{ ...object, id: 'old-table', position }] };
const anotherPosition = suggestFurniturePosition(occupied, [asset], object);
check(anotherPosition && Math.hypot(anotherPosition[0] - position[0], anotherPosition[2] - position[2]) >= 1, 'Click-add seeks a free footprint before overlapping existing furniture');

const concave = { ...scene, rooms: [{ ...scene.rooms[0]!, polygon: [[30, 40], [36, 40], [36, 42], [32, 42], [32, 46], [30, 46]] as [number, number][] }] };
const concavePosition = suggestFurniturePosition(concave, [asset], object);
check(concavePosition && floorSupported({ ...object, position: concavePosition }, asset, concave), 'Concave room placement searches beyond an unsupported room centre');

const raised = migrateScene(scene); raised.project!.metadata.room = { elevation: 1 };
check(suggestFurniturePosition(raised, [asset], object) === null, 'Grounded catalog furniture is not suggested on an elevated floor');
const removed = migrateScene(scene); removed.project!.metadata.room = { phase: 'remove' };
check(suggestFurniturePosition(removed, [asset], object) === null, 'Removed room floors are excluded');
const oversized = { ...asset, dimensions: [8, 1, 8] as [number, number, number] };
check(suggestFurniturePosition(scene, [oversized], object) === null, 'A piece larger than the entire floor has no suggested placement');

const blocked = { ...scene, rooms: [{ ...scene.rooms[0]!, polygon: [[30, 40], [31, 40], [31, 41], [30, 41]] as [number, number][] }], walls: [{ id: 'wall', start: [30, 40.5] as [number, number], end: [31, 40.5] as [number, number], height: 3, thickness: .1, color: '#ffffff', openings: [] }] };
check(suggestFurniturePosition(blocked, [asset], object) === null, 'Legacy placement retains blocking wall validation');
const editable = migrateScene(blocked);
check(suggestFurniturePosition(editable, [asset], object), 'Version 2 free editing can place supported furniture with wall warnings');
console.log(`Furniture placement checks passed (${assertions} assertions).`);
