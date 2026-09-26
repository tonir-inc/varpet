import { expect, test } from 'vitest';
import type { Scene } from '../src/scene.js';
import { spaceMetrics } from '../src/metrics/space.js';

test('an approach anchor cannot jump a thin obstacle immediately inside a doorway', () => {
  const scene: Scene = {
    rooms: [{ id: 'room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
    walls: [
      { id: 'south', room_id: 'room', a: [0, 0], b: [4, 0] },
      { id: 'north', room_id: 'room', a: [4, 4], b: [0, 4] },
    ],
    openings: [
      { id: 'entry', wall_id: 'south', kind: 'door', offset: 1.5, width: 1, height: 2, sill: 0 },
      { id: 'exit', wall_id: 'north', kind: 'door', offset: 1.5, width: 1, height: 2, sill: 0 },
    ],
    items: [], fixed: [{ id: 'barrier', room_id: 'room', kind: 'screen', name: 'thin screen', pos: [2, 0.0075], rot: 0, size: [4, 0.005, 1], keep: true }],
  };
  const walkway = spaceMetrics(scene).rooms[0]!.walkways[0]!;
  expect(walkway.reachable).toBe(false);
  expect(walkway.status).toBe('fail');
  expect(walkway.narrowest[1]).toBeLessThanOrEqual(0.01);
});
