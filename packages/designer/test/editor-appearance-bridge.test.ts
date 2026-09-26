import { expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { CatalogAsset, SceneDocument } from '../../../apps/editor/src/contracts.js';
import { emptyProject, projectSnapshot } from '../../../apps/editor/src/core/renovation.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { applyOps } from '../src/adapter.js';
import { editorToDesigner, proposalToEditor, type EditorBridgeOptions } from '../src/editor-bridge.js';
import { DesignerSession } from '../src/session.js';

const catalog: CatalogAsset[] = [{ id: 'chair', name: 'Chair', category: 'Seats', kind: 'chair', dimensions: [.5, .8, .6], color: '#888888', price: 25000, source: { type: 'procedural' } }];
const together: EditorBridgeOptions = { catalog, groupPolicy: 'move-together' };
function source(group = false): SceneDocument {
  return { format: 'varpet.editor', version: 2, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y', project: emptyProject(),
    rooms: [{ id: 'room', name: 'Room', polygon: [[0, 0], [12, 0], [12, 12], [0, 12]], color: '#ffffff' }],
    walls: [{ id: 'wall', start: [0, 0], end: [12, 0], height: 2.7, thickness: .1, color: '#eeeeee', openings: [] }],
    objects: [{ id: 'seat', name: 'Chair one', assetId: 'chair', position: [3, 0, 3], rotation: 0, scale: [1, 1, 1], color: '#123456', ...(group ? { groupId: 'pair' } : {}) },
      { id: 'second', name: 'Chair two', assetId: 'chair', position: [5, 0, 3], rotation: 0, scale: [1, 1, 1], ...(group ? { groupId: 'pair' } : {}) }] };
}
function accepted(editor: SceneDocument, ops: unknown, intent: unknown, options: EditorBridgeOptions = together) {
  const session = new DesignerSession(editorToDesigner(editor, options)); session.setIntent(intent);
  const result = session.propose(ops, 'Apply the requested change while preserving the rest of the apartment.');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.proposal;
}
const paint = (target: 'item' | 'wall', id: string, color = '#abcdef') => ({ type: 'color', target, id, color });
const colorIntent = (target: 'item' | 'wall', id: string, color = '#abcdef') => ({ colors: [{ target, id, color }] });

test('conversion retains effective colours and original wall IDs; groups opt into movement', () => {
  const editor = source(true), original = structuredClone(editor), converted = editorToDesigner(editor, together);
  expect(converted.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'seat', color: '#123456', group_id: 'pair', keep: false }), expect.objectContaining({ id: 'second', color: '#888888', group_id: 'pair', keep: false })]));
  expect(converted.walls[0]).toMatchObject({ id: 'wall', source_id: 'wall', color: '#eeeeee', keep: false });
  expect(editorToDesigner(editor, { catalog }).items.every(item => item.keep)).toBe(true);
  expect(editor).toEqual(original);
});

test('one anchor command moves and rotates the whole group identically in designer and editor', () => {
  const editor = source(true), original = structuredClone(editor);
  const proposal = accepted(editor, [{ type: 'move', id: 'seat', pos: [5, -5], rot: 90 }], { move: [{ kinds: ['chair'], count: 2 }] });
  const translated = proposalToEditor(proposal, editor, 0, together);
  expect(translated.command.operations).toHaveLength(1);
  const store = new EditorStore(editor, catalog); expect(store.execute(translated.command, true).ok).toBe(true);
  expect(store.scene.objects[1]).toMatchObject({ id: 'second', position: [5, 0, 3], rotation: Math.PI / 2, groupId: 'pair' });
  const after = editorToDesigner(store.scene, together), expected = applyOps(editorToDesigner(editor, together), proposal.ops);
  expect(after.items.map(({ id, pos, rot }) => ({ id, pos, rot }))).toEqual(expected.items.map(({ id, pos, rot }) => ({ id, pos, rot })));
  expect(editor).toEqual(original);
});

test('explicit keep, locked and retained members block movement of their whole group', () => {
  for (const protection of ['keep', 'locked', 'retain'] as const) {
    const editor = source(true), options = { ...together, ...(protection === 'keep' ? { keep: ['second'] } : {}) };
    if (protection === 'locked') editor.project!.metadata.second = { locked: true };
    if (protection === 'retain') editor.project!.metadata.second = { phase: 'retain' };
    const session = new DesignerSession(editorToDesigner(editor, options)); session.setIntent({ move: [{ kinds: ['chair'], count: 2 }] });
    expect(session.propose([{ type: 'move', id: 'seat', pos: [5, -5], rot: 90 }], 'Move the group.').ok).toBe(false);
  }
});

test('object paint affects only that group member and preserves the project snapshot', () => {
  const editor = source(true); editor.project!.sources.push({ id: 'photo', name: 'Reference photo', kind: 'photo', notes: 'Preserve this evidence' });
  editor.project!.tasks.push({ id: 'task', title: 'Review seating', trade: 'design', status: 'todo', entityIds: ['seat'], dependsOn: [], allowance: 10 });
  editor.project!.baseline = projectSnapshot(editor); editor.project!.options.push({ id: 'option', name: 'Existing option', snapshot: projectSnapshot(editor) });
  const original = structuredClone(editor), proposal = accepted(editor, [paint('item', 'seat')], colorIntent('item', 'seat'));
  const translated = proposalToEditor(proposal, editor, 0, together), store = new EditorStore(editor, catalog);
  expect(translated.command.operations).toEqual([{ type: 'update', id: 'seat', patch: { color: '#abcdef' } }]);
  expect(store.execute(translated.command, true).ok).toBe(true);
  expect(store.scene.objects[0]!.color).toBe('#abcdef'); expect(store.scene.objects[1]).toEqual(editor.objects[1]);
  expect(store.scene.project).toEqual(editor.project); expect(editor).toEqual(original);
});

