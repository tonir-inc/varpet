import type { Room, Vec2 } from './scene.js';
import { pointInPolygon } from './metrics/space.js';

/** Clip a (possibly concave) room by a convex, counterclockwise footprint.
 * Signed area retains disconnected pieces joined by cancelling boundary edges. */
export function footprintRoomArea(footprint: Vec2[], room: Vec2[]): number {
  const signed = footprint.reduce((sum, p, i) => { const q = footprint[(i + 1) % footprint.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (signed < 0) footprint = [...footprint].reverse();
  let polygon = room;
  for (let i = 0; i < footprint.length && polygon.length; i++) {
    const a = footprint[i]!, b = footprint[(i + 1) % footprint.length]!;
    const side = (p: Vec2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const output: Vec2[] = [];
    for (let j = 0; j < polygon.length; j++) {
      const p = polygon[j]!, q = polygon[(j + 1) % polygon.length]!, dp = side(p), dq = side(q);
      if (dp >= 0) output.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);
        output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    polygon = output;
  }
  return Math.abs(polygon.reduce((area, p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    return area + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;
}
function distanceToRoom(point: Vec2, room: Room): number {
  if (pointInPolygon(point, room.polygon)) return 0;
  return Math.min(...room.polygon.map((a, i) => {
    const b = room.polygon[(i + 1) % room.polygon.length]!, dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
  }));
}
export function footprintOwner(footprint: Vec2[], centre: Vec2, rooms: Room[]) {
  const ranked = rooms.map(room => ({ room, area: footprintRoomArea(footprint, room.polygon), distance: distanceToRoom(centre, room) }));
  ranked.sort((a, b) => Math.abs(b.area - a.area) > 1e-7 ? b.area - a.area : a.distance - b.distance || a.room.id.localeCompare(b.room.id));
  if (!ranked[0]) throw new Error('Cannot assign furniture without any rooms');
  return { ...ranked[0], overlapping: ranked.filter(candidate => candidate.area > 1e-7).map(candidate => candidate.room.id) };
}
