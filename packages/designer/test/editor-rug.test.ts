import { expect, test } from 'vitest';
import { applyOps, sceneSummary } from '../src/adapter.js';
import { checkLayout, scoreLayout } from '../src/layout.js';
import { localGeometryErrors } from '../src/local-checks.js';
import { functionClearances } from '../src/metrics/function.js';
import { spaceMetrics } from '../src/metrics/space.js';
import { place, type PlaceRequest } from '../src/place.js';
import { DesignerSession } from '../src/session.js';
import type { Item, Scene } from '../src/scene.js';

function piece(id: string, kind: string, pos: [number, number], size: [number, number, number]): Item {
  return { id, kind, name: id, room_id: 'r', pos, rot: 0, size, keep: false };
}
function room(items: Item[] = []): Scene {
  return { rooms: [{ id: 'r', polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] }],
    walls: [{ id: 'south', room_id: 'r', a: [0, 0], b: [5, 0] },
      { id: 'north', room_id: 'r', a: [5, 5], b: [0, 5] }],
    openings: ['south', 'north'].map(wall_id => ({ id: `${wall_id}-door`, wall_id,
      kind: 'door', offset: 2, width: 1, height: 2.1, sill: 0, swing: 'none' })),
    items, fixed: [] };
}
const rug = () => piece('rug', 'rug', [2.5, 2.5], [5, 5, .02]);

test('a rug underneath furniture preserves free usable floor and every existing walkway', () => {
  const bare = room([piece('desk', 'desk', [2.5, 3.5], [1.2, .6, .75])]);
  const covered = structuredClone(bare); covered.items.push(rug());
  expect(checkLayout(bare).ok).toBe(true);
  expect(checkLayout(covered).ok).toBe(true);
  expect(spaceMetrics(covered)).toEqual(spaceMetrics(bare));
  expect(spaceMetrics(covered).rooms[0]!.walkways.some(path => path.to === 'item:rug')).toBe(false);
});

test('floor rugs can overlap each other but ordinary furniture on them still collides', () => {
  const secondRug = { ...rug(), id: 'rug-2' };
  expect(checkLayout(room([rug(), secondRug])).ok).toBe(true);
  const scene = room([rug(), piece('sofa', 'sofa', [2, 2], [1, 1, .8]),
    piece('table', 'table', [2.4, 2], [1, 1, .6])]);
  const overlaps = localGeometryErrors(scene).filter(error => error.check === 'overlap');
  expect(overlaps).toHaveLength(1);
  expect(overlaps[0]!.item_ids).toEqual(['sofa', 'table']);
  expect(checkLayout(scene).ok).toBe(false);
});

test('rug footprints touching the boundary fit, while overhanging or rotated outside rugs fail containment', () => {
  expect(checkLayout(room([rug()])).ok).toBe(true);
  for (const item of [{ ...rug(), pos: [2.5001, 2.5] as [number, number] }, { ...rug(), rot: 45 }]) {
    const result = checkLayout(room([item]));
    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.check === 'containment' && error.item_ids.includes('rug'))).toBe(true);
  }
});

test('a declared floor rug does not block a door sweep, while an equally low solid piece does', () => {
  const scene = room(); scene.openings[0]!.swing = 'inward-left';
  const floorCover = piece('mat', 'rug', [2.5, .5], [1, 1, .02]);
  scene.items = [floorCover];
  expect(localGeometryErrors(scene).filter(error => error.check === 'door_swing')).toEqual([]);
  expect(spaceMetrics(scene)).toEqual(spaceMetrics({ ...scene, items: [] }));
  scene.items = [{ ...floorCover, kind: 'box' }];
  expect(localGeometryErrors(scene).some(error => error.check === 'door_swing' && error.item_ids.includes('mat'))).toBe(true);
});

test('rugs do not reduce bed-side, chair pull-out or storage-front function clearances', () => {
  for (const kind of ['bed', 'chair', 'wardrobe']) {
    const bare = room([piece('furniture', kind, [2.5, 2.5], [1, 1, .8])]);
    const covered = structuredClone(bare); covered.items.push(rug());
    expect(functionClearances(bare).every(metric => metric.status === 'good')).toBe(true);
    expect(functionClearances(covered)).toEqual(functionClearances(bare));
  }
});

test('fixed rugs remain declared items without becoming obstacles or access destinations', () => {
  const bare = room([piece('chair', 'chair', [2.5, 3], [.6, .6, .8])]);
  const covered = structuredClone(bare); covered.fixed.push(rug());
  expect(checkLayout(covered).ok).toBe(true);
  expect(spaceMetrics(covered)).toEqual(spaceMetrics(bare));
  expect(functionClearances(covered)).toEqual(functionClearances(bare));
  expect(covered.fixed).toEqual([rug()]);
});

test('relation-generated furniture placements and advisory clearances ignore underlying rug edges', () => {
  const bare = room(), covered = room([{ ...rug(), size: [3, 3, .02] }]);
  const request: PlaceRequest = { room_id: 'r', item: { id: 'new-chair', kind: 'chair', size: [.5, .5, .8] },
    relations: [{ type: 'centered' }] };
  const withoutRug = place(bare, request), withRug = place(covered, request);
  expect(withoutRug.candidates).toHaveLength(3);
  expect(withRug.candidates).toEqual(withoutRug.candidates);
  expect(withRug.candidates[0]!.clearances).toMatchObject({ front_m: 2.25, back_m: 2.25, left_m: 2.25, right_m: 2.25 });
});

test('requested rug moves and removals remain accepted scene operations with immutable originals', () => {
  const ownedRug = { ...rug(), size: [3, 3, .02] as [number, number, number] };
  const scene = room([piece('desk', 'desk', [2.5, 3.5], [1.2, .6, .75]), ownedRug]);
  const original = structuredClone(scene), session = new DesignerSession(scene);
  session.setIntent({ room_id: 'r', keeps: ['desk'], move: [{ kinds: ['rug'], count: 1 }], budget_dram: 0 });
  const moves = [{ type: 'move' as const, id: 'rug', pos: [2, 2] as [number, number] }];
  const moved = session.propose(moves, 'Move the owned rug while keeping the desk unchanged.');
  expect(moved.ok).toBe(true);
  if (moved.ok) expect(moved.proposal.ops).toEqual(moves);
  expect(applyOps(scene, moves).items.find(item => item.id === 'rug')?.pos).toEqual([2, 2]);
  expect(sceneSummary(scene).items.some(item => item.id === 'rug' && item.kind === 'rug')).toBe(true);
  session.setIntent({ room_id: 'r', keeps: ['desk'], remove: [{ kinds: ['rug'], count: 1 }], budget_dram: 0 });
  expect(session.propose([{ type: 'remove', id: 'rug' }], 'Remove only the requested rug.').ok).toBe(true);
  const score = scoreLayout(scene, [{ type: 'remove', id: 'rug' }]);
  expect(score.after.space).toEqual(score.before.space);
  expect(scene).toEqual(original);
});
