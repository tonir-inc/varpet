import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-built-catalog-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'built-test-entry', resolveId(id) { if (id.endsWith('built-test-entry')) return '\0built-test-entry'; },
  load(id) { if (id === '\0built-test-entry') return `export * from '${root}/src/adapters/built-catalog.ts'; export * from '${root}/src/core/store.ts'; export * from '${root}/src/adapters/database-catalog.ts';`; },
}], build: { ssr: 'built-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const api = await import(pathToFileURL(join(output, 'test.mjs')));
const { EditorStore, resolveSceneProducts } = api;
const scene = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', color: '#ffffff', polygon: [[0,0],[6,0],[6,6],[0,6]] }], walls: [], objects: [] };
const asset = (run = 'older') => ({ id: `built-${run}-table`, name: 'Photo table', category: 'Built from your photos', kind: 'table',
  dimensions: [1,1,1], color: '#ffffff', price: 0, source: { type: 'gltf', url: `http://localhost:8788/files/${run}/table/piece.glb` } });
const calls = [];
const fetcher = async url => {
  const parsed = new URL(url); calls.push(parsed.pathname + parsed.search);
  return Response.json(parsed.pathname === '/runs' ? [{ run: 'newest', pieces: 1 }, { run: 'older', pieces: 1 }] : [asset(parsed.searchParams.get('run'))]);
};
const options = { url: 'http://localhost:8788', fetch: fetcher };

test('built assets become registrable products with explicit unpriced, unverified provenance', async () => {
  assert.equal(typeof api.loadBuiltProducts, 'function', 'Built pieces need a product registration adapter');
  const { products, run } = await api.loadBuiltProducts(options);
  assert.equal(run, 'newest');
  assert.equal(products[0].asset.price, 0);
  assert.equal(products[0].priceSource, 'not priced');
  assert.equal(products[0].sizeStatus, 'unverified reconstruction');
  assert.match(products[0].attribution, /newest/);
  const store = new EditorStore(scene, []);
  store.registerCatalogAssets(products.map(p => p.asset));
  const command = { id: 'place', label: 'Place built table', source: 'human', baseRevision: 0,
    operations: [{ type: 'add', object: { id: 'table', name: 'Photo table', assetId: products[0].asset.id, position: [2,0,2], rotation: 0, scale: [1,1,1] } }] };
  assert.equal(store.execute(command, true).ok, true);
  store.registerCatalogAssets([]);
  assert.equal(store.undo().ok, true);
  assert.equal(store.redo().ok, true);
});

test('saved older-run references hydrate alongside database furniture including option references', async () => {
  calls.length = 0;
  const db = { asset: { ...asset(), id: 'abo:shop' }, priceSource: 'mock', sizeStatus: 'estimated', attribution: 'ABO' };
  const input = { ...scene, objects: [{ assetId: db.asset.id }], project: { options: [{ snapshot: { objects: [{ assetId: asset().id }] } }] } };
  const result = await resolveSceneProducts(input, new Map(), ids => api.resolveFurnitureProducts(ids, options, async ids => {
    assert.deepEqual(ids, ['abo:shop']); return [db];
  }));
  assert.deepEqual(result.map(p => p.asset.id).sort(), ['abo:shop', asset().id].sort());
  assert.ok(calls.includes('/pieces?run=older'));
  assert.ok(!calls.includes('/pieces?run=newest'));
});

test('missing service or missing built pieces reject hydration without falling back to database records', async () => {
  let queried = false;
  const database = async () => { queried = true; return []; };
  await assert.rejects(() => api.resolveFurnitureProducts([asset().id], {}, database), /architect/i);
  await assert.rejects(() => api.resolveFurnitureProducts(['built-removed-table'], options, database), /unavailable/i);
  assert.equal(queried, false);
});

test('malformed or shop-priced built payloads cannot enter the product catalog', async () => {
  for (const patch of [{ dimensions: [-1,1,1] }, { price: 500 }, { source: { type: 'procedural' } }, { id: 'abo:collision' }]) {
    await assert.rejects(() => api.loadBuiltProducts({ ...options, run: 'older', fetch: async () => Response.json([{ ...asset(), ...patch }]) }));
  }
});
