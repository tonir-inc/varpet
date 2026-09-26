import type { Opening, SceneDocument, Vec2, Wall } from '../contracts';
import { wallLength } from './geometry';

export const OPENING_COLLISION_EPS = 1e-5;

export interface OpeningWallObstacle {
  wallId: string;
  start: number;
  end: number;
}

/** Clip a convex footprint to one side of a line in the host wall's local frame. */
function clipAcross(points: Vec2[], boundary: number, keepBelow: boolean): Vec2[] {
  const result: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    const aInside = keepBelow ? a[1] <= boundary : a[1] >= boundary;
    const bInside = keepBelow ? b[1] <= boundary : b[1] >= boundary;
    if (aInside) result.push(a);
    if (aInside !== bInside) {
      const t = (boundary - a[1]) / (b[1] - a[1]);
      result.push([a[0] + t * (b[0] - a[0]), boundary]);
    }
  }
  return result;
}

/**
 * Solid wall spans occupying any part of an opening's height and host thickness.
 * Shared by drag limits and document validation; independent of camera/cutaway mode.
 * Inputs must have passed the scene's geometry and metadata shape checks.
 */
export function openingWallObstacles(scene: SceneDocument, host: Wall, opening: Opening): OpeningWallObstacle[] {
  const metadata = scene.project?.metadata ?? {};
  if (metadata[host.id]?.phase === 'remove' || metadata[opening.id]?.phase === 'remove') return [];
  const result: OpeningWallObstacle[] = [];
  const length = wallLength(host), ux = (host.end[0] - host.start[0]) / length, uz = (host.end[1] - host.start[1]) / length;
  const half = host.thickness / 2;
  const bottom = (metadata[host.id]?.elevation ?? 0) + opening.sill, top = bottom + opening.height;
  for (const wall of scene.walls) {
    if (wall.id === host.id || metadata[wall.id]?.phase === 'remove') continue;
    const base = metadata[wall.id]?.elevation ?? 0;
    if (base >= top - OPENING_COLLISION_EPS || base + wall.height <= bottom + OPENING_COLLISION_EPS) continue;
    const otherLength = wallLength(wall), dx = (wall.end[0] - wall.start[0]) / otherLength, dz = (wall.end[1] - wall.start[1]) / otherLength;
    const addSolid = (from: number, to: number, low: number, high: number) => {
      if (to - from <= OPENING_COLLISION_EPS || high <= low || base + low >= top - OPENING_COLLISION_EPS || base + high <= bottom + OPENING_COLLISION_EPS) return;
      const h = wall.thickness / 2;
      let polygon: Vec2[] = ([[from, -h], [to, -h], [to, h], [from, h]] as Vec2[]).map(([along, across]) => {
        const x = wall.start[0] + dx * along - dz * across - host.start[0];
        const z = wall.start[1] + dz * along + dx * across - host.start[1];
        return [x * ux + z * uz, -x * uz + z * ux];
      });
      // Merely touching the host's side face does not occupy the opening.
      if (Math.min(...polygon.map(p => p[1])) >= half - OPENING_COLLISION_EPS || Math.max(...polygon.map(p => p[1])) <= -half + OPENING_COLLISION_EPS) return;
      polygon = clipAcross(clipAcross(polygon, half, true), -half, false);
      if (polygon.length < 3) return;
      const start = Math.max(0, Math.min(...polygon.map(p => p[0])));
      const end = Math.min(length, Math.max(...polygon.map(p => p[0])));
      if (end - start > OPENING_COLLISION_EPS) result.push({ wallId: wall.id, start, end });
    };
    let cursor = 0;
    for (const aperture of [...wall.openings].sort((a, b) => a.offset - b.offset)) {
      addSolid(cursor, aperture.offset, 0, wall.height);
      addSolid(aperture.offset, aperture.offset + aperture.width, 0, aperture.sill);
      addSolid(aperture.offset, aperture.offset + aperture.width, aperture.sill + aperture.height, wall.height);
      cursor = aperture.offset + aperture.width;
    }
    addSolid(cursor, otherLength, 0, wall.height);
  }
  return result;
}
