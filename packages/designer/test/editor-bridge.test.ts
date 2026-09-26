import { expect, test } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CatalogAsset, SceneDocument } from '../../../apps/editor/src/contracts.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { emptyProject } from '../../../apps/editor/src/core/renovation.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { DesignerSession, type Proposal } from '../src/session.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';

const catalog: CatalogAsset[] = [{ id: 'chair', name: 'Chair', category: 'Seats', kind: 'chair', dimensions: [.5, .8, .6], color: '#888888', price: 25000, source: { type: 'procedural' } }];
function scene(): SceneDocument {
  return { format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Room', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]], color: '#ffffff' }],
    walls: [{ id: 'wall', start: [0, 0], end: [6, 0], height: 2.7, thickness: .1, color: '#ffffff', openings: [{ id: 'door', kind: 'door', offset: 0, width: .9, sill: 0, height: 2.1 }] }],
    objects: [{ id: 'seat', name: 'My chair', assetId: 'chair', position: [3, 0, 3], rotation: Math.PI / 2, scale: [2, 1, 1] }] };
}
function proposal(source = scene(), options = { catalog }): Proposal {
  const session = new DesignerSession(editorToDesigner(source, options));
  session.setIntent({ room_id: 'room', add: [], remove: [], keeps: [], move: [{ kinds: ['chair'], count: 1 }] });
  const result = session.propose([{ type: 'move', id: 'seat', pos: [4, -3], rot: 180 }], 'Move the chair while keeping the room clear.');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.proposal;
}

test('converts axes, front, dimensions and explicit north/swing without changing the input', () => {
  const input = scene(), original = structuredClone(input);
  const converted = editorToDesigner(input, { catalog, keep: ['seat'], northDeg: 0, doorSwings: { door: 'in-left' } });
  expect(converted.items[0]).toMatchObject({ id: 'seat', room_id: 'room', kind: 'chair', pos: [3, -3], rot: 90, size: [1, .6, .8], keep: true, sku: 'chair' });
  expect(converted.items[0]).not.toHaveProperty('price');
  expect(converted.north_deg).toBe(0);
  expect(converted.openings[0]).toMatchObject({ id: 'door', offset: 0, swing: 'inward-left' });
  expect(input).toEqual(original);
});

test('unknown north and swing remain unknown; invalid IDs, options and catalog references fail', () => {
  const converted = editorToDesigner(scene(), { catalog });
  expect(converted.north_deg).toBeUndefined(); expect(converted.openings[0]!.swing).toBeUndefined();
  expect(() => editorToDesigner(scene(), { catalog, keep: ['missing'] })).toThrow(/keep|unknown/i);
  expect(() => editorToDesigner(scene(), { catalog, doorSwings: { missing: 'in-left' } })).toThrow(/door|unknown/i);
  expect(() => editorToDesigner(scene(), { catalog, northDeg: NaN })).toThrow(/north/i);
  expect(() => editorToDesigner(scene(), { catalog: [] })).toThrow(/catalog|asset/i);
});

test('maps every editor kind, including rugs, and preserves every demo opening across split/shared walls', () => {
  const converted = editorToDesigner(demoScene);
  expect(converted.items).toHaveLength(demoScene.objects.length);
  expect(converted.items.find(item => item.id === 'living-rug')!.kind).toBe('rug');
  expect(converted.openings.map(opening => opening.id).sort()).toEqual(demoScene.walls.flatMap(wall => wall.openings.map(opening => opening.id)).sort());
  for (const kind of ['sofa', 'chair', 'table', 'bed', 'cabinet', 'lamp', 'plant', 'rug', 'shelf'] as const) {
    expect(editorToDesigner(scene(), { catalog: [{ ...catalog[0]!, kind }] }).items[0]!.kind).toBe(kind);
  }
  const eastWindows = converted.openings.filter(opening => ['window-bath', 'window-bedroom'].includes(opening.id));
  expect(eastWindows.map(opening => converted.walls.find(wall => wall.id === opening.wall_id)!.room_id)).toEqual(['room-bath', 'room-bedroom']);
  expect(converted.walls.some(wall => wall.room_id === 'room-living' && wall.a[0] === .6 && wall.b[0] === .6)).toBe(true);
  expect(converted.walls.some(wall => wall.room_id === 'room-kitchen' && wall.a[0] === .6 && wall.b[0] === .6)).toBe(true);
});

test('safe v2 preserves metadata while groups, locks and retained objects become keeps', () => {
  const input = scene(); input.version = 2; input.project = emptyProject();
  input.objects.push({ ...structuredClone(input.objects[0]!), id: 'second', position: [4, 0, 4], groupId: 'pair' }); input.objects[0]!.groupId = 'pair';
  expect(editorToDesigner(input, { catalog }).items.every(item => item.keep)).toBe(true);
  delete input.objects[0]!.groupId; delete input.objects[1]!.groupId;
  input.project.metadata.seat = { locked: true }; input.project.metadata.second = { phase: 'retain' };
  expect(editorToDesigner(input, { catalog }).items.every(item => item.keep)).toBe(true);
});

