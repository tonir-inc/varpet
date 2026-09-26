import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const implementation = await import('./accounts.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const password = 'a long private password';
const scene = {
  format: 'varpet.editor', version: 2, id: 'flat-source', name: 'The Avani Apartment', units: 'm', upAxis: 'Y',
  rooms: [], walls: [], objects: [],
  project: { sources: [{ id: 'plan', name: 'Original plan', kind: 'plan', dataUrl: 'data:image/png;base64,abc' }],
    assumptions: [{ id: 'uncertain-height', status: 'unresolved' }], options: [], baseline: { rooms: [], walls: [], objects: [] } },
};
const catalog = [{ id: 'abo:chair', name: 'Chair', source: { type: 'gltf', url: 'https://example.test/chair.glb' },
  dimensions: [1, 1, 1], category: 'chair', kind: 'chair', color: '#ffffff', price: 1000 }];

async function serve(t, options = {}, dataDir) {
  assert.equal(typeof implementation.createAccountsHandler, 'function', 'account HTTP handler is implemented');
  const directory = dataDir ?? await mkdtemp(join(tmpdir(), 'varpet-accounts-'));
  const handler = implementation.createAccountsHandler({ dataDir: directory, ...options });
  const server = createServer((req, res) => handler(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise(resolve => server.close(resolve));
    handler.close();
  };
  t.after(async () => { await close(); if (!dataDir) await rm(directory, { recursive: true, force: true }); });
  const request = async (path, { method = 'GET', body, cookie, headers = {}, raw } = {}) => {
    const response = await fetch(`${origin}${path}`, { method,
      headers: { ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : raw !== undefined ? { body: raw } : {}) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const register = async (email = 'davit@example.test') => {
    const result = await request('/api/account/register', { method: 'POST', body: { name: 'Davit', email, password } });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return { ...result, cookie: result.headers.get('set-cookie').split(';')[0] };
  };
  return { request, register, close, directory, origin };
}

const draft = (overrides = {}) => ({ name: 'My Avani apartment', templateId: 'avani', scene, catalog, ...overrides });

test('registration authenticates with a private cookie; logout revokes it and login verifies the password', async t => {
  const api = await serve(t);
  assert.deepEqual((await api.request('/api/account/session')).body, { user: null });
  assert.equal((await api.request('/api/apartments')).status, 401);
  const account = await api.register(' DAVIT@example.test ');
  assert.deepEqual(Object.keys(account.body.user).sort(), ['email', 'id', 'name']);
  assert.equal(account.body.user.email, 'davit@example.test');
  assert.match(account.headers.get('set-cookie'), /HttpOnly/);
  assert.match(account.headers.get('set-cookie'), /SameSite=Lax/);
  assert.match(account.headers.get('set-cookie'), /Path=\//);
  assert.equal((await api.request('/api/account/session', { cookie: account.cookie })).body.user.id, account.body.user.id);
  assert.equal((await api.request('/api/account/logout', { method: 'POST', cookie: account.cookie })).status, 200);
  assert.deepEqual((await api.request('/api/account/session', { cookie: account.cookie })).body, { user: null });
  assert.equal((await api.request('/api/account/login', { method: 'POST', body: { email: 'davit@example.test', password: 'wrong password' } })).status, 401);
  const login = await api.request('/api/account/login', { method: 'POST', body: { email: 'DAVIT@example.test', password } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, account.body.user.id);
  assert.notEqual(login.headers.get('set-cookie').split(';')[0], account.cookie);
});

test('apartments preserve the complete project and catalog across a server restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'varpet-durable-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const api = await serve(t, {}, directory);
  const account = await api.register();
  const saved = await api.request('/api/apartments', { method: 'POST', cookie: account.cookie, body: draft() });
  assert.equal(saved.status, 201);
  assert.deepEqual(saved.body.apartment.scene, scene);
  assert.deepEqual(saved.body.apartment.catalog, catalog);
  assert.equal(saved.body.apartment.version, 1);
  await api.close();
  const reopened = await serve(t, {}, directory);
  const loaded = await reopened.request(`/api/apartments/${saved.body.apartment.id}`, { cookie: account.cookie });
  assert.deepEqual(loaded.body, saved.body);
  const list = await reopened.request('/api/apartments', { cookie: account.cookie });
  assert.equal(list.body.apartments.length, 1);
  assert.equal(list.body.apartments[0].id, saved.body.apartment.id);
  assert.equal('scene' in list.body.apartments[0], false);
  assert.equal('catalog' in list.body.apartments[0], false);
});

test('one user cannot read or update another user’s saved apartment', async t => {
  const api = await serve(t);
  const owner = await api.register();
  const other = await api.register('other@example.test');
  const saved = await api.request('/api/apartments', { method: 'POST', cookie: owner.cookie, body: draft() });
  const path = `/api/apartments/${saved.body.apartment.id}`;
  assert.equal((await api.request(path, { cookie: other.cookie })).status, 404);
  assert.equal((await api.request(path, { method: 'PUT', cookie: other.cookie, body: draft({ version: 1 }) })).status, 404);
  assert.deepEqual((await api.request('/api/apartments', { cookie: other.cookie })).body, { apartments: [] });
  assert.equal((await api.request(path)).status, 401);
});

test('concurrent saves accept one version and reject a stale overwrite with the current apartment', async t => {
  const api = await serve(t);
  const { cookie } = await api.register();
  const saved = await api.request('/api/apartments', { method: 'POST', cookie, body: draft() });
  const path = `/api/apartments/${saved.body.apartment.id}`;
  const saves = await Promise.all(['Layout A', 'Layout B'].map(name => api.request(path,
    { method: 'PUT', cookie, body: draft({ name, version: 1 }) })));
  assert.deepEqual(saves.map(result => result.status).sort(), [200, 409]);
  const accepted = saves.find(result => result.status === 200).body.apartment;
  const rejected = saves.find(result => result.status === 409).body;
  assert.equal(rejected.code, 'version_conflict');
  assert.deepEqual(rejected.apartment, accepted);
  assert.equal(accepted.version, 2);
  assert.equal((await api.request(path, { cookie })).body.apartment.name, accepted.name);
});

test('credential validation rejects empty names, malformed email, weak passwords and duplicate normalized accounts', async t => {
  const api = await serve(t);
  for (const body of [{ name: '', email: 'a@example.test', password }, { name: 'A', email: 'invalid', password },
    { name: 'A', email: 'a@example.test', password: 'short' }, { name: 'A', email: 'a@example.test', password: 'x'.repeat(129) }]) {
    assert.equal((await api.request('/api/account/register', { method: 'POST', body })).status, 400);
  }
  await api.register();
  assert.equal((await api.request('/api/account/register', { method: 'POST', body: { name: 'Other', email: 'DAVIT@example.test', password } })).status, 409);
});

test('mutations reject cross-origin and missing-origin requests, invalid JSON and wrong content types', async t => {
  const api = await serve(t);
  const body = { name: 'Davit', email: 'a@example.test', password };
  for (const headers of [{ Origin: 'https://untrusted.example' }, { Origin: '' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await api.request('/api/account/register', { method: 'POST', body, headers })).status, 403);
  }
  assert.equal((await api.request('/api/account/register', { method: 'POST', raw: '{' })).status, 400);
  assert.equal((await api.request('/api/account/register', { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } })).status, 415);
});

test('body limits and scene validation reject invalid saves without damaging a saved apartment', async t => {
  const api = await serve(t, { maxBodyBytes: 2048 });
  const { cookie } = await api.register();
  for (const body of [draft({ scene: {} }), draft({ scene: { ...scene, version: 9 } }), draft({ catalog: {} }), draft({ name: '' })]) {
    assert.equal((await api.request('/api/apartments', { method: 'POST', cookie, body })).status, 400);
  }
  assert.equal((await api.request('/api/apartments', { method: 'POST', cookie, body: draft({ name: 'x'.repeat(4096) }) })).status, 413);
  assert.deepEqual((await api.request('/api/apartments', { cookie })).body.apartments, []);
});

test('rate limits bound repeated authentication attempts', async t => {
  const api = await serve(t, { rateLimit: { max: 2, windowMs: 60_000 } });
  for (let i = 0; i < 2; i++) {
    assert.equal((await api.request('/api/account/login', { method: 'POST', body: { email: 'unknown@example.test', password } })).status, 401);
  }
  const limited = await api.request('/api/account/register', { method: 'POST', body: { name: 'Name', email: 'new@example.test', password } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('the database contains salted password hashes and hashed session tokens, and expired sessions cannot authenticate', async t => {
  const api = await serve(t);
  const account = await api.register();
  const token = account.cookie.split('=')[1];
  const db = new DatabaseSync(join(api.directory, 'accounts.sqlite'));
  t.after(() => db.close());
  const user = db.prepare('SELECT * FROM users').get();
  const session = db.prepare('SELECT * FROM sessions').get();
  assert.notEqual(user.password_hash, password);
  assert.ok(user.password_hash.length >= 64);
  assert.ok(user.password_salt.length >= 32);
  assert.notEqual(session.token_hash, token);
  db.prepare('UPDATE sessions SET expires_at = 0').run();
  assert.deepEqual((await api.request('/api/account/session', { cookie: account.cookie })).body, { user: null });
  await api.close();
  const bytes = await readFile(join(api.directory, 'accounts.sqlite'));
  assert.equal(bytes.includes(Buffer.from(password)), false);
  assert.equal(bytes.includes(Buffer.from(token)), false);
});

test('new accounts require passwords with at least twelve characters', async t => {
  const api = await serve(t);
  const response = await api.request('/api/account/register', { method: 'POST',
    body: { name: 'Davit', email: 'davit@example.test', password: 'elevenchars' } });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /12/);
});

test('saved apartments preserve database catalog product wrappers and attribution', async t => {
  const api = await serve(t);
  const { cookie } = await api.register();
  const products = catalog.map(asset => ({ asset, priceSource: 'mock', sizeStatus: 'estimated',
    attribution: { title: 'Amazon Berkeley Objects', license: 'CC BY 4.0', url: 'https://example.test' } }));
  const response = await api.request('/api/apartments', { method: 'POST', cookie, body: draft({ catalog: products }) });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.apartment.catalog, products);
});

test('unexpected database failures emit safe diagnostics without exposing private request data', async t => {
  const api = await serve(t);
  const { cookie } = await api.register();
  const db = new DatabaseSync(join(api.directory, 'accounts.sqlite'));
  db.exec('DROP TABLE apartments');
  db.close();
  const diagnostics = t.mock.method(console, 'error', () => {});
  const response = await api.request('/api/apartments', { method: 'POST', cookie, body: draft() });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: 'Your account request could not be completed. Please try again.', code: 'server_error' });
  assert.deepEqual(diagnostics.mock.calls.map(call => call.arguments), [
    ['[varpet-accounts] Unexpected request failure', { type: 'Error', code: 'ERR_SQLITE_ERROR' }],
  ]);
  const logged = JSON.stringify(diagnostics.mock.calls.map(call => call.arguments));
  for (const secret of [cookie, password, 'davit@example.test', scene.name, api.directory, 'no such table']) {
    assert.equal(logged.includes(secret), false);
  }
});

const shareReference = { id: 'a'.repeat(32), token: 'b'.repeat(43) };

test('apartment sharing references persist privately across restart without entering project data or lists', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'varpet-shared-apartment-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const api = await serve(t, {}, directory);
  const { cookie } = await api.register();
  const created = await api.request('/api/apartments', { method: 'POST', cookie,
    body: draft({ sharing: shareReference }) });
  assert.equal(created.body.apartment.sharing, null, 'creating a copy cannot adopt a submitted sharing reference');
  const path = `/api/apartments/${created.body.apartment.id}`;
  const linked = await api.request(`${path}/sharing`, { method: 'PUT', cookie,
    body: { version: 1, reference: { ...shareReference, sceneId: 'untrusted-scene' } } });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.apartment.version, 2);
  assert.deepEqual(linked.body.apartment.sharing, { ...shareReference, sceneId: scene.id });
  assert.deepEqual(linked.body.apartment.scene, scene);
  assert.deepEqual(linked.body.apartment.catalog, catalog);
  const db = new DatabaseSync(join(directory, 'accounts.sqlite'));
  const stored = db.prepare('SELECT scene, catalog FROM apartments WHERE id = ?').get(created.body.apartment.id);
  assert.equal(JSON.stringify(stored).includes(shareReference.token), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM apartment_shares').get().count, 1);
  db.close();
  await api.close();
  const reopened = await serve(t, {}, directory);
  assert.deepEqual((await reopened.request(path, { cookie })).body, linked.body);
  const list = await reopened.request('/api/apartments', { cookie });
  assert.equal('sharing' in list.body.apartments[0], false);
  assert.equal(JSON.stringify(list.body).includes(shareReference.token), false);
});

test('only an authenticated apartment owner can change its sharing reference from the same origin', async t => {
  const api = await serve(t);
  const owner = await api.register();
  const other = await api.register('other@example.test');
  const created = await api.request('/api/apartments', { method: 'POST', cookie: owner.cookie, body: draft() });
  const path = `/api/apartments/${created.body.apartment.id}`;
  const body = { version: 1, reference: shareReference };
  assert.equal((await api.request(`${path}/sharing`, { method: 'PUT', body })).status, 401);
  const forbidden = await api.request(`${path}/sharing`, { method: 'PUT', cookie: other.cookie, body });
  assert.equal(forbidden.status, 404);
  assert.equal('apartment' in forbidden.body, false);
  for (const headers of [{ Origin: 'https://untrusted.example' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await api.request(`${path}/sharing`, { method: 'PUT', cookie: owner.cookie, body, headers })).status, 403);
  }
  const loaded = await api.request(path, { cookie: owner.cookie });
  assert.equal(loaded.body.apartment.version, 1);
  assert.equal(loaded.body.apartment.sharing, null);
  assert.equal((await api.request(`${path}/sharing`, { method: 'PUT', cookie: owner.cookie, body })).status, 200);
  const otherRead = await api.request(path, { cookie: other.cookie });
  assert.equal(otherRead.status, 404);
  assert.equal(JSON.stringify(otherRead.body).includes(shareReference.token), false);
  assert.deepEqual((await api.request('/api/apartments', { cookie: other.cookie })).body, { apartments: [] });
});

test('competing apartment sharing changes use the same version guard as scene saves', async t => {
  const api = await serve(t);
  const { cookie } = await api.register();
  const created = await api.request('/api/apartments', { method: 'POST', cookie, body: draft() });
  const path = `/api/apartments/${created.body.apartment.id}`;
  const changes = await Promise.all(['a', 'c'].map(character => api.request(`${path}/sharing`, {
    method: 'PUT', cookie, body: { version: 1, reference: { ...shareReference, id: character.repeat(32) } },
  })));
  assert.deepEqual(changes.map(result => result.status).sort(), [200, 409]);
  const accepted = changes.find(result => result.status === 200).body.apartment;
  const rejected = changes.find(result => result.status === 409).body;
  assert.equal(accepted.version, 2);
  assert.equal(rejected.code, 'version_conflict');
  assert.deepEqual(rejected.apartment, accepted);
  const staleScene = await api.request(path, { method: 'PUT', cookie,
    body: draft({ version: 1, scene: { ...scene, id: 'different-scene' } }) });
  assert.equal(staleScene.status, 409);
  assert.deepEqual(staleScene.body.apartment, accepted);
  assert.deepEqual((await api.request(path, { cookie })).body.apartment, accepted);
});

test('scene saves preserve sharing only for the same scene and apartment copies start without it', async t => {
  const api = await serve(t);
  const { cookie } = await api.register();
  const created = await api.request('/api/apartments', { method: 'POST', cookie, body: draft() });
  const path = `/api/apartments/${created.body.apartment.id}`;
  const linked = await api.request(`${path}/sharing`, { method: 'PUT', cookie,
    body: { version: 1, reference: shareReference } });
  assert.equal(linked.status, 200);
  const edited = await api.request(path, { method: 'PUT', cookie,
    body: draft({ version: 2, name: 'Renamed apartment', sharing: null }) });
  assert.equal(edited.status, 200);
  assert.deepEqual(edited.body.apartment.sharing, linked.body.apartment.sharing);
  const copy = await api.request('/api/apartments', { method: 'POST', cookie, body: edited.body.apartment });
  assert.equal(copy.status, 201);
  assert.notEqual(copy.body.apartment.id, created.body.apartment.id);
  assert.equal(copy.body.apartment.scene.id, scene.id);
  assert.equal(copy.body.apartment.sharing, null);
  const replaced = await api.request(path, { method: 'PUT', cookie,
    body: draft({ version: 3, scene: { ...scene, id: 'replacement-scene' } }) });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.apartment.sharing, null);
  const relinked = await api.request(`${path}/sharing`, { method: 'PUT', cookie,
    body: { version: 4, reference: shareReference } });
  assert.deepEqual(relinked.body.apartment.sharing, { ...shareReference, sceneId: 'replacement-scene' });
  const cleared = await api.request(`${path}/sharing`, { method: 'PUT', cookie, body: { version: 5, reference: null } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.apartment.version, 6);
  assert.equal(cleared.body.apartment.sharing, null);
  assert.deepEqual(cleared.body.apartment.scene, replaced.body.apartment.scene);
});

test('invalid sharing references and versions leave the saved apartment unchanged', async t => {
  const api = await serve(t);
  const { cookie } = await api.register();
  const created = await api.request('/api/apartments', { method: 'POST', cookie, body: draft() });
  const path = `/api/apartments/${created.body.apartment.id}`;
  const invalid = [undefined, {}, [], 'reference', { ...shareReference, id: 'z'.repeat(32) },
    { ...shareReference, id: 'a'.repeat(31) }, { ...shareReference, token: 'x'.repeat(42) },
    { ...shareReference, token: '/'.repeat(43) }];
  for (const reference of invalid) {
    assert.equal((await api.request(`${path}/sharing`, { method: 'PUT', cookie,
      body: { version: 1, reference } })).status, 400);
  }
  for (const version of [undefined, 0, 1.5, '1']) {
    assert.equal((await api.request(`${path}/sharing`, { method: 'PUT', cookie,
      body: { version, reference: shareReference } })).status, 400);
  }
  assert.deepEqual((await api.request(path, { cookie })).body, created.body);
});

test('a failed sharing association rolls back its apartment version change', async t => {
  const api = await serve(t);
  const { cookie } = await api.register();
  const created = await api.request('/api/apartments', { method: 'POST', cookie, body: draft() });
  const path = `/api/apartments/${created.body.apartment.id}`;
  const db = new DatabaseSync(join(api.directory, 'accounts.sqlite'));
  t.after(() => db.close());
  db.exec(`CREATE TRIGGER reject_share BEFORE INSERT ON apartment_shares
    BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END`);
  t.mock.method(console, 'error', () => {});
  const body = { version: 1, reference: shareReference };
  const failed = await api.request(`${path}/sharing`, { method: 'PUT', cookie, body });
  assert.equal(failed.status, 500);
  assert.deepEqual((await api.request(path, { cookie })).body, created.body);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM apartment_shares').get().count, 0);
  db.exec('DROP TRIGGER reject_share');
  const retried = await api.request(`${path}/sharing`, { method: 'PUT', cookie, body });
  assert.equal(retried.status, 200);
  assert.equal(retried.body.apartment.version, 2);
  assert.deepEqual(retried.body.apartment.sharing, { ...shareReference, sceneId: scene.id });
});
