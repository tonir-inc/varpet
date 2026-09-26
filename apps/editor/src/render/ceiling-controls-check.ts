import * as THREE from 'three';
import type { BuildingComponent, CeilingStyle, Operation, SceneDocument } from '../contracts';
import { defaultCeilingDesign } from '../core/ceiling-design';
import { analyzeProject, migrateScene } from '../core/renovation';
import { EditorStore } from '../core/store';
import { validateScene } from '../core/validation';
import { disposeObject } from './assets';
import { applyCeilingIndirectLight, makeCeilingDesigns, updateCeilingDesignLighting, updateCeilingIndirectLighting } from './ceiling-design';
import { LightingPreview, makeServices } from './services';
import { WalkthroughControls } from './walkthrough-controls';

let assertions = 0;
function assert(condition: unknown, message: string): asserts condition { assertions++; if (!condition) throw new Error(message); }
const close = (a: number, b: number) => Math.abs(a - b) < 1e-8;
function wallSwitch(id: string, targets: string[]): BuildingComponent {
  return { id, name: id, kind: 'switch', position: [.1, 1.1, .1], dimensions: [.08, .08, .025], rotation: 0, color: '#ffffff', phase: 'existing', control: { type: 'dimmer', targets, gangs: 1 } };
}
function source(style: CeilingStyle = 'quiet', enabled = true): SceneDocument {
  const scene = migrateScene({ format: 'varpet.editor', version: 1, id: 'ceiling-controls', name: 'Ceiling controls', units: 'm', upAxis: 'Y', walls: [], objects: [], rooms: [
    { id: 'room', name: 'Living', color: '#ffffff', polygon: [[0, 0], [6, 0], [6, 5], [0, 5]] },
    { id: 'other', name: 'Bedroom', color: '#ffffff', polygon: [[6, 0], [12, 0], [12, 5], [6, 5]] },
  ] });
  for (const room of scene.rooms) scene.project!.metadata[room.id] = { ceilingHeight: 3, ceilingDesign: { ...defaultCeilingDesign(style), enabled } };
  scene.project!.components = [wallSwitch('switch-a', ['room']), wallSwitch('switch-b', ['room']), wallSwitch('switch-other', ['other'])];
  return scene;
}
function lights(root: THREE.Object3D): THREE.Light[] { const items: THREE.Light[] = []; root.traverse(item => { if (item instanceof THREE.Light) items.push(item); }); return items; }
function emissions(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const items = new Set<THREE.MeshStandardMaterial>();
  root.traverse(item => { if (item instanceof THREE.Mesh) for (const material of Array.isArray(item.material) ? item.material : [item.material]) if (material instanceof THREE.MeshStandardMaterial && (material.userData.ceilingEmitter || material.userData.ceilingIndirectIntensity != null)) items.add(material); });
  return [...items];
}
const base = source(), saved = JSON.stringify(base), preview = new LightingPreview();
assert(validateScene(base, []).ok, 'Room ceiling IDs are valid explicit switch targets');
assert(!analyzeProject(base, []).issues.some(issue => issue.id === 'switch:switch-a'), 'Room ceiling targets satisfy the switch connection issue');
preview.setScene(base);
assert(preview.getSwitchLevel('switch-a') === 1, 'Saved-on ceilings initialize switches on');
preview.toggleSwitch('switch-a');
assert(preview.getLightLevel('room') === 0 && preview.getSwitchLevel('switch-b') === 0 && preview.getLightLevel('other') === 1, 'Two-way switch state is shared by target and isolated from another room');
preview.setSwitchLevel('switch-b', .35); preview.toggleSwitch('switch-a'); preview.toggleSwitch('switch-b');
assert(close(preview.getSwitchLevel('switch-a'), .35), 'Off/on restores the previous room dimmer setting');
preview.setAutomaticLevel(0); assert(close(preview.getLightLevel('room'), .35) && preview.getLightLevel('other') === 0, 'Explicit room dimming overrides daylight fallback');
preview.setAutomaticLevel(1); preview.setSwitchLevel('switch-a', 0); preview.setAutomaticLevel(0); preview.setAutomaticLevel(1);
assert(preview.getLightLevel('room') === 0, 'An explicit switch-off survives automatic day/night changes');
preview.setScene(structuredClone(base)); assert(preview.getLightLevel('room') === 0, 'Unrelated scene refresh preserves temporary switch state');
preview.setSwitchLevel('switch-a', Infinity); assert(preview.getLightLevel('room') === 0, 'Invalid dimmer input cannot corrupt state');
preview.setSwitchLevel('switch-a', 2); assert(preview.getLightLevel('room') === 1, 'Finite dimmer input is clamped');
const otherDocument = structuredClone(base); otherDocument.id = 'another-document'; preview.setScene(otherDocument);
assert(preview.levels.size === 0, 'Opening another document clears temporary circuit state');
assert(JSON.stringify(base) === saved, 'Testing light controls never changes scene JSON');

