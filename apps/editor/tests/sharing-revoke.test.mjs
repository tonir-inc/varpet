import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'varpet-revoke-direct-'));
after(() => rm(directory, { recursive: true, force: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'silent', plugins: [{
  name: 'entry', resolveId(id) { if (id.endsWith('revoke-entry')) return '\0revoke-entry'; },
  load(id) { if (id === '\0revoke-entry') return `export * from '${root}/server/sharing.ts'; export * from '${root}/server/accounts.mjs';`; },
}], build: { ssr: 'revoke-entry', target: 'node22', outDir: join(directory, 'build'),
  rolldownOptions: { output: { entryFileNames: 'entry.mjs' } } } });
const { createSharingMiddleware, createAccountsHandler } = await import(pathToFileURL(join(directory, 'build/entry.mjs')));
const sharesDirectory = join(directory, 'shares');
const shares = createSharingMiddleware({ directory: sharesDirectory });
const accounts = createAccountsHandler({ dataDir: join(directory, 'accounts'), sharesDirectory });
after(() => accounts.close());
const scene = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y', rooms: [{ id: 'room', name: 'Room', color: '#abcdef', polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] }], walls: [], objects: [] };
async function request(handler, url, method, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { url, method, socket: {}, headers: { host: 'varpet.test', origin: 'http://varpet.test', 'content-type': 'application/json', ...headers } });
  const result = { headers: {} };
  const res = { setHeader(key, value) { result.headers[key] = value; },
    writeHead(status, headers) { result.status = status; Object.assign(result.headers, headers); },
    end(body) { result.body = JSON.parse(body); this.writableEnded = true; } };
  await handler(req, res);
  return result;
}
const auth = token => ({ authorization: `Bearer ${token}` });

test('direct handlers enforce revoke permissions, origin and permanent deletion', async () => {
  const created = await request(shares, '/api/shares', 'POST', { scene, catalog: [] });
  assert.equal(created.status, 201);
  const share = created.body, path = `/api/shares/${share.id}`;
  assert.equal((await request(shares, path, 'DELETE', undefined, auth(share.viewToken))).status, 403);
  const wrong = await request(shares, path, 'DELETE', undefined, auth('x'.repeat(43)));
  const absent = await request(shares, `/api/shares/${'0'.repeat(32)}`, 'DELETE', undefined, auth('x'.repeat(43)));
  assert.equal(wrong.status, 404); assert.deepEqual(wrong.body, absent.body);
  assert.equal((await request(shares, path, 'DELETE', undefined, { ...auth(share.editToken), origin: 'https://evil.test' })).status, 403);
  assert.equal((await request(shares, path, 'DELETE', undefined, auth(share.editToken))).status, 200);
  for (const token of [share.editToken, share.viewToken]) assert.equal((await request(shares, path, 'GET', undefined, auth(token))).status, 404);
  assert.equal((await request(shares, path, 'PUT', { scene, catalog: [], version: 1 }, auth(share.editToken))).status, 404);
});

test('account Stop sharing revokes the real link using its stored capability', async () => {
  const registered = await request(accounts, '/api/account/register', 'POST', { name: 'Test', email: 'test@example.test', password: 'a long test password' });
  const headers = { cookie: registered.headers['Set-Cookie'].split(';')[0] };
  const created = await request(accounts, '/api/apartments', 'POST', { name: 'Flat', scene, catalog: [] }, headers);
  const path = `/api/apartments/${created.body.apartment.id}/sharing`;
  const share = (await request(shares, '/api/shares', 'POST', { scene, catalog: [] })).body;
  assert.equal((await request(accounts, path, 'PUT', { version: 1, reference: { id: share.id, token: share.editToken } }, headers)).status, 200);
  assert.equal((await request(accounts, path, 'PUT', { version: 1, reference: null }, headers)).status, 409);
  assert.equal((await request(shares, `/api/shares/${share.id}`, 'GET', undefined, auth(share.viewToken))).status, 200);
  const stopped = await request(accounts, path, 'PUT', { version: 2, reference: null }, headers);
  assert.equal(stopped.status, 200); assert.equal(stopped.body.apartment.sharing, null);
  assert.equal((await request(shares, `/api/shares/${share.id}`, 'GET', undefined, auth(share.viewToken))).status, 404);
});

test('a concurrent save cannot resurrect a revoked share', async () => {
  const share = (await request(shares, '/api/shares', 'POST', { scene, catalog: [] })).body;
  const path = `/api/shares/${share.id}`;
  const results = await Promise.all([
    request(shares, path, 'PUT', { scene, catalog: [], version: 1 }, auth(share.editToken)),
    request(shares, path, 'DELETE', undefined, auth(share.editToken)),
  ]);
  assert.ok([200, 404].includes(results[0].status));
  assert.equal(results[1].status, 200);
  assert.equal((await request(shares, path, 'GET', undefined, auth(share.viewToken))).status, 404);
});

test('account revocation cannot delete with a stored view token and preserves its reference on failure', async () => {
  const registered = await request(accounts, '/api/account/register', 'POST', { name: 'Viewer', email: 'viewer@example.test', password: 'a long test password' });
  const headers = { cookie: registered.headers['Set-Cookie'].split(';')[0] };
  const created = await request(accounts, '/api/apartments', 'POST', { name: 'Flat', scene, catalog: [] }, headers);
  const path = `/api/apartments/${created.body.apartment.id}`;
  const share = (await request(shares, '/api/shares', 'POST', { scene, catalog: [] })).body;
  const linked = await request(accounts, `${path}/sharing`, 'PUT', { version: 1, reference: { id: share.id, token: share.viewToken } }, headers);
  assert.equal(linked.status, 200);
  assert.equal((await request(accounts, `${path}/sharing`, 'PUT', { version: 2, reference: null }, headers)).status, 404);
  assert.deepEqual((await request(accounts, path, 'GET', undefined, headers)).body, linked.body);
  assert.equal((await request(shares, `/api/shares/${share.id}`, 'GET', undefined, auth(share.viewToken))).status, 200);
});