test('bare wall paint emits only a colour patch and preserves wall geometry', () => {
  const editor = source(); editor.version = 1; delete editor.project;
  const proposal = accepted(editor, [paint('wall', 'wall')], colorIntent('wall', 'wall'));
  const translated = proposalToEditor(proposal, editor, 0, together), store = new EditorStore(editor, catalog);
  expect(translated.command.operations).toEqual([{ type: 'update-wall', id: 'wall', patch: { color: '#abcdef' } }]);
  expect(store.execute(translated.command, true).ok).toBe(true);
  expect(store.scene.walls[0]).toEqual({ ...editor.walls[0], color: '#abcdef' });
});

test('existing finishes and renovation mode paint both faces without replacing the wall or shared materials', () => {
  const editor = source(); editor.project!.mode = 'renovate'; editor.project!.metadata.wall = { phase: 'retain', review: 'reviewed', notes: 'Keep shell' };
  // Retain furniture is protected, while painting a retained wall is expressly requested below.
  delete editor.project!.metadata.wall!.phase;
  editor.project!.materials.push({ id: 'shared-paint', name: 'Shared original', color: '#445566', unit: 'm2', unitCost: 12, thickness: .001, wastePercent: 5 });
  editor.project!.finishes.push({ id: 'wall-finish', entityId: 'wall', surface: 'wall-front', materialId: 'shared-paint' }, { id: 'floor-finish', entityId: 'room', surface: 'floor', materialId: 'shared-paint' });
  editor.project!.baseline = projectSnapshot(editor);
  const original = structuredClone(editor); expect(editorToDesigner(editor, together).walls[0]!.color).toBeUndefined();
  const translated = proposalToEditor(accepted(editor, [paint('wall', 'wall')], colorIntent('wall', 'wall')), editor, 0, together);
  expect(translated.command.operations.some(op => op.type === 'update-wall')).toBe(false);
  const store = new EditorStore(editor, catalog); expect(store.execute(translated.command, true).ok).toBe(true);
  expect(validateScene(store.scene, catalog).ok).toBe(true);
  for (const surface of ['wall-front', 'wall-back']) {
    const finish = store.scene.project!.finishes.find(finish => finish.entityId === 'wall' && finish.surface === surface)!;
    expect(store.scene.project!.materials.find(material => material.id === finish.materialId)!.color).toBe('#abcdef');
  }
  expect(store.scene.project!.finishes.find(finish => finish.surface === 'wall-front')!.id).toBe('wall-finish');
  expect(store.scene.project!.materials.find(material => material.id === 'shared-paint')).toEqual(editor.project!.materials[0]);
  expect(store.scene.project!.finishes.find(finish => finish.id === 'floor-finish')).toEqual(editor.project!.finishes[1]);
  expect(store.scene.project!.metadata).toEqual(editor.project!.metadata); expect(store.scene.project!.baseline).toEqual(editor.project!.baseline);
  expect(store.scene.walls).toEqual(editor.walls); expect(editor).toEqual(original);
});

test('shared wall aliases target one physical wall; locked wall colours are protected', () => {
  const editor = source(); editor.objects = []; editor.rooms[0]!.polygon = [[0, 0], [6, 0], [6, 12], [0, 12]];
  editor.rooms.push({ id: 'other', name: 'Other room', polygon: [[6, 0], [12, 0], [12, 12], [6, 12]], color: '#ffffff' });
  editor.walls.push({ id: 'shared', start: [6, 0], end: [6, 12], height: 2.7, thickness: .1, color: '#eeeeee', openings: [] });
  const converted = editorToDesigner(editor, together), aliases = converted.walls.filter(wall => wall.source_id === 'shared');
  expect(aliases).toHaveLength(2);
  const op = paint('wall', aliases[0]!.id), proposal = accepted(editor, [op], colorIntent('wall', op.id));
  expect(applyOps(converted, proposal.ops).walls.filter(wall => wall.source_id === 'shared').every(wall => wall.color === '#abcdef')).toBe(true);
  expect(proposalToEditor(proposal, editor, 0, together).command.operations).toEqual([{ type: 'update-wall', id: 'shared', patch: { color: '#abcdef' } }]);
  editor.project!.metadata.shared = { locked: true };
  expect(editorToDesigner(editor, together).walls.filter(wall => wall.source_id === 'shared').every(wall => wall.keep)).toBe(true);
  expect(() => accepted(editor, [op], colorIntent('wall', op.id))).toThrow(/keep|lock|protect/i);
});

test('CLI enables group movement for the service without changing the legacy programmatic default', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'varpet-appearance-'));
  try {
    const scenePath = join(directory, 'scene.json'), catalogPath = join(directory, 'catalog.json'), output = join(directory, 'converted.json');
    await writeFile(scenePath, JSON.stringify(source(true))); await writeFile(catalogPath, JSON.stringify(catalog));
    execFileSync(resolve('node_modules/.bin/tsx'), [resolve('src/editor-bridge.ts'), 'to-designer', scenePath, output, '--catalog', catalogPath]);
    const converted = JSON.parse(await readFile(output, 'utf8'));
    expect(converted.items.every((item: { group_id: string; keep: boolean }) => item.group_id === 'pair' && !item.keep)).toBe(true);
  } finally { await rm(directory, { recursive: true }); }
});
