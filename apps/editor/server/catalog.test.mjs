import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const catalog = await import('./catalog.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('server/catalog.mjs')) return {};
  throw error;
});

const searchRow = { id: 'abo:desk', kind: 'desk', name: 'Desk', size_m: [1.2, .7, .75],
  price: 80000, colors_listing: ['White'], wd_swapped: true, why: { text: 1 } };
const detailRow = { ...searchRow, size_m: [1, .6, .7], fit_size_m: [1.2, .7, .75],
  currency: 'AMD', source: 'abo', price_source: 'mock', size_status: 'conflict',
  size_evidence: { wd_swapped: true }, glb_url: 'https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/desk.glb', license: 'CC BY 4.0' };
const vocab = { kinds: { desk: 2 }, colors: ['White'], styles: ['Modern'], materials: ['Wood'] };

function remote(options = {}) {
  const calls = [];
  let aborted = false;
  const fetch = async (url, init) => {
    if (init.method === 'GET') return new Response(null, { status: 405 });
    if (init.method === 'DELETE') return new Response(null, { status: 200 });
    const message = JSON.parse(init.body);
    calls.push({ ...message, url: String(url), session: new Headers(init.headers).get('mcp-session-id') });
    if (message.id === undefined) return new Response(null, { status: 202 });
    if (options.stall && message.params?.name === 'search_furniture') {
      return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => {
        aborted = true; reject(new Error('aborted'));
      }, { once: true }));
    }
    let result;
    if (message.method === 'initialize') {
      result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'catalog-test', version: '1' } };
    } else {
      let payload;
      if (message.params.name === 'search_furniture') payload = options.search ?? { results: [searchRow], nearest_misses: [] };
      else if (message.params.name === 'get_item') payload = message.params.arguments.item_id === 'missing' ? { error: 'no item' } : options.detail ?? detailRow;
      else if (message.params.name === 'list_vocab') payload = vocab;
      else throw new Error('Unexpected catalog tool');
      result = options.error ? { isError: true, content: [{ type: 'text', text: 'postgres://secret:password@host/db' }] }
        : { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
    const rpc = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
    // Exercise the SDK's SSE parsing and session headers, not a home-grown RPC client.
    return new Response(`event: message\ndata: ${rpc}\n\n`, {
      headers: { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'test-session' },
    });
  };
  return { fetch, calls, wasAborted: () => aborted };
}

async function editor(t, options) {
  assert.equal(typeof catalog.createCatalogMiddleware, 'function', 'catalog middleware must be implemented');
  const middleware = catalog.createCatalogMiddleware(options);
  const server = createServer((request, response) => middleware(request, response, () => {
    response.writeHead(404); response.end('next middleware');
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('search uses the real SDK, honors session/SSE, and merges raw dimensions, model and provenance', async t => {
  const stub = remote();
  const url = await editor(t, { fetch: stub.fetch, url: 'http://catalog.test/custom' });
  const response = await fetch(`${url}/api/catalog/search?text=small%20desk&kind=desk`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { results: [{ ...searchRow, ...detailRow }], nearest_misses: [] });
  const calls = stub.calls.filter(call => call.params?.name);
  assert.deepEqual(calls.map(call => [call.params.name, call.params.arguments]), [
    ['search_furniture', { text: 'small desk', kind: 'desk', limit: 20 }], ['get_item', { item_id: 'abo:desk' }],
  ]);
  assert.ok(calls.every(call => call.session === 'test-session' && call.url === 'http://catalog.test/custom'));
});

test('saved item hydration deduplicates ids and reports missing records without fake products', async t => {
  const stub = remote();
  const url = await editor(t, { fetch: stub.fetch });
  const response = await fetch(`${url}/api/catalog/items?ids=abo%3Adesk,missing,abo%3Adesk`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { results: [detailRow], missing_ids: ['missing'] });
  assert.equal(stub.calls.filter(call => call.params?.name === 'get_item').length, 2);
  assert.equal(stub.calls[0].url, 'http://100.107.246.46:8765/mcp');
});

test('vocabulary is returned directly from the database tool', async t => {
  const stub = remote();
  const url = await editor(t, { fetch: stub.fetch });
  const response = await fetch(`${url}/api/catalog/vocab`);
  assert.deepEqual(await response.json(), vocab);
  assert.deepEqual(stub.calls.filter(call => call.params?.name).map(call => call.params.name), ['list_vocab']);
});

test('remote errors and invalid detail identities return sanitized unavailable responses', async t => {
  for (const options of [{ error: true }, { detail: { ...detailRow, id: 'wrong' } }, { search: { unexpected: [] } }]) {
    const stub = remote(options);
    const url = await editor(t, { fetch: stub.fetch });
    const response = await fetch(`${url}/api/catalog/search`);
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.results, []);
    assert.ok(!JSON.stringify(result).includes('password'));
    assert.match(result.reason, /Catalog unavailable/);
  }
});

test('the request deadline aborts stalled upstream requests', async t => {
  const stub = remote({ stall: true });
  const url = await editor(t, { fetch: stub.fetch, timeoutMs: 60 });
  const started = performance.now();
  const response = await fetch(`${url}/api/catalog/search`);
  assert.equal(response.status, 503);
  assert.ok(performance.now() - started < 500);
  assert.equal(stub.wasAborted(), true);
});

test('invalid or mutating requests never call the catalog and unrelated routes pass through', async t => {
  const stub = remote();
  const url = await editor(t, { fetch: stub.fetch });
  assert.equal((await fetch(`${url}/api/catalog/search`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${url}/api/catalog/items`)).status, 400);
  assert.equal((await fetch(`${url}/api/catalog/items?ids=${Array.from({ length: 101 }, (_, i) => i).join(',')}`)).status, 400);
  assert.equal((await fetch(`${url}/api/catalog/search?text=${'x'.repeat(1001)}`)).status, 400);
  assert.equal((await fetch(`${url}/unrelated`)).status, 404);
  assert.deepEqual(stub.calls, []);
});
