import * as THREE from 'three';
import type { SceneDocument } from '../contracts';
import { disposeObject } from './assets';
import { createFinishInteraction } from './finish-interaction';
import { makeStructure } from './structure';

let assertions = 0;
const failures: string[] = [];
function assert(value: unknown, message: string): void {
  assertions++;
  if (!value) failures.push(message);
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
class ElementStub extends EventTarget {
  width = 0; height = 0; hidden = false; textContent = ''; className = '';
  style: Record<string, string> = {};
  children: ElementStub[] = [];
  getContext() { return null; }
  setAttribute() {}
  append(child: ElementStub) { this.children.push(child); }
  remove() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 }; }
}
let reduced = false;
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new ElementStub() } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), {
  matchMedia: () => ({ get matches() { return reduced; } }),
}) });

const previous: SceneDocument = {
  format: 'varpet.editor', version: 2, id: 'continuous-finish', name: 'Continuous wall face', units: 'm', upAxis: 'Y', objects: [],
  rooms: [
    { id: 'front-room', name: 'Living room', color: '#ddd8ce', polygon: [[0, 0], [6, 0], [6, 4], [0, 4]] },
    { id: 'back-left', name: 'Study', color: '#ddd8ce', polygon: [[0, -3], [2.5, -3], [2.5, 0], [0, 0]] },
    { id: 'back-right', name: 'Bedroom', color: '#ddd8ce', polygon: [[2.5, -3], [6, -3], [6, 0], [2.5, 0]] },
  ],
  walls: [
    { id: 'left', start: [0, 0], end: [2.5, 0], height: 2.7, thickness: 0.2, color: '#ddccbb', openings: [] },
    { id: 'right', start: [6, 0], end: [2.5, 0], height: 2.7, thickness: 0.2, color: '#aabbcc',
      openings: [{ id: 'door', kind: 'door', offset: 0.75, width: 0.9, height: 2.1, sill: 0 }] },
    { id: 'branch', start: [2.5, 0], end: [2.5, -3], height: 2.7, thickness: 0.2, color: '#dddddd', openings: [] },
  ],
  project: { mode: 'correct', currency: 'USD', metadata: {}, components: [], routes: [], sources: [], assumptions: [], tasks: [], options: [],
    materials: [{ id: 'paint', name: 'New paint', color: '#a13a25', unit: 'm2', unitCost: 0, thickness: 0.0002, wastePercent: 0 }], finishes: [] },
};
const painted = structuredClone(previous);
painted.project!.finishes = [
  { id: 'paint-left', entityId: 'left', surface: 'wall-front', materialId: 'paint' },
  { id: 'paint-right', entityId: 'right', surface: 'wall-back', materialId: 'paint' },
];
const saved = JSON.stringify([previous, painted]);
const reveal = { entityId: 'left', surface: 'wall-front' as const, point: [0.5, 1.3, 0.1] as [number, number, number], previousScene: previous, startedAt: 100 };
const shell = makeStructure(painted, reveal);
function uniforms(id: string, surface: 'wall-front' | 'wall-back', low = false) {
  let material: THREE.MeshStandardMaterial | undefined;
  shell.entities.get(id)!.children[low ? 1 : 0]!.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const [index, target] of Object.entries(object.userData.finishSurfaces ?? {})) {
      if (target === surface) material = (object.material as THREE.MeshStandardMaterial[])[Number(index)];
    }
  });
  if (!material) throw new Error(`Missing ${id} ${surface} projection`);
  const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '', fragmentShader: '' };
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
  return <T>(name: string) => shader.uniforms[name]?.value as T;
}
const seed = uniforms('left', 'wall-front');
const neighbor = uniforms('right', 'wall-back');
const low = uniforms('right', 'wall-back', true);
const opposite = uniforms('right', 'wall-front');
assert(seed<number>('uFinishProgress') === 0, 'clicked face begins at its previous finish');
assert(neighbor<number>('uFinishProgress') === 0, 'reversed neighboring segment begins at its previous finish, without jumping ahead');
assert(neighbor<THREE.Color>('uFinishPreviousBase').equals(new THREE.Color('#aabbcc')), 'neighbor keeps its own previous finish during the reveal');
assert(neighbor<THREE.Vector3>('uFinishOrigin').equals(new THREE.Vector3(...reveal.point)), 'neighbor uses the same world-space drop origin');
assert(opposite<number>('uFinishProgress') === 1, 'the other side stays outside the grouped reveal');
assert(shell.updateFinishes(600), 'continuous face reveal requests intermediate frames');
assert(near(seed<number>('uFinishProgress'), neighbor<number>('uFinishProgress')), 'all segments share reveal timing');
assert(near(seed<number>('uFinishRadius'), neighbor<number>('uFinishRadius')), 'wave radius stays continuous across the segment boundary');
assert(near(seed<number>('uFinishRadius'), low<number>('uFinishRadius')), 'full and cutaway projections share the full-face wave radius');
const extent = Math.hypot(6 - reveal.point[0], 2.7 - reveal.point[1]);
assert(near(seed<number>('uFinishRadius'), extent / 2), 'shared radius covers the complete face, including its distant endpoint');
reduced = true;
assert(!shell.updateFinishes(620), 'live reduced motion settles every grouped face');
assert(seed<number>('uFinishProgress') === 1 && neighbor<number>('uFinishProgress') === 1, 'grouped reveal settles to exact final state');
reduced = false;

