import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-chat-history-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: {
  ssr: join(root, 'src/ui/designer-panel.ts'), target: 'node22', outDir: output,
  minify: false, rolldownOptions: { output: { entryFileNames: 'panel.mjs' } },
} });
const { createDesignerConversation, previewDesignerProposal } = await import(pathToFileURL(join(output, 'panel.mjs')));
const scene = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', color: '#ffffff', polygon: [[0,0],[6,0],[6,6],[0,6]] }], walls: [],
  objects: [{ id: 'table', name: 'Table', assetId: 'table', position: [2,0,2], rotation: 0, scale: [1,1,1] }] };
const catalog = [{ id: 'table', name: 'Table', category: 'table', kind: 'table', dimensions: [1,1,1], color: '#ffffff', price: 0, source: { type: 'procedural' } }];
const proposal = { id: 'p1', title: 'More room', description: 'Move the table.', command: {
  id: 'p1', label: 'Move table', source: 'designer', baseRevision: 12,
  operations: [{ type: 'update', id: 'table', patch: { position: [3,0,2] } }] } };
function memoryStorage() { const data = new Map(); return {
  getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), data,
}; }
function setup(extra = {}) { return { history: true, snapshot: () => ({ scene, revision: 12 }), onProposal() {},
  ask: async () => ({ type: 'question', conversationId: 'thread-1', question: 'Which room?', options: ['Living', 'Bedroom'] }), ...extra }; }

