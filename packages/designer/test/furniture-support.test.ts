import { expect, test } from 'vitest';
import type { CatalogAsset, SceneDocument } from '../../../apps/editor/src/contracts.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { emptyProject } from '../../../apps/editor/src/core/renovation.js';
import { applyOps } from '../src/adapter.js';
import { checkLayout } from '../src/layout.js';
import { localGeometryErrors } from '../src/local-checks.js';
import { spaceMetrics } from '../src/metrics/space.js';
import { DesignerSession } from '../src/session.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { canRestOn, surfacePoses } from '../src/support.js';
import type { Item, Scene } from '../src/scene.js';

const asset = (id: string, kind: CatalogAsset['kind'], dimensions: [number, number, number], price = 10000): CatalogAsset =>
  ({ id, name: id, category: 'Test', kind, dimensions, color: '#888888', price, source: { type: 'procedural' } });
const catalog = [asset('stand', 'cabinet', [1.4, .5, .45]), asset('tv', 'tv', [.97, .64, .18], 180000), asset('lamp', 'lamp', [.25, .45, .25], 16000), asset('sofa', 'sofa', [2, .8, .9])];
function editorScene(): SceneDocument {
  return { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Living room', polygon: [[0, 0], [5, 0], [5, 5], [0, 5]], color: '#ffffff' }],
    walls: [{ id: 'wall', start: [0, 0], end: [5, 0], height: 2.7, thickness: .1, color: '#ffffff', openings: [{ id: 'door', kind: 'door', offset: 3.6, width: .9, sill: 0, height: 2.1 }] }],
    objects: [{ id: 'stand', name: 'TV stand', assetId: 'stand', position: [2, 0, .6], rotation: 0, scale: [1, 1, 1] }] };
}
const piece = (id: string, kind: string, pos: [number, number], size: [number, number, number], extra: Partial<Item> = {}): Item =>
  ({ id, kind, name: id, room_id: 'r', pos, rot: 0, size, keep: false, ...extra });
