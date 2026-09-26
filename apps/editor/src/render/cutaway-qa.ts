/** Browser-only checks using the production viewport and actual rendered frames. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createViewport } from './viewport';
import { demoScene, localCatalog } from '../core/demo';
import { EditorStore } from '../core/store';

const output = document.querySelector<HTMLPreElement>('#result')!;
let orbit: OrbitControls | undefined, transform: TransformControls | undefined;
const originalUpdate = OrbitControls.prototype.update;
const originalSetMode = TransformControls.prototype.setMode;
OrbitControls.prototype.update = function (...args) { orbit = this; return originalUpdate.apply(this, args); };
TransformControls.prototype.setMode = function (...args) { transform = this; return originalSetMode.apply(this, args); };
const store = new EditorStore(demoScene, localCatalog);
const saved = JSON.stringify(store.scene), errors: string[] = [];
const viewport = createViewport(document.querySelector('#view')!, {
  onSelect() {}, onInteraction() {}, onError: message => errors.push(message), onTransform() {},
});
viewport.setScene(store.scene, localCatalog); viewport.setSelection('coffee-table'); viewport.setTool('move');
OrbitControls.prototype.update = originalUpdate;
TransformControls.prototype.setMode = originalSetMode;
let world: THREE.Scene | undefined;
let frames = 0;
let probe: THREE.Mesh | undefined;
transform?.object?.traverse(node => { if (!probe && node instanceof THREE.Mesh) probe = node; });
if (probe) probe.onBeforeRender = (_renderer, scene) => {
  if (scene instanceof THREE.Scene && scene.background) { world = scene; frames++; }
};
viewport.setSelection(null);
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function waitForProjection(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error('Wall projection did not settle within five seconds');
    await delay(50);
  }
}
function angle(degrees: number): void {
  if (!orbit) throw new Error('Orbit controls unavailable');
  // The west-facing view matches the screenshot: dining left, bedroom at back.
  const radians = degrees * Math.PI / 180;
  orbit.target.set(0, 0.7, 0);
  orbit.object.position.set(-19 * Math.cos(radians), 12, -19 * Math.sin(radians));
  orbit.update();
}
function full(id: string): boolean {
  let wall: THREE.Object3D | undefined;
  world?.traverse(node => { if (node instanceof THREE.Group && node.userData.entityId === id) wall = node; });
  if (!wall) throw new Error(`Rendered wall ${id} unavailable`);
  return wall.children[0]!.visible;
}
document.querySelector<HTMLButtonElement>('#shallow')!.onclick = () => angle(6);
document.querySelector<HTMLButtonElement>('#diagonal')!.onclick = () => angle(45);
document.querySelector<HTMLButtonElement>('#run')!.onclick = async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
  const results: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) throw new Error(message);
    results.push(`PASS ${message}`); output.textContent = results.join('\n');
  };
  try {
    await delay(500);
    const startFrames = frames;
    viewport.setWalls('cutaway'); angle(6); await delay(650);
    check(frames > startFrames, 'Production viewport rendered the near-front camera');
    check(full('wall-south') && full('wall-north') && !full('wall-west') && full('wall-east'), 'Near-front: left/right/back walls full, foreground lowered');
    check(['wall-spine', 'wall-bedroom', 'wall-bath'].every(full), 'Near-front: all interior partitions stay full-height');
    angle(45); await delay(650);
    check(!full('wall-south') && !full('wall-west') && full('wall-north') && full('wall-east'), 'Corner: both foreground walls lowered');
    check(['wall-spine', 'wall-bedroom', 'wall-bath'].every(full), 'Corner: all interior partitions stay full-height');
    viewport.setView('top'); await delay(650);
    check(['wall-spine', 'wall-bedroom', 'wall-bath'].every(full), 'Top: all interior partitions stay full-height');
    viewport.setView('perspective'); await delay(650);
    orbit!.object.position.set(-2, 1.6, 0); orbit!.target.set(0, 1.6, 0); orbit!.update(); await delay(400);
    check(['wall-west', 'wall-east', 'wall-south', 'wall-north', 'wall-spine', 'wall-bedroom', 'wall-bath'].every(full), 'Camera inside: every wall stays full-height');
    angle(6); await delay(650);
    check(full('wall-south'), 'Returning to near-front restores the left wall');
    viewport.setWalls('full'); await waitForProjection(() => full('wall-west') && full('wall-south'));
    check(full('wall-west') && full('wall-south'), 'Full mode restores foreground walls');
    viewport.setWalls('hidden'); await waitForProjection(() => !full('wall-west') && !full('wall-south'));
    check(!full('wall-west') && !full('wall-south'), 'Hidden mode hides full walls');
    viewport.setWalls('cutaway'); await delay(400);
    check(JSON.stringify(store.scene) === saved && store.revision === 0, 'Camera and wall display preserve scene and revision');
    check(errors.length === 0, 'No viewport render errors');
    output.textContent += `\n${results.length} checks passed. Final view: near-front, cutaway.`;
  } catch (error) { output.textContent += `\nFAIL ${String(error)}`; }
  finally { button.disabled = false; }
};
