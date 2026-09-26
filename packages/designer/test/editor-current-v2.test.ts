import { expect, test } from 'vitest';
import type { CatalogAsset, SceneDocument } from '../../../apps/editor/src/contracts.js';
import type { CeilingDesign } from '../../../apps/editor/src/renovation-contracts.js';
import { createApartmentStore } from '../../../apps/editor/src/core/apartment-store.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { createReconstructionProposal } from '../../../apps/editor/src/core/reconstruction-proposal.js';
import { migrateScene, projectSnapshot } from '../../../apps/editor/src/core/renovation.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { editorToDesigner, proposalToEditor, type EditorBridgeOptions } from '../src/editor-bridge.js';
import { localGeometryErrors } from '../src/local-checks.js';
import { spaceMetrics, itemPolygon, pointInPolygon } from '../src/metrics/space.js';
import { applyOps } from '../src/adapter.js';
import { DesignerSession } from '../src/session.js';

const ceiling: CeilingDesign = { style: 'soft-glow', drop: .15, inset: .3, brightness: 65, temperature: 3000, enabled: true };
// A registered photo-built GLB contract, not a fetched model or a rendering assertion.
const photoChair: CatalogAsset = { id: 'photo-built-chair', name: 'Photo-built chair', category: 'Chairs', kind: 'chair',
  dimensions: [.6, .8, .5], color: '#887766', price: 45000, source: { type: 'gltf', url: '/models/photo-built-chair.glb' } };
const catalog = [...localCatalog, photoChair];
const options: EditorBridgeOptions = { catalog, catalogCurrency: 'AMD', groupPolicy: 'move-together' };

function enrichedDemo(design: CeilingDesign | null = ceiling): SceneDocument {
  const scene = migrateScene(demoScene), project = scene.project!;
  project.mode = 'renovate'; project.currency = 'AMD';
  project.metadata['room-living'] = { ...project.metadata['room-living'], ceilingHeight: 2.7, ceilingDesign: structuredClone(design), notes: 'Preserve the room treatment' };
  project.metadata['room-kitchen'] = { ...project.metadata['room-kitchen'], ceilingDesign: { ...ceiling, enabled: false } };
  project.metadata['room-bath'] = { ...project.metadata['room-bath'], ceilingDesign: null };
  project.sources.push({ id: 'room-photo', name: 'Room reference', kind: 'photo', roomId: 'room-living', url: 'https://example.org/references/living.jpg', notes: 'Original attachment' });
  project.assumptions.push({ id: 'ceiling-measurement', entityId: 'room-living', property: 'ceilingHeight', value: '2.7 m', status: 'measured',
    sourceKind: 'measured', sourceIds: ['room-photo'], rationale: 'Recorded before furnishing', alternatives: [], dependsOn: [] });
  project.materials.push({ id: 'original-finish', name: 'Existing room finish', color: '#f0ebe1', unit: 'm2', unitCost: 3100, thickness: .002, wastePercent: 5, notes: 'Preserve pricing' });
  project.finishes.push({ id: 'floor-finish', entityId: 'room-living', surface: 'floor', materialId: 'original-finish' },
    { id: 'ceiling-finish', entityId: 'room-living', surface: 'ceiling', materialId: 'original-finish' });
  project.tasks.push({ id: 'review-ceiling', title: 'Review ceiling treatment', trade: 'finishes', status: 'todo', entityIds: ['room-living'], dependsOn: [], allowance: 12000, notes: 'Keep this task' });
  project.baseline = projectSnapshot(scene);
  // Inactive alternatives may retain physical systems even though active systems are not modeled by the designer.
  project.baseline.components.push({ id: 'stored-radiator', name: 'Original radiator', kind: 'radiator', position: [-4, .3, 0], dimensions: [.7, .6, .15], rotation: 0, color: '#ffffff', phase: 'existing', roomId: 'room-living' });
  project.baseline.routes.push({ id: 'stored-route', name: 'Original circuit', system: 'electrical', points: [[-4, .3, 0], [-3, .3, 0]], diameter: .02, phase: 'existing' });
  project.options.push({ id: 'saved-layout', name: 'Saved layout', snapshot: structuredClone(project.baseline) });
  project.activeOptionId = 'saved-layout';
  return scene;
}

