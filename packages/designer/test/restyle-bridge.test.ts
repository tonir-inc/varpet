import { expect, test } from 'vitest';
import type { CatalogAsset, SceneDocument, SceneObject } from '../../../apps/editor/src/contracts.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { documentCommand, editorToDesigner, materialRoles, materialsPatch } from '../src/editor-bridge.js';

const kitchen = { id: 'flat:kitchen-run', name: 'Kitchen run', category: 'Kitchen', kind: 'kitchen_counter', dimensions: [3, .9, .6], color: '#3c5646', price: 0,
  source: { type: 'procedural' }, materialSlots: { fronts: ['Fronts'], handles: ['Brass'], worktop: ['Terrazzo'] } } as CatalogAsset;
const sofa: CatalogAsset = { id: 'sofa', name: 'Sofa', category: 'Seats', kind: 'sofa', dimensions: [2, .8, .9], color: '#888888', price: 10000, source: { type: 'procedural' } };
const catalog = [kitchen, sofa];
const object = (id: string, assetId: string, position: [number, number, number], extra: Record<string, unknown> = {}): SceneObject =>
  ({ id, name: id, assetId, position, rotation: 0, scale: [1, 1, 1], ...extra }) as SceneObject;
const flat = (objects: SceneObject[]): SceneDocument => ({ format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Kitchen', polygon: [[0, 0], [5, 0], [5, 5], [0, 5]], color: '#ffffff' }],
  walls: [{ id: 'wall', start: [0, 0], end: [5, 0], height: 2.7, thickness: .1, color: '#ffffff', openings: [] }], objects });

test('made-to-measure pieces reach the designer with their roles and current colours; other furniture does not', () => {
  const scene = editorToDesigner(flat([object('k-run', kitchen.id, [2.5, 0, 4]), object('seat', 'sofa', [2.5, 0, 1.5])]), { catalog });
  expect(scene.items.find(i => i.id === 'k-run')).toMatchObject({ material_slots: ['fronts', 'handles', 'worktop'] });
  expect(scene.items.find(i => i.id === 'k-run')).not.toHaveProperty('materials');
  expect(scene.items.find(i => i.id === 'seat')).not.toHaveProperty('material_slots');
  const styled = editorToDesigner(flat([object('k-run', kitchen.id, [2.5, 0, 4], { materials: { fronts: '#1F3A5F' } })]), { catalog });
  expect(styled.items[0]).toMatchObject({ material_slots: ['fronts', 'handles', 'worktop'], materials: { fronts: '#1f3a5f' } });
  expect(materialRoles(kitchen)).toEqual(['fronts', 'handles', 'worktop']);
  expect(materialRoles(sofa)).toEqual([]);
});

test('materialsPatch sets changed roles and nulls roles the target no longer sets', () => {
  const before = object('k', kitchen.id, [0, 0, 0], { materials: { fronts: '#3c5646', handles: '#c29d5f' } });
  expect(materialsPatch(before, object('k', kitchen.id, [0, 0, 0], { materials: { fronts: '#1f3a5f', handles: '#C29D5F' } }))).toEqual({ fronts: '#1f3a5f' });
  expect(materialsPatch(before, object('k', kitchen.id, [0, 0, 0], { materials: { fronts: '#3c5646', worktop: '#f5f3ee' } }))).toEqual({ worktop: '#f5f3ee', handles: null });
  expect(materialsPatch(before, before)).toBeUndefined();
  expect(materialsPatch(object('s', 'sofa', [0, 0, 0]), object('s', 'sofa', [0, 0, 0]))).toBeUndefined();
});

test('a restyled piece of the flat becomes an update with patch.materials, and nothing else about it changes', () => {
  const current = flat([object('k-run', kitchen.id, [2.5, 0, 4], { materials: { handles: '#c29d5f' } })]);
  // The target document rebuilds the flat's pieces (another asset id, a moved position): only materials may change.
  const target = flat([object('k-run', 'spike-box-k-run', [2, 0, 3], { materials: { fronts: '#1f3a5f', worktop: '#f5f3ee' } })]);
  const proposal = documentCommand(current, target, [], 0, { catalog });
  expect(proposal.command.operations).toEqual([{ type: 'update', id: 'k-run', patch: { materials: { fronts: '#1f3a5f', worktop: '#f5f3ee', handles: null } } }]);
  const store = new EditorStore(current, catalog);
  expect(store.execute(proposal.command, true).ok).toBe(true);
  const after = store.scene.objects.find(o => o.id === 'k-run') as SceneObject & { materials?: Record<string, string> };
  expect(after.materials).toEqual({ fronts: '#1f3a5f', worktop: '#f5f3ee' });
  expect(after.position).toEqual([2.5, 0, 4]);
});

test('a design piece keeps its per-role finish changes in the same update as a move', () => {
  const current = flat([object('run', kitchen.id, [2.5, 0, 4])]);
  const target = flat([object('run', kitchen.id, [2.4, 0, 4], { materials: { fronts: '#1f3a5f' } })]);
  const ops = documentCommand(current, target, ['run'], 0, { catalog }).command.operations;
  expect(ops).toEqual([{ type: 'update', id: 'run', patch: { position: [2.4, 0, 4], materials: { fronts: '#1f3a5f' } } }]);
});
