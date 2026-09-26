import { expect, test } from 'vitest';
import { demoScene } from '../../../apps/editor/src/core/demo.js';
import { applyOps } from '../src/adapter.js';
import { editorToDesigner } from '../src/editor-bridge.js';
import { checkLayout } from '../src/layout.js';
import { checkLocalLayout, checkLocalLayoutChange, compareLayoutErrors, type LayoutError } from '../src/local-checks.js';
import type { Item, Scene } from '../src/scene.js';

function item(id: string, x: number, y: number): Item {
  return { id, room_id: 'r', kind: 'box', name: id, pos: [x, y], rot: 0, size: [1, 1, 1], keep: false };
}
function room(items: Item[] = []): Scene {
  return { rooms: [{ id: 'r', polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] }], walls: [], openings: [], items, fixed: [] };
}
function path(extra: Partial<LayoutError> = {}): LayoutError {
  return { check: 'walkway', room_id: 'r', item_ids: [], at: [1, 1], deficit_m: .2,
    walkway: { from: 'door:a', to: 'door:b', reachable: true }, message: 'Narrow path', ...extra };
}

test('static checks still reject existing violations; an explicit empty preview retains them as notes', () => {
  const scene = room([item('a', 1, 1), item('b', 1.75, 1)]);
  expect(checkLocalLayout(scene).ok).toBe(false);
  expect(checkLayout(scene).ok).toBe(false);
  expect(checkLayout(scene, []).ok).toBe(false);
  const preview = checkLayout(scene, [], { compareBaseline: true });
  expect(preview.ok).toBe(true);
  expect(preview.errors.filter(error => error.severity === 'hard')).toEqual([]);
  expect(preview.notes).toEqual([expect.objectContaining({ check: 'collision', severity: 'soft', item_ids: ['a', 'b'], overlap_depth_m: .25 })]);
  expect(preview.checks).toContainEqual({ check: 'collision', status: 'warning' });
});

test('actual editor demo accepts a living-room rearrangement despite unchanged bedroom paths', () => {
  const scene = editorToDesigner(demoScene), original = structuredClone(scene);
  const ops = [{ type: 'move' as const, id: 'coffee-table', pos: [-3.25, -1.3] as [number, number] }];
  expect(checkLocalLayout(scene).errors.some(error => error.item_ids.includes('bedside-table'))).toBe(true);
  const preview = checkLayout(scene, ops);
  expect(preview.ok).toBe(true);
  expect(preview.notes).toContainEqual(expect.objectContaining({ check: 'walkway', room_id: 'room-bedroom', item_ids: ['bedside-table'], severity: 'soft' }));
  expect(checkLocalLayout(applyOps(scene, ops)).ok).toBe(false);
  expect(scene).toEqual(original);
});

test('an unrelated move and a shallower existing overlap pass, but a deeper overlap fails', () => {
  const scene = room([item('a', 1, 1), item('b', 1.75, 1), item('c', 4, 4)]);
  expect(checkLayout(scene, [{ type: 'move', id: 'c', pos: [3, 4] }]).ok).toBe(true);
  const improved = checkLayout(scene, [{ type: 'move', id: 'b', pos: [1.9, 1] }]);
  expect(improved.ok).toBe(true);
  expect(improved.notes).toContainEqual(expect.objectContaining({ check: 'collision', deficit_m: expect.closeTo(.1, 8) }));
  const worsened = checkLayout(scene, [{ type: 'move', id: 'b', pos: [1.6, 1] }]);
  expect(worsened.ok).toBe(false);
  expect(worsened.errors).toContainEqual(expect.objectContaining({ check: 'collision', severity: 'hard', deficit_m: expect.closeTo(.4, 8) }));
});

test('containment improves to a note, worsens to an error, and disappears at exact floor boundary', () => {
  const scene = room([item('edge', .2, 2)]);
  expect(checkLayout(scene, [{ type: 'move', id: 'edge', pos: [.3, 2] }]).ok).toBe(true);
  const worse = checkLayout(scene, [{ type: 'move', id: 'edge', pos: [.1, 2] }]);
  expect(worse.ok).toBe(false);
  expect(worse.errors).toContainEqual(expect.objectContaining({ check: 'containment', deficit_m: expect.closeTo(.4, 8) }));
  const fixed = checkLayout(scene, [{ type: 'move', id: 'edge', pos: [.5, 2] }]);
  expect(fixed.ok).toBe(true);
  expect(fixed.notes).toEqual([]);
});

