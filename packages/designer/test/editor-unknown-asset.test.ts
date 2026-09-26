import { expect, test } from 'vitest';
import type { CatalogAsset, SceneDocument } from '../../../apps/editor/src/contracts.js';
import { emptyProject } from '../../../apps/editor/src/core/renovation.js';
import { DesignerSession } from '../src/session.js';
import { editorToDesigner, proposalToEditor, UNRECOGNISED_KIND } from '../src/editor-bridge.js';
import { editorFitRows } from '../src/catalog-editor-fit.js';

// QA 26 Sept: one object whose catalog asset the bridge could not match made to-designer throw, and the designer
// fell back to conversation only for the whole flat.
const chair: CatalogAsset = { id: 'chair', name: 'Chair', category: 'Seats', kind: 'chair', dimensions: [.5, .8, .6], color: '#888888', price: 25000, source: { type: 'procedural' } };
const lamp: CatalogAsset = { id: 'lamp', name: 'Floor lamp', category: 'Lighting', kind: 'lamp', dimensions: [.4, 1.5, .4], color: '#eeeeee', price: 18000, source: { type: 'procedural' } };
// The editor knows this record; the bridge rejects its kind, so the asset counts as unknown.
const oddKind = { id: 'odd-sideboard', name: 'Sideboard', category: 'Storage', kind: 'sideboard', dimensions: [1.6, .8, .45], color: '#664422', price: 90000, source: { type: 'procedural' } } as unknown as CatalogAsset;
const catalog = [chair, lamp, oddKind];
const options = { catalog, catalogCurrency: 'AMD' as const };

// The editor sends version 2 documents.
function scene(): SceneDocument {
  return { format: 'varpet.editor', version: 2, project: emptyProject(), id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
    rooms: [{ id: 'room', name: 'Room', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]], color: '#ffffff' }],
    walls: [{ id: 'wall', start: [0, 0], end: [6, 0], height: 2.7, thickness: .1, color: '#ffffff', openings: [{ id: 'door', kind: 'door', offset: 0, width: .9, sill: 0, height: 2.1 }] }],
    objects: [
      { id: 'seat', name: 'My chair', assetId: 'chair', position: [3, 0, 3], rotation: 0, scale: [1, 1, 1] },
      { id: 'sideboard', name: 'Sideboard', assetId: 'odd-sideboard', position: [3, 0, 5.5], rotation: 0, scale: [1, 1, 1] },
      { id: 'mystery', name: 'Heirloom trunk', assetId: 'not-in-catalog', position: [5, 0, 1.5], rotation: Math.PI / 2, scale: [1.5, 1, 1] },
      { id: 'vase', name: 'Vase on trunk', assetId: 'lamp', position: [5, .9, 1.5], rotation: 0, scale: [.3, .3, .3], restsOn: 'mystery' },
    ] };
}

test('unknown catalog assets become fixed obstacles and the rest of the flat converts', () => {
  const input = scene(), original = structuredClone(input);
  const converted = editorToDesigner(input, options);
  expect(converted.items.map(item => item.id)).toEqual(['seat']);
  const sideboard = converted.fixed.find(item => item.id === 'sideboard')!;
  // The editor's record supplies the footprint even though its kind is not one the bridge accepts.
  expect(sideboard).toMatchObject({ kind: UNRECOGNISED_KIND, room_id: 'room', pos: [3, -5.5], size: [1.6, .45, .8], keep: true });
  expect(sideboard.name).toMatch(/unrecognised/i);
  const mystery = converted.fixed.find(item => item.id === 'mystery')!;
  expect(mystery).toMatchObject({ kind: UNRECOGNISED_KIND, pos: [5, -1.5], rot: 90, keep: true });
  expect(mystery.size[0]).toBeCloseTo(.9);
  // Standing on an unknown piece, the vase goes with it: nothing the designer can move or buy.
  expect([...converted.items, ...converted.fixed].some(item => item.id === 'vase')).toBe(false);
  expect(input).toEqual(original);
});

test('proposals still check against the unknown object and translate to an editor command', () => {
  const converted = editorToDesigner(scene(), options);
  const session = new DesignerSession(converted);
  session.setIntent({ room_id: 'room', add: [], remove: [], keeps: [], move: [{ kinds: ['chair'], count: 1 }] });
  expect(session.propose([{ type: 'move', id: 'mystery', pos: [2, -2], rot: 0 }], 'Move the trunk.').ok).toBe(false);
  expect(session.propose([{ type: 'move', id: 'seat', pos: [5, -1.5], rot: 0 }], 'Chair onto the trunk.').ok).toBe(false);
  const moved = session.propose([{ type: 'move', id: 'seat', pos: [2, -3], rot: 0 }], 'Move the chair while keeping the room clear.');
  expect(moved.ok, JSON.stringify(moved.ok ? {} : moved.errors)).toBe(true);
  if (!moved.ok) return;
  const command = proposalToEditor(moved.proposal, scene(), 4, options).command;
  expect(command.operations).toEqual([{ type: 'update', id: 'seat', patch: { position: [2, 0, 3], rotation: 0 } }]);
});

test('a purchase is never resolved against a stand-in asset', () => {
  const converted = editorToDesigner(scene(), options), session = new DesignerSession(converted);
  const add = { type: 'add' as const, item: { id: 'copy', room_id: 'room', kind: 'decor', name: 'Copy', pos: [1.5, -1.5] as [number, number], rot: 0, size: [.9, .6, .9] as [number, number, number], keep: false, sku: 'not-in-catalog', price: 0 } };
  session.setIntent({ room_id: 'room', add: [{ kinds: ['decor'], count: 1 }], remove: [], keeps: [], move: [] });
  const result = session.propose([add], 'Add a copy.');
  expect(result.ok).toBe(true);
  if (result.ok) expect(() => proposalToEditor(result.proposal, scene(), 4, options)).toThrow(/real catalog asset/);
});

test('catalog fitting keeps editor-checked slots in a flat with an unknown asset', () => {
  const base = editorToDesigner(scene(), options);
  const op = { type: 'add' as const, item: { id: 'new-lamp', room_id: 'room', kind: 'lamp', name: 'Floor lamp', pos: [1, -4] as [number, number], rot: 0, size: [.4, .4, 1.5] as [number, number, number], keep: false, sku: 'lamp', price: 18000 } };
  const rows = editorFitRows(scene(), base, catalog, [{ id: 'lamp', fit_slots: [{ room_id: 'room', ops: [op] }] }]);
  expect(rows).toHaveLength(1);
});

test('a legacy version 1 snapshot with an unknown asset converts too', () => {
  const input = scene(); input.version = 1; delete input.project;
  input.objects = input.objects.filter(object => object.id !== 'vase');
  const converted = editorToDesigner(input, options);
  expect(converted.items.map(item => item.id)).toEqual(['seat']);
  expect(converted.fixed.filter(item => item.kind === UNRECOGNISED_KIND).map(item => item.id).sort()).toEqual(['mystery', 'sideboard']);
});
