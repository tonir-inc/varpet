import type { SceneDocument, Vec2, Wall } from '../contracts';
import { wallLength } from './geometry';
import { wallSurfaceSpans } from './wall-surfaces';

export interface WallFinishTarget {
  entityId: string;
  surface: 'wall-front' | 'wall-back';
}

const EPS = 1e-5;
const near = (a: number, b: number) => Math.abs(a - b) <= EPS;
const samePoint = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPS;

/** A paintable face can cross structural junctions on its opposite side.
 * Keep wall IDs and geometry intact; only group compatible finish assignments.
 */
export function resolveWallFinishTargets(scene: SceneDocument, entityId: string, surface: WallFinishTarget['surface']): WallFinishTarget[] {
  const seed = scene.walls.find(wall => wall.id === entityId);
  if (!seed) return [];
  const targets: WallFinishTarget[] = [{ entityId, surface }];
  const length = wallLength(seed);
  if (length <= EPS) return targets;
  const metadata = scene.project?.metadata ?? {};
  const elevation = metadata[seed.id]?.elevation ?? 0;
  const ux = (seed.end[0] - seed.start[0]) / length;
  const uz = (seed.end[1] - seed.start[1]) / length;
  const sign = surface === 'wall-front' ? 1 : -1;
  const nx = -uz * sign; const nz = ux * sign;
  const sideFor = (wall: Wall): WallFinishTarget['surface'] =>
    ((wall.end[0] - wall.start[0]) * ux + (wall.end[1] - wall.start[1]) * uz >= 0) === (sign === 1) ? 'wall-front' : 'wall-back';
  // A whole-wall assignment cannot represent partial room bands. Expand only
  // when one room covers the complete face, avoiding paint leaks into others.
  const roomsFor = (wall: Wall, side: WallFinishTarget['surface']): Set<string> => new Set(scene.rooms.filter(room => {
    const spans = wallSurfaceSpans(wall, [room], metadata);
    return spans.length > 0 && spans.every(span => side === 'wall-front' ? span.front : span.back);
  }).map(room => room.id));
  const seedRooms = roomsFor(seed, surface);
  if (!seedRooms.size) return targets;
  const candidates = scene.walls.filter(wall => wall.id !== seed.id &&
    near(wall.height, seed.height) && near(wall.thickness, seed.thickness) &&
    near(metadata[wall.id]?.elevation ?? 0, elevation) && wallLength(wall) > EPS &&
    [wall.start, wall.end].every(point => Math.abs((point[0] - seed.start[0]) * uz - (point[1] - seed.start[1]) * ux) <= EPS)
  ).map(wall => ({ wall, surface: sideFor(wall), rooms: roomsFor(wall, sideFor(wall)) }));
  const connected = [seed];
  const visited = new Set([seed.id]);
  for (const current of connected) {
    for (const candidate of candidates) {
      if (visited.has(candidate.wall.id) || ![...candidate.rooms].some(id => seedRooms.has(id))) continue;
      let joint: Vec2 | undefined;
      for (const [point, other] of [[current.start, current.end], [current.end, current.start]] as const) {
        for (const [nextPoint, nextOther] of [[candidate.wall.start, candidate.wall.end], [candidate.wall.end, candidate.wall.start]] as const) {
          if (samePoint(point, nextPoint) && (other[0] - point[0]) * (nextOther[0] - point[0]) + (other[1] - point[1]) * (nextOther[1] - point[1]) < 0) joint = point;
        }
      }
      if (!joint) continue;
      const junction = joint;
      // A divider on this side interrupts the face even if the room polygon
      // has not yet been split. A divider behind it is irrelevant to paint.
      const blocked = scene.walls.some(wall => {
        if (wall.id === current.id || wall.id === candidate.wall.id || metadata[wall.id]?.phase === 'remove') return false;
        const base = metadata[wall.id]?.elevation ?? 0;
        if (base >= elevation + seed.height - EPS || base + wall.height <= elevation + EPS) return false;
        if (!samePoint(wall.start, junction) && !samePoint(wall.end, junction)) return false;
        return [wall.start, wall.end].some(point => (point[0] - junction[0]) * nx + (point[1] - junction[1]) * nz > seed.thickness / 2 + EPS);
      });
      if (blocked) continue;
      visited.add(candidate.wall.id); connected.push(candidate.wall);
      targets.push({ entityId: candidate.wall.id, surface: candidate.surface });
    }
  }
  return targets;
}
