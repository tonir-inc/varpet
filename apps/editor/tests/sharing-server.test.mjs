import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, rm, readdir, readFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, createServer as createViteServer, preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-sharing-tests-'));
after(() => rm(output, { recursive: true, force: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'silent', build: {
  ssr: join(root, 'server/sharing.ts'), target: 'node22', outDir: output, emptyOutDir: false,
  minify: false, rolldownOptions: { output: { entryFileNames: 'sharing.mjs' } },
} });
const { createSharingMiddleware, sharingPlugin } = await import(pathToFileURL(join(output, 'sharing.mjs')));
const scene = { format: 'varpet.editor', version: 1, id: 'apartment-a', name: 'Shared apartment',
  units: 'm', upAxis: 'Y', rooms: [{ id: 'room-a', name: 'Room', color: '#abcdef',
    polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] }], walls: [], objects: [] };
const asset = { id: 'chair-a', name: 'Chair', category: 'Seating', kind: 'chair',
  dimensions: [0.5, 0.8, 0.5], color: '#aabbcc', price: 1000, source: { type: 'procedural' } };
const payload = (name = scene.name) => ({ scene: { ...scene, name }, catalog: [asset] });

async function server(t, directory, options = {}) {
  directory ??= await mkdtemp(join(output, 'store-'));
  const middleware = createSharingMiddleware({ directory, ...options });
  const http = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => http.close(resolve)));
  const url = `http://127.0.0.1:${http.address().port}`;
  const request = async (path = '/api/shares', method = 'GET', body, token, headers = {}) => {
    const response = await fetch(url + path, { method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, data: text ? JSON.parse(text) : null };
  };
  return { request, directory, url, close: () => new Promise(resolve => http.close(resolve)) };
}
async function create(request) {
  const response = await request('/api/shares', 'POST', payload());
  assert.equal(response.status, 201, response.text);
  return response.data;
}

