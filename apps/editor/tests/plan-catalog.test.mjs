import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const apartments = fileURLToPath(new URL('../../../apartments/', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-plan-catalog-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'plan-catalog-test-entry', resolveId(id) { if (id.endsWith('plan-catalog-test-entry')) return '\0plan-catalog-test-entry'; },
  load(id) { if (id === '\0plan-catalog-test-entry') return `export * from '${root}/src/portal/bundles.ts'; export { renderPortalHeader } from '${root}/src/portal/portal-header.ts'; export * from '${root}/src/portal/bundles-contract.ts'; export { validateScene } from '${root}/src/core/validation.ts';`; },
}], build: { ssr: 'plan-catalog-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const catalog = await import(pathToFileURL(join(output, 'test.mjs')));
const { checkBundleSummary, matchesFilter, groupByDeveloper, restoreBundle, bundlesApi, BundleError, renderPortalHeader, validateScene, bundleHref, BUNDLE_API } = catalog;

const summary = (overrides = {}) => ({ id: 'sample-orion-t7', developerSlug: 'orion', developerName: 'Orion', name: 'Type 7 · top floor', building: 'Orion',
  bedrooms: 3, area: 134, blueprintUrl: '/api/bundles/sample-orion-t7/blueprint', source: 'sample', furnishedPieces: 30, updatedAt: '2026-09-27T06:20:33Z', ...overrides });
const json = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sample(dir) {
  const scene = JSON.parse(await readFile(join(apartments, dir, 'scene.furnished.json'), 'utf8'));
  const assets = JSON.parse(await readFile(join(apartments, dir, 'startup.json'), 'utf8')).catalog;
  const ids = new Set(scene.objects.map(object => object.assetId));
  return { scene, catalog: assets.filter(asset => ids.has(asset.id)).map(asset => ({ asset, priceSource: 'catalog · demo price', sizeStatus: 'catalog', attribution: 'ABO' })) };
}

test('bundle summaries are checked: foreign plan images and unsafe ids are dropped', () => {
  assert.deepEqual(checkBundleSummary(summary()), summary());
  assert.equal(checkBundleSummary(summary({ blueprintUrl: 'https://example.com/plan.png' })), null);
  assert.equal(checkBundleSummary(summary({ blueprintUrl: '//example.com/plan.png' })), null);
  assert.equal(checkBundleSummary(summary({ id: 'a"><script>' })), null);
  assert.equal(checkBundleSummary(summary({ source: 'other' })), null);
  assert.equal(checkBundleSummary(summary({ building: undefined })).building, null);
});

test('bedroom filter treats 3 as three or more; developer filter is exact', () => {
  const two = summary({ bedrooms: 2 }), four = summary({ bedrooms: 4, developerSlug: 'm6' });
  assert.equal(matchesFilter(four, { bedrooms: 3, developer: null }), true);
  assert.equal(matchesFilter(two, { bedrooms: 3, developer: null }), false);
  assert.equal(matchesFilter(two, { bedrooms: 2, developer: 'orion' }), true);
  assert.equal(matchesFilter(four, { bedrooms: null, developer: 'orion' }), false);
  assert.equal(matchesFilter(two, { bedrooms: null, developer: null }), true);
});

test('one shelf per developer, in the developers order, empty developers left out', () => {
  const developers = [{ slug: 'orion', name: 'Orion', city: '', tagline: '', bundleCount: 2, logoUrl: null },
    { slug: 'empty', name: 'Empty', city: '', tagline: '', bundleCount: 0, logoUrl: null }];
  const shelves = groupByDeveloper([
    summary({ id: 'big', bedrooms: 3 }), summary({ id: 'small', bedrooms: 2 }),
    summary({ id: 'z', developerSlug: 'zed', developerName: 'Zed' }), summary({ id: 'a', developerSlug: 'alpha', developerName: 'Alpha' }),
  ], developers);
  assert.deepEqual(shelves.map(shelf => shelf.developer.slug), ['orion', 'alpha', 'zed']);
  assert.deepEqual(shelves[0].bundles.map(bundle => bundle.id), ['small', 'big']);
  assert.equal(shelves[1].developer.name, 'Alpha');
});

test('a furnished sample reopens as a valid, independent copy with exactly its furniture', async () => {
  const bundle = await sample('orion-t7');
  const restored = await restoreBundle(bundle, async () => { throw new Error('nothing should be resolved'); });
  assert.equal(validateScene(restored.scene, restored.catalog.map(product => product.asset)).ok, true);
  assert.equal(restored.scene.objects.length, 30);
  assert.notEqual(restored.scene.id, bundle.scene.id);
  assert.deepEqual(new Set(restored.catalog.map(product => product.asset.id)), new Set(bundle.scene.objects.map(object => object.assetId)));
  restored.scene.objects[0].name = 'Changed';
  assert.notEqual(bundle.scene.objects[0].name, 'Changed');
});

test('furniture the bundle did not ship is resolved; an unreachable catalog is a clear error', async () => {
  const bundle = await sample('orion-t8');
  const [missing, ...rest] = bundle.catalog;
  let asked;
  const restored = await restoreBundle({ ...bundle, catalog: rest }, async ids => { asked = ids; return [missing]; });
  assert.deepEqual(asked, [missing.asset.id]);
  assert.equal(restored.scene.objects.length, bundle.scene.objects.length);
  await assert.rejects(restoreBundle({ ...bundle, catalog: rest }, async () => { throw new Error('offline'); }), error => error instanceof BundleError && error.code === 'catalog_unavailable');
  await assert.rejects(restoreBundle({ ...bundle, catalog: [{ asset: null }] }), error => error instanceof BundleError && error.code === 'invalid_catalog');
});

test('API reads drop malformed records and surface server errors', async () => {
  const bundles = await bundlesApi.bundles({ fetcher: json(200, { bundles: [summary(), { id: 'broken' }, summary({ id: 'second', bedrooms: 1 })] }) });
  assert.deepEqual(bundles.map(bundle => bundle.id), ['sample-orion-t7', 'second']);
  await assert.rejects(bundlesApi.bundle('gone', undefined, json(404, { error: 'This plan could not be found.', code: 'not_found' })),
    error => error instanceof BundleError && error.status === 404 && error.code === 'not_found' && /could not be found/.test(error.message));
  await assert.rejects(bundlesApi.bundles({ fetcher: async () => new Response('<html>', { status: 200 }) }), error => error instanceof BundleError && error.code === 'unavailable');
  assert.equal(BUNDLE_API.bundle('a b'), '/api/bundles/a%20b');
  assert.equal(bundleHref('sample-orion-t7'), '/?bundle=sample-orion-t7');
});

test('the shared portal header lists the Catalog tab and marks the current page', () => {
  const markup = renderPortalHeader('catalog');
  assert.match(markup, /<a href="\/\?view=catalog" aria-current="page"[^>]*>Catalog<\/a>/);
  assert.equal((markup.match(/aria-current/g) ?? []).length, 1);
  assert.equal((renderPortalHeader(null).match(/aria-current/g) ?? []).length, 0);
  assert.match(renderPortalHeader('explore'), /<a href="\/" aria-current="page">Start with a plan<\/a>/);
});
