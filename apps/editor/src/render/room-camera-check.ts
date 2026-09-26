import * as THREE from 'three';
import { roomCameraFrame } from './room-camera';

let assertions = 0;
function assert(condition: unknown, message: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(`Room camera: ${message}`);
}
const bounds = new THREE.Box3(new THREE.Vector3(1, -0.14, -4), new THREE.Vector3(5, 2.8, 1));
for (const [width, height] of [[1200, 800], [760, 900], [1800, 700]]) {
  const viewport = { width: width!, height: height! };
  const available = { left: 24, top: 100, right: width! - 340, bottom: height! - 85 };
  for (const azimuth of [-2.5, 0, 1.2, 3]) for (const elevation of [0.06, 0.65, 1.4]) {
    for (const top of [false, true]) {
      const camera = top
        ? new THREE.OrthographicCamera(-8 * width! / height!, 8 * width! / height!, 8, -8, 0.05, 250)
        : new THREE.PerspectiveCamera(32, width! / height!, 0.05, 250);
      if (top) { camera.up.set(0, 0, -1); camera.position.set(0, 25, 0.001); }
      else camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * 20, Math.sin(elevation) * 20, Math.cos(azimuth) * Math.cos(elevation) * 20);
      camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
      const before = JSON.stringify(camera.toJSON()), beforeBounds = bounds.clone();
      const frame = roomCameraFrame(camera, bounds, viewport, available);
      assert(frame, 'valid room returns a framing pose');
      assert(JSON.stringify(camera.toJSON()) === before && bounds.equals(beforeBounds), 'framing calculation preserves camera and room');
      const result = camera.clone(); result.position.copy(frame.position); result.zoom = frame.zoom;
      result.lookAt(frame.target); result.updateProjectionMatrix(); result.updateMatrixWorld(true);
      const projected = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(result);
        const px = (p.x + 1) * width! / 2, py = (1 - p.y) * height! / 2;
        assert(px >= available.left && px <= available.right && py >= available.top && py <= available.bottom && p.z > -1 && p.z < 1,
          'entire room volume fits clear of inspector and toolbars, including near/far clipping');
        projected.left = Math.min(projected.left, px); projected.right = Math.max(projected.right, px);
        projected.top = Math.min(projected.top, py); projected.bottom = Math.max(projected.bottom, py);
      }
      const occupancy = Math.max((projected.right - projected.left) / (available.right - available.left), (projected.bottom - projected.top) / (available.bottom - available.top));
      assert(occupancy > 0.6 && occupancy < 0.95, 'room fills the available view with breathing room');
      if (!top) {
        const direction = frame.position.clone().sub(frame.target).normalize();
        assert(direction.y >= Math.sin(THREE.MathUtils.degToRad(35)) - 1e-8, 'grazing views lift to see inside the room');
        assert(Math.abs(Math.atan2(direction.x, direction.z) - azimuth) < 1e-8, 'room framing preserves the chosen azimuth');
        assert(frame.zoom === camera.zoom, 'perspective uses physical dolly, preserving lens zoom');
      } else assert(result.quaternion.angleTo(camera.quaternion) < 1e-6, 'Top framing preserves the Top orientation');
      const repeated = roomCameraFrame(result, bounds, viewport, available);
      assert(repeated && repeated.position.distanceTo(frame.position) < 1e-6 && repeated.target.distanceTo(frame.target) < 1e-6
        && Math.abs(repeated.zoom - frame.zoom) < 1e-6, 'reframing the same room is stable without drift');
    }
  }
}
const camera = new THREE.PerspectiveCamera(32, 1.5, 0.05, 250);
assert(roomCameraFrame(camera, new THREE.Box3(), { width: 1200, height: 800 }, { left: 24, top: 80, right: 850, bottom: 720 }) === null, 'empty room does not frame');
assert(roomCameraFrame(camera, bounds, { width: 0, height: 800 }, { left: 24, top: 80, right: 850, bottom: 720 }) === null, 'collapsed viewport does not frame');
assert(roomCameraFrame(camera, bounds, { width: 1200, height: 800 }, { left: 400, top: 80, right: 300, bottom: 720 }) === null, 'covered viewport does not frame');
assert(roomCameraFrame(camera, bounds, { width: 1200, height: 800 }, { left: NaN, top: 80, right: 850, bottom: 720 }) === null, 'nonfinite input does not frame');
console.log(`Room camera checks passed (${assertions} assertions).`);
