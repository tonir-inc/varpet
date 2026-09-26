import { expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { emptyProject, projectSnapshot } from '../../../apps/editor/src/core/renovation.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { createDesignerHttpAdapter } from '../../../apps/editor/src/adapters/designer-http.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { createServer } from '../src/server.js';
import { DesignerSession, type ProposalResult } from '../src/session.js';
import { checkLocalLayout } from '../src/local-checks.js';
import { createEditorDemoInput } from '../eval/editor-demo.js';
import { measure } from '../eval/measure.js';

const options = { catalog: localCatalog, groupPolicy: 'move-together' as const };
const chairMove = { type: 'move' as const, id: 'lounge-chair', pos: [-1.25,-1.95] as [number,number] };
test('the actual editor demo is a standing input, with every original asset, object and opening represented', () => {
  const original = structuredClone(demoScene), scene = editorToDesigner(demoScene, options);
  expect(validateScene(demoScene, localCatalog).ok).toBe(true);
  expect(scene.items.map(item => item.id)).toEqual(demoScene.objects.map(object => object.id));
  expect(scene.items.every(item => localCatalog.some(asset => asset.id === item.sku))).toBe(true);
  expect(scene.openings.map(opening => opening.id).sort()).toEqual(demoScene.walls.flatMap(wall => wall.openings.map(opening => opening.id)).sort());
  expect(new Set(scene.walls.map(wall => wall.source_id))).toEqual(new Set(demoScene.walls.map(wall => wall.id)));
  expect(checkLocalLayout(scene).errors.some(error => error.room_id === 'room-bedroom')).toBe(true);
  expect(demoScene).toEqual(original);
  const benchmark = createEditorDemoInput();
  expect(benchmark.editor_scene).toEqual(demoScene);
  expect(benchmark.catalog).toEqual(localCatalog);
  expect(benchmark.scene).toEqual(scene);
  benchmark.editor_scene.name = 'Disposable benchmark copy';
  expect(createEditorDemoInput().editor_scene.name).toBe(demoScene.name);
});

test('Avani passes through real MCP proposal checks and the HTTP adapter to approved editor application', async () => {
  const scene = editorToDesigner(demoScene, options), server = createServer(scene), client = new Client({ name: 'avani-standing-test', version: '1' });
  const [serverTransport,clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    await client.callTool({ name: 'set_intent', arguments: { room_id: 'room-living', add: [], remove: [], move: [{ kinds: ['chair'], count: 1 }] } });
    const reply = await client.callTool({ name: 'propose', arguments: { ops: [chairMove], rationale: 'Move the living-room chair. Existing bedroom access problems remain unchanged.' } });
    expect(reply.isError).not.toBe(true);
    const result = JSON.parse((reply.content as {text:string}[])[0]!.text) as ProposalResult;
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.proposal.checks.notes?.some(note => note.room_id === 'room-bedroom')).toBe(true);
    const translated = proposalToEditor(result.proposal, demoScene, 0, options);
    const measured = measure({ ...createEditorDemoInput(), proposal: result.proposal,
      scenario: { id: 'standing-bridge', category: 'rearrange', scene: 'Avani', request: 'Move the lounge chair',
        expected_intent: { room_id: 'room-living', move: [{ kinds: ['chair'], count: 1 }] }, expect: { kind: 'proposal' } } });
    expect(measured.editor_check?.ok).toBe(true);
    expect(measured.pass).toBe(true);
    const adapter = createDesignerHttpAdapter({ catalog: localCatalog, fetch: async () => new Response(JSON.stringify({ type: 'proposal', conversationId: 'avani-test', proposal: translated })+'\n', { headers: { 'Content-Type': 'application/x-ndjson' } }) });
    const proposal = await adapter.propose(demoScene,0);
    const store = new EditorStore(demoScene, localCatalog);
    expect(store.execute(proposal.command,false).ok).toBe(false);
    expect(store.execute(proposal.command,true).ok).toBe(true);
    expect(validateScene(store.scene, localCatalog).ok).toBe(true);
    expect(store.execute(proposal.command,true).ok).toBe(false);
    const otherRooms = scene.items.filter(item => item.room_id !== 'room-living').map(item => item.id);
    expect(store.scene.objects.filter(object => otherRooms.includes(object.id))).toEqual(demoScene.objects.filter(object => otherRooms.includes(object.id)));
  } finally { await client.close(); await server.close(); }
});

test('paint every Avani wall blue reaches the editor through the published MCP colour schema', async () => {
  const scene = editorToDesigner(demoScene, options), server = createServer(scene), client = new Client({ name: 'avani-paint-test', version: '1' });
  const [a,b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
  const physicalWalls = [...new Map(scene.walls.map(wall => [wall.source_id,wall])).values()];
  const colors = physicalWalls.map(wall => ({ target: 'wall', id: wall.id, color: '#8299ad' }));
  try {
    expect((await client.callTool({ name: 'set_intent', arguments: { colors } })).isError).not.toBe(true);
    const response = await client.callTool({ name: 'propose', arguments: { ops: colors.map(color => ({ type: 'color', ...color })), rationale: 'Preview muted blue paint on both faces of the walls; paint and labour are unquoted.' } });
    expect(response.isError).not.toBe(true);
    const result = JSON.parse((response.content as {text:string}[])[0]!.text) as ProposalResult;
    expect(result.ok).toBe(true); if (!result.ok) return;
    const command = proposalToEditor(result.proposal,demoScene,0,options).command;
    const store = new EditorStore(demoScene,localCatalog); expect(store.execute(command,true).ok).toBe(true);
    expect(store.scene.walls.every(wall => wall.color === '#8299ad')).toBe(true);
    expect(store.scene.objects).toEqual(demoScene.objects);
    expect(store.scene.walls.map(({color,...wall}) => wall)).toEqual(demoScene.walls.map(({color,...wall}) => wall));
  } finally { await client.close(); await server.close(); }
});

test('Avani v2 grouping moves all members while retaining renovation and evidence records', () => {
  const source = structuredClone(demoScene); source.version = 2; source.project = emptyProject();
  for (const object of source.objects) if (['lounge-chair','living-rug'].includes(object.id)) object.groupId = 'living-set';
  source.project.sources.push({ id: 'evidence', name: 'Original plan', kind: 'plan', notes: 'Standing fixture evidence' });
  source.project.baseline = projectSnapshot(source);
  source.project.options.push({ id: 'saved-option', name: 'Original arrangement', snapshot: projectSnapshot(source) });
  const before = structuredClone(source), session = new DesignerSession(editorToDesigner(source,options));
  session.setIntent({ room_id: 'room-living', move: [{ kinds: ['chair'], count: 1 }] });
  // A 10 cm move clips the west wall by 5 mm; the standing fixture must catch it.
  expect(session.propose([chairMove],'Move the group into the wall.').ok).toBe(false);
  const result = session.propose([{ ...chairMove, pos: [-1.2,-1.95] }],'Move the chair and its grouped rug together by 5 cm.');
  expect(result.ok,JSON.stringify(result)).toBe(true); if (!result.ok) return;
  const store = new EditorStore(source,localCatalog); expect(store.execute(proposalToEditor(result.proposal,source,0,options).command,true).ok).toBe(true);
  for (const id of ['lounge-chair','living-rug']) expect(store.scene.objects.find(object => object.id === id)!.position[0]).toBeCloseTo(source.objects.find(object => object.id === id)!.position[0]-.05);
  expect(store.scene.project).toEqual(source.project);
  expect(source).toEqual(before);
});
