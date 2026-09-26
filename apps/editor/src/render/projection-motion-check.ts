import * as THREE from 'three';
import { makeStructure } from './structure';
import { disposeObject } from './assets';
import { makeFinishMaterial } from './finish-material';
import type { SceneDocument, WallMode } from '../contracts';

let assertions = 0;
function assert(value: unknown, message: string): void {
  assertions++;
  if (!value) throw new Error(`Projection motion: ${message}`);
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;
// Text labels need a canvas, but these checks do not pretend to render WebGL.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => null }),
} });
const source: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'motion-check', name: 'Motion check', units: 'm', upAxis: 'Y',
  objects: [], rooms: [], walls: [{ id: 'wall', start: [-2, 0], end: [2, 0], height: 2.7, thickness: 0.2,
    color: '#eeeeee', openings: [{ id: 'window', kind: 'window', offset: 1, width: 1, height: 1, sill: 1 }] }],
};
const saved = JSON.stringify(source);
const shell = makeStructure(source);
const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 5, 10);
const update = shell.updateWalls as (camera: THREE.Camera, mode: WallMode, top: boolean, now: number, reduced?: boolean) => boolean;
const wall = shell.entities.get('wall')!;
const [full, low, openings] = wall.children;
const mesh = full!.children[0] as THREE.Mesh;
const material = (mesh.material as THREE.Material[])[0]!;
const glass = shell.openings.get('window')!.leaves[0]!.material as THREE.Material;
update(camera, 'full', false, 0);
assert(full!.visible && !low!.visible, 'initial wall mode is exact');
assert(update(camera, 'hidden', false, 100), 'a changed wall mode requests intermediate frames');
update(camera, 'hidden', false, 200);
assert(full!.visible && material.opacity > 0 && material.opacity < 1, 'outgoing wall fades before becoming hidden');
assert(glass.opacity > 0 && glass.opacity < 0.45, 'window opacity fades relative to its original glass');
const interrupted = material.opacity;
update(camera, 'full', false, 200);
assert(near(material.opacity, interrupted), 'reversal starts from the displayed opacity');
assert(!update(camera, 'full', false, 600), 'settled wall stops requesting frames');
assert(material.opacity === 1 && !material.transparent && material.depthWrite, 'opaque material state is restored exactly');
assert(near(glass.opacity, 0.45) && glass.transparent && !glass.depthWrite, 'glass retains its authored material state');
update(camera, 'cutaway', true, 700);
update(camera, 'cutaway', true, 1100);
assert(!full!.visible && low!.visible && openings!.visible, 'Top cutaway settles to the low projection');
update(camera, 'hidden', true, 1200);
assert(!update(camera, 'hidden', true, 1230, true), 'reduced motion settles active wall fades');
assert(!full!.visible && !low!.visible && !openings!.visible, 'hidden walls and windows stop being pickable');
update(camera, 'full', false, 1400);
assert(update(camera, 'full', false, 1679.5), 'near-complete fades still request their exact final frame');
assert(!update(camera, 'full', false, 1680) && material.opacity === 1 && !material.transparent, 'final frame restores opaque depth and shadow behavior');
assert(JSON.stringify(source) === saved, 'presentation frames never mutate scene data');
disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
let reduced = false;
Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ get matches() { return reduced; } }) } });
const appearance = { color: '#ffffff', accent: '#dddddd', pattern: 0, size: [1, 1] as [number, number], roughness: 0.8 };
const finish = makeFinishMaterial(appearance, { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) }, {
  previous: { ...appearance, color: '#222222' }, radius: 5,
  reveal: { entityId: 'wall', surface: 'wall-front', point: [0, 0, 0], previousScene: source, startedAt: 0 },
});
assert(finish.update(100), 'finish reveal initially animates');
reduced = true;
assert(!finish.update(120), 'live reduced motion also settles an existing finish reveal');
finish.material.dispose();
console.log(`Projection motion checks passed (${assertions} assertions).`);
