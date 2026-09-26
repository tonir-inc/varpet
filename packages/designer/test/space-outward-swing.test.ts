import { expect, test } from 'vitest';
import type { Opening, Scene } from '../src/scene.js';
import { doorSwingPolygon, physicalDoorSwingPolygon, pointInPolygon, spaceMetrics } from '../src/metrics/space.js';

function adjacentRooms(swing: Opening['swing'] = 'outward-left'): Scene {
  return {
    rooms: [
      { id: 'upper', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
      { id: 'lower', polygon: [[0, -4], [4, -4], [4, 0], [0, 0]] },
    ],
    walls: [{ id: 'shared', room_id: 'upper', a: [0, 0], b: [4, 0] }],
    openings: [{ id: 'door', wall_id: 'shared', kind: 'door', offset: 1, width: 1, height: 2, sill: 0, swing }],
    items: [], fixed: [],
  };
}

test.each(['inward-left', 'inward-right', 'outward-left', 'outward-right'] as const)('physical %s sweep uses the correct hinge and side', swing => {
  const scene = adjacentRooms(swing), opening = scene.openings[0]!, polygon = physicalDoorSwingPolygon(scene, opening)!;
  const right = swing.endsWith('right'), inward = swing.startsWith('inward');
  const hinge = right ? 2 : 1;
  expect(polygon[0]).toEqual([hinge, 0]);
  for (let degrees = 0; degrees <= 90; degrees++) {
    const angle = degrees * Math.PI / 180;
    expect(pointInPolygon([hinge + (right ? -1 : 1) * Math.cos(angle), (inward ? 1 : -1) * Math.sin(angle)], polygon)).toBe(true);
  }
  expect(pointInPolygon([1.5, inward ? -0.5 : 0.5], polygon)).toBe(false);
  if (!inward) expect(doorSwingPolygon(scene, opening)).toBeNull();
});

test.each(['outward-left', 'outward-right'] as const)('%s occupies the adjacent room without changing its owning room', swing => {
  const scene = adjacentRooms(swing), before = structuredClone(scene);
  const metrics = spaceMetrics(scene);
  expect(metrics.rooms.find(room => room.room_id === 'upper')!.free_area_m2).toBe(16);
  const reserved = 16 - metrics.rooms.find(room => room.room_id === 'lower')!.free_area_m2;
  expect(reserved).toBeGreaterThanOrEqual(Math.PI / 4);
  expect(reserved).toBeLessThan(0.9);
  expect(scene).toEqual(before);
  expect(spaceMetrics(scene)).toEqual(metrics);
});

test('missing swings and outward swings into unmodeled space reserve no room floor', () => {
  const scene = adjacentRooms('none');
  expect(spaceMetrics(scene).free_area_m2).toBe(32);
  expect(physicalDoorSwingPolygon(scene, scene.openings[0]!)).toBeNull();
  scene.openings[0]!.swing = 'outward-left';
  scene.rooms = scene.rooms.slice(0, 1);
  expect(spaceMetrics(scene).free_area_m2).toBe(16);
  for (const kind of ['window', 'passage'] as const) expect(physicalDoorSwingPolygon(scene, { ...scene.openings[0]!, kind })).toBeNull();
});

test('a shared doorway is an ingress endpoint in the neighboring room', () => {
  const scene = adjacentRooms();
  scene.items.push({ id: 'desk', room_id: 'lower', kind: 'desk', name: 'Desk', pos: [1.5, -3], rot: 180, size: [1, 0.5, 0.75], keep: false });
  const paths = spaceMetrics(scene).rooms.find(room => room.room_id === 'lower')!.walkways;
  expect(paths).toHaveLength(1);
  expect(paths[0]!.from).toBe('door:door');
  expect(paths[0]!.to).toBe('item:desk');
  expect(paths[0]!.reachable).toBe(true);
  expect(paths[0]!.width_m).toBeGreaterThanOrEqual(0.6);
});

test('midpoint contact does not infer a doorway when its full span is not shared', () => {
  const scene = adjacentRooms();
  scene.rooms[1]!.polygon = [[0, -4], [1.5, -4], [1.5, 0], [0, 0]];
  scene.items.push({ id: 'desk', room_id: 'lower', kind: 'desk', name: 'Desk', pos: [0.75, -3], rot: 180, size: [1, 0.5, 0.75], keep: false });
  expect(spaceMetrics(scene).rooms.find(room => room.room_id === 'lower')!.walkways).toEqual([]);
});
