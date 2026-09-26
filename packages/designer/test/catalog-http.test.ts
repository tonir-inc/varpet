import { afterEach, expect, test, vi } from 'vitest';
import * as catalog from '../src/catalog.js';

type RpcCall = { url: string; method: string; name?: string; args?: Record<string, unknown> };
const searchRecord = { id: 'abo:desk', kind: 'desk', name: 'Catalog desk', size_m: [1.2, .7, .75],
  price: 80000, size_status: 'conflict', colors_listing: ['White'], colors_image: ['Gray'], styles: ['Modern'], wd_swapped: true };
const detailRecord = { ...searchRecord, size_m: [1, .6, .7], fit_size_m: [1.2, .7, .75],
  currency: 'AMD', source: 'abo', price_source: 'mock', size_evidence: { wd_swapped: true, source: 'mesh and listing' },
  brand: 'Not a shop vendor' };

function stubCatalog(options: { search?: unknown; detail?: unknown; error?: boolean;
  intercept?: (request: { method: string; params?: { name?: string } }, init?: RequestInit) => Promise<void> } = {}) {
  const calls: RpcCall[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    if (init?.method === 'GET') return new Response(null, { status: 405 });
    if (init?.method === 'DELETE') return new Response(null, { status: 200 });
    const message = JSON.parse(String(init?.body));
    calls.push({ url: String(url), method: message.method, name: message.params?.name, args: message.params?.arguments });
    await options.intercept?.(message, init);
    if (message.id === undefined) return new Response(null, { status: 202 });
    let result: unknown;
    if (message.method === 'initialize') {
      result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'local-catalog-stub', version: '1' } };
    } else if (message.params?.name === 'search_furniture') {
      result = { content: [{ type: 'text', text: JSON.stringify(options.search ?? { results: [searchRecord] }) }],
        ...(options.error ? { isError: true } : {}) };
    } else if (message.params?.name === 'get_item') {
      result = { content: [], structuredContent: options.detail ?? detailRecord };
    } else {
      throw new Error('Unexpected RPC call ' + message.method);
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test('HTTP catalog maps search constraints and enriches real provenance without shrinking conflict dimensions', async () => {
  expect(catalog.createHttpCatalogQuery).toBeTypeOf('function');
  const stub = stubCatalog();
  const input = { kind: 'desk', max_w: 1.2, max_d: .7, max_h: .75, price_max: 80000,
    colors: ['White'], styles: ['Modern'], text: 'small desk', allow_rotate: false, limit: 1 };
  const result = await catalog.searchCatalog(input, catalog.createHttpCatalogQuery({ url: 'http://catalog.test/mcp', fetch: stub.fetch }));
  expect(stub.calls.filter(call => call.name)).toEqual([
    { url: 'http://catalog.test/mcp', method: 'tools/call', name: 'search_furniture', args: input },
    { url: 'http://catalog.test/mcp', method: 'tools/call', name: 'get_item', args: { item_id: 'abo:desk' } },
  ]);
  expect(result.status).toBe('available');
  expect(result.results[0]).toMatchObject({ sku: 'abo:desk', size: [1.2, .7, .75], price: 80000,
    currency: 'AMD', source: 'abo', price_source: 'mock', vendor: null, wd_swapped: true,
    size_evidence: detailRecord.size_evidence, colors_listing: ['White'], colors_image: ['Gray'],
    item: { sku: 'abo:desk', size: [1.2, .7, .75], price: 80000 } });
});

test('default catalog uses the documented HTTP MCP endpoint when no DB or URL is configured', async () => {
  vi.stubEnv('VARPET_DB_URL', ''); vi.stubEnv('VARPET_CATALOG_URL', '');
  const stub = stubCatalog(); vi.stubGlobal('fetch', stub.fetch);
  const result = await catalog.searchCatalog({ kind: 'desk', limit: 1 });
  expect(result.status).toBe('available');
  expect(stub.calls[0]?.url).toBe('http://100.107.246.46:8765/mcp');
});

test('explicit catalog URL overrides the default and an explicit database connection', async () => {
  vi.stubEnv('VARPET_DB_URL', 'postgres://secret:password@invalid/db');
  vi.stubEnv('VARPET_CATALOG_URL', 'http://catalog.test/custom-mcp');
  const stub = stubCatalog(); vi.stubGlobal('fetch', stub.fetch);
  expect((await catalog.searchCatalog({ limit: 1 })).status).toBe('available');
  expect(stub.calls.every(call => call.url === 'http://catalog.test/custom-mcp')).toBe(true);
});

test('empty HTTP search remains available and does not perform detail lookups', async () => {
  const stub = stubCatalog({ search: { results: [], nearest_misses: [] } });
  const result = await catalog.searchCatalog({}, catalog.createHttpCatalogQuery({ fetch: stub.fetch }));
  expect(result).toMatchObject({ status: 'available', results: [] });
  expect(stub.calls.filter(call => call.name).map(call => call.name)).toEqual(['search_furniture']);
});

test('HTTP tool errors and malformed payloads are unavailable without leaking remote error text', async () => {
  for (const options of [{ error: true, search: { error: 'postgres://secret:password@host/db' } },
    { search: { unexpected: [] } }]) {
    const stub = stubCatalog(options);
    const result = await catalog.searchCatalog({}, catalog.createHttpCatalogQuery({ fetch: stub.fetch }));
    expect(result).toMatchObject({ status: 'unavailable', results: [] });
    expect(result.reason).toMatch(/catalog/i);
    expect(JSON.stringify(result)).not.toContain('password');
  }
});

test('unknown currency or mismatched detail identity cannot manufacture a priced AMD product', async () => {
  for (const detail of [{ ...detailRecord, currency: null }, { ...detailRecord, id: 'another-item' }]) {
    const stub = stubCatalog({ detail });
    const result = await catalog.searchCatalog({}, catalog.createHttpCatalogQuery({ fetch: stub.fetch }));
    expect(result.results).toEqual([]);
  }
});

test('one timeout bounds initialize plus search and aborts a stalled HTTP request', async () => {
  let aborted = false;
  const stub = stubCatalog({ intercept: async (request, init) => {
    if (request.method === 'initialize') await new Promise(resolve => setTimeout(resolve, 25));
    if (request.params?.name === 'search_furniture') {
      await new Promise<void>((_, reject) => init?.signal?.addEventListener('abort', () => {
        aborted = true; reject(new Error('aborted'));
      }, { once: true }));
    }
  } });
  const started = performance.now();
  const result = await catalog.searchCatalog({}, catalog.createHttpCatalogQuery({ fetch: stub.fetch, timeoutMs: 60 }));
  expect(result).toMatchObject({ status: 'unavailable', results: [] });
  expect(performance.now() - started).toBeLessThan(250);
  expect(aborted).toBe(true);
  expect(stub.calls.some(call => call.name === 'get_item')).toBe(false);
});

test('invalid timeout or endpoint is rejected without performing a network request', () => {
  const fetch = vi.fn();
  for (const timeoutMs of [0, -1, Infinity, NaN]) {
    expect(() => catalog.createHttpCatalogQuery({ fetch, timeoutMs })).toThrow();
  }
  expect(() => catalog.createHttpCatalogQuery({ fetch, url: 'file:///private/catalog' })).toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