test('new collision pairs cannot replace an existing pair even with a smaller deficit', () => {
  const scene = room([item('a', 1, 1), item('b', 1.75, 1), item('c', 4, 1)]);
  const preview = checkLayout(scene, [{ type: 'move', id: 'b', pos: [3.9, 1] }]);
  expect(preview.ok).toBe(false);
  expect(preview.errors).toContainEqual(expect.objectContaining({ check: 'collision', item_ids: ['b', 'c'], severity: 'hard' }));
});

test('new collisions still block proposals from the already imperfect editor demo', () => {
  const scene = editorToDesigner(demoScene);
  const result = checkLayout(scene, [{ type: 'move', id: 'coffee-table', pos: [-3.25, -2.8] }]);
  expect(result.ok).toBe(false);
  expect(result.errors).toContainEqual(expect.objectContaining({ check: 'collision', item_ids: ['sofa', 'coffee-table'], severity: 'hard' }));
});

test('walkway identities include room and both endpoints, independent of wording, location and direction', () => {
  const before = path();
  const reversed = path({ message: 'Different wording', at: [2, 2], walkway: { from: 'door:b', to: 'door:a', reachable: true } });
  expect(compareLayoutErrors([before], [reversed])).toEqual({ errors: [], notes: [reversed] });
  for (const changed of [path({ room_id: 'other' }), path({ walkway: { from: 'door:a', to: 'door:c', reachable: true } })]) {
    expect(compareLayoutErrors([before], [changed])).toEqual({ errors: [changed], notes: [] });
  }
});

test('walkway comparison checks both deficit and reachability, including equal-deficit reachability loss', () => {
  const before = path({ deficit_m: .6 });
  const disconnected = path({ deficit_m: .6, walkway: { from: 'door:a', to: 'door:b', reachable: false } });
  expect(compareLayoutErrors([before], [disconnected]).errors).toEqual([disconnected]);
  expect(compareLayoutErrors([disconnected], [before]).notes).toEqual([before]);
  const wider = path({ deficit_m: .1 }), narrower = path({ deficit_m: .3 });
  expect(compareLayoutErrors([path()], [wider]).notes).toEqual([wider]);
  expect(compareLayoutErrors([path()], [narrower]).errors).toEqual([narrower]);
  expect(compareLayoutErrors([path()], [path({ deficit_m: .2 + 1e-10 })]).errors).toEqual([]);
  expect(compareLayoutErrors([path()], [path({ deficit_m: .2 + 1e-6 })]).errors).toHaveLength(1);
});

test('door-swing identity includes the door and missing measurements never silently become notes', () => {
  const before: LayoutError = { check: 'door_swing', room_id: 'r', opening_id: 'a', item_ids: ['box'], at: [1, 1], deficit_m: .2, message: 'Blocked door' };
  const newDoor = { ...before, opening_id: 'b' };
  expect(compareLayoutErrors([before], [newDoor]).errors).toEqual([newDoor]);
  const unknown = { ...before, deficit_m: undefined };
  expect(compareLayoutErrors([unknown], [unknown]).errors).toEqual([unknown]);
});

test('reusable scene comparison returns actual after metrics and never mutates either scene', () => {
  const before = room([item('a', 1, 1), item('b', 1.75, 1)]);
  const after = applyOps(before, [{ type: 'move', id: 'b', pos: [1.9, 1] }]);
  const snapshots = structuredClone({ before, after });
  const result = checkLocalLayoutChange(before, after);
  expect(result.ok).toBe(true);
  expect(result.errors).toEqual([]);
  expect(result.notes).toHaveLength(1);
  expect(result.metrics).toEqual(checkLocalLayout(after).metrics);
  expect({ before, after }).toEqual(snapshots);
});

test('rotation cannot hide a deeper containment violation behind an improved first corner', () => {
  const scene = room([item('edge', .2, 2)]);
  const result = checkLayout(scene, [{ type: 'move', id: 'edge', pos: [.2, 2], rot: 15 }]);
  expect(result.ok).toBe(false);
  expect(result.errors).toContainEqual(expect.objectContaining({ check: 'containment', severity: 'hard', deficit_m: expect.closeTo((Math.cos(Math.PI / 12) + Math.sin(Math.PI / 12)) / 2 - .2, 8) }));
  const touching = room([item('edge', .5, 2)]);
  expect(checkLayout(touching).ok).toBe(true);
  expect(checkLayout(touching, [{ type: 'move', id: 'edge', pos: [.5, 2], rot: 15 }]).ok).toBe(false);
});
