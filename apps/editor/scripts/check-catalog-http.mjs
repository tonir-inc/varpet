import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-catalog-check-'));
try {
  await build({
    root, configFile: false, publicDir: false, logLevel: 'error',
    build: {
      ssr: join(root, 'src/adapters/catalog-http.ts'), target: 'node22',
      outDir: output, emptyOutDir: false, minify: false,
      rolldownOptions: { output: { entryFileNames: 'catalog.mjs' } },
    },
  });
  const { createCatalogHttpAdapter, mergeCatalogs, DEFAULT_CATALOG_ASSETS_URL, CATALOG_CURRENCY } =
    await import(pathToFileURL(join(output, 'catalog.mjs')).href);
  assert.equal(DEFAULT_CATALOG_ASSETS_URL, 'http://100.107.246.46:8765/editor/assets');
  assert.equal(CATALOG_CURRENCY, 'AMD');
  const asset = { id: 'remote', name: 'Chair', category: 'Seating', kind: 'chair',
    dimensions: [0.5, 0.8, 0.6], color: '#aAbBcC', price: 1000,
    source: { type: 'gltf', url: 'https://amazon-berkeley-objects.s3.amazonaws.com/chair.glb' } };
  const list = (data) => createCatalogHttpAdapter({ fetch: async () => ({ ok: true, json: async () => data }) }).list();
  const newKinds = ['desk', 'wardrobe', 'dresser'].flatMap(kind => [
    { ...asset, id: `gltf-${kind}`, kind },
    { ...asset, id: `procedural-${kind}`, kind, source: { type: 'procedural' } },
  ]);
  assert.deepEqual(await list(newKinds), newKinds, 'Native furniture kinds survive catalog discovery for both model sources');
  const tailnet = { ...asset, source: { type: 'gltf', url: 'http://100.107.246.46:8765/models/chair.glb' } };
  assert.deepEqual(await list([tailnet]), [tailnet]);
  const valid = await list([asset, { ...asset, id: 'procedural', source: { type: 'procedural' } }]);
  assert.equal(valid.length, 2);
  assert.deepEqual(valid[0], asset);
  assert.ok(Object.isFrozen(valid));
  let requestedUrl;
  await createCatalogHttpAdapter({ url: 'https://catalog.test/assets', models: 'original', fetch: async (url) => {
    requestedUrl = url; return { ok: true, json: async () => [asset] };
  } }).list();
  assert.equal(requestedUrl, 'https://catalog.test/assets');
  for (const [url, expected] of [
    ['https://catalog.test/assets', 'https://catalog.test/assets?models=web'],
    ['/editor/assets?kind=chair#assets', '/editor/assets?kind=chair&models=web#assets'],
  ]) {
    await createCatalogHttpAdapter({ url, models: 'web', fetch: async (requestUrl) => {
      requestedUrl = requestUrl; return { ok: true, json: async () => [asset] };
    } }).list();
    assert.equal(requestedUrl, expected);
  }
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const invalid = [null, { ...asset, id: 1 }, { ...asset, name: null }, { ...asset, category: 1 },
      { ...asset, kind: 'unknown' }, ...[[0, 1, 1], [10, 1, 1], [Infinity, 1, 1], [1, 1], [1, 1, '1']].map(dimensions => ({ ...asset, dimensions })),
      { ...asset, color: '#abc' }, ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(price => ({ ...asset, price })),
      { ...asset, source: { type: 'gltf', url: 'https://evil.test/model.glb' } },
      { ...asset, source: { type: 'gltf', url: 'http://amazon-berkeley-objects.s3.amazonaws.com/model.glb' } },
      { ...asset, source: { type: 'gltf', url: 'http://evil.test/model.glb' } },
      { ...asset, source: { type: 'other' } }, asset];
    const independentInvalid = invalid.map((entry, index) =>
      entry && typeof entry.id === 'string' && index !== invalid.length - 1
        ? { ...entry, id: `invalid-${index}` } : entry);
    assert.deepEqual(await list([asset, ...independentInvalid]), [asset]);
    assert.ok(warnings.some(message => message.includes(String(invalid.length))));
    await assert.rejects(list([null]), /valid/i);
    await assert.rejects(list([]), /valid/i);
  } finally { console.warn = warn; }
  await assert.rejects(list({ assets: [asset] }), /array/i);
  await assert.rejects(createCatalogHttpAdapter({ fetch: async () => ({ ok: false, status: 503 }) }).list(), /503/);
  let transportSignal;
  const hangingFetch = async (_url, { signal }) => {
    transportSignal = signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  };
  await assert.rejects(createCatalogHttpAdapter({ timeoutMs: 10, fetch: hangingFetch }).list(), { name: 'TimeoutError' });
  assert.ok(transportSignal.aborted);
  const caller = new AbortController();
  const pending = createCatalogHttpAdapter({ fetch: hangingFetch }).list(caller.signal);
  caller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(transportSignal.aborted);
  await assert.rejects(createCatalogHttpAdapter({ fetch: () => assert.fail('Already aborted request fetched') }).list(caller.signal), { name: 'AbortError' });
  const local = [{ ...asset, name: 'Local chair' }];
  const remote = [asset, { ...asset, id: 'new' }, { ...asset, id: 'new' }];
  assert.deepEqual(mergeCatalogs(local, remote), [local[0], remote[1]]);
  assert.equal(local.length, 1);
  assert.equal(remote.length, 3);
  console.log('catalog HTTP checks passed');
} finally {
  await rm(output, { recursive: true, force: true });
}
