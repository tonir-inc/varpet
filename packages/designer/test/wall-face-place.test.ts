import { expect, test } from 'vitest';
import { applyOps } from '../src/adapter.js';
import { place } from '../src/place.js';
import { checkRequest } from '../src/request.js';
import { spaceMetrics } from '../src/metrics/space.js';
import type { Scene } from '../src/scene.js';

function room(): Scene {
  return { rooms: [{ id: 'r', polygon: [[0,0],[5,0],[5,5],[0,5]] }],
    walls: [
      { id: 'south', room_id: 'r', a: [0,0], b: [5,0], thickness: .2 },
      { id: 'east', room_id: 'r', a: [5,0], b: [5,5], thickness: .2 },
      { id: 'north', room_id: 'r', a: [5,5], b: [0,5], thickness: .2 },
      { id: 'west', room_id: 'r', a: [0,5], b: [0,0], thickness: .2 },
    ], openings: [], fixed: [], items: [{ id: 'chair', room_id: 'r', name: 'Chair', kind: 'chair', pos: [2,2], rot: 0, size: [.5,.5,1], keep: false }] };
}
test('against-wall placements touch the physical inner face and satisfy the same request preference', () => {
  const scene = room(), candidates = place(scene,{ room_id: 'r', item_id: 'chair', relations: [{ type: 'against_wall', wall_id: 'west' }] }).candidates;
  expect(candidates.length).toBeGreaterThan(0);
  for (const candidate of candidates) {
    expect(candidate.item.pos[0]).toBeCloseTo(.35);
    expect(checkRequest(scene,applyOps(scene,[candidate.op]),[candidate.op],{ preferences: [{ type: 'against_wall', item_id: 'chair', wall_id: 'west' }] },0).ok).toBe(true);
  }
});
test('corner placement clears the full thickness of both walls', () => {
  const candidates = place(room(),{ room_id: 'r', item_id: 'chair', relations: [{ type: 'in_corner', wall_ids: ['south','west'] }] }).candidates;
  expect(candidates.length).toBeGreaterThan(0);
  for (const candidate of candidates) {
    expect(candidate.item.pos[0]).toBeCloseTo(.35);
    expect(candidate.item.pos[1]).toBeCloseTo(.35);
  }
});
test('usable floor excludes wall thickness instead of counting the wall itself as open floor', () => {
  const scene = room(); scene.items = [];
  expect(spaceMetrics(scene).rooms[0]!.free_area_m2).toBeCloseTo(4.8*4.8,8);
});
test('repeated metrics stay independent of caller mutations and appearance, and react to geometry changes', () => {
  const scene = room(); scene.items = [];
  const first = spaceMetrics(scene), expected = structuredClone(first);
  first.rooms[0]!.free_area_m2 = -100;
  expect(spaceMetrics(scene)).toEqual(expected);
  scene.walls[0]!.color = '#3366cc';
  expect(spaceMetrics(scene)).toEqual(expected);
  scene.walls[0]!.thickness = .4;
  expect(spaceMetrics(scene).free_area_m2).toBeLessThan(expected.free_area_m2);
});
