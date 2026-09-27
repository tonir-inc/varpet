import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAccountsHandler } from './accounts.mjs';
import { createDevelopersHandler, loadEditorChecks } from './developers.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const password = 'a long private password';
// 1×1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const orion = JSON.parse(readFileSync(join(repo, 'apartments/orion-t8/startup.json'), 'utf8'));
const products = orion.catalog.map(asset => ({ asset, priceSource: 'catalog · demo price', sizeStatus: 'catalog', attribution: 'Amazon Berkeley Objects, CC BY 4.0' }));
const bundleBody = (overrides = {}) => ({ name: 'Type A · 3rd floor', building: 'Riverside', scene: structuredClone(orion.scene), catalog: products, blueprint: PNG, ...overrides });
const profile = (overrides = {}) => ({ slug: 'ararat-homes', name: 'Ararat Homes', city: 'Yerevan', tagline: 'Homes with light', about: 'We build calm, bright homes.', website: 'ararat.example', ...overrides });

async function serve(t, dataDir) {
  const directory = dataDir ?? await mkdtemp(join(tmpdir(), 'varpet-developers-'));
  const accounts = createAccountsHandler({ dataDir: directory });
  const developers = createDevelopersHandler({ dataDir: directory, repoRoot: repo, checks: loadEditorChecks });
  const server = createServer((req, res) => accounts(req, res, () => developers(req, res, () => { res.statusCode = 404; res.end(); })));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise(resolve => server.close(resolve));
    accounts.close(); developers.close();
  };
  t.after(async () => { await close(); if (!dataDir) await rm(directory, { recursive: true, force: true }); });
  const request = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
    const response = await fetch(`${origin}${path}`, { method,
      headers: { ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const type = response.headers.get('content-type') ?? '';
    return { status: response.status, headers: response.headers, body: type.startsWith('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  };
  const register = async email => {
    const result = await request('/api/account/register', { method: 'POST', body: { name: email.split('@')[0], email, password } });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.headers.get('set-cookie').split(';')[0];
  };
  return { request, register, close, directory };
}

test('samples: three developers and four bundles from apartments/, each reopening with its catalog', async t => {
  const api = await serve(t);
  const { developers } = (await api.request('/api/developers')).body;
  assert.deepEqual(developers.map(d => [d.slug, d.bundleCount]).sort(), [['m6', 1], ['orion', 2], ['sunday-towers', 1]]);
  const { bundles } = (await api.request('/api/bundles')).body;
  assert.deepEqual(bundles.map(b => b.id).sort(), ['sample-m6-12-54', 'sample-orion-t7', 'sample-orion-t8', 'sample-sunday-b12121']);
  const sunday = bundles.find(b => b.id === 'sample-sunday-b12121');
  assert.equal(sunday.area, 188.6);
  assert.equal(sunday.bedrooms, 3);
  assert.equal(sunday.source, 'sample');
  assert.equal(sunday.furnishedPieces, 54);
  assert.equal(bundles.find(b => b.id === 'sample-orion-t7').area, 134);
  assert.equal(bundles.find(b => b.id === 'sample-m6-12-54').area, 76.1);
  assert.equal(bundles.find(b => b.id === 'sample-m6-12-54').bedrooms, 2);
  assert.equal(bundles.find(b => b.id === 'sample-orion-t8').bedrooms, 2);
  const filtered = (await api.request('/api/bundles?developer=orion')).body.bundles;
  assert.deepEqual(filtered.map(b => b.id).sort(), ['sample-orion-t7', 'sample-orion-t8']);
  const developer = (await api.request('/api/developers/orion')).body.developer;
  assert.equal(developer.ownedByViewer, false);
  assert.equal(developer.website, null);
  assert.match(developer.about, /sample collection/i);
  assert.equal(developer.bundles.length, 2);

  const checks = await loadEditorChecks();
  for (const { id } of bundles) {
    const { bundle } = (await api.request(`/api/bundles/${id}`)).body;
    const assets = bundle.catalog.map(product => product.asset);
    for (const ref of checks.sceneCatalogIds(bundle.scene)) assert.ok(assets.some(asset => asset.id === ref), `${id} includes ${ref}`);
    assert.deepEqual(checks.checkBundleScene(bundle.scene, assets), { ok: true, errors: [] }, id);
    assert.ok(bundle.catalog.every(product => typeof product.priceSource === 'string' && typeof product.attribution === 'string'));
    const image = await api.request(bundle.blueprintUrl);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual([...image.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  }
  assert.equal((await api.request('/api/developers/nobody')).status, 404);
  assert.equal((await api.request('/api/bundles/sample-nothing')).status, 404);
  assert.equal((await api.request('/api/bundles/sample-nothing/blueprint')).status, 404);
  assert.equal((await api.request('/api/bundles/sample-orion-t7', { method: 'DELETE' })).status, 401);
});

test('profiles belong to the signed-in account; writes check origin, ownership and reserved addresses', async t => {
  const api = await serve(t);
  assert.equal((await api.request('/api/developers', { method: 'POST', body: profile() })).status, 401);
  assert.deepEqual((await api.request('/api/studio')).body, { user: null, developer: null });
  const owner = await api.register('owner@example.test');
  const other = await api.register('other@example.test');
  assert.equal((await api.request('/api/developers', { method: 'POST', body: profile(), cookie: owner, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await api.request('/api/developers', { method: 'POST', body: profile({ slug: 'orion' }), cookie: owner })).status, 409);
  assert.equal((await api.request('/api/developers', { method: 'POST', body: profile({ slug: 'Bad Slug' }), cookie: owner })).status, 400);
  assert.equal((await api.request('/api/developers', { method: 'POST', body: profile({ website: 'javascript:alert(1)' }), cookie: owner })).status, 400);
  const created = await api.request('/api/developers', { method: 'POST', body: profile(), cookie: owner });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.developer.website, 'https://ararat.example/');
  assert.equal(created.body.developer.ownedByViewer, true);
  assert.equal((await api.request('/api/developers', { method: 'POST', body: profile({ slug: 'second-one' }), cookie: owner })).status, 409);
  assert.equal((await api.request('/api/developers', { method: 'POST', body: profile(), cookie: other })).status, 409);
  assert.equal((await api.request('/api/studio', { cookie: owner })).body.developer.slug, 'ararat-homes');
  assert.equal((await api.request('/api/developers/ararat-homes', { cookie: other })).body.developer.ownedByViewer, false);
  assert.equal((await api.request('/api/developers/ararat-homes', { method: 'PUT', body: profile({ name: 'Taken over' }), cookie: other })).status, 403);
  const renamed = await api.request('/api/developers/ararat-homes', { method: 'PUT', body: profile({ slug: 'ararat', tagline: 'Bright homes' }), cookie: owner });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.developer.slug, 'ararat');
  assert.equal((await api.request('/api/developers/ararat-homes')).status, 404);
  assert.ok((await api.request('/api/developers')).body.developers.some(d => d.slug === 'ararat' && d.tagline === 'Bright homes'));
});

test('publishing validates the scene with the editor checks, the plan image and model addresses; unpublish is owner-only', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'varpet-developers-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const api = await serve(t, directory);
  const owner = await api.register('owner@example.test');
  const other = await api.register('other@example.test');
  await api.request('/api/developers', { method: 'POST', body: profile(), cookie: owner });
  await api.request('/api/developers', { method: 'POST', body: profile({ slug: 'other-homes' }), cookie: other });
  const publish = (body, cookie = owner, slug = 'ararat-homes') => api.request(`/api/developers/${slug}/bundles`, { method: 'POST', body, cookie });

  assert.equal((await publish(bundleBody(), other)).status, 403);
  assert.equal((await publish(bundleBody(), null)).status, 401);
  const broken = bundleBody(); broken.scene.objects[0].assetId = 'abo:missing';
  assert.equal((await publish(broken)).status, 422);
  assert.equal((await publish(bundleBody({ catalog: [] }))).status, 422);
  assert.equal((await publish(bundleBody({ blueprint: `data:image/png;base64,${Buffer.from('<svg/>').toString('base64')}` }))).status, 400);
  assert.equal((await publish(bundleBody({ blueprint: 'data:image/svg+xml;base64,PHN2Zy8+' }))).status, 400);
  const hostile = structuredClone(products); hostile[0].asset.source.url = 'http://tracker.example/model.glb';
  assert.equal((await publish(bundleBody({ catalog: hostile }))).status, 400);

  const published = await publish(bundleBody({ catalog: [...products, { ...products[0], asset: { ...products[0].asset, id: 'abo:unused' } }] }));
  assert.equal(published.status, 201, JSON.stringify(published.body));
  const { bundle } = published.body;
  assert.match(bundle.id, /^p-[0-9a-f-]{36}$/);
  assert.equal(bundle.source, 'published');
  assert.equal(bundle.developerSlug, 'ararat-homes');
  assert.equal(bundle.bedrooms, 2);
  assert.equal(bundle.furnishedPieces, orion.scene.objects.length);
  assert.ok(bundle.area > 100 && bundle.area < 130, String(bundle.area));
  assert.ok(!bundle.catalog.some(product => product.asset.id === 'abo:unused'), 'unreferenced products are dropped');
  assert.deepEqual(bundle.scene, orion.scene);

  const listed = (await api.request('/api/bundles')).body.bundles;
  assert.ok(listed.some(item => item.id === bundle.id && !('scene' in item)));
  assert.deepEqual((await api.request('/api/bundles?developer=ararat-homes')).body.bundles.map(item => item.id), [bundle.id]);
  const image = await api.request(bundle.blueprintUrl);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.body.toString('base64'), PNG.split(',')[1]);
  assert.equal((await api.request('/api/developers/ararat-homes')).body.developer.bundleCount, 1);

  const updated = await api.request(`/api/bundles/${bundle.id}`, { method: 'PUT', cookie: owner, body: { ...bundleBody({ name: 'Type A · updated', area: 118.5, bedrooms: 3 }), blueprint: undefined } });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.bundle.name, 'Type A · updated');
  assert.equal(updated.body.bundle.area, 118.5);
  assert.equal((await api.request(bundle.blueprintUrl)).body.toString('base64'), PNG.split(',')[1], 'the plan survives an update without one');

  // Restart: the published bundle is durable.
  await api.close();
  const again = await serve(t, directory);
  assert.equal((await again.request(`/api/bundles/${bundle.id}`)).body.bundle.name, 'Type A · updated');
  assert.equal((await again.request(`/api/bundles/${bundle.id}`, { method: 'DELETE', cookie: other })).status, 403);
  assert.equal((await again.request('/api/bundles/sample-orion-t7', { method: 'DELETE', cookie: owner })).status, 404);
  assert.deepEqual((await again.request(`/api/bundles/${bundle.id}`, { method: 'DELETE', cookie: owner })).body, { ok: true });
  assert.equal((await again.request(`/api/bundles/${bundle.id}`)).status, 404);
  assert.equal((await again.request(bundle.blueprintUrl)).status, 404);
});
