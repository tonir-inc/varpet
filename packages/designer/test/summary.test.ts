import { test, expect } from 'vitest';
import bedroom from './fixtures/bedroom.json';
import { sceneSummary, parseScene } from '../src/adapter.js';

test('summary preserves the scene and returns an empty explicit filter', () => {
  const scene = parseScene(bedroom), before = JSON.stringify(scene);
  expect(sceneSummary(scene, []).rooms).toEqual([]);
  sceneSummary(scene);
  expect(JSON.stringify(scene)).toBe(before);
});

test('north rotation changes compass and missing north stays unknown', () => {
  const scene = parseScene({ ...bedroom, north_deg: 90 });
  expect(sceneSummary(scene).walls.find(w => w.id === 'east')!.compass).toBe('north');
  const unknown = parseScene({ ...bedroom, north_deg: undefined });
  expect(sceneSummary(unknown).walls.every(w => w.compass === 'unknown')).toBe(true);
});

test('invalid geometry and dangling item rooms are rejected at the adapter', () => {
  expect(() => parseScene({ ...bedroom, rooms: [{ id: 'bedroom', polygon: [[0,0],[0,0]] }] })).toThrow();
  expect(() => parseScene({ ...bedroom, items: [{ ...bedroom.items[0], room_id: 'missing' }] })).toThrow(/room/i);
});
