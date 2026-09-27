import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { Writable } from 'node:stream';

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

function models(files) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    if (files === 'down') throw new Error('connect ECONNREFUSED 100.107.246.46');
    const body = files[new URL(url).pathname];
    return body ? new Response(body, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(body.length) } })
      : new Response(null, { status: 404 });
  };
  return { fetch, calls };
}

test('light model files are relayed from the catalog service with a one-year cache', async t => {
  const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
  const stub = models({ '/models/B0718WYQ8D.glb': glb });
  const url = await editor(t, { fetch: stub.fetch, url: 'http://catalog.test/custom' });
  const response = await fetch(`${url}/api/catalog/models/B0718WYQ8D.glb`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), glb);
  assert.deepEqual(stub.calls, [{ url: 'http://catalog.test/models/B0718WYQ8D.glb', method: 'GET' }]);
});

test('a model without a light copy is an uncached 404 so the browser falls back to the original', async t => {
  const stub = models({});
  const url = await editor(t, { fetch: stub.fetch });
  const missing = await fetch(`${url}/api/catalog/models/B000000000.glb`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  const down = await editor(t, { fetch: models('down').fetch });
  const failed = await fetch(`${down}/api/catalog/models/B000000000.glb`);
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
});

test('model routes accept only GET of a plain .glb name and never reach the catalog otherwise', async t => {
  const stub = models({});
  const url = await editor(t, { fetch: stub.fetch });
  for (const name of ['..%2Fsecret.glb', 'B0718WYQ8D.gltf', 'a.b.glb', `${'x'.repeat(121)}.glb`]) {
    assert.equal((await fetch(`${url}/api/catalog/models/${name}`)).status, 404, name);
  }
  assert.equal((await fetch(`${url}/api/catalog/models/B0718WYQ8D.glb`, { method: 'POST' })).status, 405);
  assert.deepEqual(stub.calls, []);
});

test('search pages forward an offset and return where the next page starts', async t => {
  const stub = remote({ search: { results: [searchRow], candidates: 45, next_offset: 40, nearest_misses: [] } });
  const url = await editor(t, { fetch: stub.fetch });
  const response = await fetch(`${url}/api/catalog/search?text=sofa&offset=20`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.next_offset, 40);
  assert.equal(body.candidates, 45);
  const search = stub.calls.find(call => call.params?.name === 'search_furniture');
  assert.deepEqual(search.params.arguments, { text: 'sofa', limit: 20, offset: 20 });
  for (const bad of ['-1', '1.5', 'x', '100001']) {
    assert.equal((await fetch(`${url}/api/catalog/search?text=sofa&offset=${bad}`)).status, 400, bad);
  }
});

test('long extra model names up to 120 characters are relayed', async () => {
  const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
  for (const length of [90, 120, 121]) {
    const name = `extra-appliances-${'x'.repeat(length - 17)}.glb`;
    const stub = models({ [`/models/${name}`]: glb });
    const middleware = catalog.createCatalogMiddleware({ fetch: stub.fetch, url: 'http://catalog.test/mcp' });
    const chunks = [];
    let status;
    const response = new Writable({ write(chunk, _encoding, done) { chunks.push(chunk); done(); } });
    response.writeHead = code => { status = code; };
    await middleware({ method: 'GET', url: `/api/catalog/models/${name}` }, response, () => assert.fail('Unexpected route'));
    assert.equal(status, length <= 120 ? 200 : 404);
    if (length <= 120) {
      assert.deepEqual(new Uint8Array(Buffer.concat(chunks)), glb);
      assert.equal(stub.calls[0].url, `http://catalog.test/models/${name}`);
    } else assert.deepEqual(stub.calls, []);
  }
});

test('a browser leaving mid-download or a catalog dying mid-stream never escapes the middleware', async t => {
  const escaped = [];
  const onRejection = error => escaped.push(error);
  process.on('unhandledRejection', onRejection);
  t.after(() => process.off('unhandledRejection', onRejection));
  let cancelled = false;
  const fetch = async (_url, init) => new Response(new ReadableStream({
    pull: controller => new Promise(resolve => setTimeout(() => { if (!cancelled) controller.enqueue(new Uint8Array(64 * 1024)); resolve(); }, 5)),
    cancel: () => { cancelled = true; },
  }), { status: 200, headers: { 'Content-Length': '99999999' } });
  const url = await editor(t, { fetch, url: 'http://catalog.test/mcp' });
  const controller = new AbortController();
  const response = await globalThis.fetch(`${url}/api/catalog/models/a.glb`, { signal: controller.signal });
  assert.equal(response.status, 200);
  controller.abort();
  const dying = await editor(t, { url: 'http://catalog.test/mcp', fetch: async () => new Response(new ReadableStream({
    start: controller => { controller.enqueue(new Uint8Array(10)); setTimeout(() => controller.error(new TypeError('terminated')), 20); } }), { status: 200 }) });
  await (await globalThis.fetch(`${dying}/api/catalog/models/b.glb`)).arrayBuffer().catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(cancelled, true, 'the upstream download stops with the browser');
  assert.deepEqual(escaped, []);
});

test('the middleware promise never rejects, even when the response cannot be written', async () => {
  const middleware = catalog.createCatalogMiddleware({ url: 'http://catalog.test/mcp', fetch: async () => { throw new Error('down'); } });
  const response = new Writable({ write(_chunk, _encoding, done) { done(); } });
  response.writeHead = () => { throw new Error('headers already sent'); };
  await middleware({ method: 'GET', url: '/api/catalog/search?text=x' }, response, () => assert.fail('Unexpected route'));
  await middleware({ method: 'GET', url: '/api/catalog/models/a.glb' }, response, () => assert.fail('Unexpected route'));
});
