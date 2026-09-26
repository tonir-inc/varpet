/** Finish identity and material editing regressions through the scene write boundary. */
import type { FinishMaterial, Operation } from '../contracts';
import { finishAppearance } from '../render/finish-material';
import { demoScene, localCatalog } from './demo';
import { FINISH_PRESETS, buildFinishOperations, getFinishPreset, getPresetForMaterial, materialForPreset } from './finish-presets';
import { migrateScene } from './renovation';
import { EditorStore } from './store';

let assertions = 0;
let commandId = 0;
const failures: string[] = [];
function assert(condition: unknown, message: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(message);
}
function check(name: string, run: () => void): void {
  try { run(); }
  catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
}
function apply(store: EditorStore, operations: Operation[]): void {
  const result = store.execute({ id: `finish-check-${commandId++}`, label: 'Finish check', source: 'human', baseRevision: store.revision, operations }, true);
  assert(result.ok, result.errors.join(' '));
}
function assignedMaterial(store: EditorStore, entityId = 'room-living'): FinishMaterial {
  const assignment = store.scene.project!.finishes.find(finish => finish.entityId === entityId && finish.surface === 'floor');
  const material = store.scene.project!.materials.find(item => item.id === assignment?.materialId);
  assert(material, 'Floor has an assigned material');
  return material;
}
const oak = getFinishPreset('oak')!;

check('Editing a floor color preserves its procedural surface', () => {
  for (const preset of FINISH_PRESETS.filter(item => item.category === 'floor')) {
    const store = new EditorStore(demoScene, localCatalog);
    apply(store, buildFinishOperations(store.scene, preset, 'room-living', 'floor'));
    const before = finishAppearance(store.scene, 'room-living', 'floor', '#ffffff');
    const changed = { ...assignedMaterial(store), color: '#aabbcc' };
    apply(store, [{ type: 'upsert-material', material: changed }]);
    assert(getPresetForMaterial(changed)?.id === preset.id, `${preset.name} still has its preset identity after a color edit`);
    const after = finishAppearance(store.scene, 'room-living', 'floor', '#ffffff');
    assert(after.color === changed.color, `${preset.name} renders the edited color`);
    assert(after.pattern === before.pattern && after.pattern !== 0, `${preset.name} keeps its surface pattern`);
    assert(after.size.join() === before.size.join(), `${preset.name} keeps its repeat dimensions`);
  }
});

check('Choosing the original sample after editing creates a separate material', () => {
  const store = new EditorStore(demoScene, localCatalog);
  apply(store, buildFinishOperations(store.scene, oak, 'room-living', 'floor'));
  const edited = { ...assignedMaterial(store), name: 'Custom tinted oak', color: '#aabbcc', unitCost: 79 };
  apply(store, [{ type: 'upsert-material', material: edited }]);
  const finishId = store.scene.project!.finishes[0]!.id;
  const operations = buildFinishOperations(store.scene, oak, 'room-living', 'floor');
  assert(operations.length > 0, 'The original sample is not a no-op after the tint changed');
  apply(store, operations);
  assert(assignedMaterial(store).color === oak.color, 'The chosen sample restores its original color');
  assert(assignedMaterial(store).id !== edited.id, 'The tinted material keeps its independent identity');
  assert(JSON.stringify(store.scene.project!.materials.find(item => item.id === edited.id)) === JSON.stringify(edited), 'Existing tinted material and quote stay unchanged');
  assert(store.scene.project!.finishes[0]!.id === finishId, 'The surface keeps one stable assignment');
  assert(buildFinishOperations(store.scene, oak, 'room-living', 'floor').length === 0, 'Choosing the same unmodified sample is a no-op');
  apply(store, buildFinishOperations(store.scene, oak, 'room-bedroom', 'floor'));
  assert(assignedMaterial(store, 'room-bedroom').id === assignedMaterial(store).id, 'Another room reuses the matching original sample');
  assert(store.scene.project!.materials.length === 2, 'Reusing the sample does not add duplicate material records');
});

check('An unrelated material cannot claim a sample by its ID or color', () => {
  const scene = migrateScene(demoScene);
  const custom: FinishMaterial = { ...materialForPreset(oak), notes: 'Supplier quote', name: 'Custom flooring', unitCost: 65 };
  scene.project!.materials.push(custom);
  const store = new EditorStore(scene, localCatalog);
  assert(getPresetForMaterial(custom) === undefined, 'An ID and color match alone do not identify a built-in finish');
  apply(store, buildFinishOperations(store.scene, oak, 'room-living', 'floor'));
  assert(assignedMaterial(store).id !== custom.id, 'The sample gets a collision-free ID');
  assert(getPresetForMaterial(assignedMaterial(store))?.id === oak.id, 'Collision-free material keeps its pattern identity');
  assert(JSON.stringify(store.scene.project!.materials[0]) === JSON.stringify(custom), 'Custom material is never overwritten');
});

check('A quoted but untinted sample is reused without overwriting its price', () => {
  const scene = migrateScene(demoScene);
  const quoted = { ...materialForPreset(oak), color: oak.color.toUpperCase(), unitCost: 45 };
  scene.project!.materials.push(quoted);
  const store = new EditorStore(scene, localCatalog);
  apply(store, buildFinishOperations(store.scene, oak, 'room-living', 'floor'));
  assert(assignedMaterial(store).id === quoted.id, 'Color equality is case-insensitive');
  assert(assignedMaterial(store).unitCost === 45, 'The supplied price remains intact');
  assert(store.scene.project!.materials.length === 1, 'Matching material is reused');
});

check('Wood grain runs along 120 cm planks with 18 cm row spacing', () => {
  for (const preset of FINISH_PRESETS.filter(item => item.pattern === 'wood')) {
    const store = new EditorStore(demoScene, localCatalog);
    apply(store, buildFinishOperations(store.scene, preset, 'room-living', 'floor'));
    const appearance = finishAppearance(store.scene, 'room-living', 'floor', '#ffffff');
    assert(appearance.size[0] === 1.2, `${preset.name} long grain axis repeats every 120 cm`);
    assert(appearance.size[1] === 0.18, `${preset.name} plank rows repeat every 18 cm`);
  }
});

if (failures.length) throw new Error(`Finish regressions failed (${failures.length}):\n${failures.join('\n')}`);
console.log(`Finish regressions passed: ${assertions} assertions across 5 scenarios.`);
