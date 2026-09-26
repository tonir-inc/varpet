/** Isolated browser diagnostics: all measurements are read from the real renderer. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { CeilingStyle } from '../contracts';
import { localCatalog } from '../core/demo';
import { createInitialScene } from '../core/initial-scene';
import { EditorStore } from '../core/store';
import { buildCeilingDesignOperations, defaultCeilingDesign } from '../core/ceiling-design';
import { createViewport } from './viewport';
import { StudioRenderer } from './studio-renderer';

const output = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const container = document.querySelector<HTMLDivElement>('#view')!;
const roomSelect = document.querySelector<HTMLSelectElement>('#room')!;
const frameImage = document.querySelector<HTMLImageElement>('#rendered-frame')!;
const captureInfo = document.querySelector<HTMLParagraphElement>('#capture-info')!;
const errors: string[] = [];
let captureRequested = false;
const originalStudioRender = StudioRenderer.prototype.render;
StudioRenderer.prototype.render = function (...args) {
  originalStudioRender.apply(this, args);
  if (!captureRequested) return;
  captureRequested = false;
  const canvas = container.querySelector('canvas');
  if (!canvas) return;
  try {
    // Capture synchronously after the final compositor pass, before the browser
    // clears a WebGL drawing buffer whose preserveDrawingBuffer is false.
    frameImage.src = canvas.toDataURL('image/png');
    captureInfo.textContent = `${canvas.width} × ${canvas.height} pixels · ${currentView} · ${currentMood} · ${store.scene.project?.metadata[roomSelect.value]?.ceilingDesign?.style ?? 'plain'} · ${new Date().toISOString()}`;
  } catch (error) { errors.push(`Frame capture: ${String(error)}`); captureInfo.textContent = String(error); }
};
window.addEventListener('error', event => errors.push(`Uncaught: ${event.message}`));
window.addEventListener('unhandledrejection', event => errors.push(`Rejected: ${String(event.reason)}`));
let orbit: OrbitControls | undefined, transform: TransformControls | undefined;
const originalUpdate = OrbitControls.prototype.update;
OrbitControls.prototype.update = function (...args) { orbit = this; return originalUpdate.apply(this, args); };
const originalSetMode = TransformControls.prototype.setMode;
TransformControls.prototype.setMode = function (...args) { transform = this; return originalSetMode.apply(this, args); };
const store = new EditorStore(createInitialScene(), localCatalog);
const viewport = createViewport(container, { onSelect: id => viewport.setSelection(id), onTransform() {}, onInteraction() {}, onError: message => errors.push(message) });
viewport.setScene(store.scene, localCatalog); viewport.setTool('move');
OrbitControls.prototype.update = originalUpdate; TransformControls.prototype.setMode = originalSetMode;

let world: THREE.Scene | undefined, renderedCamera: THREE.Camera | undefined, renderer: THREE.WebGLRenderer | undefined;
let frames = 0, lastFrame = -1, currentView = 'overview', currentMood = 'day';
const monitored = new WeakSet<THREE.Mesh>();
function monitor(mesh: THREE.Mesh): void {
  if (monitored.has(mesh)) return;
  monitored.add(mesh);
  const original = mesh.onBeforeRender;
  mesh.onBeforeRender = function (actualRenderer, scene, camera, geometry, material, group) {
    original.call(this, actualRenderer, scene, camera, geometry, material, group);
    if (!(scene instanceof THREE.Scene) || !scene.background || world && scene !== world) return;
    world = scene; renderedCamera = camera; renderer = actualRenderer;
    if (actualRenderer.info.render.frame !== lastFrame) { lastFrame = actualRenderer.info.render.frame; frames++; }
  };
}
function watchWorld(): void {
  let root: THREE.Object3D | undefined = transform?.getHelper();
  while (root?.parent) root = root.parent;
  if (root instanceof THREE.Scene) world = root;
  world?.traverse(node => { if (node instanceof THREE.Mesh) monitor(node); });
}
watchWorld();
store.subscribe(() => { viewport.setScene(store.scene, localCatalog); watchWorld(); });
for (const room of store.scene.rooms) { const option = document.createElement('option'); option.value = room.id; option.textContent = room.name; roomSelect.append(option); }
const rounded = (value: number) => Number(value.toFixed(5));
const vector = (value: THREE.Vector3) => value.toArray().map(rounded);
function visible(object: THREE.Object3D): boolean { for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return false; return true; }
function ancestry(object: THREE.Object3D): string[] {
  const parts: string[] = [];
  for (let parent: THREE.Object3D | null = object; parent && !(parent instanceof THREE.Scene); parent = parent.parent) parts.unshift(`${parent.type}:${parent.name || parent.userData.objectId || parent.userData.entityId || parent.id}`);
  return parts;
}
function describeMaterial(material: THREE.Material): object {
  const standard = material as THREE.MeshStandardMaterial;
  return { type: material.type, color: standard.color?.getHexString(), emissive: standard.emissive?.getHexString(), emission: standard.emissiveIntensity, side: ['FrontSide', 'BackSide', 'DoubleSide'][material.side], opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite };
}
function diagnostics(): void {
  const canvas = container.querySelector('canvas');
  if (!world || !renderedCamera || !canvas) { output.textContent = JSON.stringify({ waiting: true, frames, capturedWorld: !!world, capturedCamera: !!renderedCamera, errors }, null, 2); return; }
  world.updateMatrixWorld(true); renderedCamera.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [], lights: object[] = [];
  world.traverse(node => {
    if (node instanceof THREE.Mesh && visible(node)) meshes.push(node);
    if (node instanceof THREE.Light) lights.push({ type: node.type, name: node.name, position: vector(node.getWorldPosition(new THREE.Vector3())), intensity: node.intensity, visible: visible(node), color: node.color.getHexString() });
  });
  const rays = [[0, 0], [-.85, .85], [.85, .85], [-.85, -.85], [.85, -.85]].map(([x, y]) => {
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(x!, y!), renderedCamera!);
    return { ndc: [x, y], direction: vector(raycaster.ray.direction), hits: raycaster.intersectObjects(meshes, false).slice(0, 3).map(hit => {
      const mesh = hit.object as THREE.Mesh;
      const material = Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0]! : mesh.material;
      return { distance: rounded(hit.distance), point: vector(hit.point), object: ancestry(mesh), local: vector(mesh.position), world: vector(mesh.getWorldPosition(new THREE.Vector3())), geometry: mesh.geometry.type, material: describeMaterial(material), userData: Object.fromEntries(Object.entries(mesh.userData).filter(([, value]) => typeof value !== 'object')) };
    }) };
  });
  const camera = renderedCamera as THREE.PerspectiveCamera;
  output.textContent = JSON.stringify({ view: currentView, mood: currentMood, room: roomSelect.value, revision: store.revision, frames,
    camera: { type: camera.type, position: vector(camera.position), world: vector(camera.getWorldPosition(new THREE.Vector3())), direction: vector(camera.getWorldDirection(new THREE.Vector3())), quaternion: camera.quaternion.toArray().map(rounded), near: camera.near, far: camera.far, fov: camera.fov, aspect: camera.aspect, projection: camera.projectionMatrix.toArray().map(rounded) },
    orbit: { enabled: orbit?.enabled, cameraType: orbit?.object.type, target: orbit && vector(orbit.target) },
    canvas: { cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, bufferWidth: canvas.width, bufferHeight: canvas.height, dpr: window.devicePixelRatio, pixelRatio: renderer?.getPixelRatio() },
    visibleMeshes: meshes.length, exposure: renderer?.toneMappingExposure, rays, lights, errors,
  }, null, 2);
}
function inspect(): void {
  viewport.setSelection(roomSelect.value); viewport.setTool('select');
  const ok = viewport.inspectCeiling(roomSelect.value); currentView = ok ? 'inside / ceiling' : 'inspect failed'; watchWorld();
  status.textContent = `${currentView} · ${roomSelect.selectedOptions[0]?.textContent} · ${store.scene.project?.metadata[roomSelect.value]?.ceilingDesign?.style ?? 'plain'} · ${currentMood}. Nothing is saved.`;
  setTimeout(diagnostics, 100);
}
function applyStyle(style: CeilingStyle): void {
  try {
    const operations = buildCeilingDesignOperations(store.scene, roomSelect.value, defaultCeilingDesign(style));
    if (operations.length) {
      const result = store.execute({ id: `qa-ceiling-${store.revision}-${style}`, label: `Try ${style}`, source: 'human', baseRevision: store.revision, operations }, true);
      if (!result.ok) throw new Error(result.errors.join(' '));
    }
    inspect();
  } catch (error) { errors.push(String(error)); diagnostics(); }
}
for (const style of ['quiet', 'soft-glow', 'architectural'] as const) document.querySelector<HTMLButtonElement>(`#${style}`)!.onclick = () => applyStyle(style);
document.querySelector<HTMLButtonElement>('#inspect')!.onclick = inspect;
for (const mood of ['day', 'evening'] as const) document.querySelector<HTMLButtonElement>(`#${mood}`)!.onclick = () => { currentMood = mood; viewport.setLightingMood(mood); setTimeout(diagnostics, 100); };
document.querySelector<HTMLButtonElement>('#overview')!.onclick = () => { viewport.setSelection(null); viewport.setView('perspective'); viewport.focus(); currentView = 'overview'; setTimeout(diagnostics, 700); };
document.querySelector<HTMLButtonElement>('#refresh')!.onclick = diagnostics;
document.querySelector<HTMLButtonElement>('#capture')!.onclick = () => { captureRequested = true; viewport.setLightingMood(currentMood === 'evening' ? 'evening' : 'day'); };
roomSelect.onchange = inspect;
setInterval(diagnostics, 700);
setTimeout(() => { applyStyle('quiet'); currentMood = 'evening'; viewport.setLightingMood('evening'); viewport.setView('inside'); captureRequested = true; }, 300);
window.addEventListener('beforeunload', () => { StudioRenderer.prototype.render = originalStudioRender; viewport.dispose(); });
