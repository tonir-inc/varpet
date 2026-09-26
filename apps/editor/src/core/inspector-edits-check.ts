/** Inspector choices must use checked transactions and preserve scene identity. */
import type { CatalogAsset, EntityMetadata, Operation, SceneDocument } from '../contracts';
import { demoScene, localCatalog } from './demo';
import { OPENING_TYPES, buildAssetReplacementOperations, buildOpeningTypeOperations } from './inspector-edits';
import { parseScene, serializeScene } from './persistence';
import { migrateScene, projectSnapshot } from './renovation';
import { EditorStore } from './store';

let assertions = 0;
let scenarios = 0;
let commandId = 0;
const failures: string[] = [];
function assert(condition: unknown, message: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}
function check(name: string, run: () => void): void {
  scenarios++;
  try { run(); }
  catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
}
function execute(store: EditorStore, operations: Operation[]) {
  return store.execute({ id: `inspector-${commandId++}`, label: 'Inspector edit', source: 'human', baseRevision: store.revision, operations }, true);
}
function apply(store: EditorStore, operations: Operation[]): void {
  const result = execute(store, operations);
  assert(result.ok, result.errors.join(' '));
}
function rejects(build: () => Operation[], message: string): void {
  let rejected = false;
  try { build(); } catch (error) { rejected = error instanceof Error && error.message.length > 0; }
  assert(rejected, message);
}
function withReferences(): SceneDocument {
  const scene = migrateScene(demoScene);
  const project = scene.project!;
  project.metadata['living-olive'] = { name: 'Keep greenery here', notes: 'By the window', phase: 'retain', review: 'reviewed' };
  project.sources.push({ id: 'plant-source', kind: 'photo', name: 'Existing plant photo' });
  project.assumptions.push({ id: 'plant-fit', entityId: 'living-olive', property: 'width', value: '0.58 m', status: 'accepted', sourceKind: 'observed', sourceIds: ['plant-source'], rationale: 'Existing pot', alternatives: [] });
  project.assumptions.push({ id: 'plant-spacing', entityId: 'sofa', property: 'clearance', value: 'Clear', status: 'verified', sourceKind: 'inferred', sourceIds: ['plant-source'], rationale: 'Plant clearance', alternatives: [], dependsOn: ['plant-fit'] });
  project.tasks.push({ id: 'plant-task', title: 'Select plant', trade: 'Decorating', status: 'todo', entityIds: ['living-olive'], dependsOn: [], allowance: 100 });
  project.baseline = projectSnapshot(scene);
  project.options.push({ id: 'saved-layout', name: 'Original', snapshot: projectSnapshot(scene) });
  return scene;
}

check('Opening choices include every supported door and window variant', () => {
  equal(OPENING_TYPES.door.map(option => option.value), ['hinged', 'double', 'sliding', 'pocket'], 'Door choices are complete');
  equal(OPENING_TYPES.window.map(option => option.value), ['fixed', 'casement', 'tilt', 'sliding', 'double'], 'Window choices are complete');
  assert([...OPENING_TYPES.door, ...OPENING_TYPES.window].every(option => option.label.trim()), 'Every choice has a visible label');
});

check('An unspecified opening records its chosen type and migrates only on commit', () => {
  for (const [id, mechanism] of [['door-entry', 'hinged'], ['window-west', 'fixed']] as const) {
    const store = new EditorStore(demoScene, localCatalog);
    const before = serializeScene(store.scene);
    const operations = buildOpeningTypeOperations(store.scene, id, mechanism);
    assert(operations[0]?.type === 'migrate-project', 'Version 1 migration is explicit');
    assert(serializeScene(store.scene) === before, 'Building an opening choice never mutates the scene');
    apply(store, operations);
    assert(store.scene.version === 2 && store.scene.project?.metadata[id]?.mechanism === mechanism, 'Choosing a renderer fallback records an explicit type');
    equal(store.scene.walls, demoScene.walls, 'Opening dimensions and wall geometry are unchanged');
    assert(buildOpeningTypeOperations(store.scene, id, mechanism).length === 0, 'An explicitly chosen current type is a no-op');
    const after = serializeScene(store.scene);
    assert(store.undo().ok && serializeScene(store.scene) === before, 'Undo restores the original v1 scene');
    assert(store.redo().ok && serializeScene(store.scene) === after, 'Redo restores the selected type');
    equal(parseScene(after, localCatalog), store.scene, 'The selected type survives JSON persistence');
  }
});

