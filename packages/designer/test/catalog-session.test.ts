import { expect, test } from 'vitest';
import * as catalog from '../src/catalog.js';

/** A catalog MCP stub counting initialize handshakes and tool calls; `fail` breaks the next n tool calls at the HTTP level. */
function stub(search: unknown) {
  const calls: string[] = [];
  let fail = 0;
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    if (init?.method === 'GET') return new Response(null, { status: 405 });
    if (init?.method === 'DELETE') return new Response(null, { status: 200 });
    const message = JSON.parse(String(init?.body));
    calls.push(message.params?.name ?? message.method);
    if (message.id === undefined) return new Response(null, { status: 202 });
    if (message.method === 'tools/call' && fail > 0) { fail--; return new Response('gone', { status: 404 }); }
    const result = message.method === 'initialize'
      ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'stub', version: '1' } }
      : message.params?.name === 'search_furniture' ? { content: [{ type: 'text', text: JSON.stringify(search) }] }
      : { content: [], structuredContent: { id: 'abo:desk', currency: 'AMD', source: 'abo', price_source: 'mock', size_evidence: null, size_m: [1.2, 0.7, 0.75] } };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls, failNext: (n: number) => { fail = n; } };
}
const complete = { id: 'abo:desk', kind: 'desk', name: 'Desk', size_m: [1.2, 0.7, 0.75], price: 80000, currency: 'AMD', source: 'abo', price_source: 'mock', size_evidence: { from: 'mesh' } };

test('searches share one session: one handshake for many searches', async () => {
  const s = stub({ results: [complete] }), query = catalog.createHttpCatalogQuery({ fetch: s.fetch });
  for (let i = 0; i < 3; i++) expect((await catalog.searchCatalog({ kind: 'desk' }, query)).results).toHaveLength(1);
  expect(s.calls.filter(c => c === 'initialize')).toHaveLength(1);
  expect(s.calls.filter(c => c === 'search_furniture')).toHaveLength(3);
});

test('rows that already carry currency, provenance and size skip the per-result get_item', async () => {
  const s = stub({ results: [complete] }), result = await catalog.searchCatalog({ kind: 'desk' }, catalog.createHttpCatalogQuery({ fetch: s.fetch }));
  expect(result.results[0]).toMatchObject({ sku: 'abo:desk', currency: 'AMD', source: 'abo', price_source: 'mock' });
  expect(s.calls).not.toContain('get_item');
  const { currency: _c, ...bare } = complete, t = stub({ results: [bare] });
  await catalog.searchCatalog({ kind: 'desk' }, catalog.createHttpCatalogQuery({ fetch: t.fetch }));
  expect(t.calls).toContain('get_item');
});

test('a session that breaks is reopened and the call retried once', async () => {
  const s = stub({ results: [complete] }), query = catalog.createHttpCatalogQuery({ fetch: s.fetch });
  await catalog.searchCatalog({ kind: 'desk' }, query);
  s.failNext(1);
  expect((await catalog.searchCatalog({ kind: 'desk' }, query)).status).toBe('available');
  expect(s.calls.filter(c => c === 'initialize')).toHaveLength(2);
});

test('the bare-bed-base filter still applies to search rows', async () => {
  const frame = { ...complete, id: 'abo:frame', kind: 'bed', name: 'Metal platform bed frame, no box spring needed' };
  const bed = { ...complete, id: 'abo:bed', kind: 'bed', name: 'Oak bed with headboard' };
  const base = { ...complete, id: 'abo:base', kind: 'bed', name: 'Bed base with slats only' };
  const s = stub({ results: [base, bed, frame] }), result = await catalog.searchCatalog({ kind: 'bed' }, catalog.createHttpCatalogQuery({ fetch: s.fetch }));
  expect(result.results.map(r => r.sku)).not.toContain('abo:base');
});