for (const style of ['quiet', 'soft-glow', 'architectural'] as const) {
  const scene = source(style, false), state = new LightingPreview(); state.setScene(scene);
  const projection = makeCeilingDesigns(scene, 'room'), room = projection.children[0]!, geometry = room.children.slice();
  const update = () => updateCeilingDesignLighting(projection, id => state.getLightLevel(id));
  update(); assert(lights(projection).length === 0 && emissions(room).every(material => material.emissiveIntensity === 0), `${style}: saved-off design has no active sources or glow`);
  state.toggleSwitch('switch-a'); update();
  assert(lights(room).length > 0 && lights(room).every(light => light.intensity > 0), `${style}: a switch can turn on a saved-off ceiling`);
  assert(emissions(room).every(material => material.emissiveIntensity > 0), `${style}: visible emitters and panel bounce turn on together`);
  const intensities = lights(room).map(light => light.intensity), lightIdentities = lights(room), materials = emissions(room).map(material => material.emissiveIntensity);
  state.setSwitchLevel('switch-b', .25); update();
  assert(lights(room).every((light, index) => light === lightIdentities[index] && close(light.intensity, intensities[index]! * .25)), `${style}: dimming reuses lights and scales actual intensity`);
  assert(emissions(room).every((material, index) => close(material.emissiveIntensity, materials[index]! * .25)), `${style}: dimming scales all visible emission`);
  state.toggleSwitch('switch-a'); update();
  assert(lights(room).length === 0 && emissions(room).every(material => material.emissiveIntensity === 0), `${style}: switch-off removes real sources and every glow`);
  state.toggleSwitch('switch-b'); update();
  assert(lights(room).every((light, index) => close(light.intensity, intensities[index]! * .25)), `${style}: room relights at its prior dimmer level`);
  assert(room.children.every((child, index) => child === geometry[index]), `${style}: switching keeps physical fixture geometry unchanged`);
  disposeObject(projection);
}

const material = new THREE.MeshStandardMaterial({ color: '#ffffff' }), ceiling = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
applyCeilingIndirectLight(material, { ...defaultCeilingDesign('quiet'), enabled: false });
updateCeilingIndirectLighting(ceiling, 1); assert(material.emissiveIntensity > 0, 'Structural ceiling bounce can turn on from saved-off');
const fullBounce = material.emissiveIntensity; updateCeilingIndirectLighting(ceiling, .2); assert(close(material.emissiveIntensity, fullBounce * .2), 'Structural ceiling bounce follows room dimming');
updateCeilingIndirectLighting(ceiling, 0); assert(material.emissiveIntensity === 0, 'Structural ceiling bounce turns fully off'); disposeObject(ceiling);

const services = makeServices(base); preview.setScene(base); preview.setSwitchLevel('switch-a', 0);
services.applyLighting(preview.levels, null, id => preview.getSwitchLevel(id));
assert(services.components.get('switch-a')!.userData.toggles[0].rotation.x < 0, 'Physical room switch rocker shows off');
preview.toggleSwitch('switch-b'); services.applyLighting(preview.levels, null, id => preview.getSwitchLevel(id));
assert(services.components.get('switch-a')!.userData.toggles[0].rotation.x > 0, 'Another switch updates the same room rocker'); disposeObject(services.group);

