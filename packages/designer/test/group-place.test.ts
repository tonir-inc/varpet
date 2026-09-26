import { expect, test } from 'vitest';
import { applyOps } from '../src/adapter.js';
import { checkLayout, scoreLayout } from '../src/layout.js';
import { place, type PlaceRequest } from '../src/place.js';
import { placeBatch } from '../src/place-batch.js';
import type { Item, Scene } from '../src/scene.js';

function piece(id: string, pos: [number, number], group_id?: string): Item {
  return { id, name: id, kind: 'box', room_id: 'r', pos, rot: 0, size: [.5, .5, .5], keep: false, ...(group_id ? { group_id } : {}) };
}
function room(): Scene {
  return { rooms: [{ id: 'r', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]] }],
    walls: [{ id: 'north', room_id: 'r', a: [6, 6], b: [0, 6] }, { id: 'south', room_id: 'r', a: [0, 0], b: [6, 0] }],
    openings: [], fixed: [], items: [piece('anchor', [1, 3], 'pair'), piece('member', [3, 3], 'pair')] };
}
const centered: PlaceRequest = { room_id: 'r', item_id: 'anchor', relations: [{ type: 'centered' }] };

test('relation placement moves a group onto a members old position without treating that member as stationary', () => {
  const scene = room(), original = structuredClone(scene);
  const result = place(scene, centered);
  expect(result.candidates.length).toBeGreaterThan(0);
  for (const candidate of result.candidates) {
    expect(candidate.op).toMatchObject({ type: 'move', id: 'anchor', pos: [3, 3] });
    const after = applyOps(scene, [candidate.op]), anchor = after.items.find(item => item.id === 'anchor')!, member = after.items.find(item => item.id === 'member')!;
    const angle = candidate.item.rot * Math.PI / 180;
    expect(member.pos[0]).toBeCloseTo(3 + 2 * Math.cos(angle), 8);
    expect(member.pos[1]).toBeCloseTo(3 + 2 * Math.sin(angle), 8);
    expect(member.rot).toBeCloseTo(anchor.rot, 8);
    expect(checkLayout(after).ok).toBe(true);
  }
  expect(scene).toEqual(original);
});

test('every centered orientation is rejected if another group member hits an obstacle', () => {
  const scene = room();
  scene.items = [piece('anchor', [.5, .5], 'pair'), piece('member', [2.5, .5], 'pair'),
    ...([[5, 3], [3, 5], [1, 3], [3, 1]] as [number, number][]).map((pos, index) => piece(`obstacle-${index}`, pos))];
  expect(checkLayout(scene).ok).toBe(true);
  const result = place(scene, centered);
  expect(result.candidates).toEqual([]);
  expect(result.rejections.overlap).toBeGreaterThan(0);
});

test('group containment is checked for all members even when the selected anchor fits', () => {
  const scene = room();
  scene.rooms[0]!.polygon = [[0, 0], [4, 0], [4, 4], [0, 4]];
  scene.walls = [];
  scene.items = [piece('anchor', [.5, .5], 'pair'), piece('member', [3.5, .5], 'pair')];
  expect(checkLayout(scene).ok).toBe(true);
  const result = place(scene, centered);
  expect(result.candidates).toEqual([]);
  expect(result.rejections.inside).toBeGreaterThan(0);
});

test('a kept group member prevents moving its otherwise movable anchor', () => {
  const scene = room(); scene.items[1]!.keep = true;
  expect(() => place(scene, centered)).toThrow(/kept|group.*cannot/i);
  expect(() => placeBatch(scene, [centered])).toThrow(/kept|group.*cannot/i);
});

test('a batch rejects two requests selecting different members of one group', () => {
  expect(() => placeBatch(room(), [centered, { ...centered, item_id: 'member' }])).toThrow(/duplicate.*group|group.*duplicate/i);
});

test('group batch returns one rigid move and scores the exact full pose that will be applied', () => {
  const scene = room(), original = structuredClone(scene);
  const result = placeBatch(scene, [centered]);
  expect(result.candidates.length).toBeGreaterThan(0);
  for (const candidate of result.candidates) {
    expect(candidate.ops).toHaveLength(1);
    expect(candidate.ops[0]).toMatchObject({ type: 'move', id: 'anchor', pos: [3, 3] });
    const after = applyOps(scene, candidate.ops), anchor = after.items.find(item => item.id === 'anchor')!, member = after.items.find(item => item.id === 'member')!;
    expect(Math.hypot(member.pos[0] - anchor.pos[0], member.pos[1] - anchor.pos[1])).toBeCloseTo(2, 8);
    expect(checkLayout(after).ok).toBe(true);
    expect(candidate.score).toEqual(scoreLayout(scene, candidate.ops));
  }
  expect(scene).toEqual(original);
});

test('a bounded batch supports mixed grouped and ungrouped requests without altering group shape', () => {
  const scene = room(); scene.items.push(piece('loose', [4, 1]));
  const result = placeBatch(scene, [
    { ...centered, relations: [{ type: 'against_wall', wall_id: 'north' }] },
    { room_id: 'r', item_id: 'loose', relations: [{ type: 'against_wall', wall_id: 'south' }] },
  ]);
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.search).toEqual({ beam_width: 8, max_pieces: 6, exhaustive: false });
  for (const candidate of result.candidates) {
    expect(candidate.ops.map(op => op.type === 'move' ? op.id : '')).toEqual(['anchor', 'loose']);
    const after = applyOps(scene, candidate.ops);
    expect(checkLayout(after).ok).toBe(true);
    expect(after.items.find(item => item.id === 'member')!.pos[1]).toBeCloseTo(5.75, 8);
  }
});

test('group batches retain strict default checks and require an explicit baseline preview for existing issues', () => {
  const scene = room(); scene.items.push(piece('already-outside', [20, 20]));
  expect(placeBatch(scene, [centered]).candidates).toEqual([]);
  expect(placeBatch(scene, [centered], { compareBaseline: true }).candidates.length).toBeGreaterThan(0);
});

test('a relation cannot use a member of the moving group as a stationary anchor', () => {
  expect(() => place(room(), { ...centered, relations: [{ type: 'beside', anchor_id: 'member', side: 'left' }] })).toThrow(/self.*group|group.*anchor/i);
});

test('wall exclusions apply to all transformed group members', () => {
  const scene = room(); scene.items = [piece('anchor', [.25, 1], 'pair'), piece('member', [3, 1], 'pair')];
  const result = place(scene, { ...centered, exclusions: { wall_ids: ['north'] } });
  expect(result.candidates).toHaveLength(3);
  expect(result.candidates.map(candidate => candidate.item.rot)).not.toContain(90);
  expect(result.rejections['excluded wall or opening']).toBeGreaterThan(0);
});
