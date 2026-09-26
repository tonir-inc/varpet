import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-designer-catalog-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'catalog-test-entry', resolveId(id) { if (id.endsWith('catalog-test-entry')) return '\0catalog-test-entry'; },
  load(id) { if (id === '\0catalog-test-entry') return `export * from '${root}/src/core/designer-catalog.ts'; export * from '${root}/src/core/store.ts'; export * from '${root}/src/adapters/database-catalog.ts';`; },
}], build: { ssr: 'catalog-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { DesignerProposalCatalog, mergeDesignerProducts, retainRegisteredProducts, EditorStore } = await import(pathToFileURL(join(output, 'test.mjs')));
const scene = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', color: '#ffffff', polygon: [[0,0],[6,0],[6,6],[0,6]] }], walls: [], objects: [] };
const product = id => ({ asset: { id, name: id, category: 'table', kind: 'table', dimensions: [1,1,1],
  color: '#ffffff', price: 15000, source: { type: 'gltf', url: 'https://example.com/table.glb' } },
  priceSource: 'mock', sizeStatus: 'estimated', attribution: 'Catalog' });
const proposal = (assetId, id = 'proposal', revision = 0) => ({ id, title: 'Add table', description: 'Place table.', command: {
  id, label: 'Add table', source: 'designer', baseRevision: revision,
  operations: [{ type: 'add', object: { id: 'new-table', name: 'Table', assetId, position: [2,0,2], rotation: 0, scale: [1,1,1] } }] } });

test('designer can propose remote ABO products while existing product identity and provenance stay authoritative', () => {
  const existing = product('abo:owned'), available = product('abo:remote');
  const merged = mergeDesignerProducts([existing], [{ ...existing.asset, price: 99 }, available.asset]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], existing);
  assert.equal(merged[1].asset.id, available.asset.id);
  assert.equal(merged[1].priceSource, 'unverified');
  assert.equal(merged[1].sizeStatus, 'unverified');
  available.asset.price = 88;
  assert.equal(merged[1].asset.price, 15000);
  const cache = new DesignerProposalCatalog(), pending = proposal(merged[1].asset.id);
  cache.remember(pending, merged);
  const store = new EditorStore(scene, []);
  store.registerCatalogAssets(cache.products(pending, 0).map(p => p.asset));
  assert.equal(store.execute(pending.command, true).ok, true);
});

test('remote discovery never reintroduces demo or procedural furniture', () => {
  const demo = product('demo-chair'), procedural = product('abo:procedural'), real = product('abo:real'), extra = product('extra:appliances:washer');
  procedural.asset.source = { type: 'procedural' };
  assert.deepEqual(mergeDesignerProducts([], [demo.asset, procedural.asset, real.asset, extra.asset]).map(p => p.asset.id), ['abo:real', 'extra:appliances:washer']);
});

test('browsing the same designer-added SKU preserves its registered appearance and updates provenance', () => {
  const registered = product('abo:shared'); registered.asset.category = 'Living';
  const store = new EditorStore(scene, [registered.asset]);
  assert.equal(store.execute(proposal(registered.asset.id).command, true).ok, true);
  const browsed = structuredClone(registered);
  browsed.asset.name = 'Longer database display name'; browsed.asset.category = 'table'; browsed.asset.color = '#aa9988';
  browsed.sizeStatus = 'confirmed';
  const result = retainRegisteredProducts([browsed], new Map([[registered.asset.id, registered]]));
  assert.deepEqual(result[0].asset, registered.asset);
  assert.equal(result[0].sizeStatus, 'confirmed');
  assert.doesNotThrow(() => store.registerCatalogAssets(result.map(p => p.asset)));
  for (const changed of [
    { ...browsed, asset: { ...browsed.asset, price: 99 } },
    { ...browsed, asset: { ...browsed.asset, dimensions: [2,1,1] } },
  ]) {
    const checked = retainRegisteredProducts([changed], new Map([[registered.asset.id, registered]]));
    assert.throws(() => store.registerCatalogAssets(checked.map(p => p.asset)), /changed/);
  }
});

test('discovery fits the catalog bound without dropping current scene or history references', () => {
  const current = Array.from({ length: 60 }, (_, i) => product(`abo:current-${i}`));
  const remote = Array.from({ length: 960 }, (_, i) => product(`abo:remote-${i}`).asset);
  const result = mergeDesignerProducts(current, remote);
  assert.equal(result.length, 1000);
  assert.deepEqual(result.slice(0, current.length), current);
  assert.doesNotThrow(() => new EditorStore(scene, result.map(p => p.asset)));
});

test('proposal survives a catalog search, requires approval, and undo restores the empty apartment', () => {
  const first = product('abo:first'), other = product('abo:other');
  const store = new EditorStore(scene, [first.asset]), cache = new DesignerProposalCatalog();
  const pending = proposal(first.asset.id);
  cache.remember(pending, [first]);
  store.registerCatalogAssets([other.asset]);
  assert.equal(store.execute(pending.command, true).ok, false, 'search prunes the unused proposed item');
  const restored = cache.products(pending, store.revision);
  assert.equal(restored.length, 1, 'pending proposal retains the exact catalog product');
  const catalog = store.registerCatalogAssets([other.asset, ...restored.map(p => p.asset)]);
  const preview = new EditorStore(store.scene, catalog);
  assert.equal(preview.execute(pending.command, true).ok, true);
  assert.equal(store.scene.objects.length, 0, 'preview leaves the authoritative apartment unchanged');
  assert.equal(store.execute(pending.command, false).ok, false);
  assert.equal(store.execute(pending.command, true).ok, true);
  cache.prune(store.revision);
  assert.deepEqual(cache.products(pending, store.revision), []);
  assert.equal(store.undo().ok, true);
  assert.deepEqual(store.scene, scene);
});

test('same-revision conversations retain only added products and immutable snapshots', () => {
  const cache = new DesignerProposalCatalog(), first = product('abo:first'), second = product('abo:second');
  const a = proposal(first.asset.id), b = proposal(second.asset.id, 'other-proposal');
  cache.remember(a, [first, second]); cache.remember(b, [first, second]);
  first.asset.price = 99;
  cache.prune(0);
  assert.deepEqual(cache.products(a, 0).map(p => p.asset.id), ['abo:first']);
  assert.equal(cache.products(a, 0)[0].asset.price, 15000);
  cache.products(a, 0)[0].asset.price = 88;
  assert.equal(cache.products(a, 0)[0].asset.price, 15000);
  cache.forget(a);
  assert.deepEqual(cache.products(a, 0), []);
  assert.equal(cache.products(b, 0).length, 1);
  cache.prune(1);
  assert.deepEqual(cache.products(b, 0), []);
});

test('reused proposal IDs cannot substitute a different command or bypass revisions', () => {
  const cache = new DesignerProposalCatalog(), first = product('abo:first'), second = product('abo:second');
  const a = proposal(first.asset.id), b = proposal(second.asset.id);
  cache.remember(a, [first]); cache.remember(b, [second]);
  assert.equal(cache.products(a, 0)[0].asset.id, first.asset.id);
  assert.equal(cache.products(b, 0)[0].asset.id, second.asset.id);
  assert.deepEqual(cache.products(a, 1), []);
  const changed = structuredClone(a); changed.command.operations[0].object.position = [4,0,4];
  assert.deepEqual(cache.products(changed, 0), []);
});
