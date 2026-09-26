import { expect, test } from 'vitest';
import type { Item, Scene } from '../src/scene.js';
import { itemPolygon, polygonsOverlap } from '../src/metrics/space.js';
import { place, placeInputSchema, type PlaceRequest } from '../src/place.js';

function room(width = 4, depth = 4): Scene {
  const windowWidth = Math.min(1, depth);
  return {
    north_deg: 0,
    rooms: [{ id: 'room', polygon: [[0, 0], [width, 0], [width, depth], [0, depth]] }],
    walls: [
      { id: 'south', room_id: 'room', a: [0, 0], b: [width, 0] },
      { id: 'east', room_id: 'room', a: [width, 0], b: [width, depth] },
      { id: 'north', room_id: 'room', a: [width, depth], b: [0, depth] },
      { id: 'west', room_id: 'room', a: [0, depth], b: [0, 0] },
    ],
    openings: [{ id: 'window', wall_id: 'east', kind: 'window', offset: (depth - windowWidth) / 2, width: windowWidth, height: 1.5, sill: 0.8 }],
    items: [], fixed: [],
  };
}
const desk = { id: 'desk', kind: 'desk', size: [1.2, 0.6, 0.75] as [number, number, number] };
const anchor: Item = { id: 'sofa', name: 'Sofa', kind: 'sofa', room_id: 'room', size: [1, 1, 0.8], pos: [2, 2], rot: 0, keep: false };
const request = (relations: PlaceRequest['relations']): PlaceRequest => ({ room_id: 'room', item: desk, relations });

test('desk against east wall and near window satisfies both relations with three checked poses', () => {
  const result = place(room(), request([{ type: 'against_wall', compass: 'east' }, { type: 'near_window', window_id: 'window' }]));
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.candidates.length).toBeLessThanOrEqual(3);
  expect(result.resolution_m).toBe(0.05);
  for (const candidate of result.candidates) {
    expect(candidate.item.pos[0]).toBeCloseTo(3.7, 8);
    expect(candidate.item.rot).toBeCloseTo(270, 8);
    expect(Math.max(0, 1.5 - (candidate.item.pos[1] + 0.6), (candidate.item.pos[1] - 0.6) - 2.5)).toBeLessThanOrEqual(1.5);
    expect(candidate.clearances.front_m).toBeGreaterThan(0);
    expect(candidate.clearances.back_m).toBeCloseTo(0, 8);
    expect(candidate.op.type).toBe('add');
  }
});

test('wardrobe excludes the door wall and never occupies an inward swing', () => {
  const scene = room();
  scene.openings.push({ id: 'door', wall_id: 'south', kind: 'door', offset: 0.2, width: 0.9, height: 2.1, sill: 0, swing: 'inward-left' });
  const result = place(scene, { room_id: 'room', item: { ...desk, id: 'wardrobe', kind: 'wardrobe', size: [1, 0.6, 2] }, relations: [{ type: 'against_wall' }], exclusions: { door_walls: true } });
  expect(result.candidates.length).toBeGreaterThan(0);
  for (const candidate of result.candidates) {
    expect(candidate.item.pos[1]).toBeGreaterThan(0.3 + 1e-8);
    // The entire quarter-circle is contained in this square; returned east/north poses clear it.
    expect(polygonsOverlap(itemPolygon(candidate.item), [[0.2, 0], [1.1, 0], [1.1, 0.9], [0.2, 0.9]])).toBe(false);
    expect(candidate.clearances.walkway_m).toBeGreaterThanOrEqual(0.6 - 1e-8);
  }
});

test('two metre bed cannot fit a 1.5 metre nook and gives an actionable reason', () => {
  const result = place(room(1.5, 1.5), { room_id: 'room', item: { id: 'bed', kind: 'bed', size: [2, 2, 0.5] }, relations: [{ type: 'against_wall' }] });
  expect(result.candidates).toEqual([]);
  expect(result.reason).toMatch(/fit|inside|space/i);
  expect(result.reason).toMatch(/bed|2/);
});

test('beside uses the anchor local left side and leaves the requested gap', () => {
  const scene = room(); scene.items = [anchor];
  const result = place(scene, request([{ type: 'beside', anchor_id: 'sofa', side: 'left', gap_m: 0.1 }]));
  expect(result.candidates.length).toBeGreaterThan(0);
  for (const candidate of result.candidates) {
    expect(candidate.item.pos[0] + candidate.item.size[0] / 2).toBeCloseTo(1.4, 8);
    expect(polygonsOverlap(itemPolygon(candidate.item), itemPolygon(anchor))).toBe(false);
  }
});

test('facing points the physical front at the anchor', () => {
  const scene = room(); scene.items = [anchor];
  const result = place(scene, request([{ type: 'facing', anchor_id: 'sofa' }]));
  expect(result.candidates.length).toBeGreaterThan(0);
  for (const { item } of result.candidates) {
    const angle = item.rot * Math.PI / 180;
    const delta = [anchor.pos[0] - item.pos[0], anchor.pos[1] - item.pos[1]];
    expect((Math.sin(angle) * delta[0]! - Math.cos(angle) * delta[1]!) / Math.hypot(...delta)).toBeCloseTo(1, 8);
  }
});

