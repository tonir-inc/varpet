import type { BuildingComponent, CatalogAsset, SceneDocument, Wall } from '../contracts';
import { architectProject } from './architect-project';
import { parseScene, serializeScene } from '../core/persistence';
import { createApartmentStore } from '../core/apartment-store';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`architect project check failed: ${message}`);
}
function rejects(run: () => unknown, text: string, message: string): void {
  let error = '';
  try { run(); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  assert(error.includes(text), `${message} (got: ${error || 'no error'})`);
}

const wall = (id: string, start: [number, number], end: [number, number]): Wall => ({ id, start, end, height: 2.7, thickness: 0.1, color: '#f4f1ea', openings: [] });
const v1: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'tiny', name: 'tiny (architect)', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'bath', name: 'Bathroom', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]], color: '#dddddd' }],
  walls: [wall('w1', [0, 0], [3, 0]), wall('w2', [3, 0], [3, 3]), wall('w3', [3, 3], [0, 3]), wall('w4', [0, 3], [0, 0])],
  objects: [{ id: 'cabinet-1', name: 'Built cabinet', assetId: 'built-tiny-cabinet', position: [2, 0, 2], rotation: 0, scale: [1, 1, 1] }],
};
const asset: CatalogAsset = { id: 'built-tiny-cabinet', name: 'Built cabinet', category: 'Built from your photos', kind: 'cabinet', dimensions: [0.6, 0.8, 0.4], color: '#e0ddd5', price: 0, source: { type: 'gltf', url: 'http://127.0.0.1:8788/files/tiny/cabinet/piece.glb' } };
const toilet: BuildingComponent = { id: 'toilet-1', name: 'Toilet', kind: 'toilet', position: [0.5, 0, 0.5], dimensions: [0.38, 0.8, 0.65], rotation: 0, color: '#ffffff', phase: 'new' };

const project = architectProject(v1, [toilet], [asset]);
assert(project.version === 2 && project.project?.components.length === 1, 'the project carries the fixture');
assert(project.project!.components[0]!.phase === 'existing' && project.project!.components[0]!.roomId === 'bath', 'fixtures are existing and sit in their room');
assert(project.objects[0]?.assetId === asset.id, 'built furniture stays placed');
const reopened = parseScene(serializeScene(project), [asset]);
assert(createApartmentStore(reopened, [asset]).scene.project?.components[0]?.kind === 'toilet', 'the saved file opens the way Import project JSON opens it');

rejects(() => architectProject(v1, [{ ...toilet, position: [5, 0, 5] }], [asset]), 'outside every room', 'a fixture outside the rooms is rejected');
rejects(() => architectProject(v1, [{ ...toilet, kind: 'bidet' as BuildingComponent['kind'] }], [asset]), 'Component “toilet-1” has invalid geometry or properties.', 'an unknown kind is rejected with the editor message');
rejects(() => architectProject(v1, [{ ...toilet, roomId: 'kitchen' }], [asset]), 'Component “toilet-1” references a missing room.', 'a missing room is rejected with the editor message');
rejects(() => architectProject(v1, [toilet], []), 'Cannot open scene', 'furniture without its built piece is rejected');

// A fixture can carry its built model; the editor draws that GLB in place of the procedural shape.
const toiletAsset: CatalogAsset = { id: 'built-tiny-toilet', name: 'Built toilet', category: 'Built from your photos', kind: 'toilet', dimensions: [0.4, 0.78, 0.62], color: '#ffffff', price: 0, source: { type: 'gltf', url: 'http://127.0.0.1:8788/files/tiny/toilet/piece.glb' } };
const modelled = architectProject(v1, [{ ...toilet, assetId: toiletAsset.id }], [asset, toiletAsset]);
assert(modelled.project!.components[0]!.assetId === toiletAsset.id, 'the fixture keeps its built model');
const modelledReopened = parseScene(serializeScene(modelled), [asset, toiletAsset]);
assert(createApartmentStore(modelledReopened, [asset, toiletAsset]).scene.project?.components[0]?.assetId === toiletAsset.id, 'the saved file keeps the fixture model');
const unknown = architectProject(v1, [{ ...toilet, assetId: 'not-in-catalog' }], [asset]);
assert(unknown.project!.components[0]!.assetId === 'not-in-catalog', 'an unknown fixture model still opens (drawn procedurally)');
rejects(() => architectProject(v1, [{ ...toilet, assetId: ' ' }], [asset]), 'Component “toilet-1” has invalid geometry or properties.', 'a blank fixture model id is rejected');
rejects(() => architectProject(v1, [{ ...toilet, assetId: 7 as unknown as string }], [asset]), 'Component “toilet-1” has invalid geometry or properties.', 'a non-string fixture model id is rejected');
console.log('architect project check passed');
