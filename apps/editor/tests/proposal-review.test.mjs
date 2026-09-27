import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-proposal-review-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error',
  plugins: [{ name: 'review-entry', resolveId(id) { if (id.endsWith('review-entry')) return '\0review-entry'; },
    load(id) { if (id === '\0review-entry') return `export * from '${root}/src/ui/proposal-review.ts'; export * from '${root}/src/ui/designer-panel.ts';`; } }],
  build: { ssr: 'review-entry', target: 'node22', outDir: output, minify: false, rolldownOptions: { output: { entryFileNames: 'review.mjs' } } } });
const { proposalArrival, describeEntity, entityBlock, createDesignerConversation } = await import(pathToFileURL(join(output, 'review.mjs')));

const object = (id, name, assetId, position) => ({ id, name, assetId, position, rotation: 0, scale: [1, 1, 1] });
const before = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'living', name: 'Living room', color: '#fff', polygon: [[0, 0], [5, 0], [5, 5], [0, 5]] },
    { id: 'bed', name: 'Bedroom', color: '#fff', polygon: [[5, 0], [9, 0], [9, 5], [5, 5]] }],
  walls: [{ id: 'w4', start: [0, 0], end: [5, 0], height: 2.7, thickness: 0.2, color: '#eee', openings: [{ id: 'win', kind: 'window', offset: 1, width: 1, height: 1.2, sill: 0.9 }] }],
  objects: [object('table', 'Dining table', 'table', [1, 0, 1]), object('chair', 'Armchair', 'chair', [2, 0, 2]), object('bed1', 'Bed', 'bed', [7, 0, 2])] };
const catalog = [{ id: 'kivik', name: 'Kivik', dimensions: [2, 0.8, 0.9] }];

test('a proposal arrives in the room it changes most; new pieces elsewhere follow quietly', () => {
  const proposed = structuredClone(before);
  proposed.objects = [object('table', 'Dining table', 'table', [1.6, 0, 1]), object('bed1', 'Bed', 'bed', [7, 0, 2]),
    object('sofa_3', 'Sofa', 'kivik', [3, 0, 3]), object('lamp', 'Lamp', 'lamp', [8, 0, 1])];
  const arrival = proposalArrival(before, proposed);
  assert.equal(arrival.roomId, 'living');
  assert.deepEqual(arrival.ids, ['sofa_3']);
  assert.deepEqual(arrival.elsewhere, ['lamp']);
  // A later preview of the same turn goes to the room with new pieces and does not bring shown pieces again.
  const next = structuredClone(proposed);
  next.objects.push(object('desk', 'Desk', 'desk', [6, 0, 4]), object('rug', 'Rug', 'rug', [7, 0, 3]));
  const again = proposalArrival(before, next, new Set(arrival.added));
  assert.equal(again.roomId, 'bed');
  assert.deepEqual(again.ids, ['desk', 'rug']);
  assert.deepEqual(again.elsewhere, []);
});

test('attached things name their kind and room, and travel as one id block', () => {
  const proposed = structuredClone(before);
  proposed.objects.push(object('sofa_3', 'Sofa', 'kivik', [3, 0, 3]));
  const sofa = describeEntity(proposed, 'sofa_3', catalog), wall = describeEntity(proposed, 'w4'), window = describeEntity(proposed, 'win');
  assert.deepEqual(sofa, { id: 'sofa_3', kind: 'furniture', label: 'Sofa Kivik', room: 'Living room' });
  assert.deepEqual(wall, { id: 'w4', kind: 'wall', label: 'Wall 1', room: 'Living room' });
  assert.deepEqual(window, { id: 'win', kind: 'opening', label: 'Window', room: 'Living room' });
  assert.deepEqual(describeEntity(proposed, 'living'), { id: 'living', kind: 'room', label: 'Living room' });
  assert.equal(entityBlock([sofa, wall]), '\n\nAttached: sofa_3 (furniture, Sofa Kivik, Living room); w4 (wall, Wall 1, Living room)');
  assert.equal(entityBlock([]), '');
});

test('a message carries its attachments to the designer; the bubble keeps the words and the chips', async () => {
  const requests = [];
  const chat = createDesignerConversation({ ask: async request => { requests.push(request.request); return { type: 'message', conversationId: 'c', message: 'Sure.' }; },
    history: true, snapshot: () => ({ scene: before, revision: 3 }), onProposal: () => {} });
  chat.attachEntity({ id: 'w4', kind: 'wall', label: 'Wall 1', room: 'Living room' });
  chat.attachEntity({ id: 'w4', kind: 'wall', label: 'Wall 1', room: 'Living room' });
  chat.attachEntity({ id: 'table', kind: 'furniture', label: 'Dining table' });
  chat.detachEntity('table');
  assert.equal(chat.state.entities.length, 1);
  await chat.send('Paint it deep green');
  assert.deepEqual(requests, ['Paint it deep green\n\nAttached: w4 (wall, Wall 1, Living room)']);
  const sent = chat.state.messages.find(message => message.role === 'user');
  assert.equal(sent.text, 'Paint it deep green');
  assert.deepEqual(sent.entities, [{ id: 'w4', kind: 'wall', label: 'Wall 1', room: 'Living room' }]);
  assert.deepEqual(chat.state.entities, []);
});

test('with auto-preview a complete proposal is previewed as it lands, quietly when the editor cannot', async () => {
  const proposal = { id: 'p1', title: 'Living', description: 'A warm room.', command: { id: 'p1', label: 'Design', source: 'designer', baseRevision: 3, operations: [] } };
  for (const ok of [true, false]) {
    const actions = [];
    const chat = createDesignerConversation({ ask: async () => ({ type: 'proposal', conversationId: 'c', proposal }), history: true, autoPreview: true,
      snapshot: () => ({ scene: before, revision: 3 }), onProposal: () => {}, onProposalAction: (p, action) => { actions.push(action); return { ok, message: 'Busy.' }; } });
    await chat.send('Furnish it');
    assert.deepEqual(actions, ['preview']);
    assert.equal(chat.state.messages.at(-1).status, 'pending');
    assert.equal(chat.state.messages.some(message => message.text === 'Busy.'), false);
  }
});
