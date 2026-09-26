import { buildFinishOperations, getFinishPreset } from './finish-presets';
import { demoScene, localCatalog } from './demo';
import { EditorStore } from './store';
import { finishAppearance } from '../render/finish-material';

let assertions = 0;
function check(value: unknown, label: string): asserts value {
  assertions++;
  if (!value) throw new Error(label);
}
for (const [id, texture] of [['oak', 'oak'], ['walnut', 'walnut'], ['limestone', 'travertine'], ['porcelain', 'marble']]) {
  const preset = getFinishPreset(id!)!;
  check(Reflect.get(preset, 'texture') === texture, `${id} must identify its real texture set`);
  const store = new EditorStore(demoScene, localCatalog);
  const result = store.execute({ id: `texture-${id}`, source: 'human', baseRevision: 0, label: `Apply ${id}`, operations: buildFinishOperations(store.scene, preset, 'room-living', 'floor') }, true);
  check(result.ok, result.errors.join(' '));
  const appearance = () => finishAppearance(store.scene, 'room-living', 'floor', '#ffffff');
  check(Reflect.get(appearance(), 'texture') === texture, `${id}: checked assignment renders its texture`);
  const saved = JSON.parse(JSON.stringify(store.scene));
  check(Reflect.get(finishAppearance(saved, 'room-living', 'floor', '#ffffff'), 'texture') === texture, `${id}: texture identity survives JSON round trip`);
  store.undo();
  check(Reflect.get(appearance(), 'texture') === undefined, `${id}: undo restores the untextured original`);
  store.redo();
  check(Reflect.get(appearance(), 'texture') === texture, `${id}: redo restores the texture`);
  const material = store.scene.project!.materials[0]!;
  const tint = store.execute({ id: `tint-${id}`, source: 'human', baseRevision: store.revision, label: 'Tint material', operations: [{ type: 'upsert-material', material: { ...material, color: '#cdbca2' } }] }, true);
  check(tint.ok, 'Tint accepted through the checked store');
  check(appearance().color === '#cdbca2' && Reflect.get(appearance(), 'texture') === texture, `${id}: custom tint preserves the texture`);
}
check(Reflect.get(getFinishPreset('chalk')!, 'texture') === undefined, 'Paint stays untextured');
console.log(`Finish texture preset checks passed (${assertions} assertions).`);