function paintProposal(scene: SceneDocument, revision: number) {
  const session = new DesignerSession(editorToDesigner(scene, options));
  session.setIntent({ colors: [{ target: 'item', id: 'lounge-chair', color: '#314159' }] });
  const result = session.propose([{ type: 'color', target: 'item', id: 'lounge-chair', color: '#314159' }], 'Apply the requested chair colour.');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return proposalToEditor(result.proposal, scene, revision, options);
}

test.each([
  ['enabled', ceiling], ['disabled', { ...ceiling, enabled: false }], ['null', null],
] as const)('Avani v2 preserves %s room ceilings and all untouched project records after approved designer paint', (_name, design) => {
  const input = enrichedDemo(design), original = structuredClone(input), store = createApartmentStore(input, catalog);
  expect(validateScene(input, catalog).ok).toBe(true);
  const before = structuredClone(store.scene), translated = paintProposal(store.scene, store.revision);
  expect(translated.command.operations).toEqual([{ type: 'update', id: 'lounge-chair', patch: { color: '#314159' } }]);
  expect(store.execute(translated.command, false).ok).toBe(false); expect(store.scene).toEqual(before);
  expect(store.execute(translated.command, true).ok).toBe(true);
  expect(store.scene.objects.find(object => object.id === 'lounge-chair')!.color).toBe('#314159');
  expect(store.scene.project).toEqual(before.project);
  expect(store.scene.project!.metadata['room-living']!.ceilingDesign).toEqual(design);
  expect(store.scene.rooms).toEqual(before.rooms); expect(store.scene.walls).toEqual(before.walls);
  expect(store.scene.objects.filter(object => object.id !== 'lounge-chair')).toEqual(before.objects.filter(object => object.id !== 'lounge-chair'));
  expect(input).toEqual(original); expect(validateScene(store.scene, catalog).ok).toBe(true);
});

test('a ceiling-only edit rejects a stale designer command even though the designer floor-plan view is unchanged', () => {
  const store = createApartmentStore(enrichedDemo(), catalog), beforeView = editorToDesigner(store.scene, options);
  const translated = paintProposal(store.scene, store.revision);
  expect(store.execute({ id: 'human-ceiling', label: 'Disable ceiling lighting', source: 'human', baseRevision: store.revision,
    operations: [{ type: 'set-metadata', id: 'room-living', patch: { ceilingDesign: { ...ceiling, enabled: false } } }] }, true).ok).toBe(true);
  expect(editorToDesigner(store.scene, options)).toEqual(beforeView);
  const afterHuman = structuredClone(store.scene), result = store.execute(translated.command, true);
  expect(result.ok).toBe(false); expect(result.errors.join(' ')).toMatch(/stale/i);
  expect(store.scene).toEqual(afterHuman);
});

