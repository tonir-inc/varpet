import * as THREE from 'three';

export type InsideLens = 'standard' | 'photo' | 'wide';
export const DEFAULT_INSIDE_LENS: InsideLens = 'photo';
export function isInsideLens(value: unknown): value is InsideLens {
  return value === 'standard' || value === 'photo' || value === 'wide';
}
const lenses: Record<InsideLens, { vertical: number; horizontal: number }> = {
  standard: { vertical: 65, horizontal: 95 },
  photo: { vertical: 80, horizontal: 95 },
  wide: { vertical: 85, horizontal: 105 },
};

/**
 * Photo framing retains more of the room when side panels make the canvas narrow.
 * The two-argument form retains the standard lens for viewport consumers.
 * Three's fov is vertical, so derive it from the horizontal limit and aspect.
 */
export function configureInsideCamera(camera: THREE.PerspectiveCamera, aspect: number, lens: InsideLens = 'standard'): void {
  const limits = lenses[isInsideLens(lens) ? lens : 'standard'];
  camera.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  camera.fov = Math.min(limits.vertical, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(limits.horizontal / 2)) / camera.aspect)));
  camera.zoom = 1;
  camera.updateProjectionMatrix();
}
