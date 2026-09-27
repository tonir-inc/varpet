import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

// Live chat for the pitch: steps from progress lines, card numbers from the spike check, room previews while the
// designer works, and a fresh thread after the service restarts.
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-designer-pitch-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: {
  ssr: join(root, 'src/ui/designer-panel.ts'), target: 'node22', outDir: output,
  minify: false, rolldownOptions: { output: { entryFileNames: 'panel.mjs' } },
} });
const { createDesignerConversation, progressStep, proposalInScene, proposalMarks } = await import(pathToFileURL(join(output, 'panel.mjs')));
const scene = { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y', rooms: [], walls: [], objects: [] };
const proposal = (id = 'p1') => ({ id, title: 'Living room', description: 'A warm living room.',
  command: { id, label: 'Design', source: 'designer', baseRevision: 3, operations: [] } });
const setup = (ask, extra = {}) => {
  const actions = [];
  const controller = createDesignerConversation({ ask, history: true, snapshot: () => ({ scene, revision: 3 }), onProposal: () => {},
    onProposalAction: (p, action) => { actions.push([p.id, action]); return { ok: true }; }, ...extra });
  return { controller, actions };
};

test('progress lines become steps: a new line closes the previous one, a repeat is ignored', () => {
  let steps = progressStep([], 'Planning the flat', 1);
  steps = progressStep(steps, 'Planning the flat', 2);
  steps = progressStep(steps, 'Designing the living room', 5);
  assert.deepEqual(steps.map(step => [step.label, step.status, step.end]), [['Planning the flat', 'done', 5], ['Designing the living room', 'running', undefined]]);
});

test('the card shows free floor, the narrowest walkway per designed room and the budget used', async () => {
  const metrics = { cost_dram: 1_200_000, budget_dram: 3_000_000, space: { free_before_m2: 95.3, free_after_m2: 80.1, rooms: [
    { id: 'living', name: 'Living room', designed: true, free_before_m2: 38.6, free_after_m2: 30.2, narrowest_m: 0.82, blocked: 0 },
    { id: 'lounge', name: 'Reading room', designed: true, free_before_m2: 10.6, free_after_m2: 8.4, narrowest_m: 0.95, blocked: 0 },
    { id: 'hall', name: 'Hall', designed: false, free_before_m2: 7.2, free_after_m2: 7.2, narrowest_m: 0.76, blocked: 0 }] } };
  const { controller } = setup(async () => ({ type: 'proposal', conversationId: 'c1', proposal: proposal(), metrics }));
  await controller.send('Furnish it');
  const rows = Object.fromEntries(controller.state.messages.at(-1).metrics.map(row => [row.label, row.value]));
  assert.equal(rows['Open floor · before → after'], '95.3 → 80.1 m²');
  assert.equal(rows['Narrowest walkway'], '0.82 m · Living room');
  assert.equal(rows['Living room'], '30.2 m² open · walkway 0.82 m');
  assert.equal(rows['Reading room'], '8.4 m² open · walkway 0.95 m');
  assert.equal(rows.Hall, undefined);
  assert.equal(rows['Budget used'], '1,200,000 of 3,000,000 ֏ (40%)');
  assert.ok(!Object.values(rows).some(value => /Unknown/.test(value)));
});

test('rooms finished so far can be previewed while the designer works, and the preview follows', async () => {
  let release, options;
  const { controller, actions } = setup(async (_request, opts) => { options = opts; await new Promise(resolve => { release = resolve; });
    return { type: 'proposal', conversationId: 'c1', proposal: proposal('final') }; }, { isPreviewing: () => true });
  const turn = controller.send('Furnish the flat');
  options.onPartial({ proposal: proposal('part-1'), rooms: ['Living room'] });
  assert.deepEqual(controller.state.partial.rooms, ['Living room']);
  assert.equal(controller.previewPartial(), true);
  options.onPartial({ proposal: proposal('part-2'), rooms: ['Living room', 'Kitchen'] });
  release(); await turn;
  assert.deepEqual(actions, [['part-1', 'preview'], ['part-2', 'preview'], ['final', 'preview']]);
  assert.equal(controller.state.partial, undefined);
});

test('a thread the restarted service forgot is started again with the same words', async () => {
  const requests = [];
  const { controller } = setup(async request => { requests.push(request.conversationId);
    return requests.length === 1 ? { type: 'message', conversationId: 'old', message: 'Hello.' }
      : requests.length === 2 ? { type: 'error', message: 'Unknown conversationId; start a new conversation after restarting the service' }
      : { type: 'message', conversationId: 'new', message: 'Fresh.' }; });
  await controller.send('Hi');
  await controller.send('Make it warmer');
  for (let i = 0; i < 20 && requests.length < 3; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(requests, [undefined, 'old', undefined]);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(controller.state.conversationId, 'new');
  assert.equal(controller.state.messages.filter(message => message.text === 'Make it warmer').length, 1);
});

test('an applied card reads Undone after Undo and Applied again after Redo', async () => {
  const added = { id: 'p-lamp', title: 'Lamp', description: 'A lamp.', command: { id: 'p-lamp', label: 'Lamp', source: 'designer', baseRevision: 3,
    operations: [{ type: 'add', object: { id: 'lamp-1', name: 'Lamp', assetId: 'lamp', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] } }] } };
  let objects = [];
  const controller = createDesignerConversation({ history: true, snapshot: () => ({ scene: { ...scene, objects }, revision: 3 }), onProposal: () => {},
    ask: async () => ({ type: 'proposal', conversationId: 'c1', proposal: added }), onProposalAction: () => { objects = [added.command.operations[0].object]; return { ok: true }; } });
  await controller.send('Add a lamp');
  controller.act('p-lamp', 'apply');
  assert.equal(controller.state.messages.at(-1).status, 'applied');
  objects = []; controller.refreshSettings();
  assert.equal(controller.state.messages.at(-1).status, 'undone');
  objects = [added.command.operations[0].object]; controller.refreshSettings();
  assert.equal(controller.state.messages.at(-1).status, 'applied');
  assert.equal(proposalInScene(proposal(), scene), undefined);
});

test('undoing a follow-up that re-hangs earlier pieces reads Undone; the first design stays Applied', async () => {
  const object = (id, assetId) => ({ id, name: id, assetId, position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] });
  const make = (id, objects) => ({ id, title: id, description: id, command: { id, label: id, source: 'designer', baseRevision: 3, operations: objects.map(o => ({ type: 'add', object: o })) } });
  const first = make('first', [object('sofa', 'sofa-a'), object('rug', 'rug-ivory'), object('art', 'art-1')]);
  const follow = make('follow', [object('rug', 'rug-oat'), object('art', 'art-1')]);
  let objects = [], turn = 0;
  const controller = createDesignerConversation({ history: true, snapshot: () => ({ scene: { ...scene, objects }, revision: 3 }), onProposal: () => {},
    ask: async () => ({ type: 'proposal', conversationId: 'c1', proposal: [first, follow][turn++] }),
    onProposalAction: p => { const ids = new Set(p.command.operations.map(op => op.object.id)); objects = [...objects.filter(o => !ids.has(o.id)), ...p.command.operations.map(op => op.object)]; return { ok: true }; } });
  await controller.send('Design'); controller.act('first', 'apply'); const afterFirst = objects;
  await controller.send('Warmer rug'); controller.act('follow', 'apply');
  objects = afterFirst; controller.refreshSettings();
  assert.deepEqual(controller.state.messages.filter(m => m.proposal).map(m => m.status), ['applied', 'undone']);
  objects = []; controller.refreshSettings();
  assert.deepEqual(controller.state.messages.filter(m => m.proposal).map(m => m.status), ['undone', 'undone']);
});

test('undoing a follow-up that only moved and re-hung existing pieces reads Undone', () => {
  const object = (id, x) => ({ id, name: id, assetId: 'a-' + id, position: [x, 0, 0], rotation: 0, scale: [1, 1, 1] });
  const before = { ...scene, objects: [object('sofa', 1), object('art', 2)] };
  const follow = { id: 'f', title: 'f', description: 'f', command: { id: 'f', label: 'f', source: 'designer', baseRevision: 3,
    operations: [{ type: 'delete', id: 'art' }, { type: 'add', object: object('art', 2) }, { type: 'update', id: 'sofa', patch: { position: [3, 0, 0] } }] } };
  const after = { ...scene, objects: [object('sofa', 3), object('art', 2)] };
  const marks = proposalMarks(follow, before, after);
  assert.deepEqual(marks.length, 1);
  assert.equal(proposalInScene(follow, after, marks), 'applied');
  assert.equal(proposalInScene(follow, before, marks), 'undone');
  assert.equal(proposalInScene(follow, before, []), undefined);
});
