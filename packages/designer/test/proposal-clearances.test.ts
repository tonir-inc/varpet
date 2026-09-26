import { expect, test } from 'vitest';
import { checkLayout } from '../src/layout.js';
import type { LayoutMetrics } from '../src/layout.js';
import type { FunctionClearance } from '../src/metrics/function.js';
import type { Walkway } from '../src/metrics/space.js';
import { proposalClearanceRegressions } from '../src/proposal-clearances.js';
import type { Scene } from '../src/scene.js';

type ClearanceMetrics = Pick<LayoutMetrics, 'function_clearances' | 'space'>;
function clearance(overrides: Partial<FunctionClearance> = {}): FunctionClearance {
  return { item_id: 'bed', function: 'bed_side', side: 'right', clearance_m: 0.6,
    minimum_m: 0.6, deficit_m: 0, status: 'good', at: [2, 3], ...overrides };
}
function path(width: number, overrides: Partial<Walkway> = {}): Walkway {
  return { from: 'opening:door', to: 'item:bed', reachable: true, width_m: width,
    status: width < 0.75 ? 'warn' : 'adequate', narrowest: [1, 2], path: [[0, 2], [2, 2]], ...overrides };
}
function metrics(functions: FunctionClearance[] = [], walkways: Walkway[] = [], room = 'bedroom'): ClearanceMetrics {
  return { function_clearances: functions, space: { free_area_m2: 10,
    rooms: [{ room_id: room, free_area_m2: 10, largest_free_rectangle: null, walkways }] } };
}

test('rejects a sofa-to-coffee-table maximum-gap regression, in metres', () => {
  const gap = (value: number) => clearance({ item_id: 'sofa', other_item_id: 'coffee', function: 'sofa_coffee',
    side: 'front', clearance_m: value, minimum_m: 0.36, maximum_m: 0.46,
    excess_m: value - 0.46, deficit_m: 0, status: 'warn' });
  const issues = proposalClearanceRegressions(metrics([gap(0.535)]), metrics([gap(0.765)]));
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject({ check: 'function_clearance', severity: 'hard', item_ids: ['sofa', 'coffee'], at: [2, 3] });
  expect(issues[0]!.deficit_m).toBeCloseTo(0.305, 8);
  for (const measurement of ['0.535 m', '0.765 m', '0.360', '0.460 m']) expect(issues[0]!.message).toContain(measurement);
});

test('an existing left-side bed deficit cannot mask a new right-side deficit', () => {
  const left = clearance({ side: 'left', clearance_m: 0.3, deficit_m: 0.3, status: 'warn' });
  const right = clearance({ clearance_m: 0.5075, deficit_m: 0.0925, status: 'warn' });
  const issues = proposalClearanceRegressions(metrics([left, clearance({ clearance_m: 1.25 })]), metrics([left, right]));
  expect(issues).toHaveLength(1);
  expect(issues[0]!.deficit_m).toBeCloseTo(0.0925, 8);
  expect(issues[0]!.message).toContain('right');
  expect(issues[0]!.message).toContain('1.250 m');
});

test('tracks item, function and other-item identity independently', () => {
  const baseline = clearance({ item_id: 'sofa', other_item_id: 'old-coffee', function: 'sofa_coffee', side: 'front',
    clearance_m: 0.9, minimum_m: 0.36, maximum_m: 0.46, excess_m: 0.44, status: 'warn' });
  const changed = { ...baseline, other_item_id: 'new-coffee', clearance_m: 0.6, excess_m: 0.14 };
  expect(proposalClearanceRegressions(metrics([baseline]), metrics([changed]))).toHaveLength(1);
  expect(proposalClearanceRegressions(metrics([clearance({ deficit_m: 0.2 })]),
    metrics([clearance({ item_id: 'another-bed', deficit_m: 0.1 })]))).toHaveLength(1);
});

