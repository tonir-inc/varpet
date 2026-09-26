import { wallOutward } from './adapter.js';
import type { Scene, Vec2, Wall } from './scene.js';

const EPS = 1e-8;
export interface WallSolid { wall_id: string; room_id: string; polygon: Vec2[] }

/** Wall endpoints are centre lines. Furniture rests against this room's inner face. */
export function innerWallFace(scene: Scene, wall: Wall): [Vec2, Vec2] {
  const half = wall.open ? 0 : (wall.thickness ?? 0) / 2;
  if (half === 0) return [[...wall.a], [...wall.b]];
  const outward = wallOutward(scene, wall);
  const offset = (point: Vec2): Vec2 => [point[0] - outward[0] * half, point[1] - outward[1] * half];
  return [offset(wall.a), offset(wall.b)];
}

/** Floor-level physical wall rectangles. Doors/passages cut only when the item fits their height.
 * Windows retain the wall below them. Shared room aliases use the same physical opening spans.
 * Missing thickness preserves legacy centre-line scenes. All callers clip these solids spatially;
 * the retained room_id is one owner, not an instruction to ignore the other side of a shared wall. */
export function wallSolidPolygons(scene: Scene, itemHeight = 0): WallSolid[] {
  if (!Number.isFinite(itemHeight) || itemHeight < 0) throw new Error('Wall collision item height must be finite and nonnegative');
  const solids: WallSolid[] = [], seen = new Set<string>();
  const byId = new Map(scene.walls.map(wall => [wall.id, wall]));
  for (const wall of scene.walls) {
    const half = (wall.thickness ?? 0) / 2;
    if (wall.open || half <= EPS || (wall.height !== undefined && wall.height <= EPS)) continue;
    const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1], length = Math.hypot(dx, dy);
    const along: Vec2 = [dx / length, dy / length], physicalId = wall.source_id ?? wall.id;
    const project = (point: Vec2) => (point[0] - wall.a[0]) * along[0] + (point[1] - wall.a[1]) * along[1];
    const cuts: Vec2[] = [];
    for (const opening of scene.openings) {
      if (opening.kind === 'window' || opening.sill > EPS || opening.height + EPS < itemHeight) continue;
      const owner = byId.get(opening.wall_id);
      if (!owner || (owner.source_id ?? owner.id) !== physicalId) continue;
      const ownerLength = Math.hypot(owner.b[0] - owner.a[0], owner.b[1] - owner.a[1]);
      const point = (offset: number): Vec2 => [owner.a[0] + (owner.b[0] - owner.a[0]) * offset / ownerLength, owner.a[1] + (owner.b[1] - owner.a[1]) * offset / ownerLength];
      const a = point(opening.offset), b = point(opening.offset + opening.width);
      // A reused source label on non-collinear geometry cannot punch a remote hole.
      const distance = (point: Vec2) => Math.abs((point[0] - wall.a[0]) * along[1] - (point[1] - wall.a[1]) * along[0]);
      if (distance(a) > EPS || distance(b) > EPS) continue;
      const from = Math.max(0, Math.min(project(a), project(b))), to = Math.min(length, Math.max(project(a), project(b)));
      if (to - from > EPS) cuts.push([from, to]);
    }
    const solid = (from: number, to: number) => {
      if (to - from <= EPS) return;
      const polygon: Vec2[] = ([[from, -half], [to, -half], [to, half], [from, half]] as Vec2[]).map(([distance, across]) =>
        [wall.a[0] + along[0] * distance - along[1] * across, wall.a[1] + along[1] * distance + along[0] * across]);
      // Sorting vertices makes opposite-direction aliases share an identity.
      const key = JSON.stringify([physicalId, polygon.map(point => point.map(value => Math.round(value * 1e8) / 1e8)).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)]);
      if (seen.has(key)) return;
      seen.add(key); solids.push({ wall_id: physicalId, room_id: wall.room_id, polygon });
    };
    let cursor = 0;
    for (const [from, to] of cuts.sort((a, b) => a[0] - b[0])) {
      solid(cursor, from); cursor = Math.max(cursor, to);
    }
    solid(cursor, length);
  }
  return solids;
}
