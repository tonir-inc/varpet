import * as THREE from 'three';
import { selectionCameraOffset } from './selection-camera';

type Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
const viewport = { width: 1200, height: 800 };
const available = { left: 32, top: 90, right: 820, bottom: 720 };
const epsilon = 1e-6;
let assertions = 0;
function assert(value: unknown, message: string): void {
  assertions++;
  if (!value) throw new Error(`Selection camera: ${message}`);
}

function perspective(orbit = false): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, viewport.width / viewport.height, 0.1, 1000);
  camera.position.set(orbit ? 7 : 0, orbit ? 6 : 0, orbit ? 9 : 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function orthographic(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-6, 6, 4, -4, 0.1, 1000);
  camera.position.set(0, 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.zoom = 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function localBox(camera: Camera, x: number, y: number, depth: number, size: number): THREE.Box3 {
  const center = new THREE.Vector3(x, y, -depth).applyMatrix4(camera.matrixWorld);
  return new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(size, size, size));
}

function projected(camera: Camera, bounds: THREE.Box3) {
  const result = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        const px = (point.x + 1) * viewport.width / 2;
        const py = (1 - point.y) * viewport.height / 2;
        result.left = Math.min(result.left, px);
        result.right = Math.max(result.right, px);
        result.top = Math.min(result.top, py);
        result.bottom = Math.max(result.bottom, py);
      }
    }
  }
  return result;
}

function fits(camera: Camera, bounds: THREE.Box3): boolean {
  const rect = projected(camera, bounds);
  return rect.left >= available.left - epsilon && rect.right <= available.right + epsilon
    && rect.top >= available.top - epsilon && rect.bottom <= available.bottom + epsilon;
}

function translated(camera: Camera, offset: THREE.Vector3): Camera {
  const result = camera.clone();
  result.position.add(offset);
  result.updateMatrixWorld(true);
  return result;
}

function verifyPan(camera: Camera, bounds: THREE.Box3, label: string): void {
  const savedCamera = JSON.stringify(camera.toJSON());
  const savedBounds = bounds.clone();
  const savedViewport = JSON.stringify(viewport);
  const savedAvailable = JSON.stringify(available);
  assert(!fits(camera, bounds), `${label}: setup starts outside the usable area`);
  const offset = selectionCameraOffset(camera, bounds, viewport, available);
  assert(offset.length() > epsilon, `${label}: covered selection requests a camera pan`);
  assert(offset.toArray().every(Number.isFinite), `${label}: pan is finite`);
  assert(Math.abs(offset.dot(camera.getWorldDirection(new THREE.Vector3()))) < epsilon,
    `${label}: pan preserves viewing distance`);
  assert(JSON.stringify(camera.toJSON()) === savedCamera && bounds.equals(savedBounds)
    && JSON.stringify(viewport) === savedViewport && JSON.stringify(available) === savedAvailable,
  `${label}: calculating the pan does not mutate inputs`);
  const moved = translated(camera, offset);
  assert(fits(moved, bounds), `${label}: all selection corners become visible`);
  assert(moved.quaternion.equals(camera.quaternion), `${label}: camera angle is unchanged`);
  assert(!fits(translated(camera, offset.clone().multiplyScalar(0.999)), bounds),
    `${label}: pan stops at the closest fitting position`);
  assert(selectionCameraOffset(moved, bounds, viewport, available).length() < epsilon,
    `${label}: a settled selection does not drift`);
}

const orbitCamera = perspective(true);
verifyPan(orbitCamera, localBox(orbitCamera, 4, 0.3, 10, 0.8), 'perspective wardrobe beside inspector');
const topCamera = orthographic();
verifyPan(topCamera, localBox(topCamera, 2.3, 0.5, 10, 0.4), 'zoomed top-view selection beside inspector');

for (const [label, x, y] of [
  ['left', -10, 0], ['right', 10, 0], ['top', 0, 8], ['bottom', 0, -8], ['top-right', 10, 8],
] as const) {
  const camera = perspective();
  verifyPan(camera, localBox(camera, x, y, 10, 0.6), `offscreen ${label} edge`);
}

for (const camera of [perspective(true), orthographic()]) {
  const visible = localBox(camera, -0.5, 0, 10, 0.5);
  assert(fits(camera, visible), 'visible-selection setup fits with comfortable margin');
  assert(selectionCameraOffset(camera, visible, viewport, available).lengthSq() === 0,
    'a selection already visible does not move the camera');
  assert(selectionCameraOffset(camera, new THREE.Box3(), viewport, available).lengthSq() === 0,
    'empty selection bounds do not move the camera');
  assert(selectionCameraOffset(camera, localBox(camera, 3, 0, -5, 0.5), viewport, available).lengthSq() === 0,
    'selection behind the camera does not produce a spurious pan');
  assert(selectionCameraOffset(camera, localBox(camera, 3, 0, 0.1, 0.5), viewport, available).lengthSq() === 0,
    'bounds crossing the camera plane do not cause an extreme pan');
  assert(selectionCameraOffset(camera, visible, { width: 0, height: 0 }, available).lengthSq() === 0,
    'a collapsed viewport does not move the camera');
}

const largeCamera = orthographic();
const oversized = localBox(largeCamera, 4, 0, 10, 10);
const initialRect = projected(largeCamera, oversized);
const desiredCenter = new THREE.Vector2((available.left + available.right) / 2, (available.top + available.bottom) / 2);
function distanceFromCenter(rect: ReturnType<typeof projected>): number {
  return new THREE.Vector2((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2).distanceTo(desiredCenter);
}
const largeOffset = selectionCameraOffset(largeCamera, oversized, viewport, available);
assert(largeOffset.toArray().every(Number.isFinite), 'oversized selection produces a finite best-effort pan');
const largeMoved = translated(largeCamera, largeOffset);
assert(distanceFromCenter(projected(largeMoved, oversized)) < distanceFromCenter(initialRect),
  'oversized selection moves toward the usable area');
assert(selectionCameraOffset(largeMoved, oversized, viewport, available).length() < epsilon,
  'oversized selection settles without repeated camera drift');

console.log(`Selection camera checks passed (${assertions} assertions).`);