test('creation returns independent capabilities and JSON responses disable caching and CORS', async t => {
  const { request } = await server(t);
  const result = await request('/api/shares', 'POST', payload());
  assert.equal(result.status, 201, result.text);
  assert.match(result.data.id, /^[a-f0-9]{32}$/);
  assert.match(result.data.viewToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(result.data.editToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(result.data.viewToken, result.data.editToken);
  assert.equal(result.data.version, 1);
  assert.ok(Number.isFinite(Date.parse(result.data.updatedAt)));
  assert.deepEqual(Object.keys(result.data).sort(), ['editToken', 'id', 'updatedAt', 'version', 'viewToken']);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('access-control-allow-origin'), null);
  assert.match(result.headers.get('content-type'), /^application\/json/);
});

test('view reads include the exact snapshot but never either secret or editable access', async t => {
  const { request } = await server(t), share = await create(request);
  const result = await request(`/api/shares/${share.id}?access=edit&permission=edit`, 'GET', undefined, share.viewToken);
  assert.equal(result.status, 200);
  assert.equal(result.data.access, 'view');
  assert.deepEqual(result.data.scene, scene);
  assert.deepEqual(result.data.catalog, [asset]);
  assert.equal(result.data.version, 1);
  assert.equal(result.text.includes(share.editToken), false);
  assert.equal(result.text.includes(share.viewToken), false);
  assert.deepEqual(Object.keys(result.data).sort(), ['access', 'catalog', 'id', 'scene', 'updatedAt', 'version']);
});

test('editors can recover the viewer capability and publish a validated newer snapshot', async t => {
  const { request } = await server(t), share = await create(request);
  const editable = await request(`/api/shares/${share.id}`, 'GET', undefined, share.editToken);
  assert.equal(editable.data.access, 'edit');
  assert.equal(editable.data.viewToken, share.viewToken);
  assert.equal(editable.text.includes(share.editToken), false);
  const saved = await request(`/api/shares/${share.id}`, 'PUT', { ...payload('New layout'), version: 1 }, share.editToken);
  assert.equal(saved.status, 200);
  assert.deepEqual(Object.keys(saved.data).sort(), ['updatedAt', 'version']);
  assert.equal(saved.data.version, 2);
  assert.ok(Date.parse(saved.data.updatedAt) > Date.parse(share.updatedAt));
  const viewed = await request(`/api/shares/${share.id}`, 'GET', undefined, share.viewToken);
  assert.equal(viewed.data.scene.name, 'New layout');
  assert.equal(viewed.data.version, 2);
});

test('viewer PUT cannot elevate permission through headers, query parameters, or a forged body', async t => {
  const { request } = await server(t), share = await create(request);
  const denied = await request(`/api/shares/${share.id}?access=edit`, 'PUT',
    { ...payload('Forged change'), version: 1, access: 'edit', editToken: share.viewToken }, share.viewToken,
    { 'X-Share-Access': 'edit', 'X-HTTP-Method-Override': 'POST' });
  assert.equal(denied.status, 403);
  assert.equal((await request(`/api/shares/${share.id}`, 'GET', undefined, share.viewToken)).data.version, 1);
});

test('missing, malformed and unrelated tokens fail without exposing identifiers or secrets', async t => {
  const { request, directory } = await server(t), share = await create(request), other = await create(request);
  for (const token of [undefined, 'bad', 'A'.repeat(43), other.editToken, `${share.editToken}x`]) {
    for (const method of ['GET', 'PUT']) {
      const result = await request(`/api/shares/${share.id}?token=${share.editToken}`, method,
        method === 'PUT' ? { ...payload(), version: 1 } : undefined, token);
      assert.ok([401, 404].includes(result.status), result.text);
      for (const secret of [share.editToken, share.viewToken, directory]) assert.equal(result.text.includes(secret), false);
      assert.equal(typeof result.data.reason, 'string');
    }
  }
  const missing = await request(`/api/shares/${'0'.repeat(32)}`, 'GET', undefined, share.editToken);
  assert.equal(missing.status, 404);
});

test('concurrent expected-version writes serialize the entire compare and atomic save', async t => {
  const { request } = await server(t), share = await create(request);
  const outcomes = await Promise.all(['First editor', 'Second editor'].map(name =>
    request(`/api/shares/${share.id}`, 'PUT', { ...payload(name), version: 1 }, share.editToken)));
  assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
  const winner = outcomes.findIndex(result => result.status === 200);
  const latest = await request(`/api/shares/${share.id}`, 'GET', undefined, share.viewToken);
  assert.equal(latest.data.version, 2);
  assert.equal(latest.data.scene.name, ['First editor', 'Second editor'][winner]);
});

test('a new server instance reads the committed disk snapshot with the same capabilities', async t => {
  const original = await server(t), share = await create(original.request);
  await original.request(`/api/shares/${share.id}`, 'PUT', { ...payload('Persisted'), version: 1 }, share.editToken);
  await original.close();
  const restarted = await server(t, original.directory);
  const saved = await restarted.request(`/api/shares/${share.id}`, 'GET', undefined, share.editToken);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.scene.name, 'Persisted');
  assert.equal(saved.data.version, 2);
  assert.equal(saved.data.viewToken, share.viewToken);
  const files = await readdir(original.directory);
  assert.equal(files.length, 1, 'No unfinished temporary writes');
  const stored = await readFile(join(original.directory, files[0]), 'utf8');
  assert.equal(stored.includes(share.editToken), false, 'Edit capabilities must be hashed on disk');
});

test('invalid scenes, catalogs, spoofed creation fields and versions are rejected without changing disk', async t => {
  const { request } = await server(t), share = await create(request);
  const invalid = [null, [], {}, { ...payload(), scene: { ...scene, rooms: [] } },
    { ...payload(), catalog: [null] }, { ...payload(), catalog: Array.from({ length: 1001 }, () => asset) },
    { ...payload(), catalog: [{ ...asset, source: { type: 'gltf', url: 'javascript:alert(1)' } }] },
    { ...payload(), scene: { ...scene, objects: [{ id: 'unknown', name: 'Unknown', assetId: 'missing',
      position: [2, 0, 2], rotation: 0, scale: [1, 1, 1] }] } }];
  for (const body of invalid) {
    assert.equal((await request('/api/shares', 'POST', body)).status, 400);
    assert.equal((await request(`/api/shares/${share.id}`, 'PUT', { ...body, version: 1 }, share.editToken)).status, 400);
  }
  assert.equal((await request('/api/shares', 'POST', { ...payload(), access: 'edit' })).status, 400);
  for (const version of [undefined, null, '1', 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await request(`/api/shares/${share.id}`, 'PUT', { ...payload(), version }, share.editToken)).status, 400);
  }
  assert.equal((await request(`/api/shares/${share.id}`, 'GET', undefined, share.viewToken)).data.version, 1);
});

test('an edit capability cannot silently replace an unrelated project identity', async t => {
  const { request } = await server(t), share = await create(request);
  const replacement = { ...payload(), scene: { ...scene, id: 'unrelated-apartment' }, version: 1 };
  assert.equal((await request(`/api/shares/${share.id}`, 'PUT', replacement, share.editToken)).status, 400);
  assert.equal((await request(`/api/shares/${share.id}`, 'GET', undefined, share.viewToken)).data.scene.id, scene.id);
});

