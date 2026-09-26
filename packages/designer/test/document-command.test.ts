import { expect, test } from 'vitest';
import type { CatalogAsset, SceneDocument, SceneObject } from '../../../apps/editor/src/contracts.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { migrateScene } from '../../../apps/editor/src/core/renovation.js';
import { documentCommand } from '../src/editor-bridge.js';

const asset = (id: string, kind: CatalogAsset['kind'], dimensions: [number, number, number]): CatalogAsset =>
  ({ id, name: id, category: 'Test', kind, dimensions, color: '#888888', price: 10000, source: { type: 'procedural' } });
const catalog = [asset('stand', 'cabinet', [1.4, .5, .45]), asset('lamp', 'lamp', [.25, .45, .25]), asset('sofa', 'sofa', [2, .8, .9])];
const flat = (objects: SceneObject[] = []): SceneDocument => ({ format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Living room', polygon: [[0, 0], [5, 0], [5, 5], [0, 5]], color: '#ffffff' }],
  walls: [{ id: 'wall', start: [0, 0], end: [5, 0], height: 2.7, thickness: .1, color: '#ffffff', openings: [] }], objects });
const object = (id: string, assetId: string, position: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject =>
  ({ id, name: id, assetId, position, rotation: 0, scale: [1, 1, 1], ...extra });
const applied = (current: SceneDocument, target: SceneDocument, owned: string[]) => {
  const store = new EditorStore(current, catalog), proposal = documentCommand(current, target, owned, 0, { catalog });
  expect(store.execute(proposal.command, true).ok).toBe(true);
  return { store, proposal };
};

test('a design with a resting lamp, a floor finish and a ceiling design becomes one checked editor command', () => {
  const current = flat([object('own-sofa', 'sofa', [4, 0, 4])]);
  const target = migrateScene(flat([object('own-sofa', 'sofa', [4, 0, 4]), object('stand', 'stand', [2, 0, 2]), object('lamp', 'lamp', [2, 0.5, 2], { restsOn: 'stand' })]));
  target.project!.materials.push({ id: 'spike-finish:oak', name: 'Oak', color: '#c8ae89', unit: 'm2', unitCost: 0, thickness: .014, wastePercent: 0 });
  target.project!.finishes.push({ id: 'spike:room:floor', entityId: 'room', surface: 'floor', materialId: 'spike-finish:oak' });
  target.project!.metadata.room = { ceilingDesign: { style: 'quiet', drop: 0, inset: .55, brightness: 70, temperature: 2700, enabled: true } };
  const { store, proposal } = applied(current, target, ['stand', 'lamp']);
  expect(proposal.command.operations.map(op => op.type)).toEqual(['migrate-project', 'add', 'add', 'upsert-material', 'upsert-finish', 'set-metadata']);
  expect(store.scene.objects.find(o => o.id === 'lamp')!.restsOn).toBe('stand');
  expect(store.scene.objects.find(o => o.id === 'own-sofa')!.position).toEqual([4, 0, 4]);
  expect(store.scene.project!.finishes.map(f => f.id)).toEqual(['spike:room:floor']);
});

test('a follow-up after Apply moves, re-places and removes only the design\'s own pieces', () => {
  const first = flat([object('stand', 'stand', [2, 0, 2]), object('lamp', 'lamp', [2, 0.5, 2], { restsOn: 'stand' }), object('sofa', 'sofa', [3, 0, 4])]);
  const { store } = applied(flat(), first, ['stand', 'lamp', 'sofa']);
  const current = store.scene;
  // Stand moves (its lamp is re-placed on it), the sofa is dropped, nothing else is touched.
  const next = flat([object('stand', 'stand', [1.5, 0, 2]), object('lamp', 'lamp', [1.5, 0.5, 2], { restsOn: 'stand' })]);
  const { store: after, proposal } = applied(current, next, ['stand', 'lamp', 'sofa']);
  expect(proposal.command.operations.filter(op => op.type === 'delete').map(op => (op as { id: string }).id).sort()).toEqual(['lamp', 'sofa']);
  expect(after.scene.objects.map(o => o.id).sort()).toEqual(['lamp', 'stand']);
  expect(after.scene.objects.find(o => o.id === 'stand')!.position).toEqual([1.5, 0, 2]);
  expect(after.scene.objects.find(o => o.id === 'lamp')!.restsOn).toBe('stand');
});

test('pieces outside the design are never touched and an unchanged design has nothing to apply', () => {
  const current = flat([object('sofa', 'sofa', [3, 0, 4])]);
  expect(() => documentCommand(current, flat([object('sofa', 'sofa', [2, 0, 4])]), [], 0, { catalog })).toThrow(/nothing to apply/);
  expect(() => documentCommand(current, flat([object('sofa', 'sofa', [2, 0, 4])]), ['other'], 0, { catalog })).toThrow(/nothing to apply/);
  const owned = flat([object('sofa', 'sofa', [3, 0, 4])]);
  expect(() => documentCommand(owned, owned, ['sofa'], 0, { catalog })).toThrow(/nothing to apply/);
});