const many = source();
for (let index = 2; index < 12; index++) {
  const id = `room-${index}`; many.rooms.push({ ...many.rooms[0]!, id, polygon: [[index * 6, 0], [index * 6 + 6, 0], [index * 6 + 6, 5], [index * 6, 5]] });
  many.project!.metadata[id] = { ceilingHeight: 3, ceilingDesign: defaultCeilingDesign('quiet') };
}
const budget = makeCeilingDesigns(many, 'room'), levels = new Map(many.rooms.map(room => [room.id, 1]));
for (const level of [0, 1, 0, .5]) {
  levels.set('room', level); updateCeilingDesignLighting(budget, id => levels.get(id) ?? 0);
  assert(lights(budget).length === 8 && lights(budget).filter(light => light.castShadow).length <= 3, 'Switch changes reallocate eight lights and at most three shadow maps');
}
disposeObject(budget);

const store = new EditorStore(base, []);
const execute = (operations: Operation[]) => store.execute({ id: crypto.randomUUID(), source: 'human', baseRevision: store.revision, label: 'Ceiling controls', operations }, true);
assert(execute([{ type: 'set-metadata', id: 'room', patch: { ceilingDesign: null } }]).ok, 'Restoring a plain ceiling permits existing inert control links');
preview.setScene(store.scene); preview.toggleSwitch('switch-a'); assert(preview.getLightLevel('room') === 0, 'Plain ceiling links are inert');
store.undo(); preview.setScene(store.scene); assert(preview.getLightLevel('room') === 1, 'Undo restores default ceiling state after inert state is removed');
assert(execute([{ type: 'set-metadata', id: 'room', patch: { phase: 'remove' } }]).ok, 'Marking a ceiling room removed keeps valid inert links');
preview.setScene(store.scene); preview.setSwitchLevel('switch-a', 1); assert(preview.getLightLevel('room') === 0, 'Removed ceiling links never illuminate');
store.undo();
assert(execute([{ type: 'set-metadata', id: 'room', patch: { zone: 'terrace', ceilingDesign: null } }]).ok, 'Outdoor conversion can keep an inert room target');
preview.setScene(store.scene); preview.toggleSwitch('switch-a'); assert(preview.getLightLevel('room') === 0, 'Outdoor ceiling links never illuminate');
const removedSwitch = source(); removedSwitch.project!.metadata['switch-a'] = { phase: 'remove' }; preview.setScene(removedSwitch); preview.toggleSwitch('switch-a'); assert(preview.levels.size === 0, 'A switch marked removed in metadata cannot change circuit state');
const broken = source(); broken.project!.components[0]!.control!.targets = ['missing']; assert(!validateScene(broken, []).ok, 'Missing target IDs remain invalid');
broken.project!.components[0]!.control!.targets = ['switch-b']; assert(!validateScene(broken, []).ok, 'A switch cannot target another switch');

// Exercise the same captured pointer stream as Inside mode without WebGL.
const globals = new Map(['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const doc = Object.assign(new EventTarget(), { activeElement: null as unknown, hidden: false, querySelector: () => null });
const media = Object.assign(new EventTarget(), { matches: false });
const win = Object.assign(new EventTarget(), { matchMedia: () => media });
const captures = new Set<number>();
const canvas = Object.assign(new EventTarget(), { style: { cursor: '' }, focus: () => { doc.activeElement = canvas; }, setPointerCapture: (id: number) => captures.add(id), hasPointerCapture: (id: number) => captures.has(id), releasePointerCapture: (id: number) => { captures.delete(id); } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: win }); Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
let taps = 0;
const walk = new WalkthroughControls(new THREE.PerspectiveCamera(), canvas as unknown as HTMLCanvasElement, position => position, () => {}, () => taps++);
function pointer(type: string, x = 10, y = 10) { const event = new Event(type, { cancelable: true }); Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y }); canvas.dispatchEvent(event); }
try {
  walk.setEnabled(true); pointer('pointerdown'); pointer('pointerup'); assert(taps === 1, 'An Inside tap activates the interaction callback once');
  pointer('pointerdown'); pointer('pointermove', 60); pointer('pointermove', 10); pointer('pointerup'); assert(Number(taps) === 1, 'Looking away and back does not turn a light off');
  pointer('pointerdown'); pointer('pointercancel'); pointer('pointerup'); assert(Number(taps) === 1, 'Cancelled gestures cannot trigger a switch');
  walk.setEnabled(false); pointer('pointerdown'); pointer('pointerup'); assert(Number(taps) === 1, 'Outside mode does not invoke Inside taps');
} finally {
  walk.dispose();
  for (const [key, descriptor] of globals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
}
console.log(`Ceiling control checks passed (${assertions} assertions).`);
