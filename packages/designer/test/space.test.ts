import { expect, test } from 'vitest';
import type { Item, Scene } from '../src/scene.js';
import { itemPolygon, polygonsOverlap, spaceMetrics } from '../src/metrics/space.js';

function room(width = 4, depth = 3.5): Scene {
  return {
    rooms: [{ id: 'room', polygon: [[0, 0], [width, 0], [width, depth], [0, depth]] }],
    walls: [
      { id: 'south', room_id: 'room', a: [0, 0], b: [width, 0] },
      { id: 'north', room_id: 'room', a: [width, depth], b: [0, depth] },
    ],
    openings: [], items: [], fixed: [], north_deg: 0,
  };
}
function item(id: string, x: number, y: number, width: number, depth: number): Item {
  return { id, room_id: 'room', kind: 'bed', name: id, pos: [x, y], size: [width, depth, 1], rot: 0, keep: false };
}
function doors(scene: Scene, x: number, width = 1): void {
  const roomWidth = scene.walls[0]!.b[0];
  scene.openings = [
    { id: 'entry', wall_id: 'south', kind: 'door', offset: x - width / 2, width, height: 2, sill: 0, swing: 'none' },
    { id: 'exit', wall_id: 'north', kind: 'door', offset: roomWidth - x - width / 2, width, height: 2, sill: 0, swing: 'none' },
  ];
}

test('empty 4 by 3.5 room has hand-computed area and largest rectangle', () => {
  const metrics = spaceMetrics(room());
  expect(metrics.free_area_m2).toBeCloseTo(14, 10);
  expect(metrics.rooms[0]!.largest_free_rectangle).toEqual({ x: 0, y: 0, width: 4, depth: 3.5, area_m2: 14 });
  expect(metrics.rooms[0]!.walkways).toEqual([]);
});

test('occupied and fixed footprints subtract area; touching footprints do not overlap', () => {
  const scene = room();
  scene.items.push(item('bed', 1, 1, 2, 2));
  scene.fixed.push(item('fixed', 3, 1, 2, 2));
  const result = spaceMetrics(scene).rooms[0]!;
  expect(result.free_area_m2).toBeCloseTo(6, 10);
  expect(result.largest_free_rectangle).toEqual({ x: 0, y: 2, width: 4, depth: 1.5, area_m2: 6 });
  expect(polygonsOverlap(itemPolygon(scene.items[0]!), itemPolygon(scene.fixed[0]!))).toBe(false);
});

test('rotation changes footprint occupancy; a filled room has no free rectangle', () => {
  const scene = room(2, 4);
  const bed = item('bed', 1, 2, 4, 2);
  bed.rot = 90;
  scene.items.push(bed);
  const result = spaceMetrics(scene).rooms[0]!;
  expect(result.free_area_m2).toBe(0);
  expect(result.largest_free_rectangle).toBeNull();
});

test('a bed across the only path fails door-to-door circulation at the obstruction', () => {
  const scene = room();
  doors(scene, 2);
  scene.items.push(item('bed', 2, 1.75, 4, 0.5));
  const paths = spaceMetrics(scene).rooms[0]!.walkways;
  const blocked = paths.find(path => path.from === 'door:entry' && path.to === 'door:exit')!;
  expect(blocked.reachable).toBe(false);
  expect(blocked.status).toBe('fail');
  expect(blocked.width_m).toBe(0);
  expect(blocked.narrowest[0]).toBeGreaterThanOrEqual(0);
  expect(blocked.narrowest[0]).toBeLessThanOrEqual(4);
  expect(blocked.narrowest[1]).toBeGreaterThanOrEqual(1.5);
  expect(blocked.narrowest[1]).toBeLessThanOrEqual(2);
  expect(paths.some(path => path.from === 'door:entry' && path.to === 'item:bed')).toBe(true);
  expect(paths.some(path => path.from === 'door:exit' && path.to === 'item:bed')).toBe(true);
});

test.each([
  [0.55, 'fail'], [0.6, 'warn'], [0.7, 'warn'], [0.75, 'adequate'], [0.9, 'good'],
] as const)('a %s metre passage is classified as %s, at the exact threshold', (gap, status) => {
  const scene = room(4, 5);
  doors(scene, 2, 1);
  // Two fixed strips form a long, straight, hand-computable passage of width gap.
  const strip = (4 - gap) / 2;
  scene.fixed.push(item('left', strip / 2, 2.5, strip, 5), item('right', 4 - strip / 2, 2.5, strip, 5));
  // Align the passage on raster boundaries for each threshold.
  const shift = gap === 0.55 || gap === 0.75 ? 0.025 : 0;
  for (const obstruction of scene.fixed) obstruction.pos[0] += shift;
  for (const opening of scene.openings) opening.offset += opening.id === 'entry' ? shift : -shift;
  const path = spaceMetrics(scene).rooms[0]!.walkways[0]!;
  expect(path.reachable).toBe(true);
  expect(path.width_m).toBeCloseTo(gap, 8);
  expect(path.status).toBe(status);
});

test('door aperture limits an otherwise open room and paths reach every item front', () => {
  const scene = room(5, 5);
  doors(scene, 2.5, 0.7);
  scene.items.push(item('desk', 2.5, 3, 1, 0.5));
  const paths = spaceMetrics(scene).rooms[0]!.walkways;
  expect(paths).toHaveLength(3);
  expect(paths.every(path => path.width_m <= 0.7)).toBe(true);
  expect(paths.find(path => path.to === 'item:desk')?.status).toBe('warn');
});

test('inward door swings consume free floor, outward swings do not', () => {
  const scene = room();
  doors(scene, 2);
  scene.openings = scene.openings.slice(0, 1);
  scene.openings[0]!.swing = 'inward-left';
  const inward = spaceMetrics(scene).free_area_m2;
  // A 1 m quarter circle is pi/4 square metres; raster occupancy is conservative.
  expect(14 - inward).toBeGreaterThanOrEqual(Math.PI / 4);
  expect(14 - inward).toBeLessThan(0.9);
  scene.openings[0]!.swing = 'outward-left';
  expect(spaceMetrics(scene).free_area_m2).toBe(14);
});

test('ops are applied on a copy and repeat evaluations give identical output', () => {
  const scene = room();
  scene.items.push(item('bed', 1, 1, 2, 2));
  const original = structuredClone(scene);
  const ops = [{ type: 'remove' as const, id: 'bed' }];
  expect(spaceMetrics(scene, ops).free_area_m2).toBe(14);
  expect(spaceMetrics(scene, ops)).toEqual(spaceMetrics(scene, ops));
  expect(scene).toEqual(original);
  expect(spaceMetrics(scene).free_area_m2).toBe(10);
});

test('a sub-cell obstacle still occupies touched cells, and unknown op IDs are rejected', () => {
  const scene = room(1, 1);
  scene.fixed.push(item('thin', 0.012, 0.5, 0.01, 1));
  expect(spaceMetrics(scene).free_area_m2).toBeCloseTo(0.95, 10);
  expect(() => spaceMetrics(scene, [{ type: 'remove', id: 'missing' }])).toThrow();
});