test('in_corner touches both requested walls and centered uses the room centre', () => {
  const corner = place(room(), request([{ type: 'in_corner', wall_ids: ['south', 'west'] }]));
  expect(corner.candidates.length).toBeGreaterThan(0);
  for (const { item } of corner.candidates) {
    const polygon = itemPolygon(item);
    expect(Math.min(...polygon.map(point => point[0]))).toBeCloseTo(0, 8);
    expect(Math.min(...polygon.map(point => point[1]))).toBeCloseTo(0, 8);
  }
  const centered = place(room(), request([{ type: 'centered' }]));
  expect(centered.candidates.length).toBeGreaterThan(0);
  for (const candidate of centered.candidates) expect(candidate.item.pos).toEqual([2, 2]);
});

test('near_window uses the full span and away_from enforces an edge gap', () => {
  const scene = room(); scene.items = [anchor];
  const near = place(scene, request([{ type: 'near_window', window_id: 'window', max_distance_m: 0 }]));
  expect(near.candidates.length).toBeGreaterThan(0);
  for (const { item } of near.candidates) expect(Math.max(...itemPolygon(item).map(point => point[0]))).toBeCloseTo(4, 8);
  const away = place(scene, request([{ type: 'away_from', anchor_id: 'sofa', min_distance_m: 0.5 }]));
  expect(away.candidates.length).toBeGreaterThan(0);
  for (const { item } of away.candidates) {
    const dx = Math.max(0, Math.abs(item.pos[0] - 2) - item.size[0] / 2 - 0.5);
    const dy = Math.max(0, Math.abs(item.pos[1] - 2) - item.size[1] / 2 - 0.5);
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(0.5 - 1e-8);
  }
});

test('window and wall exclusions are respected across the full furniture span', () => {
  const result = place(room(), { ...request([{ type: 'against_wall', wall_id: 'east' }]), exclusions: { in_front_of_windows: true } });
  expect(result.candidates.length).toBeGreaterThan(0);
  for (const { item } of result.candidates) {
    const ys = itemPolygon(item).map(point => point[1]);
    expect(Math.max(...ys) <= 1.5 + 1e-8 || Math.min(...ys) >= 2.5 - 1e-8).toBe(true);
  }
  const none = place(room(), { ...request([{ type: 'against_wall', wall_id: 'east' }]), exclusions: { wall_ids: ['east'] } });
  expect(none.candidates).toEqual([]);
  expect(none.reason).toMatch(/exclu|wall|constraint/i);
});

test('boundary touching is allowed, occupied centre is rejected, and no input is mutated', () => {
  const exact = place(room(1.5, 1.5), { room_id: 'room', item: { id: 'bed', kind: 'bed', size: [1.5, 1.5, 0.5] }, relations: [{ type: 'centered' }] });
  expect(exact.candidates.length).toBeGreaterThan(0);
  const scene = room(); scene.items = [structuredClone(anchor)];
  const before = structuredClone(scene);
  const blocked = place(scene, request([{ type: 'centered' }]));
  expect(blocked.candidates).toEqual([]);
  expect(blocked.reason).toMatch(/overlap|occupied/i);
  const movable = place(scene, { room_id: 'room', item_id: 'sofa', relations: [{ type: 'against_wall', wall_id: 'north' }] });
  expect(movable.candidates.length).toBeGreaterThan(0);
  expect(movable.candidates[0]!.op.type).toBe('move');
  expect(scene).toEqual(before);
  expect(place(scene, request([{ type: 'centered' }]))).toEqual(blocked);
});

test('unknown references and compass without north fail with useful messages', () => {
  expect(() => place(room(), request([{ type: 'beside', anchor_id: 'missing', side: 'left' }]))).toThrow(/anchor.*missing/i);
  expect(() => place(room(), request([{ type: 'against_wall', wall_id: 'missing' }]))).toThrow(/wall.*missing/i);
  expect(() => place(room(), request([{ type: 'near_window', window_id: 'missing' }]))).toThrow(/window.*missing/i);
  const scene = room(); delete scene.north_deg;
  expect(() => place(scene, request([{ type: 'against_wall', compass: 'east' }]))).toThrow(/north_deg/i);
  expect(place(scene, request([{ type: 'against_wall', wall_id: 'east' }])).candidates.length).toBeGreaterThan(0);
});

test('kept and fixed items cannot move and callers cannot provide coordinates or unsized products', () => {
  const scene = room(); scene.items = [{ ...anchor, keep: true }];
  expect(() => place(scene, { room_id: 'room', item_id: 'sofa', relations: [{ type: 'centered' }] })).toThrow(/kept/i);
  scene.items = []; scene.fixed = [anchor];
  expect(() => place(scene, { room_id: 'room', item_id: 'sofa', relations: [{ type: 'centered' }] })).toThrow(/fixed/i);
  expect(placeInputSchema.safeParse({ ...request([{ type: 'centered' }]), item: { ...desk, pos: [1, 1] } }).success).toBe(false);
  expect(placeInputSchema.safeParse({ room_id: 'room', item: { id: 'new', kind: 'desk' }, relations: [{ type: 'centered' }] }).success).toBe(false);
  expect(placeInputSchema.safeParse(request([])).success).toBe(false);
});
