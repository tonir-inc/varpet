import * as THREE from 'three';

export interface ScreenRect { left: number; top: number; right: number; bottom: number }

export function selectionCameraOffset(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  bounds: THREE.Box3,
  viewport: { width: number; height: number },
  available: ScreenRect,
): THREE.Vector3 {
  const offset = new THREE.Vector3();
  const { width, height } = viewport;
  if (bounds.isEmpty() || width <= 0 || height <= 0
    || available.right <= available.left || available.bottom <= available.top
    || ![...bounds.min.toArray(), ...bounds.max.toArray(), width, height, ...Object.values(available)].every(Number.isFinite)) return offset;

  camera.updateWorldMatrix(true, false);
  const projection = camera.projectionMatrix.elements;
  const cameraPoint = new THREE.Vector3();
  let minX = -Infinity, maxX = Infinity, minY = -Infinity, maxY = Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    cameraPoint.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const depth = -cameraPoint.z;
    // Crossing the eye/near plane needs an explicit frame/zoom, not a large automatic pan.
    if (depth <= camera.near) return offset;
    const divisor = camera instanceof THREE.PerspectiveCamera ? depth : 1;
    const unitsX = 2 * divisor / (width * projection[0]!);
    const unitsY = 2 * divisor / (height * projection[5]!);
    const projected = cameraPoint.clone().applyMatrix4(camera.projectionMatrix);
    const px = (projected.x + 1) * width / 2, py = (1 - projected.y) * height / 2;
    // Intersect each corner's allowable camera translation. Depth matters in perspective:
    // using the centre's pixel scale would leave the nearer edge underneath the panel.
    minX = Math.max(minX, (px - available.right) * unitsX);
    maxX = Math.min(maxX, (px - available.left) * unitsX);
    minY = Math.max(minY, (available.top - py) * unitsY);
    maxY = Math.min(maxY, (available.bottom - py) * unitsY);
  }

  const middle = bounds.getCenter(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse);
  const divisor = camera instanceof THREE.PerspectiveCamera ? -middle.z : 1;
  middle.applyMatrix4(camera.projectionMatrix);
  const centerX = ((middle.x + 1) * width / 2 - (available.left + available.right) / 2) * 2 * divisor / (width * projection[0]!);
  const centerY = ((available.top + available.bottom) / 2 - (1 - middle.y) * height / 2) * 2 * divisor / (height * projection[5]!);
  // A room/group larger than the clear area cannot fit without zooming. Centre only
  // that overflowing axis; ordinary objects use the smallest possible translation.
  const x = minX <= maxX ? THREE.MathUtils.clamp(0, minX, maxX) : centerX;
  const y = minY <= maxY ? THREE.MathUtils.clamp(0, minY, maxY) : centerY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return offset;
  return offset.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(x)
    .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), y);
}
