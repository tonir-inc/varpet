import * as THREE from 'three';
import type { ScreenRect } from './selection-camera';

export interface RoomCameraFrame { position: THREE.Vector3; target: THREE.Vector3; zoom: number }

/** Fit a room's full volume inside the uncovered canvas, retaining the user's azimuth. */
export function roomCameraFrame(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  bounds: THREE.Box3,
  viewport: { width: number; height: number },
  available: ScreenRect,
): RoomCameraFrame | null {
  const { width, height } = viewport;
  if (bounds.isEmpty() || width <= 0 || height <= 0
    || available.right <= available.left || available.bottom <= available.top
    || ![...bounds.min.toArray(), ...bounds.max.toArray(), width, height, ...Object.values(available)].every(Number.isFinite)) return null;

  // Leave breathing room around the architecture, not just around its floor slab.
  const padX = (available.right - available.left) * 0.08;
  const padY = (available.bottom - available.top) * 0.08;
  const left = (available.left + padX) * 2 / width - 1;
  const right = (available.right - padX) * 2 / width - 1;
  const bottom = 1 - (available.bottom - padY) * 2 / height;
  const top = 1 - (available.top + padY) * 2 / height;
  const sx = (left + right) / 2, sy = (bottom + top) / 2;
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  if (camera instanceof THREE.PerspectiveCamera) {
    const azimuth = Math.atan2(direction.x, direction.z);
    const elevation = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)),
      THREE.MathUtils.degToRad(35), THREE.MathUtils.degToRad(65));
    direction.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
  }
  const screenRight = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  const screenUp = new THREE.Vector3().crossVectors(direction, screenRight).normalize();
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const corner = new THREE.Vector3(x, y, z).sub(center);
    corners.push(new THREE.Vector3(corner.dot(screenRight), corner.dot(screenUp), corner.dot(direction)));
  }

  let distance = 2, zoom = camera.zoom, offsetX: number, offsetY: number;
  if (camera instanceof THREE.PerspectiveCamera) {
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom;
    const tanX = tanY * camera.aspect;
    // Solve each corner against all four off-centre frustum planes. Fitting against
    // the whole canvas then panning would clip near corners beside the inspector.
    for (const p of corners) distance = Math.max(distance, p.z + camera.near + 0.1,
      (p.x / tanX + right * p.z) / (right - sx),
      (-p.x / tanX - left * p.z) / (sx - left),
      (p.y / tanY + top * p.z) / (top - sy),
      (-p.y / tanY - bottom * p.z) / (sy - bottom));
    offsetX = -sx * distance * tanX; offsetY = -sy * distance * tanY;
  } else {
    const spanX = Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x));
    const spanY = Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y));
    zoom = Math.min((camera.right - camera.left) * (right - left) / (2 * Math.max(spanX, 0.1)),
      (camera.top - camera.bottom) * (top - bottom) / (2 * Math.max(spanY, 0.1)));
    offsetX = -(sx * (camera.right - camera.left) + camera.right + camera.left) / (2 * zoom);
    offsetY = -(sy * (camera.top - camera.bottom) + camera.top + camera.bottom) / (2 * zoom);
    distance = Math.max(25, bounds.getSize(new THREE.Vector3()).length() * 2);
  }
  const target = center.addScaledVector(screenRight, offsetX).addScaledVector(screenUp, offsetY);
  return { position: target.clone().addScaledVector(direction, distance), target, zoom };
}
