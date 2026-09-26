import { expect, test, vi } from 'vitest';
import { searchCatalog, searchCatalogInputSchema } from '../src/catalog.js';
import { placeInputSchema } from '../src/place.js';

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 'test:crib-1', name: 'Catalog crib', kind: 'crib', size_m: [1.2, 0.7, 0.9],
  price: 80000, currency: 'AMD', source: 'test', price_source: 'mock', size_status: 'confirmed',
  colors_listing: ['White'], colors_image: ['White'], styles: ['Modern'], ...overrides,
});

test('catalog forwards the requested constraints and returns a sized priced place item with provenance', async () => {
  const query = vi.fn(async () => ({ results: [record()] }));
  const input = { kind: 'crib', max_w: 1.2, max_d: 0.7, max_h: 0.9, price_max: 80000, colors: ['White'], styles: ['Modern'], text: 'small crib', allow_rotate: false, limit: 2 };
  const result = await searchCatalog(input, query);
  expect(query).toHaveBeenCalledWith(input);
  expect(result.status).toBe('available');
  expect(result.results).toHaveLength(1);
  expect(result.results[0]).toMatchObject({ sku: 'test:crib-1', size: [1.2, 0.7, 0.9], price: 80000, currency: 'AMD', source: 'test', price_source: 'mock', vendor: null });
  expect(placeInputSchema.safeParse({ room_id: 'bedroom', item: result.results[0]!.item, relations: [{ type: 'centered' }] }).success).toBe(true);
  expect(result.ranking_note).toMatch(/colo.*rank/i);
});

test('catalog excludes unsized, unpriced, non-AMD and malformed records without inventing values', async () => {
  const result = await searchCatalog({ kind: 'crib' }, async () => ({ results: [
    record({ size_m: null }), record({ size_m: [1, -1, 1] }), record({ price: null }),
    record({ price: 1.5 }), record({ price: -1 }), record({ currency: 'USD' }), record({ id: '' }),
  ] }));
  expect(result.status).toBe('available');
  expect(result.results).toEqual([]);
  expect(result.excluded_records).toBe(7);
});

test('catalog enforces hard dimensions, kind and budget including exact boundaries and a zero budget', async () => {
  const result = await searchCatalog({ kind: 'crib', max_w: 1.2, max_d: 0.7, max_h: 0.9, price_max: 0, allow_rotate: false }, async () => ({ results: [
    record({ id: 'test:free', price: 0 }), record({ price: 1 }), record({ kind: 'bed', price: 0 }),
    record({ size_m: [1.21, 0.7, 0.9], price: 0 }), record({ size_m: [1.2, 0.7, 0.91], price: 0 }),
  ] }));
  expect(result.results.map(item => item.sku)).toEqual(['test:free']);
});

test('catalog accepts rotated fit only when rotation is allowed and retains source dimensions', async () => {
  const query = async () => ({ results: [record()] });
  const input = { max_w: 0.7, max_d: 1.2, max_h: 0.9 };
  expect((await searchCatalog(input, query)).results[0]?.size).toEqual([1.2, 0.7, 0.9]);
  expect((await searchCatalog({ ...input, allow_rotate: false }, query)).results).toEqual([]);
});

test('catalog distinguishes no matches from an unavailable or invalid backend without leaking connection secrets', async () => {
  expect(await searchCatalog({}, async () => ({ results: [] }))).toMatchObject({ status: 'available', results: [] });
  const unavailable = await searchCatalog({}, async () => { throw new Error('postgres://secret:password@host/db'); });
  expect(unavailable).toMatchObject({ status: 'unavailable', results: [] });
  expect(unavailable.reason).toMatch(/catalog/i);
  expect(JSON.stringify(unavailable)).not.toContain('password');
  expect(await searchCatalog({}, async () => ({ error: 'database offline' }))).toMatchObject({ status: 'unavailable', results: [] });
});

test('catalog validates limits and inputs before invoking the backend', async () => {
  expect(searchCatalogInputSchema.safeParse({ price_max: 0, limit: 1 }).success).toBe(true);
  expect(searchCatalogInputSchema.safeParse({ limit: 20 }).success).toBe(true);
  for (const input of [{ max_w: 0 }, { price_max: -1 }, { price_max: 0.1 }, { limit: 0 }, { limit: 21 }, { kind: '' }]) {
    const query = vi.fn(async () => ({ results: [] }));
    await expect(searchCatalog(input, query)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  }
});

test('catalog applies its result limit even when a backend returns too many items', async () => {
  const result = await searchCatalog({ limit: 1 }, async () => ({ results: [record(), record({ id: 'test:crib-2' })] }));
  expect(result.results).toHaveLength(1);
});
