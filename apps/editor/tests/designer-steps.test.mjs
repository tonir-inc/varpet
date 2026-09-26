import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-designer-steps-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'steps-test-entry', resolveId(id) { if (id.endsWith('steps-test-entry')) return '\0steps-test-entry'; },
  load(id) { if (id === '\0steps-test-entry') return `export * from '${root}/src/ui/designer-steps.ts'; export * from '${root}/src/ui/designer-panel.ts';`; },
}], build: { ssr: 'steps-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'steps.mjs' } } } });
const { applyDesignerEvent, finishDesignerSteps, designerStepsSummary, designerPieceName, designerClock, validDesignerTurnSteps,
  createDesignerConversation, designerContextRequest, proposalProducts } = await import(pathToFileURL(join(output, 'steps.mjs')));

const scene = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y', rooms: [], walls: [],
  objects: [{ id: 'sofa', name: 'Cream sofa', assetId: 'sofa', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] }] };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const memoryStorage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; };

test('the recorded event stream becomes plain-English steps', async () => {
  const sample = await readFile(new URL('../../../packages/designer/eval/event-stream-sample.ndjson', import.meta.url), 'utf8');
  const events = sample.trim().split('\n').map(JSON.parse).filter(record => record.type === 'tool' || record.type === 'build');
  let steps = [];
  events.forEach((event, index) => { steps = applyDesignerEvent(steps, event, index); });
  assert.deepEqual(steps.map(step => [step.label, step.status]), [
    ['Understanding your request', 'done'],
    ['Searching Yerevan shops · 2 results', 'done'],
    ['Comparing options · 2 options', 'done'],
    ['Understanding your request', 'done'],
    ['Preparing the proposal', 'done'],
    ['Reserving space to build the cabinet', 'done'],
    ['Built the cabinet', 'done'],
    ['Placing the furniture', 'done'],
    ['Checking walkways and doors', 'done'],
    ['Pricing the pieces · 588,000 ֏ (unverified prices)', 'done'],
  ]);
  const build = steps.find(step => step.timed);
  assert.equal(build.at, 10); assert.equal(build.end, 14);
});

test('tool calls without ids close the latest open call; errors and failed checks stay visible', () => {
  let steps = applyDesignerEvent([], { type: 'tool', name: 'check_layout', phase: 'start', summary: 'Checking' }, 1);
  assert.equal(steps[0].status, 'running');
  steps = applyDesignerEvent(steps, { type: 'tool', name: 'check_layout', phase: 'end', summary: 'Checked', refs: { ok: false } }, 2);
  assert.deepEqual(steps.map(step => [step.label, step.status]), [['Checking walkways and doors · found a problem', 'done']]);
  steps = applyDesignerEvent(steps, { type: 'tool', name: 'search_catalog', phase: 'start', callId: 'a', summary: 'Finding' }, 3);
  steps = applyDesignerEvent(steps, { type: 'tool', name: 'search_catalog', phase: 'error', callId: 'a', summary: 'Finding' }, 4);
  assert.equal(steps.at(-1).status, 'failed');
  steps = applyDesignerEvent(steps, { type: 'build', slotId: 'custom-oaksideboard-2', state: 'failed', reason: 'Too deep for the wall' }, 5);
  assert.equal(steps.at(-1).label, 'Could not build the sideboard: Too deep for the wall');
  assert.equal(steps.at(-1).status, 'failed');
});

test('piece names come only from known nouns in the slot id, and clocks read m:ss', () => {
  assert.equal(designerPieceName('custom-livecabinet-1'), 'the cabinet');
  assert.equal(designerPieceName('custom-bookshelf-3'), 'the bookshelf');
  assert.equal(designerPieceName('custom-xyz-1'), 'a custom piece');
  assert.equal(designerPieceName(undefined), 'a custom piece');
  assert.equal(designerClock(65), '1:05'); assert.equal(designerClock(0), '0:00'); assert.equal(designerClock(-3), '0:00');
});

test('an unfinished build is not reported as done, and the summary counts it', () => {
  let steps = applyDesignerEvent([], { type: 'tool', name: 'set_intent', phase: 'end', summary: 'Understanding' }, 0);
  steps = applyDesignerEvent(steps, { type: 'build', slotId: 'custom-desk-1', state: 'building' }, 3);
  const finished = finishDesignerSteps(steps, 102);
  assert.deepEqual(finished.map(step => step.status), ['done', 'unfinished']);
  assert.equal(designerStepsSummary({ steps: finished, seconds: 102 }), '2 steps · 1 unfinished · 1:42');
  assert.equal(validDesignerTurnSteps({ steps: finished, seconds: 102 }), true);
  for (const invalid of [null, [], { steps: [], seconds: 1 }, { steps: finished, seconds: -1 }, { steps: [{ ...finished[0], status: 'maybe' }], seconds: 1 }])
    assert.equal(validDesignerTurnSteps(invalid), false);
});

