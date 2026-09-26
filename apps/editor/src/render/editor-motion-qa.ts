/** Browser-only development harness. Samples actual render frames, never app internals via automation. */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createViewport } from './viewport';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';
import type { ObjectPatch, WallMode } from '../contracts';

const output = document.querySelector<HTMLPreElement>('#result')!;
let reduced = false;
const listeners = new Set<() => void>();
const match = window.matchMedia.bind(window);
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? {
  get matches() { return reduced; }, media: query, onchange: null,
  addEventListener(_event: string, listener: () => void) { listeners.add(listener); },
  removeEventListener(_event: string, listener: () => void) { listeners.delete(listener); },
} as unknown as MediaQueryList : match(query);
let controls: TransformControls;
const originalSetMode = TransformControls.prototype.setMode;
TransformControls.prototype.setMode = function (...args) { controls = this; return originalSetMode.apply(this, args); };
const store = new EditorStore(demoScene, localCatalog);
const errors: string[] = [];
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect: id => viewport.setSelection(id), onInteraction() {}, onError: message => errors.push(message),
  onTransform: (id, patch) => { edit(patch, id); viewport.setScene(store.scene, localCatalog); },
});
const id = 'coffee-table';
const object = () => store.scene.objects.find(item => item.id === id)!;
function edit(patch: ObjectPatch, target = id): void {
  const result = store.execute({ id: crypto.randomUUID(), source: 'human', label: 'Motion QA', baseRevision: store.revision,
    operations: [{ type: 'update', id: target, patch }] }, true);
  if (!result.ok) throw new Error(result.errors.join(' '));
}
store.subscribe(() => viewport.setScene(store.scene, localCatalog));
viewport.setScene(store.scene, localCatalog); viewport.setSelection(id); viewport.setTool('move');
type Sample = { root: number[]; pose: number[]; camera: number[]; wallOpacity: number; wallVisible: boolean };
let samples: Sample[] = [], world: THREE.Scene | undefined;
let probe: THREE.Mesh | undefined;
controls!.object!.traverse(node => { if (!probe && node instanceof THREE.Mesh) probe = node; });
probe!.onBeforeRender = (_renderer, scene, camera) => {
  if (!(scene instanceof THREE.Scene) || !scene.background) return;
  world = scene;
  let root: THREE.Object3D | undefined, wall: THREE.Object3D | undefined;
  scene.traverse(node => { if (node.userData.objectId === id) root = node; if (node.userData.entityId === demoScene.walls[0]!.id && node instanceof THREE.Group) wall = node; });
  if (!root || !wall) return;
  const full = wall.children[0]!;
  const mesh = full.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh;
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)!;
  samples.push({ root: root.position.toArray(), pose: root.children[0]!.getWorldPosition(new THREE.Vector3()).toArray(),
    camera: camera.position.toArray(), wallOpacity: material.opacity, wallVisible: full.visible });
};
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const results: string[] = [];
function check(ok: unknown, message: string): void { if (!ok) throw new Error(message); results.push(`PASS ${message}`); output.textContent = results.join('\n'); }
let wallMode: WallMode = 'cutaway';
document.querySelector<HTMLButtonElement>('#wall')!.onclick = () => { wallMode = wallMode === 'cutaway' ? 'full' : wallMode === 'full' ? 'hidden' : 'cutaway'; viewport.setWalls(wallMode); };
document.querySelector<HTMLButtonElement>('#focus')!.onclick = () => viewport.focus(id);
document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true; results.length = 0;
  try {
    reduced = false; for (const listener of listeners) listener();
    viewport.setView('perspective'); viewport.setWalls('full'); await delay(550);
    const start = [...object().position]; samples = [];
    edit({ position: [start[0]!, 0, start[2]! - 0.5] }); await delay(420);
    check(samples.some(s => s.pose[2]! < start[2]! && s.pose[2]! > start[2]! - 0.5), `committed move has intermediate rendered positions (${samples.length} frames)`);
    check(samples.every(s => s.root[2] === start[2]! - 0.5), 'authoritative root reaches checked target immediately');
    samples = []; store.undo(); await delay(420);
    check(samples.some(s => s.pose[2]! < start[2]! && s.pose[2]! > start[2]! - 0.5), 'undo travels back through intermediate positions');
    check(Math.abs(samples.at(-1)!.pose[2]! - start[2]!) < 1e-7, 'undo settles at exact original position');
    const saved = JSON.stringify(store.scene); samples = []; viewport.setWalls('hidden'); await delay(420);
    check(samples.some(s => s.wallOpacity > 0 && s.wallOpacity < 1), 'wall mode has intermediate opacity');
    check(samples.at(-1)!.wallVisible === false, 'hidden wall settles invisible');
    viewport.setWalls('cutaway'); await delay(420); samples = []; viewport.focus(id); await delay(600);
    check(new Set(samples.map(s => s.camera.join(','))).size > 2, 'camera framing moves through intermediate positions');
    check(JSON.stringify(store.scene) === saved, 'wall and camera animations leave scene data unchanged');
    samples = []; edit({ position: [start[0]!, 0, start[2]! - 0.5] }); await delay(65);
    store.undo(); await delay(420);
    check(samples.at(-1)!.pose[2] === start[2], 'rapid move / undo settles to latest target');
    edit({ position: [start[0]!, 0, start[2]! - 0.5] }); await delay(65);
    reduced = true; for (const listener of listeners) listener(); samples = []; viewport.setWalls('hidden'); await delay(120);
    check(samples.length > 0 && samples.every(s => Math.abs(s.pose[2]! - s.root[2]!) < 1e-7 && !s.wallVisible), 'live reduced motion settles transforms and walls immediately');
    const gestureRevision = store.revision;
    controls!.dispatchEvent({ type: 'mouseDown', mode: 'translate' });
    controls!.object!.position.z -= 0.25; controls!.dispatchEvent({ type: 'objectChange' });
    controls!.dispatchEvent({ type: 'mouseUp', mode: 'translate' }); await delay(100);
    check(store.revision === gestureRevision + 1, 'direct move commits exactly one history entry');
    const moved = object().position[2];
    controls!.dispatchEvent({ type: 'mouseDown', mode: 'translate' }); controls!.object!.position.z = 999;
    controls!.dispatchEvent({ type: 'objectChange' }); viewport.cancelInteraction(); await delay(100);
    check(object().position[2] === moved && controls!.object!.position.z === moved, 'cancel restores exact checked placement');
    samples = []; await delay(180); check(samples.length === 0, 'settled renderer returns to idle');
    check(errors.length === 0 && !!world, 'real renderer completed without reported errors');
    reduced = false; for (const listener of listeners) listener();
    viewport.setLayer('furniture', false);
    const outgoing = controls!.object!;
    const deletion = store.execute({ id: crypto.randomUUID(), source: 'human', label: 'Remove QA table', baseRevision: store.revision,
      operations: [{ type: 'delete', id }] }, true);
    check(deletion.ok && outgoing.parent?.visible === false, 'retiring furniture preserves hidden layer visibility');
    await delay(300);
    check(outgoing.parent === null, 'retiring geometry detaches after its fade');
    store.undo(); viewport.setLayer('furniture', true); viewport.setSelection(id);
    const entering = controls!.object!;
    store.redo();
    let entryMaterial: THREE.Material | undefined;
    entering.traverse(node => { if (!entryMaterial && node instanceof THREE.Mesh) entryMaterial = Array.isArray(node.material) ? node.material[0] : node.material; });
    check(entryMaterial && entryMaterial.opacity < 1, 'removing an appearing item does not reset opacity to full');
    await delay(300); store.undo(); viewport.setWalls('cutaway'); viewport.focus();
    output.textContent = `${results.join('\n')}\nCOMPLETE ${results.length} browser checks.`;
  } catch (error) { output.textContent = `${results.join('\n')}\nFAIL ${String(error)}`; }
  finally { button.disabled = false; }
};
