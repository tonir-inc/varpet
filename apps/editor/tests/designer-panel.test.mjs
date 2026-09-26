import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-designer-panel-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: {
  ssr: join(root, 'src/ui/designer-panel.ts'), target: 'node22', outDir: output,
  minify: false, rolldownOptions: { output: { entryFileNames: 'panel.mjs' } },
} });
const { createDesignerConversation, createRecordedDesigner } = await import(pathToFileURL(join(output, 'panel.mjs')));
const scene = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
  rooms: [], walls: [], objects: [{ id: 'coffee-table', name: 'Table', assetId: 'table-coffee',
    position: [-3.25, 0, 1.48], rotation: 0, scale: [1, 1, 1] }] };
const proposal = { id: 'p1', title: 'A little more room', description: 'Move the table.',
  command: { id: 'p1', label: 'Move table', source: 'designer', baseRevision: 12,
    operations: [{ type: 'update', id: 'coffee-table', patch: { position: [-3.25, 0, 1.2] } }] } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(ask) {
  const reviews = [], changes = [];
  const controller = createDesignerConversation({ ask, snapshot: () => ({ scene, revision: 12 }),
    onProposal: p => reviews.push(p), onChange: state => changes.push(state) });
  return { controller, reviews, changes };
}

test('empty input and overlapping submissions do not start requests', async () => {
  const pending = deferred(); let calls = 0;
  const { controller } = setup(async () => { calls++; return pending.promise; });
  await controller.send('  '); assert.equal(calls, 0);
  const first = controller.send('Move the table');
  await controller.send('Duplicate'); assert.equal(calls, 1);
  pending.resolve({ type: 'decline', conversationId: 'c1', message: 'No room.' }); await first;
});
test('streams progress and sends a captured scene, revision and existing keep ids', async () => {
  const pending = deferred(); let request, options;
  const { controller } = setup((req, opts) => { request = req; options = opts; return pending.promise; });
  controller.setKeep('coffee-table', true); controller.setKeep('missing', true);
  const running = controller.send('  Fit a desk  ');
  assert.equal(request.request, 'Fit a desk'); assert.equal(request.revision, 12);
  assert.notEqual(request.scene, scene); assert.deepEqual(request.keep, ['coffee-table']);
  options.onProgress('Checking paths'); assert.equal(controller.state.progress, 'Checking paths');
  assert.equal(controller.state.busy, true);
  pending.resolve({ type: 'decline', conversationId: 'c1', message: 'Not enough space.' }); await running;
  assert.equal(controller.state.busy, false); assert.equal(controller.state.progress, '');
  assert.equal(controller.state.messages.at(-1).text, 'Not enough space.');
});
test('question option is the next message in the same conversation', async () => {
  const requests = [];
  const { controller } = setup(async req => {
    requests.push(req);
    return requests.length === 1 ? { type: 'question', conversationId: 'c1', question: 'What matters?', options: ['Open floor', 'Seating'] }
      : { type: 'decline', conversationId: 'c1', message: 'No change needed.' };
  });
  await controller.send('Make it cozy'); assert.deepEqual(controller.state.options, ['Open floor', 'Seating']);
  await controller.send('Open floor'); assert.equal(requests[1].conversationId, 'c1');
  assert.equal(requests[1].request, 'Open floor'); assert.deepEqual(controller.state.options, []);
  assert.deepEqual(controller.state.messages.map(m => m.role), ['user', 'designer', 'user', 'designer']);
});
test('proposal is sent to review once without changing the scene', async () => {
  const before = structuredClone(scene);
  const { controller, reviews } = setup(async () => ({ type: 'proposal', conversationId: 'c2', proposal }));
  await controller.send('Move the table');
  assert.deepEqual(reviews, [proposal]); assert.deepEqual(scene, before);
  assert.match(controller.state.messages.at(-1).text, /Move the table/);
});
test('cancel aborts the signal immediately and ignores late progress and proposals', async () => {
  const pending = deferred(); let opts;
  const { controller, reviews } = setup((req, options) => { opts = options; return pending.promise; });
  const running = controller.send('Move the table'); controller.cancel();
  assert.equal(opts.signal.aborted, true); assert.equal(controller.state.busy, false);
  opts.onProgress('Late progress'); assert.equal(controller.state.progress, '');
  pending.resolve({ type: 'proposal', conversationId: 'late', proposal }); await running;
  assert.equal(reviews.length, 0); assert.equal(controller.state.conversationId, undefined);
  assert.match(controller.state.messages.at(-1).text, /cancelled/i);
});
test('a cancelled request cannot clear the busy state of a newer request', async () => {
  const old = deferred(), next = deferred(); let calls = 0;
  const { controller } = setup(() => ++calls === 1 ? old.promise : next.promise);
  const first = controller.send('First'); controller.cancel(); const second = controller.send('Second');
  old.resolve({ type: 'decline', conversationId: 'old', message: 'Old' }); await first;
  assert.equal(controller.state.busy, true);
  next.resolve({ type: 'decline', conversationId: 'next', message: 'New' }); await second;
  assert.equal(controller.state.conversationId, 'next'); assert.equal(controller.state.busy, false);
});
test('service errors and network errors are visible and allow retry', async () => {
  let calls = 0;
  const { controller } = setup(async () => {
    if (++calls === 1) return { type: 'error', message: 'Service unavailable' };
    throw new Error('Connection lost');
  });
  await controller.send('First'); assert.equal(controller.state.messages.at(-1).text, 'Service unavailable');
  await controller.send('Retry'); assert.equal(controller.state.messages.at(-1).text, 'Connection lost');
  assert.equal(controller.state.busy, false);
});
test('disposing aborts without publishing a late reply', async () => {
  const pending = deferred(); let signal;
  const { controller, reviews, changes } = setup((req, opts) => { signal = opts.signal; return pending.promise; });
  const run = controller.send('Move'); controller.dispose(); const count = changes.length;
  pending.resolve({ type: 'proposal', conversationId: 'late', proposal }); await run;
  assert.equal(signal.aborted, true); assert.equal(changes.length, count); assert.equal(reviews.length, 0);
});
test('recorded demo has proposal, question, decline and respects keeps', async () => {
  const ask = createRecordedDesigner(0);
  const req = { scene, revision: 12, request: 'Move the table' };
  const reply = await ask(req); assert.equal(reply.type, 'proposal'); assert.equal(reply.proposal.command.baseRevision, 12);
  assert.equal((await ask({ ...req, request: 'Make it cozier' })).type, 'question');
  assert.equal((await ask({ ...req, request: 'Pick paint colours' })).type, 'decline');
  assert.equal((await ask({ ...req, keep: ['coffee-table'] })).type, 'decline');
});

test('proposal numbers come from service score, including zero cost and blocked walkways', async () => {
  const metrics = { before: { space: { free_area_m2: 12.345 } },
    after: { space: { free_area_m2: 14.5, rooms: [
      { walkways: [{ width_m: 0.9, reachable: true }] },
      { walkways: [{ width_m: 0, reachable: false }] },
    ] } }, cost_dram: 0 };
  const { controller } = setup(async () => ({ type: 'proposal', conversationId: 'c1', proposal, metrics }));
  await controller.send('Open up the room');
  assert.deepEqual(controller.state.messages.at(-1).metrics, [
    { label: 'Open floor · before → after', value: '12.35 → 14.50 m²' },
    { label: 'Narrowest walkway · proposed', value: '0.00 m (blocked)' },
    { label: 'Cost · furniture purchases', value: '0 ֏' },
  ]);
});
test('missing or malformed proposal numbers remain unknown instead of becoming zero', async () => {
  const { controller } = setup(async () => ({ type: 'proposal', conversationId: 'c1', proposal,
    metrics: { before: { space: { free_area_m2: '12' } }, after: { space: { free_area_m2: -1,
      rooms: [{ walkways: [{ width_m: 0.9 }, { width_m: null }] }] } }, cost_dram: null } }));
  await controller.send('Move');
  assert.deepEqual(controller.state.messages.at(-1).metrics.map(row => row.value), ['Unknown → Unknown', 'Unknown', 'Unknown']);
});
test('valid score reports minimum across rooms and whole dram purchases', async () => {
  const { controller } = setup(async () => ({ type: 'proposal', conversationId: 'c1', proposal,
    metrics: { before: { space: { free_area_m2: 0 } }, after: { space: { free_area_m2: 2,
      rooms: [{ walkways: [{ width_m: 1.1 }] }, { walkways: [{ width_m: 0.75 }] }] } }, cost_dram: 125000 } }));
  await controller.send('Move');
  assert.deepEqual(controller.state.messages.at(-1).metrics.map(row => row.value), ['0.00 → 2.00 m²', '0.75 m', '125,000 ֏']);
});
test('no door routes or missing metrics are not reported as measured clearance', async () => {
  const { controller } = setup(async () => ({ type: 'proposal', conversationId: 'c1', proposal,
    metrics: { after: { space: { rooms: [{ walkways: [] }] } } } }));
  await controller.send('Move');
  assert.equal(controller.state.messages.at(-1).metrics[1].value, 'Unknown');
});
function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
test('north is unknown by default, validates degrees, persists per scene and is sent with Suggest', async () => {
  const storage = memoryStorage(), requests = []; let current = scene;
  const options = { storage, snapshot: () => ({ scene: current, revision: 12 }), onProposal() {},
    ask: async req => { requests.push(req); return { type: 'question', conversationId: 'north-chat', question: 'Which room?', options: ['Living', 'Bedroom'] }; } };
  const controller = createDesignerConversation(options);
  assert.equal(controller.state.northDeg, undefined);
  for (const invalid of ['-1', '360', 'NaN', 'Infinity', 'north']) assert.equal(controller.setNorth(invalid), false);
  assert.equal(controller.setNorth('359.5'), true);
  assert.equal(createDesignerConversation(options).state.northDeg, 359.5);
  await controller.suggest();
  assert.equal(requests[0].request, 'Suggest one improvement for this room');
  assert.equal(requests[0].northDeg, 359.5);
  assert.equal(controller.state.messages[0].text, requests[0].request);
  controller.setNorth('0'); await controller.send('Living');
  assert.equal(requests[1].northDeg, 0); assert.equal(requests[1].conversationId, 'north-chat');
  current = { ...scene, id: 'different-flat' }; controller.refreshSettings();
  assert.equal(controller.state.northDeg, undefined);
  current = scene; controller.refreshSettings(); assert.equal(controller.state.northDeg, 0);
  controller.setNorth(''); await controller.send('Living');
  assert.equal('northDeg' in requests[2], false);
  assert.equal(createDesignerConversation(options).state.northDeg, undefined);
});
test('unavailable browser storage preserves north for this session without claiming it was saved', () => {
  const controller = createDesignerConversation({ snapshot: () => ({ scene, revision: 0 }), onProposal() {},
    ask: async () => ({ type: 'error', message: 'unused' }),
    storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); }, removeItem() { throw Error('blocked'); } } });
  assert.equal(controller.setNorth('90'), true); assert.equal(controller.state.northDeg, 90);
  assert.equal(controller.state.northPersisted, false);
});
test('elapsed seconds use elapsed time, reset on retry, and stop after cancellation and disposal', async () => {
  let now = 1000; const first = deferred(), second = deferred(); let calls = 0;
  const controller = createDesignerConversation({ snapshot: () => ({ scene, revision: 0 }), onProposal() {}, now: () => now,
    ask: () => ++calls === 1 ? first.promise : second.promise });
  const run = controller.suggest();
  now = 4200; controller.tick(); assert.equal(controller.state.elapsedSeconds, 3);
  controller.cancel(); now = 9000; controller.tick(); assert.equal(controller.state.elapsedSeconds, 3);
  const retry = controller.suggest(); assert.equal(controller.state.elapsedSeconds, 0);
  now = 12000; controller.tick(); assert.equal(controller.state.elapsedSeconds, 3);
  first.resolve({ type: 'decline', conversationId: 'old', message: 'late' }); await run;
  assert.equal(controller.state.busy, true); assert.equal(controller.state.elapsedSeconds, 3);
  second.resolve({ type: 'decline', conversationId: 'new', message: 'done' }); await retry;
  now = 19000; controller.tick(); assert.equal(controller.state.elapsedSeconds, 3);
  controller.dispose(); controller.tick(); assert.equal(controller.state.elapsedSeconds, 3);
});
