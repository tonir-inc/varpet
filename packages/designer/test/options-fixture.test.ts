import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { applyOps, parseScene } from '../src/adapter.js';
import { checkLayout } from '../src/layout.js';
import { strategyMetrics } from '../src/metrics/strategy.js';
import { placeBatch } from '../src/place-batch.js';
import { DesignerSession } from '../src/session.js';

test('living-room fixture supports distinct accepted daylight/open and social relation layouts', () => {
  const scene = parseScene(JSON.parse(readFileSync(new URL('./fixtures/living-room.json', import.meta.url), 'utf8')));
  const original = structuredClone(scene);
  expect(scene.items.filter(item => !item.keep)).toHaveLength(5);
  expect(checkLayout(scene).ok).toBe(true);
  const daylight = placeBatch(scene, [
    { room_id: 'living', item_id: 'desk', relations: [{ type: 'against_wall', wall_id: 'north' }, { type: 'near_window', window_id: 'window', max_distance_m: 1.5 }] },
    { room_id: 'living', item_id: 'office_chair', relations: [{ type: 'beside', anchor_id: 'desk', side: 'front', gap_m: 0.7 }, { type: 'facing', anchor_id: 'desk' }] },
  ]).candidates[0];
  const social = placeBatch(scene, [
    { room_id: 'living', item_id: 'armchair', relations: [{ type: 'beside', anchor_id: 'sofa', side: 'front', gap_m: 1.4 }, { type: 'facing', anchor_id: 'sofa' }] },
    { room_id: 'living', item_id: 'coffee_table', relations: [{ type: 'beside', anchor_id: 'armchair', side: 'left', gap_m: 0.7 }] },
  ]).candidates[0];
  expect(daylight).toBeDefined();
  expect(social).toBeDefined();
  expect(daylight!.ops).not.toEqual(social!.ops);
  const a = strategyMetrics(applyOps(scene, daylight!.ops)), b = strategyMetrics(applyOps(scene, social!.ops));
  expect(a.daylight_for_work.score).toBeGreaterThan(b.daylight_for_work.score);
  expect(b.social_living.score).toBeGreaterThan(a.social_living.score);
  expect(daylight!.score.after.space.rooms[0]!.largest_free_rectangle!.area_m2)
    .toBeGreaterThan(social!.score.after.space.rooms[0]!.largest_free_rectangle!.area_m2);
  const session = new DesignerSession(scene);
  session.setIntent({ room_id: 'living', keeps: ['tv'] });
  for (const option of [daylight!, social!]) {
    expect(checkLayout(scene, option.ops).ok).toBe(true);
    expect(session.propose(option.ops, 'A measured rearrangement of the furniture already in this room.').ok).toBe(true);
    expect(option.score.cost_dram).toBe(0);
    expect(applyOps(scene, option.ops).items.find(item => item.id === 'tv')).toEqual(scene.items.find(item => item.id === 'tv'));
  }
  expect(scene).toEqual(original);
}, 30_000);