test('allows unchanged appearance metrics and improvements below the preferred minimum', () => {
  const before = metrics([clearance({ clearance_m: 0.4, deficit_m: 0.2, status: 'warn' })], [path(0.6)]);
  expect(proposalClearanceRegressions(before, structuredClone(before))).toEqual([]);
  const after = metrics([clearance({ clearance_m: 0.5, deficit_m: 0.1, status: 'warn' })],
    [path(0.7, { from: 'item:bed', to: 'opening:door' })]);
  expect(proposalClearanceRegressions(before, after)).toEqual([]);
});

test('rejects a new preferred 0.75 m walkway deficit above the physical minimum', () => {
  const issues = proposalClearanceRegressions(metrics([], [path(0.8)]), metrics([], [path(0.7)]));
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject({ check: 'walkway', severity: 'hard', room_id: 'bedroom', item_ids: ['bed'],
    at: [1, 2], walkway: { from: 'opening:door', to: 'item:bed', reachable: true } });
  expect(issues[0]!.deficit_m).toBeCloseTo(0.05, 8);
  for (const measurement of ['0.800 m', '0.700 m', '0.750 m']) expect(issues[0]!.message).toContain(measurement);
});

test('does not borrow a walkway baseline from another room', () => {
  const issues = proposalClearanceRegressions(metrics([], [path(0.6)], 'living'), metrics([], [path(0.7)], 'bedroom'));
  expect(issues).toHaveLength(1);
  expect(issues[0]!.room_id).toBe('bedroom');
});

test('unreachable routes have a full 0.75 m deficit and unchanged ones remain allowed', () => {
  const blocked = metrics([], [path(0, { reachable: false, status: 'fail', path: [] })]);
  const issues = proposalClearanceRegressions(metrics([], [path(0.6)]), blocked);
  expect(issues).toHaveLength(1);
  expect(issues[0]!.deficit_m).toBe(0.75);
  expect(issues[0]!.message).toContain('unreachable');
  expect(proposalClearanceRegressions(blocked, structuredClone(blocked))).toEqual([]);
});

test('ignores sub-micrometre differences but rejects a larger measured regression', () => {
  const before = metrics([clearance({ deficit_m: 0.1, clearance_m: 0.5 })]);
  expect(proposalClearanceRegressions(before, metrics([clearance({ deficit_m: 0.1000005, clearance_m: 0.4999995 })]))).toEqual([]);
  expect(proposalClearanceRegressions(before, metrics([clearance({ deficit_m: 0.100002, clearance_m: 0.499998 })]))).toHaveLength(1);
  expect(proposalClearanceRegressions(metrics(), metrics([clearance({ deficit_m: 0.000001 })]))).toEqual([]);
});

test('removed items and routes create no artificial clearance regression', () => {
  expect(proposalClearanceRegressions(metrics([clearance({ deficit_m: 0.3 })], [path(0.6)]), metrics())).toEqual([]);
});

test('leaves global layout guidance soft while the proposal comparison rejects new gaps', () => {
  const scene: Scene = { rooms: [{ id: 'r', polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] }], walls: [], openings: [], fixed: [],
    items: [{ id: 'sofa', kind: 'sofa', name: 'Sofa', room_id: 'r', pos: [2.5, 3], size: [2, 1, 1], rot: 0, keep: false },
      { id: 'coffee', kind: 'coffee_table', name: 'Coffee table', room_id: 'r', pos: [2.5, 1.85], size: [1, 0.5, 0.5], rot: 0, keep: false }] };
  const before = checkLayout(scene);
  const after = checkLayout(scene, [{ type: 'move', id: 'coffee', pos: [2.5, 1.65] }]);
  expect(before.ok).toBe(true);
  expect(after.ok).toBe(true);
  expect(after.errors).toContainEqual(expect.objectContaining({ check: 'function_clearance', severity: 'soft' }));
  const original = structuredClone({ before: before.metrics!, after: after.metrics! });
  const issues = proposalClearanceRegressions(before.metrics!, after.metrics!);
  expect(issues).toHaveLength(1);
  expect(issues[0]!.deficit_m).toBeCloseTo(0.14, 6);
  expect({ before: before.metrics, after: after.metrics }).toEqual(original);
});