test('reload restores messages, choices and service conversationId; new conversation retains selectable history', async () => {
  const storage = memoryStorage(), requests = [];
  const opts = setup({ storage, ask: async req => { requests.push(req); return { type: 'question', conversationId: req.conversationId ?? `thread-${requests.length}`, question: 'Which room?', options: ['Living', 'Bedroom'] }; } });
  let chat = createDesignerConversation(opts); await chat.send('Make it cozier');
  const first = chat.state.activeHistoryId; chat.dispose();
  chat = createDesignerConversation(opts);
  assert.equal(chat.state.messages[0].text, 'Make it cozier'); assert.deepEqual(chat.state.options, ['Living', 'Bedroom']);
  await chat.send('Living'); assert.equal(requests[1].conversationId, 'thread-1');
  chat.newConversation(); assert.equal(chat.state.messages.length, 0); assert.equal(chat.state.conversationId, undefined);
  await chat.send('Paint the bedroom'); assert.equal(requests[2].conversationId, undefined);
  assert.equal(chat.state.conversations.length, 2);
  chat.selectConversation(first); assert.equal(chat.state.conversationId, 'thread-1');
  assert.equal(chat.state.messages[2].text, 'Living');
  assert.equal(createDesignerConversation(opts).state.activeHistoryId, first);
});
test('scene changes abort work, isolate history and ignore late replies', async () => {
  let current = scene, resolve, signal;
  const opts = setup({ storage: memoryStorage(), snapshot: () => ({ scene: current, revision: 12 }),
    ask: (req, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); } });
  const chat = createDesignerConversation(opts), run = chat.send('First room');
  current = { ...scene, id: 'second' }; chat.refreshSettings();
  assert.equal(signal.aborted, true); assert.equal(chat.state.busy, false); assert.equal(chat.state.messages.length, 0);
  resolve({ type: 'decline', conversationId: 'wrong-scene', message: 'Late reply' }); await run;
  assert.equal(chat.state.messages.length, 0);
  current = scene; chat.refreshSettings(); assert.equal(chat.state.messages[0].text, 'First room');
  assert.equal(chat.state.messages.some(m => m.text === 'Late reply'), false);
});
test('stored pending proposals become stale even when a reloaded store has the same revision', async () => {
  const opts = setup({ storage: memoryStorage(), ask: async () => ({ type: 'proposal', conversationId: 'c', proposal }) });
  const chat = createDesignerConversation(opts); await chat.send('Move');
  assert.equal(chat.state.messages.at(-1).proposal.id, 'p1'); assert.equal(chat.state.messages.at(-1).status, 'pending');
  const restored = createDesignerConversation(opts);
  assert.equal(restored.state.messages.at(-1).status, 'stale');
  assert.equal(restored.act('p1', 'apply'), false);
});
test('preview, apply and dismiss are explicit actions; terminal state persists and cannot apply twice', async () => {
  const calls = [], storage = memoryStorage();
  const opts = setup({ storage, ask: async () => ({ type: 'proposal', conversationId: 'c', proposal }),
    onProposalAction: (p, action) => { calls.push(action); return { ok: true }; } });
  const chat = createDesignerConversation(opts); await chat.send('Move');
  assert.deepEqual(calls, []); assert.equal(chat.act('p1', 'preview'), true);
  assert.equal(chat.state.messages.at(-1).status, 'pending');
  assert.equal(chat.act('p1', 'apply'), true); assert.equal(chat.state.messages.at(-1).status, 'applied');
  assert.equal(chat.act('p1', 'apply'), false); assert.deepEqual(calls, ['preview', 'apply']);
  assert.equal(createDesignerConversation(opts).state.messages.at(-1).status, 'applied');
  chat.newConversation(); await chat.send('Another'); chat.act('p1', 'dismiss');
  assert.equal(createDesignerConversation(opts).state.messages.at(-1).status, 'dismissed');
});
test('failed approval stays pending and reports the editor error; revision changes mark it stale', async () => {
  let revision = 12;
  const chat = createDesignerConversation(setup({ snapshot: () => ({ scene, revision }),
    ask: async () => ({ type: 'proposal', conversationId: 'c', proposal }),
    onProposalAction: () => ({ ok: false, message: 'Finish your current edit.' }) }));
  await chat.send('Move'); assert.equal(chat.act('p1', 'apply'), false);
  assert.equal(chat.state.messages.find(m => m.proposal).status, 'pending');
  assert.match(chat.state.messages.at(-1).text, /Finish your current edit/);
  revision++; chat.refreshSettings();
  assert.equal(chat.state.messages.find(m => m.proposal).status, 'stale');
  assert.equal(chat.act('p1', 'preview'), false);
});
test('storage failures and malformed history do not break requests or scene-local session history', async () => {
  for (const storage of [ { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } },
    { getItem: () => '{invalid json', setItem() { throw Error('full'); } },
    { getItem: () => '{"version":1,"conversations":[null]}', setItem() { throw Error('full'); } } ]) {
    const chat = createDesignerConversation(setup({ storage })); await chat.send('Hello');
    assert.equal(chat.state.messages.length, 2); assert.equal(chat.state.historyPersisted, false);
    const first = chat.state.activeHistoryId; chat.newConversation(); chat.selectConversation(first);
    assert.equal(chat.state.conversationId, 'thread-1');
  }
});
test('legacy mock mode does not load or save conversation history', async () => {
  const storage = memoryStorage(), chat = createDesignerConversation(setup({ history: false, storage }));
  await chat.send('Hello'); assert.equal([...storage.data.keys()].some(key => key.includes('history')), false);
  assert.equal(createDesignerConversation(setup({ history: false, storage })).state.messages.length, 0);
});
test('preview applies through a scratch command store, checks staleness and leaves the original untouched', () => {
  const before = structuredClone(scene);
  const candidate = previewDesignerProposal(scene, 12, proposal, catalog);
  assert.deepEqual(candidate.objects[0].position, [3,0,2]); assert.deepEqual(scene, before);
  assert.throws(() => previewDesignerProposal(scene, 13, proposal, catalog), /stale/i);
  const invalid = structuredClone(proposal); invalid.command.operations[0].patch.position = [99,0,2];
  assert.throws(() => previewDesignerProposal(scene, 12, invalid, catalog));
});

test('a new conversation confirms storage availability before reporting its persistence status', () => {
  const chat = createDesignerConversation(setup({ storage: memoryStorage() }));
  assert.equal(chat.state.historyPersisted, true);
});
test('successfully stored long history remains readable on reload', () => {
  const storage = memoryStorage();
  const conversations = Array.from({ length: 1001 }, (_, i) => ({ id: `chat-${i}`, title: `Conversation ${i}`, messages: [], options: [] }));
  storage.setItem('varpet.designer.history:flat', JSON.stringify({ version: 1, activeId: 'chat-1000', conversations }));
  const chat = createDesignerConversation(setup({ storage }));
  assert.equal(chat.state.conversations.length, 1001); assert.equal(chat.state.activeHistoryId, 'chat-1000');
});
