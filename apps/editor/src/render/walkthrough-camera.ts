import * as THREE from 'three';

/**
 * A wider interior lens: show more of the room while limiting horizontal spread
 * to 95° on wide monitors and vertical spread to 65° on tall windows.
 * Three's fov is vertical, so derive it from the horizontal limit and aspect.
 */
export function configureInsideCamera(camera: THREE.PerspectiveCamera, aspect: number): void {
  camera.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  camera.fov = Math.min(65, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(95 / 2)) / camera.aspect)));
  camera.zoom = 1;
  camera.updateProjectionMatrix();
}
