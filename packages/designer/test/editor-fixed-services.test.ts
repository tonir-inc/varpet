import { expect, test } from 'vitest';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { migrateScene } from '../../../apps/editor/src/core/renovation.js';
import { componentPosition, componentRotation } from '../../../apps/editor/src/core/geometry.js';
import { DesignerSession } from '../src/session.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { applyOps } from '../src/adapter.js';
import { localGeometryErrors } from '../src/local-checks.js';
import { spaceMetrics } from '../src/metrics/space.js';

function flat() {
  const source = migrateScene(demoScene);
  source.project!.components.push(
    { id: 'kitchen-sink', name: 'Kitchen sink', kind: 'sink', position: [2, 0, -2], dimensions: [1, .9, .6], rotation: Math.PI / 4, color: '#ffffff', phase: 'existing', price: 90000 },
    { id: 'bath-unit', name: 'Bath', kind: 'bath', position: [4.2, 0, -2], dimensions: [.7, .6, 1.6], rotation: 0, color: '#ffffff', phase: 'existing', price: 200000 });
  source.project!.routes.push({ id: 'pipe', name: 'Waste pipe', system: 'waste', points: [[2, .1, -2], [3, .1, -2], [3, 1, -2]], diameter: .1, phase: 'existing', pricePerMetre: 1000 });
  return source;
}

test('editor kitchen and bathroom fixtures convert to unpriced immutable solids without altering the source', () => {
  const source = flat(), before = structuredClone(source), scene = editorToDesigner(source);
  expect(scene.fixed.length).toBe(4);
  expect(scene.items.map(i => i.id)).toEqual(source.objects.map(i => i.id));
  for (const fixed of scene.fixed) {
    expect(fixed.keep).toBe(true); expect(fixed.price).toBeUndefined(); expect(fixed.sku).toBeUndefined();
    expect(() => applyOps(scene, [{ type: 'remove', id: fixed.id }])).toThrow(/fixed/);
    expect(() => applyOps(scene, [{ type: 'move', id: fixed.id, pos: [0, 0] }])).toThrow(/fixed/);
  }
  expect(source).toEqual(before);
  expect(spaceMetrics(scene).free_area_m2).toBeLessThan(spaceMetrics(editorToDesigner(migrateScene(demoScene))).free_area_m2);
});

test('fixtures and horizontal/vertical pipe segments block furniture; clear positions remain usable', () => {
  const scene = editorToDesigner(flat(), { catalog: localCatalog });
  for (const pos of [[2, 2], [2.8, 2], [3, 2]] as [number, number][]) {
    const item = { id: 'probe', name: 'Chair', kind: 'chair', room_id: 'room-kitchen', pos, rot: 0, size: [.2, .2, .8] as [number, number, number], keep: false };
    expect(localGeometryErrors({ ...scene, items: [item] }).some(e => e.check === 'wall_collision')).toBe(true);
    expect(localGeometryErrors({ ...scene, items: [{ ...item, pos: [2, 1] }] }).some(e => e.check === 'wall_collision')).toBe(false);
  }
});

test('mounted fixture uses the editor world pose and overhead fixtures preserve headroom', () => {
  const source = flat(), c = source.project!.components[0]!;
  c.kind = 'cabinet'; c.dimensions = [.5, .4, .3];
  c.host = { wallId: source.walls[0]!.id, offset: 1, elevation: 2, side: 1 };
  const scene = editorToDesigner(source), fixed = scene.fixed.find(f => f.name.includes(c.name))!;
  const p = componentPosition(source, c);
  expect(fixed.pos).toEqual([p[0], -p[2]]);
  expect(fixed.rot).toBeCloseTo(componentRotation(source, c) * 180 / Math.PI);
  expect(fixed.structure!.bottom_m).toBe(2);
});

test('raised pipes occupy walking space even though their bottom is above the floor', () => {
  const source = flat(); source.project!.components = [];
  const scene = editorToDesigner(source), baseline = editorToDesigner({ ...source, project: { ...source.project!, routes: [] } });
  expect(spaceMetrics(scene).free_area_m2).toBeLessThan(spaceMetrics(baseline).free_area_m2);
});


test('approved furniture-only paint preserves every fixture and route in the editor', () => {
  const source = flat(), scene = editorToDesigner(source), session = new DesignerSession(scene);
  session.setIntent({ colors: [{ target: 'item', id: 'lounge-chair', color: '#314159' }] });
  const result = session.propose([{ type: 'color', target: 'item', id: 'lounge-chair', color: '#314159' }], 'Paint the chair.');
  expect(result.ok).toBe(true); if (!result.ok) return;
  const command = proposalToEditor(result.proposal, source, 0).command;
  const store = new EditorStore(source, localCatalog);
  expect(store.execute(command, true).ok).toBe(true);
  expect(store.scene.project!.components).toEqual(source.project!.components);
  expect(store.scene.project!.routes).toEqual(source.project!.routes);
});

test('proposal checks reject a new chair placed on the kitchen sink', () => {
  const scene = editorToDesigner(flat()), session = new DesignerSession(scene);
  session.setIntent({ room_id: 'room-kitchen', add: [{ kinds: ['chair'], count: 1 }] });
  const result = session.propose([{ type: 'add', item: { id: 'new-chair', name: 'Chair', kind: 'chair', room_id: 'room-kitchen', pos: [2, 2], rot: 0, size: [.5, .5, .8], keep: false, price: 1000, sku: 'chair' } }], 'Place a chair on the sink.');
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).toContain('kitchen-sink');
});
