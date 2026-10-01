import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExperimentalHandler } from './experimental.mjs';
import { loadEditorChecks } from './developers.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

async function serve(t, repoRoot = repo) {
  const server = createServer((req, res) => createExperimentalHandler({ repoRoot })(req, res, () => { res.statusCode = 404; res.end('next'); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('the experimental list carries Komitas 2-5 as a bundle summary', async t => {
  const origin = await serve(t);
  const response = await fetch(`${origin}/api/experimental/flats`);
  assert.equal(response.status, 200);
  const { bundles } = await response.json();
  const flat = bundles.find(bundle => bundle.id === 'komitas-b3-t11');
  assert.ok(flat, 'komitas-b3-t11 is listed');
  assert.equal(flat.developerName, 'Komitas Park');
  assert.equal(flat.bedrooms, 1);
  assert.equal(flat.area, 66.3);
  assert.equal(flat.furnishedPieces, 19);
  assert.equal(flat.source, 'sample');
  assert.match(flat.blueprintUrl, /^\/api\/experimental\/flats\/komitas-b3-t11\/blueprint$/);
});

test('a full flat reopens under the editor’s own scene checks with every piece in its catalog', async t => {
  const origin = await serve(t);
  const { bundle } = await (await fetch(`${origin}/api/experimental/flats/komitas-b3-t11`)).json();
  const assets = bundle.catalog.map(product => product.asset);
  const ids = new Set(assets.map(asset => asset.id));
  for (const object of bundle.scene.objects) assert.ok(ids.has(object.assetId), `${object.id} has its model`);
  const { checkBundleScene } = await loadEditorChecks();
  assert.deepEqual(checkBundleScene(bundle.scene, assets), { ok: true, errors: [] });
});

test('the plan image is served, falling back to the generated top view when the private plan is absent', async t => {
  const origin = await serve(t);
  const image = await fetch(`${origin}/api/experimental/flats/komitas-b3-t11/blueprint`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');

  // A checkout without the plan (it is never committed) still shows the flat.
  const copy = await mkdtemp(join(tmpdir(), 'varpet-experimental-'));
  t.after(() => rm(copy, { recursive: true }));
  const flat = join(copy, 'apartments/komitas-b3-t11');
  await mkdir(join(flat, 'review'), { recursive: true });
  for (const file of ['startup.json', 'trace.svg', 'name.txt', 'review/top.png']) await copyFile(join(repo, 'apartments/komitas-b3-t11', file), join(flat, file));
  const fallback = await serve(t, copy);
  const { bundles } = await (await fetch(`${fallback}/api/experimental/flats`)).json();
  assert.equal(bundles.length, 1);
  const top = await fetch(`${fallback}/api/experimental/flats/komitas-b3-t11/blueprint`);
  assert.equal(top.status, 200);
});

test('the flat’s pieces are served as the designer’s own design, every scene piece owned once', async t => {
  const origin = await serve(t);
  const { design } = await (await fetch(`${origin}/api/experimental/flats/komitas-b3-t11/design`)).json();
  const { bundle } = await (await fetch(`${origin}/api/experimental/flats/komitas-b3-t11`)).json();
  const ids = bundle.scene.objects.map(object => object.id).sort();
  assert.deepEqual([...design.owned].sort(), ids);
  assert.deepEqual(design.draft.items.map(item => item.id).sort(), ids);
  for (const item of design.draft.items) assert.ok(item.sku && item.price > 0 && item.vendor && item.keep === false, `${item.id} is a priced, movable design piece`);
});

test('unknown flats and other paths are not served', async t => {
  const origin = await serve(t);
  const missing = await fetch(`${origin}/api/experimental/flats/nope`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'not_found');
  assert.equal(await (await fetch(`${origin}/api/bundles`)).text(), 'next');
  assert.equal((await fetch(`${origin}/api/experimental/flats`, { method: 'POST' })).status, 405);
});
