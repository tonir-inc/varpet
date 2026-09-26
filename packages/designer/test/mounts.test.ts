import { expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CatalogAsset, SceneDocument } from '../../../apps/editor/src/contracts.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { DesignerSession } from '../src/session.js';
import { localGeometryErrors } from '../src/local-checks.js';
import { spaceMetrics } from '../src/metrics/space.js';
import { mountPoses, isHangingPlanter } from '../src/mounts.js';
import { createTypedServer } from '../src/typed-tools.js';
import type { Item } from '../src/scene.js';

const asset = (id: string, kind: CatalogAsset['kind'], dimensions: [number, number, number], name = id): CatalogAsset =>
  ({ id, name, category: 'Decoration', kind, dimensions, color: '#ffffff', price: 20000, source: { type: 'procedural' } });
const curtain = asset('curtain', 'curtain', [2.1, 2.628, .13], 'Linen curtains, pair drawn open, 260 cm');
const planter = asset('extra:plants:hanging-string-of-pearls', 'plant', [.35, .9, .387], 'Hanging planter, trailing succulent');
const art = asset('art', 'wall_art', [.8, .6, .03], 'Framed print');
const catalog = [curtain, planter, art];
const wall = (id: string, start: [number, number], end: [number, number], openings: SceneDocument['walls'][number]['openings'] = []) => ({ id, start, end, height: 2.7, thickness: .2, color: '#ffffff', openings });
function editorScene(): SceneDocument {
  return { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Living room', color: '#ffffff', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]] }],
    walls: [wall('south', [0, 0], [6, 0], [{ id: 'win', kind: 'window', offset: 1, width: 1.2, height: 1.4, sill: .9 }]), wall('east', [6, 0], [6, 6]),
      wall('north', [6, 6], [0, 6], [{ id: 'door', kind: 'door', offset: 2.5, width: .9, height: 2.1, sill: 0 }]), wall('west', [0, 6], [0, 0])], objects: [] };
}
const piece = (a: CatalogAsset) => ({ kind: a.kind, name: a.name, sku: a.id, size: [a.dimensions[0], a.dimensions[2], a.dimensions[1]] as [number, number, number] });
function propose(item: Item) {
  const scene = editorToDesigner(editorScene(), { catalog, catalogCurrency: 'AMD' });
  const session = new DesignerSession(scene);
  session.setIntent({ room_id: 'room', add: [{ kinds: [item.kind], count: 1 }] });
  const result = session.propose([{ type: 'add', item }], 'Hang it.');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const proposal = proposalToEditor(result.proposal, editorScene(), 0, { catalog, catalogCurrency: 'AMD' });
  const store = new EditorStore(editorScene(), catalog);
  expect(store.execute(proposal.command, true).ok).toBe(true);
  return store.scene.objects.find(o => o.id === item.id)!;
}

test('a curtain is proposed over the window and the editor hangs it centred there', () => {
  const scene = editorToDesigner(editorScene(), { catalog });
  const [pose] = mountPoses(scene, 'room', piece(curtain));
  expect(pose).toMatchObject({ mount: 'wall' });
  const hung = propose({ id: 'curtain-1', room_id: 'room', kind: 'curtain', name: curtain.name, pos: pose!.pos, rot: pose!.rot, size: piece(curtain).size, keep: false, sku: 'curtain', price: 20000, mount: 'wall' });
  expect(hung.host?.wallId).toBe('south');
  expect(hung.position[0]).toBeCloseTo(1.6);
});

test('a hanging planter is proposed by a window and hangs from the ceiling; outdoor rooms get none', () => {
  expect(isHangingPlanter(piece(planter))).toBe(true);
  const scene = editorToDesigner(editorScene(), { catalog });
  const [pose] = mountPoses(scene, 'room', piece(planter));
  expect(pose).toMatchObject({ mount: 'ceiling' });
  const hung = propose({ id: 'planter-1', room_id: 'room', kind: 'plant', name: planter.name, pos: pose!.pos, rot: pose!.rot, size: piece(planter).size, keep: false, sku: planter.id, price: 20000, mount: 'ceiling' });
  expect(hung.hangsFrom).toBe('ceiling');
  const balcony = { ...scene, rooms: [{ ...scene.rooms[0]!, zone: 'balcony' as const }] };
  expect(mountPoses(balcony, 'room', piece(planter))).toEqual([]);
  const item: Item = { id: 'p', room_id: 'room', kind: 'plant', name: planter.name, pos: pose!.pos, rot: 0, size: piece(planter).size, keep: false, mount: 'ceiling' };
  expect(localGeometryErrors({ ...balcony, items: [item] }).some(e => e.check === 'support')).toBe(true);
});

test('scenes with wall art, curtains and hanging planters import as hung items with no floor footprint', () => {
  const source = editorScene(), store = new EditorStore(source, catalog);
  expect(store.execute({ id: 'c1', label: 'Hang', source: 'human', baseRevision: 0, operations: [
    { type: 'add', object: { id: 'art', name: 'Print', assetId: 'art', position: [3, 0, 5.8], rotation: 0, scale: [1, 1, 1] } },
    { type: 'add', object: { id: 'curtain', name: 'Curtain', assetId: 'curtain', position: [1.6, 0, .3], rotation: 0, scale: [1, 1, 1] } },
    { type: 'add', object: { id: 'planter', name: 'Planter', assetId: planter.id, position: [3, 0, 3], rotation: 0, scale: [1, 1, 1] } }] }, true).ok).toBe(true);
  const scene = editorToDesigner(store.scene, { catalog });
  expect(Object.fromEntries(scene.items.map(i => [i.id, i.mount]))).toEqual({ art: 'wall', curtain: 'wall', planter: 'ceiling' });
  expect(localGeometryErrors(scene)).toEqual([]);
  expect(spaceMetrics(scene).rooms[0]!.walkways.some(w => /art|curtain|planter/.test(w.to))).toBe(false);
  expect(mountPoses(scene, 'room', piece(curtain))).toEqual([]);
});

test('search_catalog offers a curtain slot over the window, not a floor slot', async () => {
  const scene = editorToDesigner(editorScene(), { catalog });
  const query = async (p: { kind?: string }) => ({ results: p.kind === 'curtain' ? [{ id: 'curtain', kind: 'curtain', name: curtain.name, size_m: piece(curtain).size, price: 20000, currency: 'AMD', size_status: 'confirmed', styles: ['modern'], colors_image: ['beige'] }] : [] });
  const images = async (ids: string[]) => ({ content: [{ type: 'image' as const, mimeType: 'image/png', data: 'cHJldmlldw==' }, { type: 'text' as const, text: ids.map((id, i) => `${i + 1}. ${id} | photo`).join('\n') }] });
  const server = createTypedServer(scene, { catalogQuery: query, images }), client = new Client({ name: 't', version: '1' }), [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    const result = await client.callTool({ name: 'search_catalog', arguments: { room_id: 'room', queries: [{ kind: 'curtain' }] } });
    const value = JSON.parse((result.content as any[]).find(c => c.type === 'text').text);
    expect(value.candidates).toEqual([expect.objectContaining({ catalog_id: 'curtain', mount: 'wall' })]);
  } finally { await client.close(); await server.close(); }
});
