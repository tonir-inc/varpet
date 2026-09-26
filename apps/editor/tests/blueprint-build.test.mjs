import assert from 'node:assert/strict';
import { after, test as nodeTest } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-blueprint-build-'));
const transportKey = '__varpetBlueprintBuildTestTransport';
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Blueprint build tests must use the fake transport'); };
after(() => { globalThis.fetch = originalFetch; });
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'blueprint-build-test-entry',
  enforce: 'pre',
  resolveId(id) {
    if (id.endsWith('blueprint-build-test-entry')) return '\0blueprint-build-test-entry';
    if (/\/adapters\/architect-http(?:\.ts)?$/.test(id)) return '\0blueprint-build-test-transport';
  },
  load(id) {
    if (id === '\0blueprint-build-test-entry') return `export * from '${root}/src/portal/blueprint-build.ts';`;
    if (id === '\0blueprint-build-test-transport') return `export function buildFurnishedFlat(...args) { return globalThis[${JSON.stringify(transportKey)}](...args); }`;
  },
}], build: { ssr: 'blueprint-build-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { startBlueprintBuild } = await import(pathToFileURL(join(output, 'test.mjs')));

const test = (name, run) => nodeTest(name, { timeout: 5000 }, run);
const file = (name = 'My apartment.png', text = 'plan') => new File([text], name, { type: 'image/png' });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fakeTransport(t) {
  const started = deferred(), requests = [];
  globalThis[transportKey] = (input, onProgress, options) => {
    const reply = deferred();
    const request = { input, onProgress, ...options, ...reply };
    requests.push(request);
    started.resolve(request);
    return reply.promise;
  };
  t.after(() => { delete globalThis[transportKey]; });
  return { started: started.promise, requests };
}
const record = (job, seen) => job.attach(message => seen.push(['progress', message]), event => seen.push(['event', event]));

test('starts before attachment and sends a snapshot of the original photos', async t => {
  const transport = fakeTransport(t), plan = file(), photo = file('Kitchen.png', 'original kitchen');
  const photos = [photo], job = startBlueprintBuild(plan, photos, () => {});
  photos.splice(0, 1, file('Replacement.png', 'replacement'));
  photos.push(file('Extra.png', 'extra'));
  const request = await transport.started;
  assert.equal(transport.requests.length, 1);
  assert.equal(job.status, 'reading');
  assert.equal(job.plan, plan);
  assert.deepEqual(job.photos, [photo]);
  assert.notEqual(job.photos, photos);
  assert.equal(request.input.name, 'My apartment');
  assert.equal(await request.input.plan.text(), 'plan');
  assert.deepEqual(await Promise.all(request.input.photos.map(photo => photo.text())), ['original kitchen']);
  request.resolve({ id: 'ready' });
  await job.result;
});

test('replays buffered progress and geometry in wire order, then delivers live updates once', async t => {
  const transport = fakeTransport(t), job = startBlueprintBuild(file(), [], () => {});
  const request = await transport.started, seen = [];
  const shell = { type: 'shell', rooms: [{ id: 'living' }] }, piece = { type: 'piece', id: 'sofa' };
  request.onProgress('Reading the plan');
  request.onEvent(shell);
  request.onEvent({ type: 'activity', message: 'Internal log' });
  request.onProgress('Building furniture');
  request.onEvent(piece);
  record(job, seen);
  assert.deepEqual(seen, [['progress', 'Reading the plan'], ['event', shell], ['progress', 'Building furniture'], ['event', piece]]);
  const placements = { type: 'placements', placements: [{ piece: 'sofa' }] };
  request.onProgress('Placing furniture');
  request.onEvent(placements);
  request.onEvent({ type: 'activity', message: 'Another internal log' });
  assert.deepEqual(seen, [['progress', 'Reading the plan'], ['event', shell], ['progress', 'Building furniture'], ['event', piece],
    ['progress', 'Placing furniture'], ['event', placements]]);
  const reattached = [];
  record(job, reattached);
  assert.deepEqual(reattached, [], 'already-delivered updates must not replay again');
  request.onProgress('Checking the result');
  assert.deepEqual(reattached, [['progress', 'Checking the result']]);
  assert.equal(seen.length, 6, 'the replaced listener must not receive live updates');
  request.resolve({ id: 'ready' });
  await job.result;
});

test('a build completed before attachment reuses its result without a second request', async t => {
  const transport = fakeTransport(t);
  let settled = 0;
  const job = startBlueprintBuild(file(), [], () => { settled++; }), request = await transport.started;
  const project = { id: 'completed-before-submit' }, result = job.result;
  request.onProgress('Done');
  request.resolve(project);
  assert.deepEqual(await result, { ok: true, project });
  assert.equal(job.status, 'ready');
  assert.equal(settled, 1);
  const seen = [];
  record(job, seen);
  assert.deepEqual(seen, [['progress', 'Done']]);
  assert.equal(job.result, result);
  assert.deepEqual(await job.result, { ok: true, project });
  assert.equal(transport.requests.length, 1);
  assert.equal(settled, 1);
});

test('a failure before attachment is caught immediately and remains available to submit', async t => {
  const transport = fakeTransport(t);
  let settled = 0;
  const job = startBlueprintBuild(file(), [], () => { settled++; }), request = await transport.started;
  const error = new Error('Architect unavailable');
  request.reject(error);
  // Give an unhandled rejection a chance to surface before a consumer reads the result.
  await new Promise(setImmediate);
  assert.equal(job.status, 'failed');
  assert.equal(settled, 1);
  assert.deepEqual(await job.result, { ok: false, error });
  assert.equal(transport.requests.length, 1);
});

for (const attached of [false, true]) test(`cancellation ${attached ? 'after' : 'before'} attachment aborts and suppresses stale updates`, async t => {
  const transport = fakeTransport(t);
  let settled = 0;
  const job = startBlueprintBuild(file(), [], () => { settled++; }), request = await transport.started, seen = [];
  request.onProgress('Reading the plan');
  if (attached) record(job, seen);
  const beforeCancel = structuredClone(seen);
  job.cancel();
  assert.equal(request.signal, job.signal);
  assert.equal(request.signal.aborted, true);
  request.onProgress('Stale progress');
  request.onEvent({ type: 'shell', rooms: [{ id: 'stale' }] });
  record(job, seen);
  request.resolve({ id: 'stale-project' });
  await job.result;
  assert.deepEqual(seen, beforeCancel, 'neither buffered nor late updates can reach a cancelled build');
  assert.equal(settled, 0, 'completion of a cancelled request must not update its former view');
});

test('cancelling immediately prevents the deferred transport from starting', async t => {
  const transport = fakeTransport(t);
  let settled = 0;
  const job = startBlueprintBuild(file(), [], () => { settled++; });
  job.cancel();
  const result = await job.result;
  assert.equal(result.ok, false);
  assert.equal(result.error.name, 'AbortError');
  assert.equal(transport.requests.length, 0);
  assert.equal(settled, 0);
});

test('a rejected plan has a distinct landing state before submit', async t => {
  const transport = fakeTransport(t);
  let settled = 0;
  const job = startBlueprintBuild(file(), [], () => { settled++; }), request = await transport.started;
  const error = Object.assign(new Error('This image shows a room. Upload your flat’s floor plan (JPG, PNG or WebP).'),
    { name: 'PlanRejectedError', kind: 'room photo', reason: 'This image shows a room.' });
  request.reject(error);
  const result = await job.result;
  assert.equal(result.ok, false);
  assert.equal(job.status, 'rejected');
  assert.equal(job.rejection, error);
  assert.equal(settled, 1);
});
