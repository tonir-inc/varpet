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
