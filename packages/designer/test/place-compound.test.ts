import { expect, test } from 'vitest';
import type { Scene } from '../src/scene.js';
import { place } from '../src/place.js';
import { itemPolygon } from '../src/metrics/space.js';

test('beside plus facing solves the final rotated footprint before choosing its edge gap', () => {
  const scene: Scene = {
    north_deg: 0,
    rooms: [{ id: 'room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
    walls: [
      { id: 'south', room_id: 'room', a: [0, 0], b: [4, 0] },
      { id: 'east', room_id: 'room', a: [4, 0], b: [4, 4] },
      { id: 'north', room_id: 'room', a: [4, 4], b: [0, 4] },
      { id: 'west', room_id: 'room', a: [0, 4], b: [0, 0] },
    ],
    openings: [], fixed: [],
    items: [{ id: 'sofa', name: 'Sofa', kind: 'sofa', room_id: 'room', pos: [2, 2], rot: 0, size: [1, 1, 0.8], keep: false }],
  };
  const result = place(scene, {
    room_id: 'room', item: { id: 'desk', kind: 'desk', size: [1.2, 0.6, 0.75] },
    relations: [{ type: 'beside', anchor_id: 'sofa', side: 'left', gap_m: 0.1 }, { type: 'facing', anchor_id: 'sofa' }],
  });
  expect(result.candidates.length).toBeGreaterThan(0);
  for (const { item } of result.candidates) {
    expect(Math.max(...itemPolygon(item).map(point => point[0]))).toBeCloseTo(1.4, 7);
    const dx = 2 - item.pos[0], dy = 2 - item.pos[1], angle = item.rot * Math.PI / 180;
    expect((Math.sin(angle) * dx - Math.cos(angle) * dy) / Math.hypot(dx, dy)).toBeCloseTo(1, 8);
  }
});
