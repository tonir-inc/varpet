import { expect, test } from 'vitest';
import bedroom from './fixtures/bedroom.json';
import { parseScene } from '../src/adapter.js';
import { spaceMetrics } from '../src/metrics/space.js';

function keptBedroom() {
  const scene = parseScene(bedroom);
  scene.items = scene.items.filter(item => item.keep);
  return scene;
}

test('the real bedroom entry can turn through its own swing before reaching the kept bed', () => {
  const scene = keptBedroom(), before = structuredClone(scene);
  const path = spaceMetrics(scene).rooms[0]!.walkways[0]!;
  expect(path.reachable).toBe(true);
  expect(path.width_m).toBeGreaterThanOrEqual(0.6);
  expect(path.status).not.toBe('fail');
  expect(path.path[0]).toEqual([0.6, 0]);
  expect(scene).toEqual(before);
});

test('turning ingress cannot jump a thin barrier or inflate a narrow doorway', () => {
  const blocked = keptBedroom();
  blocked.fixed.push({ id: 'barrier', room_id: 'bedroom', kind: 'screen', name: 'Barrier', pos: [2, 0.0075], rot: 0, size: [4, 0.005, 1], keep: true });
  expect(spaceMetrics(blocked).rooms[0]!.walkways[0]!.reachable).toBe(false);
  const narrow = keptBedroom();
  narrow.openings[0]!.width = 0.55;
  const path = spaceMetrics(narrow).rooms[0]!.walkways[0]!;
  expect(path.width_m).toBeLessThanOrEqual(0.55);
  expect(path.status).toBe('fail');
});
