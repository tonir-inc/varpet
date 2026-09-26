import { expect, test } from 'vitest';
import { strategyMetrics } from '../src/metrics/strategy.js';
import type { Item, Scene } from '../src/scene.js';

const piece = (id: string, kind: string, pos: [number, number], rot = 0): Item => ({
  id, kind, name: id, room_id: 'r', pos, rot, size: [1, 0.6, 0.75], keep: false,
});
function scene(items: Item[] = []): Scene {
  return {
    rooms: [{ id: 'r', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]] }],
    walls: [{ id: 'east', room_id: 'r', a: [6, 0], b: [6, 6] }],
    openings: [{ id: 'window', wall_id: 'east', kind: 'window', offset: 0.5, width: 5, height: 1.4, sill: 0.8 }],
    items, fixed: [],
  };
}

test('daylight proxy measures the complete window span and rewards side light close to the desk', () => {
  const near = strategyMetrics(scene([piece('desk', 'desk', [4.5, 1])]));
  const far = strategyMetrics(scene([piece('desk', 'desk', [1.5, 1])]));
  expect(near.daylight_for_work.desks).toEqual([{ item_id: 'desk', window_id: 'window', distance_m: 1, side_light_alignment: 1 }]);
  expect(near.daylight_for_work.score).toBeGreaterThan(far.daylight_for_work.score);
  expect(near.daylight_for_work.basis).toMatch(/proxy/i);
  expect(near.daylight_for_work.basis).toMatch(/illuminance|glare/i);
});

test('a window ahead or behind a rotated desk does not score as side light', () => {
  for (const rotation of [90, 270]) {
    const metrics = strategyMetrics(scene([piece('desk', 'desk', [4.5, 3], rotation)]));
    expect(metrics.daylight_for_work.desks[0]!.side_light_alignment).toBe(0);
    expect(metrics.daylight_for_work.score).toBe(0);
  }
  expect(strategyMetrics(scene([piece('desk', 'desk', [4.5, 3], 180)])).daylight_for_work.desks[0]!.side_light_alignment).toBe(1);
});

test('touching the window span is a zero-distance boundary and absent windows remain unknown', () => {
  const touching = strategyMetrics(scene([piece('desk', 'desk', [5.5, 1])]));
  expect(touching.daylight_for_work.desks[0]!.distance_m).toBe(0);
  expect(touching.daylight_for_work.score).toBe(1);
  const noWindow = scene([piece('desk', 'desk', [4.5, 1])]); noWindow.openings = [];
  expect(strategyMetrics(noWindow).daylight_for_work).toMatchObject({ score: 0, desks: [{ item_id: 'desk', window_id: null, distance_m: null, side_light_alignment: null }] });
  expect(strategyMetrics(scene()).daylight_for_work).toMatchObject({ score: 0, desks: [] });
});

test('social proxy rewards mutual facing and counts the exact three-metre distance boundary', () => {
  const facing = scene([piece('sofa', 'sofa', [2, 3], 90), piece('armchair', 'armchair', [5, 3], 270)]);
  expect(strategyMetrics(facing).social_living).toMatchObject({ score: 1, seating_pairs_within_3m: 1, mean_facing_alignment: 1 });
  facing.items[1]!.rot = 90;
  expect(strategyMetrics(facing).social_living).toMatchObject({ score: 0, seating_pairs_within_3m: 1, mean_facing_alignment: 0 });
  facing.items[1]!.rot = 270; facing.items[1]!.pos[0] = 5.001;
  expect(strategyMetrics(facing).social_living).toMatchObject({ score: 0, seating_pairs_within_3m: 0, mean_facing_alignment: 0 });
});

test('work chairs and furniture in other rooms do not create social or desk-window matches', () => {
  const input = scene([piece('sofa', 'sofa', [2, 3], 90), piece('chair', 'office_chair', [4, 3], 270)]);
  expect(strategyMetrics(input).social_living).toMatchObject({ score: 0, seating_pairs_within_3m: 0 });
  input.rooms.push({ id: 'other', polygon: [[6, 0], [12, 0], [12, 6], [6, 6]] });
  input.items.push({ ...piece('other-desk', 'desk', [7, 3]), room_id: 'other' });
  expect(strategyMetrics(input).daylight_for_work.desks[0]!.window_id).toBeNull();
  expect(strategyMetrics(scene()).social_living).toMatchObject({ score: 0, seating_pairs_within_3m: 0, mean_facing_alignment: 0 });
});

test('strategy metrics are deterministic, independent of the clock and north, and leave the scene intact', () => {
  const input = scene([piece('desk', 'desk', [4.5, 3]), piece('a', 'sofa', [2, 2], 90), piece('b', 'armchair', [4, 2], 270)]);
  const original = structuredClone(input), first = strategyMetrics(input);
  expect(strategyMetrics(input)).toEqual(first);
  expect(strategyMetrics({ ...input, north_deg: 123 })).toEqual(first);
  expect(input).toEqual(original);
});
