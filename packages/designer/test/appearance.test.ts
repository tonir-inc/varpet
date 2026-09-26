import { expect, test } from 'vitest';
import { applyOps, parseOps, parseScene } from '../src/adapter.js';
import { DesignerSession } from '../src/session.js';
import { checkRequest } from '../src/request.js';
import { opsToolSchema } from '../src/tool-inputs.js';
import type { Scene } from '../src/scene.js';

function flat(): Scene {
  return { rooms: [{ id: 'room', polygon: [[0,0],[8,0],[8,8],[0,8]] }],
    walls: [{ id: 'wall', room_id: 'room', a: [0,0], b: [8,0], color: '#eeeeee', source_id: 'original-wall' }], openings: [], fixed: [],
    items: ['a','b'].map((id, i) => ({ id, kind: 'chair', name: id, room_id: 'room', pos: [2+i,2], rot: 0, size: [.5,.5,1], keep: false, color: '#888888', group_id: 'pair' })) };
}
const blue = { type: 'color' as const, target: 'wall' as const, id: 'wall', color: '#0000ff' };
test('paint the walls blue produces a checked preview without changing geometry or the scene', () => {
  const scene = flat(), original = structuredClone(scene), session = new DesignerSession(scene);
  session.setIntent({ room_id: 'room', colors: [{ target: 'wall', id: 'wall', color: '#0000ff' }] });
  const result = session.propose([blue], 'Preview blue paint on both faces of the wall. Paint and labour have not been quoted.');
  expect(result.ok, JSON.stringify(result)).toBe(true);
  expect(applyOps(scene,[blue]).walls[0]!.color).toBe('#0000ff');
  expect(scene).toEqual(original);
  expect(opsToolSchema.safeParse([blue]).success).toBe(true);
});
test('colour intent rejects omitted, wrong, extra and out-of-room changes', () => {
  const scene = flat(), session = new DesignerSession(scene);
  session.setIntent({ colors: [{ target: 'wall', id: 'wall', color: '#0000ff' }] });
  for (const ops of [[], [{ ...blue, color: '#ff0000' }], [blue, { type: 'color', target: 'item', id: 'a', color: '#0000ff' }], [blue, { type: 'move', id: 'a', pos: [4,4] }]]) {
    expect(session.propose(ops, 'Paint the wall blue.').ok).toBe(false);
  }
  const after = applyOps(scene,[blue]);
  expect(checkRequest(scene, after, [blue], {}, 0).ok).toBe(false);
  scene.rooms.push({ id: 'other', polygon: [[9,0],[13,0],[13,4],[9,4]] });
  const scoped = new DesignerSession(scene);
  scoped.setIntent({ room_id: 'other', colors: [{ target: 'wall', id: 'wall', color: '#0000ff' }] });
  expect(scoped.propose([blue], 'Paint.').ok).toBe(false);
});
test('wall aliases paint together, while object colours affect only the selected member', () => {
  const scene = flat(); scene.walls.push({ ...scene.walls[0]!, id: 'wall-alias' });
  expect(applyOps(scene,[blue]).walls.every(wall => wall.color === '#0000ff')).toBe(true);
  const session = new DesignerSession(scene);
  session.setIntent({ colors: [{ target: 'wall', id: 'wall', color: '#0000FF' }] });
  expect(session.propose([blue], 'Paint both wall faces.').ok).toBe(true);
  const recolored = applyOps(scene,[{ type: 'color', target: 'item', id: 'a', color: '#00ff00' }]);
  expect(recolored.items.map(item => item.color)).toEqual(['#00ff00','#888888']);
  expect(recolored.items.map(item => item.group_id)).toEqual(['pair','pair']);
});
test('invalid colours, structural patches, kept items and locked walls cannot be painted', () => {
  for (const color of ['blue','#fff','#0000ff00','']) expect(() => parseOps([{ ...blue, color }])).toThrow();
  expect(() => parseOps([{ ...blue, a: [1,1] }])).toThrow();
  const scene = flat(); scene.walls[0]!.keep = true;
  expect(() => applyOps(scene,[blue])).toThrow(/kept|locked/i);
  scene.items[0]!.keep = true;
  expect(() => applyOps(scene,[{ type: 'color', target: 'item', id: 'a', color: '#0000ff' }])).toThrow(/kept/i);
});
test('one group anchor operation rigidly translates and rotates all members and preserves identity', () => {
  const scene = flat(), original = structuredClone(scene);
  const after = applyOps(scene,[{ type: 'move', id: 'a', pos: [4,4], rot: 90 }]);
  expect(after.items[0]).toMatchObject({ pos: [4,4], rot: 90, group_id: 'pair' });
  expect(after.items[1]!.pos[0]).toBeCloseTo(4);
  expect(after.items[1]!.pos[1]).toBeCloseTo(5);
  expect(after.items[1]!.rot).toBe(90);
  expect(scene).toEqual(original);
  expect(parseScene(scene).items[0]).toMatchObject({ group_id: 'pair', color: '#888888' });
});
test('group movement respects any member keep, including intent-only keeps and touch-restore operations', () => {
  const scene = flat(), move = { type: 'move' as const, id: 'a', pos: [4,4] as [number,number] };
  const session = new DesignerSession(scene); session.setIntent({ keeps: ['b'] });
  expect(session.propose([move], 'Move the group.').ok).toBe(false);
  expect(session.propose([move,{ ...move, pos: [2,2] }], 'Move and restore the group.').ok).toBe(false);
  scene.items[1]!.keep = true;
  expect(() => applyOps(scene,[move])).toThrow(/kept|group/i);
});
