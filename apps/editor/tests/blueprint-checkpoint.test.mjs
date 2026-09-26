import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-blueprint-checkpoint-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'checkpoint-test-entry',
  resolveId(id) { if (id.endsWith('checkpoint-test-entry')) return '\0checkpoint-test-entry'; },
  load(id) { if (id === '\0checkpoint-test-entry') return `export * from '${root}/src/portal/blueprint-checkpoint.ts'; export { migrateScene } from '${root}/src/core/renovation.ts';`; },
}], build: { ssr: 'checkpoint-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { saveBlueprintCheckpoint, readBlueprintCheckpoint, clearBlueprintCheckpoint, migrateScene } = await import(pathToFileURL(join(output, 'test.mjs')));

const shell = () => ({ format: 'varpet.editor', version: 1, id: 'uploaded-home', name: 'Uploaded home', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', color: '#ffffff', polygon: [[0, 0], [5, 0], [5, 4], [0, 4]] }], walls: [], objects: [] });
const product = () => ({ asset: { id: 'built-table', name: 'My table', kind: 'table', category: 'Furniture', dimensions: [1, 1, 1],
  color: '#ffffff', price: 0, source: { type: 'gltf', url: 'http://localhost:8788/assets/table.glb' } },
  priceSource: 'Built from photos', sizeStatus: 'Unverified', attribution: 'Original table' });
const tick = () => new Promise(setImmediate);

/** Controlled request and transaction events expose the commit boundary without browser dependencies. */
function database(t, options = {}) {
  const previous = globalThis.indexedDB, records = new Map(), transactions = [];
  let opens = 0, closes = 0;
  globalThis.indexedDB = { open() {
    opens++;
    const opening = {};
    queueMicrotask(() => {
      if (options.openError) { opening.error = options.openError; opening.onerror?.(); return; }
      opening.result = { close() { closes++; }, createObjectStore() {}, transaction() {
        const transaction = { error: null, objectStore() {
          const operation = (kind, id, value) => {
            const request = {};
            const snapshot = value === undefined ? undefined : structuredClone(value);
            queueMicrotask(() => {
              request.result = kind === 'get' ? structuredClone(records.get(id)) : kind === 'add' ? id : undefined;
              request.onsuccess?.();
              const commit = () => {
                if (kind === 'add') records.set(id, snapshot);
                if (kind === 'delete') records.delete(id);
                transaction.oncomplete?.();
              };
              transaction.commit = commit;
              if (options.abortError) { transaction.error = options.abortError; transaction.onabort?.(); }
              else if (!options.manualCommit) queueMicrotask(commit);
            });
            return request;
          };
          return { add: (value, id) => operation('add', id, value), get: id => operation('get', id), delete: id => operation('delete', id) };
        }, abort() { transaction.onabort?.(); } };
        transactions.push(transaction);
        return transaction;
      } };
      opening.onupgradeneeded?.(); opening.onsuccess?.();
    });
    return opening;
  } };
  t.after(() => { if (previous === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = previous; });
  return { records, transactions, get opens() { return opens; }, get closes() { return closes; } };
}

test('checkpoint preserves large original evidence and built catalog across repeated recovery attempts', async t => {
  const db = database(t), scene = migrateScene(shell()), catalog = [product()];
  scene.objects.push({ id: 'table', name: 'My table', assetId: 'built-table', position: [2, 0, 2], rotation: 0, scale: [1, 1, 1] });
  scene.project.sources = Array.from({ length: 3 }, (_, i) => ({ id: `source-${i}`, name: `Plan ${i}`, kind: 'plan',
    dataUrl: `data:image/png;base64,${Buffer.alloc(1_600_000, i).toString('base64')}` }));
  const original = structuredClone({ scene, catalog });
  assert.ok(JSON.stringify(original).length > 6_000_000, 'exceeds common Web Storage quotas');
  const id = await saveBlueprintCheckpoint(scene, catalog);
  scene.name = 'Changed after checkpoint'; catalog[0].asset.name = 'Changed product';
  assert.deepEqual(await readBlueprintCheckpoint(id), original);
  const recovered = await readBlueprintCheckpoint(id);
  recovered.scene.name = 'Changed after reading';
  assert.deepEqual(await readBlueprintCheckpoint(id), original, 'failed opening and caller mutation cannot consume the saved result');
  assert.equal(db.records.size, 1);
  await clearBlueprintCheckpoint(id);
  assert.equal(await readBlueprintCheckpoint(id), null);
  assert.equal(db.opens, db.closes, 'every completed transaction closes its database connection');
});

test('separate completed plans receive independent checkpoint IDs', async t => {
  database(t);
  const first = await saveBlueprintCheckpoint(shell(), []), second = await saveBlueprintCheckpoint({ ...shell(), name: 'Second apartment' }, []);
  assert.notEqual(first, second);
  await clearBlueprintCheckpoint(first);
  assert.equal(await readBlueprintCheckpoint(first), null);
  assert.equal((await readBlueprintCheckpoint(second)).scene.name, 'Second apartment');
});

test('save waits for transaction commit before allowing navigation', async t => {
  const db = database(t, { manualCommit: true });
  let settled = false;
  const saved = saveBlueprintCheckpoint(shell(), []).then(id => { settled = true; return id; });
  await tick();
  assert.equal(settled, false, 'request success alone must not authorize reload');
  assert.equal(db.records.size, 0);
  db.transactions[0].commit();
  const id = await saved;
  assert.equal(db.records.has(id), true);
});

test('an aborted write rejects after request success and does not leave a misleading checkpoint', async t => {
  const error = new DOMException('Storage full', 'QuotaExceededError'), db = database(t, { abortError: error });
  await assert.rejects(saveBlueprintCheckpoint(shell(), []), failure => failure === error);
  assert.equal(db.records.size, 0);
  assert.equal(db.closes, 1);
});

test('unavailable or failed storage rejects so the caller can keep its current plan visible', async t => {
  const error = new DOMException('Storage denied', 'SecurityError');
  database(t, { openError: error });
  await assert.rejects(saveBlueprintCheckpoint(shell(), []), failure => failure === error);
  delete globalThis.indexedDB;
  await assert.rejects(saveBlueprintCheckpoint(shell(), []), /unavailable/);
});

test('invalid scenes and catalog metadata are rejected before any write', async t => {
  const db = database(t);
  await assert.rejects(saveBlueprintCheckpoint({ ...shell(), units: 'feet' }, []), /Cannot import/);
  await assert.rejects(saveBlueprintCheckpoint(shell(), [{ asset: product().asset }]), /catalog data/);
  await assert.rejects(saveBlueprintCheckpoint({ ...shell(), objects: [{ id: 'table', name: 'Table', assetId: 'missing', position: [2, 0, 2], rotation: 0, scale: [1, 1, 1] }] }, []), /Cannot import/);
  assert.equal(db.opens, 0);
  assert.equal(db.records.size, 0);
});

test('recovery validates stored data and leaves corrupt records intact for diagnosis', async t => {
  const db = database(t);
  db.records.set('invalid-catalog', { scene: shell(), catalog: [{ ...product(), attribution: null }] });
  db.records.set('invalid-scene', { scene: { ...shell(), units: 'feet' }, catalog: [] });
  await assert.rejects(readBlueprintCheckpoint('invalid-catalog'), /catalog data/);
  await assert.rejects(readBlueprintCheckpoint('invalid-scene'), /Cannot import/);
  assert.equal(await readBlueprintCheckpoint('missing'), null);
  assert.equal(db.records.size, 2);
});
