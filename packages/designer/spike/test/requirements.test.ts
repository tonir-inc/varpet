import { describe, expect, test } from 'vitest';
import type { Scene } from '../../src/scene.js';
import type { DraftItem } from '../lib/finishes.js';
import { describeNeeds, paintProblems, requirementProblems, roomCounts } from '../lib/requirements.js';

const scene = { rooms: [{ id: 'liv', name: 'Living', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]] }], walls: [], openings: [], items: [], fixed: [] } as unknown as Scene;
const item = (id: string, kind: string, pos: [number, number], size: [number, number, number], rot = 0, name = kind, price = 100): DraftItem =>
  ({ id, room_id: 'liv', kind, name, pos, rot, size, keep: false, sku: id, price, vendor: 'v' }) as DraftItem;
// A 1.6 x 0.9 table at (3, 3); chairs above and below it, pulled up; one stranded chair 1.5 m away.
const table = item('table', 'table', [3, 3], [1.6, 0.9, 0.75], 0, 'Oak dining table');
const chair = (id: string, x: number, y: number, rot: number) => item(id, 'chair', [x, y], [0.45, 0.5, 0.8], rot);
const items = [table, chair('c1', 2.5, 3.65, 180), chair('c2', 3.5, 3.65, 180), chair('c3', 2.5, 2.35, 0), chair('c4', 3.5, 2.35, 0),
  chair('far', 3, 0.8, 0), item('sofa', 'sofa', [1, 5.4], [2.1, 0.9, 0.8], 180), item('bed', 'bed', [5, 5], [1.6, 2.0, 0.5]),
  item('desk', 'desk', [5.3, 1], [1.2, 0.6, 0.75]), item('dchair', 'chair', [5.3, 1.6], [0.5, 0.5, 0.9], 180), item('rug', 'rug', [3, 3], [2, 3, 0.01])];

describe('requirements', () => {
  test('counts seats at a table, lounge seats, bed places and desks', () => {
    expect(roomCounts(items)).toEqual({ seats_at_table: 4, seats: 4, desks: 1, desk_chairs: 1, sleepers: 2 });
  });

  test('every unmet count, missing piece, excluded kind and budget overrun is a hard line naming the room', () => {
    const lines = requirementProblems(scene, { items, finishes: [{ room_id: 'liv', surface: 'walls', material: 'paint', color: '#A8B5A2' }] }, { rooms: { liv: {
      seats_at_table: 6, sleepers: 2, desks: 1, items: [{ kind: 'tv', min: 1 }, { kind: 'sofa' }], exclude: ['rug'], budget_dram: 500 } } });
    expect(lines).toEqual([
      'requirements: liv has 4 seats at one table; the brief needs 6',
      'requirements: liv has 0 tv; the brief needs 1',
      'requirements: liv must have no rug (brief); remove rug',
      'requirements: liv costs 1100 AMD, over its 500 AMD share by more than 10%',
    ]);
  });

  test('an undesigned room and a met brief are quiet; an unknown room is reported', () => {
    expect(requirementProblems(scene, { items: [] }, { rooms: { liv: { seats_at_table: 6 } } })).toEqual([]);
    expect(requirementProblems(scene, { items, finishes: [{ room_id: 'liv', surface: 'wall', wall_id: 'w', material: 'paint', color: '#7D93A8' }] }, { rooms: { liv: { seats_at_table: 4, desk_chairs: 1 } } })).toEqual([]);
    expect(requirementProblems(scene, { items }, { rooms: { nope: {} } })).toContain('requirements: nope is not a room of this flat (requirements.json)');
  });

  test('a designed room with no paint or only near-white walls gets a paint line', () => {
    expect(paintProblems(scene, { items })[0]).toContain('liv has no wall colour');
    expect(paintProblems(scene, { items, finishes: [{ room_id: 'liv', surface: 'walls', material: 'paint', color: '#EEEAE0' }] })[0]).toContain('walls read white');
    expect(paintProblems(scene, { items, finishes: [{ room_id: 'liv', surface: 'walls', material: 'paint', color: '#EEEAE0' }, { room_id: 'liv', surface: 'wall', wall_id: 'w', material: 'paint', color: '#C0704F' }] })).toEqual([]);
    expect(describeNeeds({ rooms: { liv: { seats_at_table: 6, exclude: ['rug'] } } }, 'liv')).toContain('no rug');
  });
});