const room = (items: Item[]): Scene => ({ rooms: [{ id: 'r', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
  walls: [{ id: 'south', room_id: 'r', a: [0, 0], b: [4, 0] }],
  openings: [{ id: 'door', wall_id: 'south', kind: 'door', offset: 3, width: .9, height: 2.1, sill: 0, swing: 'none' }], items, fixed: [] });

test('a TV added on the stand round-trips through the editor as restsOn', () => {
  const scene = editorToDesigner(editorScene(), { catalog, catalogCurrency: 'AMD' });
  const stand = scene.items[0]!;
  const [pose] = surfacePoses(scene, stand, [.97, .18, .64]);
  const tv: Item = { id: 'tv-1', kind: 'tv', name: 'TV', room_id: 'room', pos: pose!.pos, rot: pose!.rot, size: [.97, .18, .64], keep: false, sku: 'tv', price: 180000, on: 'stand' };
  const session = new DesignerSession(scene);
  session.setIntent({ room_id: 'room', add: [{ kinds: ['tv'], count: 1 }] });
  const result = session.propose([{ type: 'add', item: tv }], 'TV on the stand.');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const proposal = proposalToEditor(result.proposal, editorScene(), 0, { catalog, catalogCurrency: 'AMD' });
  expect(proposal.command.operations[0]).toMatchObject({ type: 'add', on: 'stand' });
  const store = new EditorStore(editorScene(), catalog);
  expect(store.execute(proposal.command, true).ok).toBe(true);
  const placed = store.scene.objects.find(o => o.id === 'tv-1')!;
  expect(placed.restsOn).toBe('stand');
  expect(placed.position[1]).toBeCloseTo(.5);
  // The accepted scene imports again, with the TV on the stand and no floor footprint of its own.
  const again = editorToDesigner(store.scene, { catalog });
  expect(again.items.find(i => i.id === 'tv-1')).toMatchObject({ on: 'stand' });
  expect(spaceMetrics(again).rooms[0]!.walkways.some(w => w.to === 'item:tv-1')).toBe(false);
});

test('moving an owned floor lamp onto the stand becomes an editor update with on', () => {
  const source = editorScene();
  source.objects.push({ id: 'lamp', name: 'Lamp', assetId: 'lamp', position: [4, 0, 2], rotation: 0, scale: [1, 1, 1] });
  const scene = editorToDesigner(source, { catalog });
  const [pose] = surfacePoses(scene, scene.items[0]!, scene.items[1]!.size);
  const session = new DesignerSession(scene);
  session.setIntent({ room_id: 'room', move: [{ kinds: ['lamp'], count: 1 }] });
  const result = session.propose([{ type: 'move', id: 'lamp', pos: pose!.pos, rot: pose!.rot, on: 'stand' }], 'Lamp on the stand.');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const proposal = proposalToEditor(result.proposal, source, 0, { catalog });
  expect(proposal.command.operations[0]).toMatchObject({ type: 'update', id: 'lamp', on: 'stand' });
  const store = new EditorStore(source, catalog);
  expect(store.execute(proposal.command, true).ok).toBe(true);
  expect(store.scene.objects.find(o => o.id === 'lamp')!.restsOn).toBe('stand');
});

test('support checks reject overhangs, non-surfaces, large furniture and crowded tops', () => {
  const stand = piece('stand', 'nightstand', [1, 1], [.5, .4, .55]);
  const ok = room([stand, piece('lamp', 'lamp', [1, 1.05], [.25, .25, .45], { on: 'stand' })]);
  expect(checkLayout(ok).ok).toBe(true);
  const overhang = localGeometryErrors(room([stand, piece('lamp', 'lamp', [1.3, 1], [.25, .25, .45], { on: 'stand' })]));
  expect(overhang.some(e => e.check === 'support' && e.deficit_m! > .1)).toBe(true);
  const onSofa = localGeometryErrors(room([piece('sofa', 'sofa', [2, 2], [2, .9, .8]), piece('lamp', 'lamp', [2, 2], [.25, .25, .45], { on: 'sofa' })]));
  expect(onSofa.some(e => e.check === 'support')).toBe(true);
  const bigTv = localGeometryErrors(room([piece('bench', 'table', [2, 2], [3, .6, .5]), piece('tv', 'tv', [2, 2], [2.4, .1, 1.4], { on: 'bench' })]));
  expect(bigTv.some(e => e.check === 'support')).toBe(true);
  const crowded = localGeometryErrors(room([stand, piece('a', 'lamp', [1, 1], [.25, .25, .45], { on: 'stand' }), piece('b', 'decor', [1.05, 1], [.2, .2, .2], { on: 'stand' })]));
  expect(crowded.some(e => e.check === 'overlap' && e.item_ids.includes('a') && e.item_ids.includes('b'))).toBe(true);
  expect(canRestOn('sofa', [2, .9, .8])).toBe(false);
  expect(surfacePoses(room([stand]), stand, [.25, .25, .45]).length).toBeGreaterThan(0);
  expect(surfacePoses(room([stand]), stand, [.6, .6, .45])).toHaveLength(0);
});

test('a supported item follows its support, blocks the support removal, and detaches with on null', () => {
  const scene = room([piece('stand', 'nightstand', [1, 1], [.5, .4, .55]), piece('lamp', 'lamp', [1, 1], [.25, .25, .45], { on: 'stand' })]);
  const moved = applyOps(scene, [{ type: 'move', id: 'stand', pos: [2, 1], rot: 90 }]);
  expect(moved.items.find(i => i.id === 'lamp')).toMatchObject({ pos: [2, 1], rot: 90, on: 'stand' });
  expect(() => applyOps(scene, [{ type: 'remove', id: 'stand' }])).toThrow(/support/);
  const floor = applyOps(scene, [{ type: 'move', id: 'lamp', pos: [3, 3], on: null }, { type: 'remove', id: 'stand' }]);
  expect(floor.items.map(i => i.id)).toEqual(['lamp']);
  expect(floor.items[0]!.on).toBeUndefined();
  expect(() => applyOps(scene, [{ type: 'add', item: piece('x', 'decor', [1, 1], [.1, .1, .1], { on: 'missing' }) }])).toThrow();
});

test('balcony zone crosses the bridge without invalidating proposals made before zones existed', () => {
  expect(editorToDesigner(editorScene(), { catalog }).rooms[0]).not.toHaveProperty('zone');
  const source = editorScene(); source.version = 2; source.project = emptyProject(); source.project.metadata.room = { zone: 'balcony' };
  const scene = editorToDesigner(source, { catalog });
  expect(scene.rooms[0]).toMatchObject({ zone: 'balcony' });
  // A proposal whose base scene lacked the zone still matches the zoned snapshot.
  const legacy = { ...scene, rooms: scene.rooms.map(({ zone: _zone, ...room }) => room) };
  const session = new DesignerSession(legacy);
  session.setIntent({ room_id: 'room', move: [{ kinds: ['cabinet'], count: 1 }] });
  const result = session.propose([{ type: 'move', id: 'stand', pos: [2, -1] }], 'Move the stand.');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(() => proposalToEditor(result.proposal, source, 0, { catalog })).not.toThrow();
});
