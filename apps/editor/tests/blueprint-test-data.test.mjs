import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-blueprint-test-data-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'blueprint-test-data-entry',
  resolveId(id) { if (id.endsWith('blueprint-test-data-entry')) return '\0blueprint-test-data-entry'; },
  load(id) { if (id === '\0blueprint-test-data-entry') return `export * from '${root}/src/portal/blueprint-test-data.ts'; export { parseScene } from '${root}/src/core/persistence.ts';`; },
}], build: { ssr: 'blueprint-test-data-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { BLUEPRINT_TEST_STATES, getBlueprintTestState, loadBlueprintTestData, createBlueprintTestBuild, parseScene } = await import(pathToFileURL(join(output, 'test.mjs')));

const planBytes = await readFile(new URL('../../../packages/designer/eval/vision-fixtures/avani-plan.png', import.meta.url));
const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async url => {
  assert.match(String(url), /avani-plan/);
  assert.doesNotMatch(String(url), /https?:|\/flat|\/catalog|\/runs/);
  requests.push(String(url));
  return new Response(planBytes, { headers: { 'Content-Type': 'image/png' } });
};
after(() => { globalThis.fetch = originalFetch; });
const data = await loadBlueprintTestData();
globalThis.fetch = () => { throw new Error('Checkpoint builds must never make network requests'); };
const start = (state, input = data, onSettled = () => {}) => createBlueprintTestBuild(input, state)(input.plan, input.photos, onSettled);
const attach = job => {
  const updates = [];
  job.attach(message => updates.push({ type: 'progress', message }), event => updates.push(event));
  return updates;
};

test('named states cover the full blueprint flow and reject unknown URL values', () => {
  const ids = ['upload', 'selected', 'reading', 'walls', 'building', 'placing', 'checking', 'complete', 'error'];
  assert.deepEqual(BLUEPRINT_TEST_STATES.map(state => state.id), ids);
  for (const id of ids) assert.equal(getBlueprintTestState(id), id);
  for (const value of [null, '', 'done', 'wall', '<script>']) assert.equal(getBlueprintTestState(value), undefined);
  assert.ok(BLUEPRINT_TEST_STATES.every(state => state.label && state.description));
});

test('fixtures retain the real source image and a checked furniture project without service requests', async () => {
  assert.equal(requests.length, 1, 'only the local source image is fetched');
  assert.deepEqual(Buffer.from(await data.plan.arrayBuffer()), planBytes);
  assert.equal(data.plan.type, 'image/png');
  assert.equal(data.photos.length, 0);
  assert.equal(data.project.objects.length, 2);
  const checked = parseScene(JSON.stringify(data.project), data.catalog.map(product => product.asset));
  assert.deepEqual(checked, data.project);
  for (const product of data.catalog) {
    assert.equal(product.asset.source.type, 'gltf');
    assert.match(product.asset.source.url, /\.glb$/);
    assert.doesNotMatch(product.asset.source.url, /^https?:/);
  }
});

test('checkpoints synchronously deliver cumulative real geometry and furniture events in wire order', async () => {
  const expected = {
    upload: [], selected: [], reading: ['progress'], walls: ['progress', 'progress', 'shell'],
    building: ['progress', 'progress', 'shell', 'pieces', 'progress', 'piece', 'progress', 'piece'],
    placing: ['progress', 'progress', 'shell', 'pieces', 'progress', 'piece', 'progress', 'piece', 'progress', 'placements'],
    checking: ['progress', 'progress', 'shell', 'pieces', 'progress', 'piece', 'progress', 'piece', 'progress', 'placements', 'progress'],
  };
  for (const [state, types] of Object.entries(expected)) {
    const job = start(state), updates = attach(job);
    assert.deepEqual(updates.map(event => event.type), types, state);
    assert.equal(job.status, 'reading');
    const marker = {};
    assert.equal(await Promise.race([job.result, Promise.resolve(marker)]), marker, `${state} must stay paused`);
    assert.deepEqual(attach(job), [], 'attachment does not replay previously delivered events');
    job.cancel(); await job.result;
  }
  const stage = data.checkpoints.checking;
  assert.deepEqual(stage.find(event => event.type === 'shell').walls, data.project.walls);
  const pieces = stage.filter(event => event.type === 'piece');
  const placements = stage.find(event => event.type === 'placements').objects;
  assert.equal(pieces.length, 2);
  assert.deepEqual(placements.map(item => item.assetId), pieces.map(item => item.asset.id));
  assert.deepEqual(placements.map(item => item.position), data.project.objects.map(item => item.position));
  assert.match(stage.at(-1).message, /^Checking/);
});

test('complete and failure states settle only after the construction listener attaches', async () => {
  for (const state of ['complete', 'error']) {
    let settled = 0;
    const job = start(state, data, () => { settled++; });
    assert.equal(job.status, 'reading');
    const marker = {};
    assert.equal(await Promise.race([job.result, Promise.resolve(marker)]), marker);
    attach(job);
    const result = await job.result;
    assert.equal(settled, 1);
    assert.equal(result.ok, state === 'complete');
    assert.equal(job.status, state === 'complete' ? 'ready' : 'failed');
    if (result.ok) assert.deepEqual(parseScene(JSON.stringify(result.project), data.catalog.map(product => product.asset)), data.project);
    else assert.match(result.error.message, /simulated blueprint build failure/);
    attach(job); assert.equal(settled, 1);
  }
});

test('cancelling any checkpoint settles its promise and suppresses all later callbacks', async () => {
  for (const { id } of BLUEPRINT_TEST_STATES) {
    let settled = 0;
    const job = start(id, data, () => { settled++; });
    job.cancel(); job.cancel();
    assert.equal(job.signal.aborted, true);
    assert.deepEqual(attach(job), []);
    const result = await job.result;
    assert.equal(result.ok, false);
    assert.equal(result.error.name, 'AbortError');
    assert.equal(settled, 0);
  }
  const job = start('complete');
  let messages = 0, events = 0;
  job.attach(() => { messages++; job.cancel(); }, () => { events++; });
  assert.equal(messages, 1);
  assert.equal(events, 0, 'cancellation during replay stops the remaining events');
  assert.equal((await job.result).ok, false);
});

test('each job owns its events, final project and photo list independently', async () => {
  const before = structuredClone({ project: data.project, checkpoints: data.checkpoints });
  const photo = new File(['room'], 'Room.png', { type: 'image/png' });
  const input = { ...data, photos: [photo] };
  const first = start('complete', input), second = start('complete', input);
  input.photos.length = 0;
  assert.deepEqual(first.photos, [photo]);
  const events = attach(first);
  events.find(event => event.type === 'shell').walls[0].height = 99;
  events.find(event => event.type === 'piece').asset.name = 'changed';
  const firstResult = await first.result;
  firstResult.project.objects[0].position[0] = 99;
  assert.deepEqual(attach(second), data.checkpoints.complete);
  assert.deepEqual((await second.result).project, data.project);
  assert.deepEqual({ project: data.project, checkpoints: data.checkpoints }, before);
});