test('JSON media type, parsing, size and same-origin checks apply to writes', async t => {
  const { request, url } = await server(t);
  assert.equal((await request('/api/shares', 'POST', payload(), undefined, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await request('/api/shares', 'POST', '{broken')).status, 400);
  assert.equal((await request('/api/shares', 'POST', payload(), undefined, { Origin: 'https://other.test' })).status, 403);
  assert.equal((await request('/api/shares', 'POST', payload(), undefined, { Origin: 'null' })).status, 403);
  assert.equal((await request('/api/shares', 'POST', payload(), undefined, { Origin: url })).status, 201);
  assert.equal((await request('/api/shares', 'POST', ' '.repeat(24 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await request('/api/shares', 'POST', ' '.repeat(24_000_001))).status, 413);
  assert.equal((await request('/api/shares', 'OPTIONS', undefined, undefined, { Origin: 'https://other.test' })).headers.get('access-control-allow-origin'), null);
});

test('an explicit public origin supports HTTPS proxies without trusting forwarded headers', async t => {
  const publicOrigin = 'https://varpet.example';
  const configured = await server(t, undefined, { publicOrigin });
  const forwarded = { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'varpet.example' };
  assert.equal((await configured.request('/api/shares', 'POST', payload(), undefined, { Origin: publicOrigin })).status, 201);
  for (const origin of ['https://unexpected.example', configured.url, 'http://varpet.example']) {
    assert.equal((await configured.request('/api/shares', 'POST', payload(), undefined,
      { Origin: origin, ...forwarded })).status, 403);
  }
  const direct = await server(t);
  assert.equal((await direct.request('/api/shares', 'POST', payload(), undefined,
    { Origin: publicOrigin, ...forwarded })).status, 403);
});

test('a configured public origin must be an exact HTTP or HTTPS origin without credentials or a path', () => {
  for (const publicOrigin of ['invalid', 'null', 'ftp://varpet.example', 'https://varpet.example/',
    'https://varpet.example/project', 'https://varpet.example?x=1', 'https://varpet.example#secret',
    'https://user:password@varpet.example']) {
    assert.throws(() => createSharingMiddleware({ directory: join(output, 'origins'), publicOrigin }), /public origin/i);
  }
});

test('storage locations inside served roots, including symlink aliases, are rejected', async () => {
  const served = join(output, 'served'), inside = join(served, 'shares'), alias = join(output, 'alias');
  await mkdir(inside, { recursive: true });
  await symlink(inside, alias);
  for (const directory of [inside, alias]) {
    assert.throws(() => createSharingMiddleware({ directory, forbiddenRoots: [served] }), /storage.*outside|outside.*storage/i);
  }
});

test('storage errors return generic JSON without disclosing local paths', async t => {
  const occupied = join(output, 'sharing.mjs');
  const { request } = await server(t, occupied);
  const result = await request('/api/shares', 'POST', payload());
  assert.equal(result.status, 503);
  assert.equal(typeof result.data.reason, 'string');
  assert.equal(result.text.includes(output), false);
});

test('the sharing plugin registers the API on real Vite development and preview servers', async t => {
  const directory = await mkdtemp(join(output, 'vite-store-'));
  const previewAssets = join(output, 'preview-assets');
  await mkdir(previewAssets);
  const dev = await createViteServer({ root, configFile: false, publicDir: false, logLevel: 'silent',
    plugins: [sharingPlugin({ directory })], server: { host: '127.0.0.1', port: 0 } });
  await dev.listen();
  t.after(() => dev.close());
  const devUrl = `http://127.0.0.1:${dev.httpServer.address().port}`;
  const created = await fetch(`${devUrl}/api/shares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
  assert.equal(created.status, 201);
  const share = await created.json();
  const leaked = await fetch(`${devUrl}/@fs/${join(directory, `${share.id}.json`)}`);
  assert.equal(leaked.ok, false, 'Disk snapshots cannot be requested through Vite /@fs');
  const previewServer = await preview({ root, configFile: false, publicDir: false, logLevel: 'silent',
    plugins: [sharingPlugin({ directory })], build: { outDir: previewAssets }, preview: { host: '127.0.0.1', port: 0 } });
  t.after(() => new Promise(resolve => previewServer.httpServer.close(resolve)));
  const previewUrl = `http://127.0.0.1:${previewServer.httpServer.address().port}`;
  const read = await fetch(`${previewUrl}/api/shares/${share.id}`, { headers: { Authorization: `Bearer ${share.viewToken}` } });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).access, 'view');
});
