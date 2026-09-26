import * as THREE from 'three';

/**
 * A stable interior lens: limit horizontal spread on wide monitors and vertical
 * spread on tall windows. Three's fov is vertical, so a fixed 65° lens would
 * expand to roughly 97° horizontally at 16:9 and distort room proportions.
 */
export function configureInsideCamera(camera: THREE.PerspectiveCamera, aspect: number): void {
  camera.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  camera.fov = Math.min(60, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(40)) / camera.aspect)));
  camera.zoom = 1;
  camera.updateProjectionMatrix();
}