test('an approved architect replacement remains the fresh apartment when a registered photo-built GLB is added by the designer', () => {
  const input = enrichedDemo(), original = structuredClone(input), store = createApartmentStore(input, catalog);
  const architect = createReconstructionProposal(store.scene, store.revision, {
    rooms: [{ id: 'fresh-room', name: 'Reconstructed living room', polygon: [[20, 20], [26, 20], [26, 26], [20, 26]], color: '#eeeedd' }],
    walls: [{ id: 'fresh-wall', start: [20, 20], end: [26, 20], thickness: .16, height: 2.7, color: '#eeeeee', openings: [] }],
    notes: ['Measured shell for this test'],
  }, true, 'fresh-apartment');
  expect(architect.command.operations[0]!.type).toBe('replace-scene');
  const oldApartment = structuredClone(store.scene);
  expect(store.execute(architect.command, false).ok).toBe(false); expect(store.scene).toEqual(oldApartment);
  expect(store.execute(architect.command, true).ok).toBe(true);
  expect(store.scene.objects).toEqual([]); expect(store.scene.project!.baseline).toBeUndefined(); expect(store.scene.project!.options).toEqual([]);
  expect(store.scene.project!.sources).toEqual(input.project!.sources.map(({ roomId: _roomId, ...source }) => source));
  const fresh = structuredClone(store.scene), catalogBefore = structuredClone(catalog);
  const session = new DesignerSession(editorToDesigner(store.scene, options));
  session.setIntent({ room_id: 'fresh-room', add: [{ kinds: ['chair'], count: 1 }] });
  const proposed = session.propose([{ type: 'add', item: { id: 'new-chair', room_id: 'fresh-room', kind: 'chair', name: photoChair.name,
    pos: [23, -23], rot: 0, size: [.6, .5, .8], keep: false, sku: photoChair.id, price: photoChair.price } }], 'Add the requested registered chair.');
  if (!proposed.ok) throw new Error(JSON.stringify(proposed.errors));
  const translated = proposalToEditor(proposed.proposal, store.scene, store.revision, options);
  expect(translated.command.operations.map(operation => operation.type)).toEqual(['add']);
  expect(store.execute(translated.command, false).ok).toBe(false); expect(store.scene).toEqual(fresh);
  expect(store.execute(translated.command, true).ok).toBe(true);
  expect(store.scene.objects).toEqual([{ id: 'new-chair', name: photoChair.name, assetId: photoChair.id, position: [23, 0, 23], rotation: 0, scale: [1, 1, 1] }]);
  expect({ ...store.scene, objects: [] }).toEqual(fresh);
  expect(store.registerCatalogAssets([]).find(asset => asset.id === photoChair.id)).toEqual(photoChair);
  expect(catalog).toEqual(catalogBefore); expect(input).toEqual(original);
  expect(validateScene(store.scene, catalog).ok).toBe(true);
  expect(store.undo().ok).toBe(true); expect(store.scene).toEqual(fresh);
  expect(store.redo().ok).toBe(true); expect(store.scene.objects[0]!.assetId).toBe(photoChair.id);
});

test.each(['components', 'routes', 'elevation'] as const)('current %s preserves the v2 document with fixed services or an explicit elevation error', kind => {
  const scene = enrichedDemo();
  if (kind === 'components') scene.project!.components = structuredClone(scene.project!.baseline!.components);
  if (kind === 'routes') scene.project!.routes = structuredClone(scene.project!.baseline!.routes);
  if (kind === 'elevation') scene.project!.metadata['room-living']!.elevation = .2;
  const original = structuredClone(scene);
  expect(validateScene(scene, catalog).ok).toBe(true);
  if (kind === 'elevation') expect(() => editorToDesigner(scene, options)).toThrow(/elevat|floor/i);
  else {
    const converted = editorToDesigner(scene, options), obstacle = converted.fixed[0]!;
    expect(converted.fixed).toHaveLength(1);
    expect(obstacle.keep).toBe(true);
    expect(obstacle.structure!.wall_id).toContain(kind === 'components' ? 'stored-radiator' : 'stored-route');
    expect(obstacle.price).toBeUndefined();
    expect(() => applyOps(converted, [{ type: 'remove', id: obstacle.id }])).toThrow(/fixed/);
    const probe = { id: 'probe', name: 'Chair', kind: 'chair', room_id: 'room-living', pos: obstacle.pos, rot: 0, size: [.2, .2, .8] as [number, number, number], keep: false };
    expect(localGeometryErrors({ ...converted, items: [probe] }).some(error => error.wall_id === obstacle.structure!.wall_id)).toBe(true);
    const circulation = spaceMetrics(converted);
    expect(circulation.free_area_m2).toBeLessThan(spaceMetrics({ ...converted, fixed: [] }).free_area_m2);
    const paths = circulation.rooms.flatMap(room => room.walkways).filter(walk => walk.reachable);
    expect(paths.length).toBeGreaterThan(0);
    for (const walk of paths) for (let i = 1; i < walk.path.length; i++) {
      const a = walk.path[i - 1]!, b = walk.path[i]!, steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .01));
      for (let step = 0; step <= steps; step++) expect(pointInPolygon([a[0] + (b[0] - a[0]) * step / steps, a[1] + (b[1] - a[1]) * step / steps], itemPolygon(obstacle))).toBe(false);
    }
  }
  expect(scene).toEqual(original);
});