check('Every opening type commits without erasing other opening properties', () => {
  for (const kind of ['door', 'window'] as const) {
    const id = kind === 'door' ? 'door-entry' : 'window-west';
    const variants: EntityMetadata['mechanism'][] = kind === 'door' ? ['hinged', 'double', 'sliding', 'pocket'] : ['fixed', 'casement', 'tilt', 'sliding', 'double'];
    for (const value of variants) {
      const scene = migrateScene(demoScene);
      const details: EntityMetadata = { name: 'Custom opening', hinge: 'right', swing: -1, leafThickness: 0.04, frameWidth: 0.06, notes: 'Keep hardware', phase: 'retain' };
      scene.project!.metadata[id] = details;
      const store = new EditorStore(scene, localCatalog);
      apply(store, buildOpeningTypeOperations(store.scene, id, value));
      equal(store.scene.project!.metadata[id], { ...details, mechanism: value }, `${kind} ${value} preserves non-type metadata`);
      equal(store.scene.walls, scene.walls, `${kind} ${value} preserves geometry`);
    }
  }
});

check('Opening changes follow renovation review and invalidate dependent assumptions', () => {
  const scene = migrateScene(demoScene);
  scene.project!.mode = 'renovate';
  scene.project!.metadata['door-entry'] = { phase: 'retain', mechanism: 'hinged' };
  scene.project!.assumptions.push({ id: 'door-assumption', entityId: 'door-entry', property: 'mechanism', value: 'Hinged', status: 'accepted', sourceKind: 'inferred', sourceIds: [], rationale: 'Photo', alternatives: [] });
  const store = new EditorStore(scene, localCatalog);
  apply(store, buildOpeningTypeOperations(store.scene, 'door-entry', 'sliding'));
  equal(store.scene.project!.metadata['door-entry'], { phase: 'replace', mechanism: 'sliding', review: 'required' }, 'An existing opening becomes a reviewed replacement');
  assert(store.scene.project!.metadata['wall-south']?.phase === 'replace', 'The host wall follows normal opening alteration semantics');
  assert(store.scene.project!.assumptions[0]?.status === 'stale', 'Type evidence becomes stale');
  const newScene = migrateScene(demoScene);
  newScene.project!.mode = 'renovate';
  newScene.project!.metadata['window-west'] = { phase: 'new' };
  const newStore = new EditorStore(newScene, localCatalog);
  apply(newStore, buildOpeningTypeOperations(newStore.scene, 'window-west', 'casement'));
  assert(newStore.scene.project!.metadata['window-west']?.phase === 'new', 'A new opening remains new');
});

check('Missing, invalid, locked and removed opening choices are rejected without mutations', () => {
  const store = new EditorStore(demoScene, localCatalog);
  const before = serializeScene(store.scene);
  rejects(() => buildOpeningTypeOperations(store.scene, 'missing', 'hinged'), 'A missing opening rejects');
  rejects(() => buildOpeningTypeOperations(store.scene, 'door-entry', 'fixed'), 'A window-only type cannot be assigned to a door');
  rejects(() => buildOpeningTypeOperations(store.scene, 'window-west', 'pocket'), 'A door-only type cannot be assigned to a window');
  rejects(() => buildOpeningTypeOperations(store.scene, 'door-entry', undefined), 'An absent mechanism rejects');
  for (const entityId of ['door-entry', 'wall-south']) {
    for (const metadata of [{ locked: true }, { phase: 'remove' }] as EntityMetadata[]) {
      const scene = migrateScene(demoScene);
      scene.project!.metadata[entityId] = metadata;
      const guarded = new EditorStore(scene, localCatalog);
      const prior = serializeScene(guarded.scene);
      rejects(() => buildOpeningTypeOperations(guarded.scene, 'door-entry', 'sliding'), 'Opening and host edit guards are enforced');
      assert(serializeScene(guarded.scene) === prior && guarded.revision === 0 && !guarded.canUndo, 'A rejected choice has no history or scene effect');
    }
  }
  assert(serializeScene(store.scene) === before && store.revision === 0, 'Invalid choices leave the original scene unchanged');
});

check('Decoration replacement keeps its location, identity and project references', () => {
  const scene = withReferences();
  const store = new EditorStore(scene, localCatalog);
  const before = serializeScene(store.scene);
  const operations = buildAssetReplacementOperations(store.scene, localCatalog, 'living-olive', 'plant-small');
  assert(serializeScene(store.scene) === before, 'Building a replacement never mutates the source');
  apply(store, operations);
  const original = scene.objects.find(object => object.id === 'living-olive')!;
  const replacement = store.scene.objects.find(object => object.id === 'living-olive')!;
  equal(replacement, { ...original, assetId: 'plant-small', color: localCatalog.find(asset => asset.id === 'plant-small')!.color, scale: [1, 1, 1] }, 'Replacement keeps stable ID, custom name, position and rotation');
  equal(store.scene.objects.filter(object => object.id !== original.id), scene.objects.filter(object => object.id !== original.id), 'Other objects are untouched');
  equal(store.scene.project!.metadata, scene.project!.metadata, 'Metadata stays associated with the same object');
  equal(store.scene.project!.tasks, scene.project!.tasks, 'Tasks keep their entity references');
  equal(store.scene.project!.sources, scene.project!.sources, 'Source evidence stays available');
  equal(store.scene.project!.baseline, scene.project!.baseline, 'Baseline stays unchanged');
  equal(store.scene.project!.options, scene.project!.options, 'Saved options stay unchanged');
  equal(store.scene.project!.assumptions, scene.project!.assumptions.map(assumption => ({ ...assumption, status: 'stale' })), 'Direct and dependent assumptions retain their references and become stale');
  assert(buildAssetReplacementOperations(store.scene, localCatalog, original.id, 'plant-small').length === 0, 'Choosing the current asset is a no-op');
  const after = serializeScene(store.scene);
  assert(store.undo().ok && serializeScene(store.scene) === before, 'Undo restores the original asset and evidence');
  assert(store.redo().ok && serializeScene(store.scene) === after, 'Redo restores the replacement');
  equal(parseScene(after, localCatalog), store.scene, 'Replacement survives JSON persistence');
});

