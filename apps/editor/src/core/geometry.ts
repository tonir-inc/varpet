import type { BuildingComponent, SceneDocument, Vec2, Vec3, Wall } from '../contracts';

export const wallLength = (wall: Wall): number => Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
export const polygonArea = (points: Vec2[]): number => Math.abs(points.reduce((area, a, i) => { const b = points[(i + 1) % points.length]!; return area + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;

export function componentPosition(scene: SceneDocument, component: BuildingComponent): Vec3 {
  if (!component.host) return [...component.position];
  const wall = scene.walls.find(w => w.id === component.host!.wallId);
  if (!wall) return [...component.position];
  const length = wallLength(wall), dx = (wall.end[0] - wall.start[0]) / length, dz = (wall.end[1] - wall.start[1]) / length;
  const across = component.host.side * (wall.thickness + component.dimensions[2]) / 2;
  return [wall.start[0] + dx * component.host.offset - dz * across, component.host.elevation, wall.start[1] + dz * component.host.offset + dx * across];
}

/** World yaw of free or wall-mounted equipment, matching the rendered component transform. */
export function componentRotation(scene: SceneDocument, component: BuildingComponent): number {
  const wall = component.host && scene.walls.find(w => w.id === component.host!.wallId);
  return wall ? -Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]) + (component.host!.side === -1 ? Math.PI : 0) + component.rotation : component.rotation;
}
