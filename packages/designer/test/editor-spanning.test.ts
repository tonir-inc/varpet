import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { SceneDocument, CatalogAsset } from '../../../apps/editor/src/contracts.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { emptyProject } from '../../../apps/editor/src/core/renovation.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { DesignerSession } from '../src/session.js';
import { itemPolygon, rasterizeRoom } from '../src/metrics/space.js';
import { footprintRoomArea } from '../src/room-ownership.js';
import type { Scene } from '../src/scene.js';
import { localGeometryErrors } from '../src/local-checks.js';

const startup = JSON.parse(readFileSync(new URL('../../../apartments/sunday-b12121/startup.json', import.meta.url), 'utf8'));
const furnished = JSON.parse(readFileSync(new URL('../../../apartments/sunday-b12121/scene.furnished.json', import.meta.url), 'utf8'));
const catalog: CatalogAsset[] = [{ id: 'seat', name: 'Seat', kind: 'chair', category: 'Seats', dimensions: [1, 1, 1], color: '#888888', price: 0, source: { type: 'procedural' } }];
function source(): SceneDocument {
  return { format: 'varpet.editor', version: 2, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y', project: emptyProject(),
    rooms: [{ id: 'left', name: 'Left', color: '#ffffff', polygon: [[0,0],[4,0],[4,4],[0,4]] }, { id: 'right', name: 'Right', color: '#ffffff', polygon: [[4,0],[8,0],[8,4],[4,4]] }],
    walls: [], objects: [{ id: 'seat', name: 'Seat', assetId: 'seat', position: [3.8,0,2], rotation: 0, scale: [1,1,1] }] };
}
function spanningObjects(scene: Scene) {
  return [...scene.items, ...scene.fixed].map(item => ({
    item,
    shares: scene.rooms.map(room => ({ room, area: footprintRoomArea(itemPolygon(item), room.polygon) }))
      .filter(share => share.area > 1e-7).sort((a, b) => b.area - a.area),
  })).filter(({ shares }) => shares.length > 1);
}
function expectSpanningObstacles(scene: Scene) {
  const spanning = spanningObjects(scene);
  expect(spanning.length).toBeGreaterThan(0);
  for (const { item, shares } of spanning) {
    const owner = shares.find(share => share.room.id === item.room_id);
    expect(owner?.area).toBeCloseTo(shares[0]!.area, 7);
    expect(scene.conversion_warnings?.some(w => w.includes(`Object ${item.id} assigned to ${item.room_id}`))).toBe(true);
    for (const { room } of shares.filter(share => share.room.id !== item.room_id)) {
      const withObject = rasterizeRoom(scene, room);
      const without = rasterizeRoom({ ...scene,
        items: scene.items.filter(i => i.id !== item.id),
        fixed: scene.fixed.filter(i => i.id !== item.id),
      }, room);
      expect([...withObject.occupied].some((cell, i) => cell > without.occupied[i]!)).toBe(true);
    }
  }
}
for (const [name, input] of [['furnished', furnished], ['startup', startup.scene]] as const) test(`Sunday ${name} assigns spanning objects by majority and blocks neighbouring rooms`, () => {
  expectSpanningObstacles(editorToDesigner(input, { catalog: startup.catalog }));
});
test('a synthetic stool spans two rooms, belongs to the majority room and blocks its neighbour', () => {
  const input = source();
  input.objects[0]!.name = 'Stool';
  const scene = editorToDesigner(input, { catalog });
  expect(scene.items[0]!.room_id).toBe('left');
  expectSpanningObstacles(scene);
});
test('cross-room collisions are checked and an unrelated proposal preserves every editor object', () => {
  const input = source();
  input.objects.push({ ...input.objects[0]!, id: 'other', position: [6,0,2] });
  const scene = editorToDesigner(input, { catalog });
  const collision = structuredClone(scene); collision.items[1]!.pos = [4.3,-2];
  expect(localGeometryErrors(collision).some(e => e.check === 'overlap' && e.item_ids.includes('seat'))).toBe(true);
  const session = new DesignerSession(scene);
  session.setIntent({ colors: [{ target: 'item', id: 'other', color: '#abcdef' }] });
  const result = session.propose([{ type: 'color', target: 'item', id: 'other', color: '#abcdef' }], 'Recolour the other seat.');
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) return;
  const translated = proposalToEditor(result.proposal, input, 0, { catalog });
  expect(translated.description).toMatch(/assigned/i);
  const store = new EditorStore(input, catalog);
  expect(store.execute(translated.command, true).ok).toBe(true);
  expect(store.scene.objects[0]).toEqual(input.objects[0]);
});
test.each(['outside', 'elevated'] as const)('%s object becomes a warned fixed obstacle', mode => {
  const input = source(); input.objects[0]!.position = mode === 'outside' ? [12,0,2] : [2,1,2];
  const scene = editorToDesigner(input, { catalog });
  expect(scene.fixed.find(i => i.id === 'seat')).toMatchObject({ keep: true, room_id: mode === 'outside' ? 'right' : 'left' });
  expect(JSON.stringify(scene)).toMatch(/warning|fixed obstacle/i);
  expect(scene.items).toHaveLength(0);
});