const world = new THREE.Scene(); world.add(shell.group);
const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 100);
camera.position.set(1, 1.3, 6); camera.lookAt(1, 1.3, 0); camera.updateMatrixWorld();
shell.updateWalls(camera, 'full', false, 0, true); world.updateMatrixWorld(true);
const canvas = new ElementStub(); const container = new ElementStub();
let hoverScene = painted;
const interaction = createFinishInteraction({ canvas: canvas as unknown as HTMLCanvasElement, container: container as unknown as HTMLElement,
  world, camera: () => camera, scene: () => hoverScene, roots: () => [shell.group], render: () => {},
  apply: () => { throw new Error('Hover must not apply paint'); }, error: message => { throw new Error(message); },
});
interaction.setBrush('clay');
canvas.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 300, clientY: 200 }));
assert(container.children[0]!.textContent.includes('across this wall face'), 'paint hint describes the complete grouped face');
const overlays = world.children.filter(object => object !== shell.group && object instanceof THREE.Mesh && !(object.geometry instanceof THREE.RingGeometry)) as THREE.Mesh[];
assert(overlays.some(mesh => mesh.visible && new THREE.Box3().setFromObject(mesh).max.x > 5.9), 'hover visibly covers the neighbor across the structural split');
if (overlays.length) {
  const overlay = overlays.find(mesh => mesh.visible)!;
  overlay.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(overlay);
  assert(bounds.min.z > 0.09 && bounds.max.z < 0.12, 'hover contains only the painted face, excluding the back, top and ends');
  // Probe the copied geometry directly: the real overlay intentionally disables
  // raycasting so it cannot become an editing target.
  const surfaceProbe = new THREE.Mesh(overlay.geometry, overlay.material);
  assert(new THREE.Raycaster(new THREE.Vector3(3.5, 1.2, 1), new THREE.Vector3(0, 0, -1)).intersectObject(surfaceProbe).length > 0, 'hover covers the solid neighbor face');
  assert(new THREE.Raycaster(new THREE.Vector3(4.8, 1.2, 1), new THREE.Vector3(0, 0, -1)).intersectObject(surfaceProbe).length === 0, 'hover keeps the door opening clear');
  assert(new THREE.Raycaster(new THREE.Vector3(3.5, 1.2, 1), new THREE.Vector3(0, 0, -1)).intersectObject(overlay).length === 0, 'feedback never intercepts structural picking');
  assert(!overlay.userData.entityId && !overlay.userData.finishEntityId, 'hover remains separate from structural and finish picking');
  canvas.dispatchEvent(new Event('pointerleave'));
  assert(!overlay.visible, 'leaving the wall clears the hover immediately');
}
for (const metadata of [{ locked: true }, { phase: 'remove' as const }]) {
  hoverScene = structuredClone(painted);
  hoverScene.project!.metadata.right = metadata;
  canvas.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 300, clientY: 200 }));
  const restriction = metadata.locked ? 'locked' : 'removed';
  assert(canvas.style.cursor === 'not-allowed', `${restriction} neighbor makes the entire continuous face unavailable`);
  assert(overlays.every(overlay => !overlay.visible), `${restriction} neighbor clears the grouped face highlight`);
  assert(!container.children[0]!.textContent.includes('Click to apply'), `${restriction} neighbor never promises that paint can be applied`);
}
hoverScene = painted;
canvas.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 300, clientY: 200 }));
assert(overlays.some(overlay => overlay.visible), 'restoring the neighbor makes the continuous face available again');
interaction.dispose();
assert(world.children.length === 1, 'finish interaction disposal removes all transient feedback');
assert(JSON.stringify([previous, painted]) === saved, 'hover and reveal never mutate either scene document');
disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);

if (failures.length) throw new Error(`Continuous finish rendering failed (${failures.length}/${assertions}):\n${failures.map(message => `- ${message}`).join('\n')}`);
console.log(`Continuous finish rendering checks passed (${assertions} assertions).`);
