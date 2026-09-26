import * as THREE from 'three';

type Span = readonly [number, number];
type PartBounds = { x: Span; y: Span; z?: Span };

/**
 * Fit a cloned window-pvc-tilt-turn.glb before attaching its sash pivots.
 * The named parts and their Y-up coordinates follow catalog/openings/build.py.
 * Geometry must be owned by this instance; its materials and authored origin stay intact.
 */
export function fitPvcWindow(model: THREE.Group, width: number, height: number, wallThickness: number): {
  left: THREE.Vector3; right: THREE.Vector3; tiltY: number;
} {
  // Only exceptionally small apertures need thinner profiles to leave room for glass.
  const horizontal = Math.min(1, width / 0.6);
  const vertical = Math.min(1, height / 0.35);
  const frameX = 0.065 * horizontal, frameY = 0.065 * vertical;
  const mullion = 0.08 * horizontal;
  const overlapX = 0.008 * horizontal, overlapY = 0.008 * vertical;
  const half = width / 2;
  const sashBottom = frameY - overlapY, sashTop = height - frameY + overlapY;
  const bounds = new Map<string, PartBounds>([
    ['frame', { x: [-half, -half + frameX], y: [0, height] }],
    ['frame-2', { x: [half - frameX, half], y: [0, height] }],
    ['frame-head', { x: [-half + frameX, half - frameX], y: [height - frameY, height] }],
    ['frame-bottom', { x: [-half + frameX, half - frameX], y: [0, frameY] }],
    ['mullion', { x: [-mullion / 2, mullion / 2], y: [frameY, height - frameY] }],
    ['sill-board', {
      x: [-half - 0.04, half + 0.04], y: [0, 0.025],
      z: [0.005, Math.max(0.015, wallThickness / 2 + 0.035)],
    }],
    ['sill-drip', {
      x: [-half - 0.02, half + 0.02], y: [0, 0.01],
      // A wall thinner than the frame must still have a positive weather-sill depth.
      z: [Math.min(-0.075, -wallThickness / 2 - 0.045), -0.065],
    }],
  ]);

  for (const [side, direction] of [['l', -1], ['r', 1]] as const) {
    const prefix = `sash-${side}`;
    const inner = direction * mullion / 2;
    const outer = direction * (half - frameX);
    const ends = [inner - direction * overlapX, outer + direction * overlapX];
    const x0 = Math.min(...ends), x1 = Math.max(...ends);
    const glassX0 = x0 + frameX, glassX1 = x1 - frameX;
    const glassY0 = sashBottom + frameY, glassY1 = sashTop - frameY;
    const gasketX = 0.004 * horizontal, gasketY = 0.004 * vertical;
    bounds.set(`${prefix}-stile`, { x: [x0, glassX0], y: [sashBottom, sashTop] });
    bounds.set(`${prefix}-stile-2`, { x: [glassX1, x1], y: [sashBottom, sashTop] });
    bounds.set(`${prefix}-rail`, { x: [glassX0, glassX1], y: [glassY1, sashTop] });
    bounds.set(`${prefix}-rail-2`, { x: [glassX0, glassX1], y: [sashBottom, glassY0] });
    bounds.set(`${prefix}-glass`, {
      x: [glassX0 - 0.01 * horizontal, glassX1 + 0.01 * horizontal],
      y: [glassY0 - 0.01 * vertical, glassY1 + 0.01 * vertical],
    });
    bounds.set(`${prefix}-gasket`, { x: [glassX0, glassX0 + gasketX], y: [glassY0, glassY1] });
    bounds.set(`${prefix}-gasket-2`, { x: [glassX1 - gasketX, glassX1], y: [glassY0, glassY1] });
    bounds.set(`${prefix}-gasket-3`, { x: [glassX0 + gasketX, glassX1 - gasketX], y: [glassY0, glassY0 + gasketY] });
    bounds.set(`${prefix}-gasket-4`, { x: [glassX0 + gasketX, glassX1 - gasketX], y: [glassY1 - gasketY, glassY1] });
    const handleX = inner + direction * 0.0245 * horizontal;
    bounds.set(`${prefix}-handle-base`, {
      x: [handleX - 0.015 * horizontal, handleX + 0.015 * horizontal],
      y: [height / 2 - 0.0375 * vertical, height / 2 + 0.0375 * vertical],
    });
    bounds.set(`${prefix}-handle`, {
      x: [handleX - 0.011 * horizontal, handleX + 0.011 * horizontal],
      y: [height / 2 - 0.1 * vertical, height / 2 + 0.02 * vertical],
    });
  }

  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const target = bounds.get(object.name);
    if (!target) return;
    const geometry = object.geometry;
    geometry.computeBoundingBox();
    const source = geometry.boundingBox!;
    const xScale = (target.x[1] - target.x[0]) / (source.max.x - source.min.x);
    const yScale = (target.y[1] - target.y[0]) / (source.max.y - source.min.y);
    const zScale = target.z ? (target.z[1] - target.z[0]) / (source.max.z - source.min.z) : 1;
    const transform = new THREE.Matrix4().makeScale(xScale, yScale, zScale);
    transform.setPosition(target.x[0] - source.min.x * xScale,
      target.y[0] - source.min.y * yScale, target.z ? target.z[0] - source.min.z * zScale : 0);
    geometry.applyMatrix4(transform);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  });

  const hingeX = half - frameX + overlapX;
  return {
    left: new THREE.Vector3(-hingeX, 0, 0.017),
    right: new THREE.Vector3(hingeX, 0, 0.017),
    tiltY: sashBottom,
  };
}