test('unsupported elevations, obstacles and removed shell are rejected instead of flattened', () => {
  const input = scene(); input.version = 2; input.project = emptyProject();
  input.project.metadata.room = { elevation: 1 };
  expect(() => editorToDesigner(input, { catalog })).toThrow(/elevat/i);
  input.project.metadata = {}; input.project.components.push({ id: 'radiator', name: 'Radiator', kind: 'radiator', position: [2, 0, 1], dimensions: [1, 1, .3], rotation: 0, color: '#ffffff', phase: 'existing' });
  expect(() => editorToDesigner(input, { catalog })).toThrow(/component|obstacle/i);
  input.project.components = []; input.project.metadata.wall = { phase: 'remove' };
  expect(() => editorToDesigner(input, { catalog })).toThrow(/phase|remov/i);
});

test('translation produces a revisioned, approved-only editor command and leaves original snapshot unchanged', () => {
  const input = scene(), original = structuredClone(input), result = proposalToEditor(proposal(input), input, 0, { catalog });
  expect(result.command).toMatchObject({ source: 'designer', baseRevision: 0, operations: [{ type: 'update', id: 'seat', patch: { position: [4, 0, 3], rotation: Math.PI } }] });
  const store = new EditorStore(input, catalog);
  expect(store.execute(result.command, false).ok).toBe(false);
  expect(store.execute(result.command, true).ok).toBe(true);
  expect(validateScene(store.scene, catalog).ok).toBe(true);
  expect(store.scene.objects[0]!.scale).toEqual([2, 1, 1]);
  expect(store.execute(result.command, true).ok).toBe(false);
  expect(input).toEqual(original);
});

test('refused, stale-source and tampered proposals never become editor commands', () => {
  const input = scene(), accepted = proposal(input);
  expect(() => proposalToEditor({ ...accepted, request_check: { ok: false } }, input, 0, { catalog })).toThrow(/request|accept/i);
  expect(() => proposalToEditor({ ...accepted, ops: [{ type: 'move', id: 'seat', pos: [99, 99] }] }, input, 0, { catalog })).toThrow();
  const newer = structuredClone(input); newer.objects[0]!.position = [2, 0, 2];
  expect(() => proposalToEditor(accepted, newer, 0, { catalog })).toThrow(/snapshot|fingerprint|stale/i);
  expect(() => proposalToEditor(accepted, input, -1, { catalog })).toThrow(/revision/i);
  expect(() => proposalToEditor(accepted, input, 0, { catalog, keep: ['seat'] })).toThrow(/snapshot|fingerprint|keep/i);
});

test('adds require a real catalog asset with explicit AMD price provenance; deletions stay bounded', () => {
  const input = scene(), source = editorToDesigner(input, { catalog }), session = new DesignerSession(source);
  session.setIntent({ add: [{ kinds: ['chair'], count: 1 }], remove: [{ kinds: ['chair'], count: 1 }] });
  const added = { id: 'new-chair', kind: 'chair', name: 'Chair', room_id: 'room', pos: [4, -4] as [number, number], rot: 0, size: [.5, .6, .8] as [number, number, number], keep: false, sku: 'chair', price: 25000 };
  const accepted = session.propose([{ type: 'remove', id: 'seat' }, { type: 'add', item: added }], 'Replace the chair with the requested catalog chair.');
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.errors));
  expect(() => proposalToEditor(accepted.proposal, input, 0, { catalog })).toThrow(/AMD|currency/i);
  const translated = proposalToEditor(accepted.proposal, input, 0, { catalog, catalogCurrency: 'AMD' });
  const store = new EditorStore(input, catalog); expect(store.execute(translated.command, true).ok).toBe(true);
  expect(store.scene.objects[0]).toMatchObject({ id: 'new-chair', assetId: 'chair', position: [4, 0, 4], scale: [1, 1, 1] });
  const unknown = structuredClone(accepted.proposal); (unknown.ops[1] as { item: typeof added }).item.sku = 'invented';
  expect(() => proposalToEditor(unknown, input, 0, { catalog, catalogCurrency: 'AMD' })).toThrow(/catalog|asset/i);
});

test('bridge CLI writes converted JSON and editor proposals with an explicit catalog', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'varpet-bridge-test-'));
  try {
    const source = join(directory, 'source.json'), assets = join(directory, 'catalog.json'), converted = join(directory, 'scene.json'), accepted = join(directory, 'proposal.json'), command = join(directory, 'command.json');
    await writeFile(source, JSON.stringify(scene())); await writeFile(assets, JSON.stringify(catalog)); await writeFile(accepted, JSON.stringify(proposal()));
    const cli = resolve('src/editor-bridge.ts'), tsx = resolve('node_modules/.bin/tsx');
    execFileSync(tsx, [cli, 'to-designer', source, converted, '--catalog', assets]);
    expect(JSON.parse(await readFile(converted, 'utf8')).items[0].pos).toEqual([3, -3]);
    execFileSync(tsx, [cli, 'to-command', accepted, source, '0', command, '--catalog', assets]);
    expect(JSON.parse(await readFile(command, 'utf8')).command.baseRevision).toBe(0);
    expect(() => execFileSync(tsx, [cli, 'to-designer', source, converted, '--bad'], { stdio: 'pipe' })).toThrow();
  } finally { await rm(directory, { recursive: true }); }
});
