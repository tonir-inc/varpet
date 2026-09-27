import { describe, expect, test } from 'vitest';
import { placeGroup, placeOne, type Product } from '../lib/place.js';
import { loadScene } from '../lib/scene.js';
import { roomCounts } from '../lib/requirements.js';

const scene = loadScene(new URL('../fixtures/avani-empty.json', import.meta.url).pathname);
const product = (sku: string, kind: string, size: [number, number, number], name = kind): Product => ({ sku, kind, name, size, price: 1000, vendor: 'v' });
const table = product('t', 'table', [1.6, 0.8, 0.75], 'Oak dining table'), chair = product('c', 'chair', [0.46, 0.55, 0.9]);
const sofa = product('s', 'sofa', [2.1, 0.9, 0.85]), coffee = product('ct', 'table', [1.0, 0.55, 0.42], 'Coffee table');
const media = product('m', 'cabinet', [1.8, 0.42, 0.5], 'TV stand'), tv = product('tv', 'tv', [1.2, 0.2, 0.7]), lamp = product('l', 'lamp', [0.4, 0.4, 1.5], 'Floor lamp');

describe('place and place-group', () => {
  test('a dining group for six passes the check with every chair at the table', async () => {
    const { candidates } = await placeGroup(scene, { items: [] }, 'room-living', 'dining', { anchor: table, chair, chairs: 6, pendant: true }, {}, {});
    expect(candidates[0]!.problems).toEqual([]);
    expect(roomCounts(candidates[0]!.items).seats_at_table).toBe(6);
    expect(candidates[0]!.lighting).toHaveLength(1);
  }, 60_000);

  test('a lounge with a media unit faces the TV and passes', async () => {
    const { candidates } = await placeGroup(scene, { items: [] }, 'room-living', 'lounge', { anchor: sofa, table: coffee, media, tv, lamp }, {}, {});
    const best = candidates[0]!;
    expect(best.problems).toEqual([]);
    const s = best.items.find(i => i.kind === 'sofa')!, m = best.items.find(i => i.kind === 'cabinet')!;
    expect(Math.abs(((s.rot - m.rot) % 360 + 360) % 360 - 180)).toBeLessThan(1);
  }, 60_000);

  test('place against a named wall returns checked poses flush on it', async () => {
    const { candidates } = await placeOne(scene, { items: [] }, 'room-living', sofa, 'sofa-1', { wall: 'wall-west' }, {});
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.items[0]!.rot).toBe(90);
  }, 60_000);
});
