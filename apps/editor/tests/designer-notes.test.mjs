import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-designer-notes-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'notes-test-entry', resolveId(id) { if (id.endsWith('notes-test-entry')) return '\0notes-test-entry'; },
  load(id) { if (id === '\0notes-test-entry') return `export * from '${root}/src/adapters/designer-http.ts'; export * from '${root}/src/ui/designer-panel.ts'; export * from '${root}/src/core/demo.ts';`; },
}], build: { ssr: 'notes-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'notes.mjs' } } } });
const { createDesignerHttpAdapter, askDesigner, createDesignerConversation, demoScene, localCatalog } = await import(pathToFileURL(join(output, 'notes.mjs')));
const proposal = { id: 'notes-proposal', title: 'A softer chair colour', description: 'Paint the lounge chair sage.', command: {
  id: 'notes-command', label: 'Paint the lounge chair', source: 'designer', baseRevision: 0,
  operations: [{ type: 'update', id: 'lounge-chair', patch: { color: '#81947a' } }],
} };
const notes = 'Paint and labour are not priced.\n<script>alert("plain text")</script>';
const reply = extra => ({ type: 'proposal', conversationId: 'notes-thread', proposal, ...extra });
const response = value => new Response(`${JSON.stringify(value)}\n`, { headers: { 'Content-Type': 'application/x-ndjson' } });
function adapter(value, onNotes) { return createDesignerHttpAdapter({ catalog: localCatalog, onNotes, fetch: async () => response(value) }); }
function memoryStorage() { const data = new Map(); return {
  getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key),
}; }
function conversation(extra = {}) { return { history: true, snapshot: () => ({ scene: demoScene, revision: 0 }),
  onProposal() {}, ask: async () => reply({ notes }), ...extra }; }

test('optional notes travel outside the unchanged AgentProposal and never apply the scene', async () => {
  const seen = [], before = structuredClone(demoScene);
  assert.deepEqual(await adapter(reply({ notes }), value => seen.push(value)).propose(demoScene, 0), proposal);
  assert.deepEqual(seen, [notes]); assert.deepEqual(demoScene, before);
  assert.equal(Object.hasOwn(proposal, 'notes'), false);
});

test('legacy proposals without notes remain valid and do not emit a notes callback', async () => {
  const seen = [];
  assert.deepEqual(await adapter(reply({}), value => seen.push(value)).propose(demoScene, 0), proposal);
  assert.deepEqual(seen, []);
});

test('notes accept the 1600-character boundary and reject malformed, blank or oversized values', async () => {
  const seen = [];
  await adapter(reply({ notes: 'a'.repeat(1600) }), value => seen.push(value)).propose(demoScene, 0);
  assert.equal(seen[0].length, 1600);
  for (const invalid of [null, 42, {}, [], '', '   ', 'a'.repeat(1601)]) {
    let called = false;
    await assert.rejects(adapter(reply({ notes: invalid }), () => { called = true; }).propose(demoScene, 0), /notes/i);
    assert.equal(called, false);
  }
});

test('notes cannot escape proposal validation or appear on another terminal response', async () => {
  let called = false;
  const invalid = structuredClone(proposal); invalid.command.baseRevision = 9;
  await assert.rejects(adapter(reply({ notes, proposal: invalid }), () => { called = true; }).propose(demoScene, 0), /stale/i);
  await assert.rejects(adapter({ type: 'decline', conversationId: 'c', message: 'No change', notes }).propose(demoScene, 0), /unsupported/i);
  assert.equal(called, false);
});

test('askDesigner returns envelope notes without changing the proposal', async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async () => response(reply({ notes }));
  assert.deepEqual(await askDesigner({ scene: demoScene, revision: 0, request: 'Paint the chair', catalog: localCatalog }), reply({ notes }));
  globalThis.fetch = async () => response(reply({}));
  assert.deepEqual(await askDesigner({ scene: demoScene, revision: 0, request: 'Paint the chair', catalog: localCatalog }), reply({}));
});

test('proposal notes persist as plain text and do not change preview, apply or stale-history rules', async () => {
  const storage = memoryStorage(), actions = [], reviewed = [];
  const opts = conversation({ storage, onProposal: value => reviewed.push(value), onProposalAction: (_proposal, action) => { actions.push(action); return { ok: true }; } });
  const chat = createDesignerConversation(opts); await chat.send('Paint the chair');
  const message = chat.state.messages.at(-1);
  assert.equal(message.notes, notes); assert.equal(message.text, proposal.description); assert.deepEqual(message.proposal, proposal);
  assert.deepEqual(actions, []); assert.deepEqual(reviewed, [proposal]);
  const restored = createDesignerConversation(opts);
  assert.equal(restored.state.messages.at(-1).notes, notes); assert.equal(restored.state.messages.at(-1).status, 'stale');
  assert.equal(restored.act(proposal.id, 'apply'), false);
  assert.equal(chat.act(proposal.id, 'preview'), true); assert.equal(chat.act(proposal.id, 'apply'), true);
  assert.deepEqual(actions, ['preview', 'apply']);
  assert.equal(createDesignerConversation(opts).state.messages.at(-1).notes, notes);
});

test('invalid restored notes cannot enter conversation state', () => {
  for (const invalid of [null, false, {}, '', ' ', 'x'.repeat(1601)]) {
    const storage = memoryStorage();
    storage.setItem(`varpet.designer.history:${demoScene.id}`, JSON.stringify({ version: 1, activeId: 'saved', conversations: [{
      id: 'saved', title: 'Saved chat', options: [], messages: [{ role: 'designer', text: 'A proposal', proposal, notes: invalid }],
    }] }));
    assert.deepEqual(createDesignerConversation(conversation({ storage })).state.messages, []);
  }
});

test('old saved messages without notes remain readable', () => {
  const storage = memoryStorage();
  storage.setItem(`varpet.designer.history:${demoScene.id}`, JSON.stringify({ version: 1, activeId: 'saved', conversations: [{
    id: 'saved', title: 'Saved chat', options: [], messages: [{ role: 'designer', text: 'A proposal', proposal }],
  }] }));
  const restored = createDesignerConversation(conversation({ storage }));
  assert.equal(restored.state.messages.length, 1); assert.equal(restored.state.messages[0].notes, undefined);
});

test('non-history panel callers retain notes without changing their review callback', async () => {
  const reviewed = [], chat = createDesignerConversation(conversation({ history: false, onProposal: value => reviewed.push(value) }));
  await chat.send('Paint the chair');
  assert.equal(chat.state.messages.at(-1).notes, notes);
  assert.equal(chat.state.messages.at(-1).proposal, undefined);
  assert.deepEqual(reviewed, [proposal]);
});