test('Sunday wall-colour proposal preserves every object, material and support byte-for-byte', () => {
  const input = structuredClone(furnished), options = { catalog: startup.catalog };
  const scene = editorToDesigner(input, options), wall = scene.walls.find(w => !w.open)!;
  const session = new DesignerSession(scene);
  session.setIntent({ colors: [{ target: 'wall', id: wall.id, color: '#abcdef' }] });
  const result = session.propose([{ type: 'color', target: 'wall', id: wall.id, color: '#abcdef' }], 'Paint this wall.');
  console.info('Sunday wall-colour proposal:', JSON.stringify({ ok: result.ok, errors: result.ok ? [] : result.errors }));
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) return;
  const spanning = spanningObjects(scene);
  expect(spanning.length).toBeGreaterThan(0);
  for (const { item } of spanning) {
    expect(result.proposal.checks.notes?.some(n => n.check === 'object_conversion' && n.message.includes(`Object ${item.id} assigned`))).toBe(true);
  }
  const proposal = proposalToEditor(result.proposal, input, 0, options);
  const store = new EditorStore(input, startup.catalog);
  expect(store.execute(proposal.command, true).ok).toBe(true);
  expect(JSON.stringify(store.scene.objects)).toBe(JSON.stringify(input.objects));
}, 20000);

test('fully outside fixed obstacle does not block an unrelated colour proposal', () => {
  const input = source(); input.objects[0]!.position = [12,0,2];
  input.objects.push({ ...input.objects[0]!, id: 'other', position: [2,0,2] });
  const session = new DesignerSession(editorToDesigner(input, { catalog }));
  session.setIntent({ colors: [{ target: 'item', id: 'other', color: '#abcdef' }] });
  const result = session.propose([{ type: 'color', target: 'item', id: 'other', color: '#abcdef' }], 'Paint other seat.');
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (result.ok) expect(proposalToEditor(result.proposal, input, 0, { catalog }).command.operations).toHaveLength(1);
});

test('majority area wins over centre; ties use centre, then nearest room, independent of room order', async () => {
  const { footprintOwner, footprintRoomArea } = await import('../src/room-ownership.js');
  const footprint: [number, number][] = [[0,0],[4,0],[4,2],[0,2]];
  const rect = (id: string, x: number, y: number, w: number, h: number) => ({ id, polygon: [[x,y],[x+w,y],[x+w,y+h],[x,y+h]] as [number, number][] });
  const majority = rect('majority', 0,0,3,2), centre = rect('centre', 1.8,.8,.4,.4);
  expect(footprintOwner(footprint, [2,1], [centre, majority]).room.id).toBe('majority');
  const equal = rect('equal', 0,0,1,1), centred = rect('centred', 1.5,.5,1,1);
  expect(footprintOwner(footprint, [2,1], [equal, centred]).room.id).toBe('centred');
  const near = rect('near', 5,0,1,1), far = rect('far', 10,0,1,1);
  expect(footprintOwner(footprint, [2,1], [far, near]).room.id).toBe('near');
  // Concave U: the clipped footprint intersects two disconnected arms, total area 2.
  const concave: [number, number][] = [[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4]];
  const slice: [number, number][] = [[0,2],[4,2],[4,3],[0,3]];
  expect(footprintRoomArea(slice, concave)).toBeCloseTo(2);
  expect(footprintRoomArea([...slice].reverse(), [...concave].reverse())).toBeCloseTo(2);
});

test('a cross-room footprint reduces functional clearance and is an away_from anchor', async () => {
  const { functionClearances } = await import('../src/metrics/function.js');
  const { checkRequest } = await import('../src/request.js');
  const input = source();
  input.objects.push({ ...input.objects[0]!, id: 'other', position: [4.9,0,2], rotation: Math.PI / 2, scale: [.5,1,.5] });
  const scene = editorToDesigner(input, { catalog });
  const clearance = functionClearances(scene).find(c => c.item_id === 'other')!;
  const without = functionClearances({ ...scene, items: scene.items.filter(i => i.id !== 'seat') }).find(c => c.item_id === 'other')!;
  expect(clearance.clearance_m).toBeLessThan(without.clearance_m);
  const request = checkRequest(scene, scene, [], { preferences: [{ type: 'away_from', item_id: 'other', anchor_id: 'seat', min_distance_m: 1 }] }, 0);
  expect(request.errors.some(e => e.check === 'preference' && !e.message.includes('unknown anchor'))).toBe(true);
});

test.each(['wall', 'metadata', 'support'] as const)('single-object %s problem remains a warned obstacle', mode => {
  const input = source();
  if (mode === 'wall') input.walls.push({ id: 'partition', start: [3.8,0], end: [3.8,4], thickness: .1, height: 2.7, color: '#ffffff', openings: [] });
  if (mode === 'metadata') input.project!.metadata.seat = { phase: 'remove' };
  if (mode === 'support') {
    catalog.push({ ...catalog[0]!, id: 'decor', kind: 'decor' });
    input.objects.push({ ...input.objects[0]!, id: 'decoration', assetId: 'decor', position: [6,1,2], restsOn: 'seat' });
  }
  try {
    const scene = editorToDesigner(input, { catalog });
    expect(scene.fixed.some(i => i.id === 'seat')).toBe(true);
    expect(scene.conversion_warnings?.some(w => w.includes('seat') && w.includes('fixed obstacle'))).toBe(true);
    if (mode === 'support') expect(scene.fixed.some(i => i.id === 'decoration')).toBe(true);
  } finally { if (mode === 'support') catalog.pop(); }
});