check('Furniture replacement updates catalog naming, scale and color', () => {
  const scene = structuredClone(demoScene);
  const original = scene.objects.find(object => object.id === 'sofa')!;
  original.scale = [0.9, 0.9, 0.9];
  original.color = '#123456';
  const store = new EditorStore(scene, localCatalog);
  apply(store, buildAssetReplacementOperations(store.scene, localCatalog, original.id, 'chair-clay'));
  const object = store.scene.objects.find(item => item.id === original.id)!;
  const asset = localCatalog.find(item => item.id === 'chair-clay')!;
  assert(object.name === asset.name && object.assetId === asset.id && object.color === asset.color, 'A catalog name and color follow the new asset');
  equal(object.scale, [1, 1, 1], 'Replacement uses its default dimensions');
  equal(object.position, original.position, 'Furniture stays at its original position');
  assert(object.rotation === original.rotation, 'Furniture keeps its orientation');
  assert(store.scene.version === 1, 'Furniture replacement does not require project migration');
});

check('Renovation asset replacements are marked for review while new items remain new', () => {
  for (const phase of ['retain', 'new'] as const) {
    const scene = withReferences();
    scene.project!.mode = 'renovate';
    scene.project!.metadata['living-olive']!.phase = phase;
    const store = new EditorStore(scene, localCatalog);
    apply(store, buildAssetReplacementOperations(store.scene, localCatalog, 'living-olive', 'plant-small'));
    equal(store.scene.project!.metadata['living-olive'], { ...scene.project!.metadata['living-olive'], phase: phase === 'new' ? 'new' : 'replace', review: 'required' }, 'Replacement follows renovation phase/review rules');
  }
});

check('Missing, cross-category, locked and removed assets are rejected', () => {
  const scene = withReferences();
  const original = serializeScene(scene);
  rejects(() => buildAssetReplacementOperations(scene, localCatalog, 'missing', 'plant-small'), 'A missing object rejects');
  rejects(() => buildAssetReplacementOperations(scene, localCatalog, 'living-olive', 'missing'), 'A missing replacement rejects');
  rejects(() => buildAssetReplacementOperations(scene, localCatalog.filter(asset => asset.id !== 'plant-olive'), 'living-olive', 'plant-small'), 'A missing current catalog entry rejects');
  rejects(() => buildAssetReplacementOperations(scene, localCatalog, 'living-olive', 'sofa-sage'), 'Cross-category replacement rejects');
  assert(serializeScene(scene) === original, 'Invalid asset choices do not mutate the source');
  for (const metadata of [{ locked: true }, { phase: 'remove' }] as EntityMetadata[]) {
    const guarded = withReferences();
    guarded.project!.metadata['living-olive'] = metadata;
    const store = new EditorStore(guarded, localCatalog);
    rejects(() => buildAssetReplacementOperations(store.scene, localCatalog, 'living-olive', 'plant-small'), 'Object lock and removal guards are enforced');
    assert(store.revision === 0 && !store.canUndo, 'A rejected replacement never adds history');
  }
});

check('An out-of-bounds v1 replacement is rejected atomically by the real store', () => {
  const huge: CatalogAsset = { ...localCatalog.find(asset => asset.id === 'plant-small')!, id: 'plant-huge', dimensions: [20, 1, 20] };
  const catalog = [...localCatalog, huge];
  // Version 2 intentionally reports placement conflicts as warnings; v1 rejects them.
  const store = new EditorStore(demoScene, catalog);
  const before = serializeScene(store.scene);
  const result = execute(store, buildAssetReplacementOperations(store.scene, catalog, 'living-olive', huge.id));
  assert(!result.ok && result.errors.some(error => /floor|outside/i.test(error)), 'Replacement must satisfy the complete floor containment check');
  assert(serializeScene(store.scene) === before && store.revision === 0 && !store.canUndo, 'A rejected replacement preserves source and history');
});

if (failures.length) throw new Error(`Inspector regressions failed (${failures.length}):\n${failures.join('\n')}`);
console.log(`Inspector regressions passed: ${assertions} assertions across ${scenarios} scenarios.`);
