import { expect, test } from 'vitest';
import type { Scene } from '../src/scene.js';
import { spaceMetrics } from '../src/metrics/space.js';

test('a wide room does not hide a narrow throat between the door and approach anchor', () => {
  const scene: Scene = {
    rooms: [{ id: 'room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
    walls: [{ id: 'south', room_id: 'room', a: [0, 0], b: [4, 0] }, { id: 'north', room_id: 'room', a: [4, 4], b: [0, 4] }],
    openings: [
      { id: 'entry', wall_id: 'south', kind: 'door', offset: 1.5, width: 1, height: 2, sill: 0 },
      { id: 'exit', wall_id: 'north', kind: 'door', offset: 1.5, width: 1, height: 2, sill: 0 },
    ], items: [], fixed: [
      { id: 'left', room_id: 'room', kind: 'storage', name: 'left', pos: [0.9, 0.1], rot: 0, size: [1.8, 0.2, 1], keep: true },
      { id: 'right', room_id: 'room', kind: 'storage', name: 'right', pos: [3.1, 0.1], rot: 0, size: [1.8, 0.2, 1], keep: true },
    ],
  };
  const walkway = spaceMetrics(scene).rooms[0]!.walkways[0]!;
  expect(walkway.reachable).toBe(true);
  expect(walkway.width_m).toBeCloseTo(0.4, 8);
  expect(walkway.status).toBe('fail');
  expect(walkway.narrowest[1]).toBeLessThanOrEqual(0.2);
});
