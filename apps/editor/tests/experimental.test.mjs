import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const flat = fileURLToPath(new URL('../../../apartments/komitas-b3-t11/', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-experimental-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'experimental-test-entry', resolveId(id) { if (id.endsWith('experimental-test-entry')) return '\0experimental-test-entry'; },
  load(id) {
    if (id === '\0experimental-test-entry') return `export { experimentalApi, experimentalHref, experimentalFlatHref, EXPERIMENTAL_API } from '${root}/src/portal/experimental.ts'; export { renderPortalHeader } from '${root}/src/portal/portal-header.ts'; export { restoreBundle, BundleError } from '${root}/src/portal/bundles.ts';`;
    // The page's styles are irrelevant in Node.
    if (id.endsWith('.css')) return '';
  },
}], build: { ssr: 'experimental-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { experimentalApi, experimentalHref, experimentalFlatHref, EXPERIMENTAL_API, renderPortalHeader, restoreBundle, BundleError } = await import(pathToFileURL(join(output, 'test.mjs')));

const json = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const { scene, catalog } = JSON.parse(await readFile(join(flat, 'startup.json'), 'utf8'));
const summary = { id: 'komitas-b3-t11', developerSlug: 'komitas-park', developerName: 'Komitas Park', name: 'Type 11 · flat 2-5',
  building: 'Komitas Park · Building 3', bedrooms: 1, area: 66.3, blueprintUrl: '/api/experimental/flats/komitas-b3-t11/blueprint',
  source: 'sample', furnishedPieces: scene.objects.length, updatedAt: '2026-10-01T09:40:00Z' };

test('the Experimental tab sits in the main navigation and marks itself current', () => {
  assert.match(renderPortalHeader('experimental'), /<a href="\/\?view=experimental" aria-current="page"[^>]*>Experimental<\/a>/);
  assert.doesNotMatch(renderPortalHeader('catalog'), /view=experimental" aria-current/);
  assert.equal(experimentalHref, '/?view=experimental');
  assert.equal(experimentalFlatHref('komitas-b3-t11'), '/?experimental=komitas-b3-t11');
  assert.equal(EXPERIMENTAL_API.flat('a b'), '/api/experimental/flats/a%20b');
});

test('flat summaries are checked and malformed ones dropped', async () => {
  const flats = await experimentalApi.flats(json(200, { bundles: [summary, { ...summary, blueprintUrl: 'https://example.com/x.png' }, 'junk'] }));
  assert.deepEqual(flats, [summary]);
  await assert.rejects(experimentalApi.flats(json(404, { error: 'gone', code: 'not_found' })), error => error instanceof BundleError && error.status === 404);
  await assert.rejects(experimentalApi.flats(async () => new Response('<html>', { status: 200 })), error => error instanceof BundleError && error.code === 'unavailable');
});

test('a full flat restores into an editor scene without the furniture database', async () => {
  const products = catalog.map(asset => ({ asset, priceSource: 'catalog · demo price', sizeStatus: 'catalog', attribution: 'ABO' }));
  const bundle = await experimentalApi.flat('komitas-b3-t11', json(200, { bundle: { ...summary, scene, catalog: products } }));
  assert.equal(bundle.scene.objects.length, 18);
  const restored = await restoreBundle(bundle, async () => { throw new Error('the database must not be asked'); });
  assert.equal(restored.scene.objects.length, 18);
  assert.equal(restored.catalog.length, products.length);
  await assert.rejects(experimentalApi.flat('komitas-b3-t11', json(200, { bundle: summary })), error => error instanceof BundleError && error.code === 'invalid');
});