test('a turn shows live steps, then moves them onto its reply; damaged stored steps are dropped', async () => {
  let clock = 1000, opts; const pending = deferred(), storage = memoryStorage();
  const chat = createDesignerConversation({ history: true, storage, now: () => clock, snapshot: () => ({ scene, revision: 0 }), onProposal() {},
    ask: (_req, options) => { opts = options; return pending.promise; } });
  const running = chat.send('Find a desk');
  opts.onEvent({ type: 'tool', name: 'search_catalog', phase: 'start', callId: 'c1', summary: 'Finding' });
  clock = 4000; opts.onEvent({ type: 'tool', name: 'search_catalog', phase: 'end', callId: 'c1', summary: 'Finding', refs: { results: ['a', 'b', 'c'] } });
  assert.deepEqual(chat.state.steps.map(step => step.label), ['Searching Yerevan shops · 3 results']);
  assert.match(chat.state.progress, /Finding/);
  clock = 103000; pending.resolve({ type: 'message', conversationId: 'c', message: 'Three desks fit.' }); await running;
  assert.deepEqual(chat.state.steps, []);
  const reply = chat.state.messages.at(-1);
  assert.equal(reply.steps.seconds, 102); assert.equal(designerStepsSummary(reply.steps), '1 step · 1:42');
  assert.equal(createDesignerConversation({ history: true, storage, snapshot: () => ({ scene, revision: 0 }), onProposal() {}, ask: pending.promise })
    .state.messages.at(-1).steps.steps.length, 1);
  const saved = JSON.parse(storage.getItem('varpet.designer.history:flat'));
  saved.conversations[0].messages.at(-1).steps = { steps: 'broken', seconds: 1 };
  storage.setItem('varpet.designer.history:flat', JSON.stringify(saved));
  const restored = createDesignerConversation({ history: true, storage, snapshot: () => ({ scene, revision: 0 }), onProposal() {}, ask: pending.promise });
  assert.equal(restored.state.messages.length, 2); assert.equal(restored.state.messages.at(-1).steps, undefined);
});

test('a queued message waits for the turn, can be removed, and Stop hands it back instead of sending it', async () => {
  const requests = [], waits = [];
  const chat = createDesignerConversation({ snapshot: () => ({ scene, revision: 0 }), onProposal() {},
    ask: req => { requests.push(req.request); const wait = deferred(); waits.push(wait); return wait.promise; } });
  const first = chat.send('First');
  await chat.queue('Second'); await chat.queue('And a lamp');
  assert.equal(chat.state.queued, 'Second\n\nAnd a lamp'); assert.deepEqual(requests, ['First']);
  waits[0].resolve({ type: 'message', conversationId: 'c', message: 'Done.' }); await first;
  assert.deepEqual(requests, ['First', 'Second\n\nAnd a lamp']); assert.equal(chat.state.queued, ''); assert.equal(chat.state.busy, true);
  await chat.queue('Third'); chat.unqueue(); assert.equal(chat.state.queued, '');
  await chat.queue('Fourth');
  assert.equal(chat.cancel(), 'Fourth'); assert.equal(chat.state.queued, '');
  waits[1].resolve({ type: 'message', conversationId: 'c', message: 'Late.' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, ['First', 'Second\n\nAnd a lamp']);
  assert.equal(chat.cancel(), '');
});

test('switching conversation drops the queue instead of sending it into another thread', async () => {
  const requests = [], wait = deferred();
  const chat = createDesignerConversation({ history: true, storage: memoryStorage(), snapshot: () => ({ scene, revision: 0 }), onProposal() {},
    ask: req => { requests.push(req.request); return wait.promise; } });
  const run = chat.send('First'); await chat.queue('For the first thread');
  chat.newConversation(); assert.equal(chat.state.queued, '');
  wait.resolve({ type: 'message', conversationId: 'c', message: 'Late.' }); await run;
  assert.deepEqual(requests, ['First']);
});

test('context prefixes only what the buyer typed, and proposal chips price only known pieces', () => {
  assert.equal(designerContextRequest('  make it smaller ', { id: 'sofa', label: 'Cream sofa' }), 'About the cream sofa: make it smaller');
  assert.equal(designerContextRequest('Hi', { id: 'tv', label: 'TV unit' }), 'About the TV unit: Hi');
  assert.equal(designerContextRequest('Hi', null), 'Hi'); assert.equal(designerContextRequest('   ', { id: 'sofa', label: 'Sofa' }), '');
  const proposal = { id: 'p', title: 'T', description: 'D', command: { id: 'p', label: 'L', source: 'designer', baseRevision: 0, operations: [
    { type: 'add', object: { id: 'o1', name: 'Round oak coffee table', assetId: 'table', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] } },
    { type: 'update', id: 'sofa', patch: { position: [1, 0, 1] } },
    { type: 'add', object: { id: 'o2', name: '', assetId: 'custom-sideboard-1', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] } },
    { type: 'add', object: { id: 'o3', name: 'Lamp', assetId: 'unknown', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] } },
  ] } };
  const asset = (id, name, price) => ({ id, name, category: 'x', kind: 'table', dimensions: [1, 1, 1], color: '#fff', price, source: { type: 'procedural' } });
  assert.deepEqual(proposalProducts(proposal, [asset('table', 'Table', 96000)], [asset('custom-sideboard-1', 'Fluted oak sideboard', 310000)]), [
    { id: 'o1', name: 'Round oak coffee table', price: 96000 },
    { id: 'o2', name: 'Fluted oak sideboard', price: 310000, estimate: true },
    { id: 'o3', name: 'Lamp' },
  ]);
});
