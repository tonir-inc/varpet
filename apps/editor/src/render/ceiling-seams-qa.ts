/** Real M6 shell, actual viewport/compositor, isolated from saved user state. */
import * as THREE from 'three';
import m6 from '../../../../apartments/m6-12-54/scene.json';
import type { Room, SceneDocument, Vec3 } from '../contracts';
import { createApartmentStore } from '../core/apartment-store';
import { roomCeilingHeight, hasRoomCeiling } from '../core/heights';
import { findWalkSpawn } from '../core/walkthrough';
import { createViewport } from './viewport';
import { StudioRenderer } from './studio-renderer';

const scene = createApartmentStore(m6 as unknown as SceneDocument, []).scene;
const original = JSON.stringify(scene), errors: string[] = [];
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const roomSelect = byId<HTMLSelectElement>('room'), aimSelect = byId<HTMLSelectElement>('aim');
const lightSelect = byId<HTMLSelectElement>('light'), qualitySelect = byId<HTMLSelectElement>('quality');
const flatInput = byId<HTMLInputElement>('flat'), result = byId<HTMLPreElement>('result');
const container = byId<HTMLDivElement>('view'), frame = byId<HTMLImageElement>('frame');
const WIDTH = 1200, HEIGHT = 720;
let world: THREE.Scene | undefined, camera: THREE.Camera | undefined;
let pose: { position: Vec3; target: Vec3 } | undefined;
let requested: ((source: string) => void) | undefined;
const previousMeshRender = THREE.Mesh.prototype.onBeforeRender, previousRender = StudioRenderer.prototype.render;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  previousMeshRender.apply(this, args);
  if (args[1].getObjectByName('Sun')) world = args[1];
};
const walls = new Set(scene.walls.map(wall => wall.id)), rooms = new Set(scene.rooms.map(room => room.id));
const wallFlat = new THREE.MeshBasicMaterial({ color: '#28394a' });
const ceilingFlat = new THREE.MeshBasicMaterial({ color: '#665a48', side: THREE.FrontSide });
const floorFlat = new THREE.MeshBasicMaterial({ color: '#84785e' });
StudioRenderer.prototype.render = function (...args) {
  camera = args[0];
  if (pose && camera instanceof THREE.PerspectiveCamera) {
    camera.position.fromArray(pose.position); camera.lookAt(...pose.target);
    camera.fov = 62; camera.aspect = WIDTH / HEIGHT; camera.zoom = 1;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  const replaced: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  if (world && flatInput.checked) world.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    let shellId: unknown;
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      const id: unknown = node.userData.entityId;
      if (typeof id === 'string' && (walls.has(id) || rooms.has(id))) { shellId = id; break; }
    }
    if (typeof shellId !== 'string') return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(material => material.transparent || !material.depthWrite)) return;
    replaced.push({ mesh: object, material: object.material });
    object.material = object.userData.shellPart === 'ceiling' ? ceilingFlat : walls.has(shellId) ? wallFlat : floorFlat;
  });
  try {
    previousRender.apply(this, args);
    if (requested) {
      const capture = requested; requested = undefined;
      // Copy before the browser discards the non-preserved drawing buffer.
      const source = container.querySelector('canvas')!.toDataURL('image/png');
      frame.src = source; byId<HTMLAnchorElement>('download').href = source; capture(source);
    }
  } finally { for (const item of replaced) item.mesh.material = item.material; }
};
const viewport = createViewport(container, { onSelect() {}, onInteraction() {}, onTransform() { throw new Error('QA changed authored geometry'); }, onError(message) { errors.push(message); } });
viewport.setScene(scene, []); viewport.setSelection('room-bedroom-large'); viewport.setView('inside'); viewport.setWalls('full');
for (const layer of ['dimensions', 'assumptions', 'clearances'] as const) viewport.setLayer(layer, false);
for (const room of scene.rooms) roomSelect.add(new Option(`${room.name}${hasRoomCeiling(scene, room) ? '' : ' · open sky'}`, room.id));
roomSelect.value = 'room-bedroom-large';
const coordinateNames = ['Eye X', 'Eye Y', 'Eye Z', 'Target X', 'Target Y', 'Target Z'];
const coordinates = coordinateNames.map((name, index) => {
  const label = document.createElement('label'); label.textContent = name;
  const input = document.createElement('input'); input.type = 'number'; input.step = '.01'; input.id = `coordinate-${index}`;
  label.append(input); byId('coordinates').append(label); return input;
});
function selectedRoom(): Room { return scene.rooms.find(room => room.id === roomSelect.value)!; }
function populateAim(): void {
  aimSelect.replaceChildren();
  selectedRoom().polygon.forEach((_, index) => {
    aimSelect.add(new Option(`Wall edge ${index + 1}`, `edge-${index}`));
    aimSelect.add(new Option(`Corner ${index + 1}`, `corner-${index}`));
  });
}
function roomPose(): void {
  const room = selectedRoom(), spawn = findWalkSpawn({ ...scene, rooms: [room] }, [], { roomId: room.id });
  if (!spawn) throw new Error(`No interior standing point for ${room.name}`);
  const [kind, indexText] = aimSelect.value.split('-'), index = Number(indexText);
  const point = room.polygon[index]!, next = room.polygon[(index + 1) % room.polygon.length]!;
  const x = kind === 'edge' ? (point[0] + next[0]) / 2 : point[0];
  const z = kind === 'edge' ? (point[1] + next[1]) / 2 : point[1];
  const elevation = scene.project?.metadata[room.id]?.elevation ?? 0;
  pose = { position: spawn.position, target: [x, elevation + roomCeilingHeight(scene, room) - .12, z] };
  [...pose.position, ...pose.target].forEach((value, index) => { coordinates[index]!.value = value.toFixed(4); });
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function captureFrame(custom = false): Promise<string> {
  if (custom) {
    const values = coordinates.map(input => Number(input.value));
    if (!values.every(Number.isFinite)) throw new Error('Camera coordinates must be finite');
    pose = { position: values.slice(0, 3) as Vec3, target: values.slice(3) as Vec3 };
  } else roomPose();
  viewport.setLightingMood(lightSelect.value as 'day' | 'evening');
  viewport.setQuality(qualitySelect.value as 'balanced' | 'high');
  await delay(350);
  const source = await new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => { requested = undefined; reject(new Error('No rendered frame')); }, 5000);
    requested = image => { window.clearTimeout(timeout); resolve(image); };
    viewport.setSun(viewport.getSun());
  });
  frame.alt = `${selectedRoom().name} · ${aimSelect.selectedOptions[0]!.text} · ${lightSelect.value} · ${qualitySelect.value}${flatInput.checked ? ' · flat shell' : ''}`;
  result.textContent = `${frame.alt}\nCamera ${JSON.stringify(pose)}\n${world && camera ? 'PASS actual world and camera' : 'FAIL no world'} · ${JSON.stringify(scene) === original ? 'PASS scene unchanged' : 'FAIL scene mutated'} · ${errors.length ? errors.join('; ') : 'PASS no viewport errors'}`;
  return source;
}
let captureQueue = Promise.resolve('');
function capture(custom = false): Promise<string> {
  const next = captureQueue.then(() => captureFrame(custom));
  captureQueue = next.catch(() => '');
  return next;
}
function run(custom = false): void { void capture(custom).catch(error => { result.textContent = `FAIL ${String(error)}`; }); }
populateAim();
roomSelect.onchange = () => { populateAim(); run(); };
for (const control of [aimSelect, lightSelect, qualitySelect, flatInput]) control.onchange = () => run();
byId<HTMLButtonElement>('capture').onclick = () => run();
byId<HTMLButtonElement>('custom').onclick = () => run(true);
byId<HTMLButtonElement>('clear').onclick = () => byId('captures').replaceChildren();
byId<HTMLButtonElement>('all').onclick = async () => {
  const button = byId<HTMLButtonElement>('all'); button.disabled = true;
  try {
    for (const room of scene.rooms) {
      roomSelect.value = room.id; populateAim();
      const source = await capture(), figure = document.createElement('figure'), caption = document.createElement('figcaption'), image = document.createElement('img');
      image.src = source; image.alt = frame.alt; image.width = WIDTH; image.style.maxWidth = '100%'; caption.textContent = frame.alt;
      figure.append(caption, image); byId('captures').append(figure);
    }
  } catch (error) { result.textContent = `FAIL ${String(error)}`; }
  finally { button.disabled = false; }
};
void delay(1000).then(() => run());
window.addEventListener('pagehide', () => {
  viewport.dispose(); THREE.Mesh.prototype.onBeforeRender = previousMeshRender; StudioRenderer.prototype.render = previousRender;
  wallFlat.dispose(); ceilingFlat.dispose(); floorFlat.dispose();
}, { once: true });
