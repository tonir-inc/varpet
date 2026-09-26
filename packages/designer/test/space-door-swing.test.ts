import { expect, test } from 'vitest';
import type { Opening, Scene } from '../src/scene.js';
import { doorSwingPolygon, pointInPolygon } from '../src/metrics/space.js';

const scene: Scene = {
  rooms: [{ id: 'room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
  walls: [{ id: 'south', room_id: 'room', a: [0, 0], b: [4, 0] }],
  openings: [], items: [], fixed: [],
};
const opening: Opening = { id: 'door', wall_id: 'south', kind: 'door', offset: 1, width: 1, height: 2, sill: 0, swing: 'inward-left' };

test('public inward swing polygon includes the hinge and full circular sweep', () => {
  const original = structuredClone(scene);
  const polygon = doorSwingPolygon(scene, opening)!;
  expect(polygon[0]).toEqual([1, 0]);
  for (let degrees = 0; degrees <= 90; degrees++) {
    const angle = degrees * Math.PI / 180;
    expect(pointInPolygon([1 + Math.cos(angle), Math.sin(angle)], polygon)).toBe(true);
  }
  expect(pointInPolygon([2, 1], polygon)).toBe(false);
  const right = doorSwingPolygon(scene, { ...opening, swing: 'inward-right' })!;
  expect(right[0]).toEqual([2, 0]);
  expect(pointInPolygon([1.5, 0.5], right)).toBe(true);
  expect(scene).toEqual(original);
});

test('windows, passages and non-inward doors have no interior swing polygon', () => {
  for (const swing of [undefined, 'none', 'outward-left', 'outward-right'] as const) {
    expect(doorSwingPolygon(scene, { ...opening, swing })).toBeNull();
  }
  for (const kind of ['window', 'passage'] as const) expect(doorSwingPolygon(scene, { ...opening, kind })).toBeNull();
});
