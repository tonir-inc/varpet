import type { EntityMetadata, Room, Vec2, Wall } from '../contracts';

export interface WallSurfaceSpan {
  start: number;
  end: number;
  front: boolean;
  back: boolean;
}

function inside([x, z]: Vec2, polygon: Vec2[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!; const b = polygon[j]!;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

/** Room-facing portions of each wall face, independent of endpoint or polygon winding.
 * This is a presentation boundary, not an inference about the wall's structural role.
 */
export function wallSurfaceSpans(wall: Wall, rooms: readonly Room[], metadata: Record<string, EntityMetadata> = {}): WallSurfaceSpan[] {
  const dx = wall.end[0] - wall.start[0]; const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  if (length < 1e-8) return [];
  const ux = dx / length; const uz = dz / length;
  const local = ([x, z]: Vec2): Vec2 => [(x - wall.start[0]) * ux + (z - wall.start[1]) * uz, -(x - wall.start[0]) * uz + (z - wall.start[1]) * ux];
  const wallBase = metadata[wall.id]?.elevation ?? 0;
  const polygons = rooms.filter(room => {
    const roomBase = metadata[room.id]?.elevation ?? 0;
    const roomTop = roomBase + (metadata[room.id]?.ceilingHeight ?? 2.8);
    return room.polygon.length >= 3 && roomBase < wallBase + wall.height && roomTop > wallBase;
  }).map(room => room.polygon.map(local));
  // Probe immediately beyond the solid wall: supports room boundaries drawn
  // on wall centerlines as well as boundaries drawn at the finished face.
  const offset = wall.thickness / 2 + 1e-5;
  const cuts = [0, length];
  for (const polygon of polygons) for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!; const b = polygon[(i + 1) % polygon.length]!;
    for (const side of [-offset, offset]) {
      if ((a[1] > side) === (b[1] > side)) continue;
      const x = a[0] + (b[0] - a[0]) * (side - a[1]) / (b[1] - a[1]);
      if (x > 0 && x < length) cuts.push(x);
    }
  }
  cuts.sort((a, b) => a - b);
  const spans: WallSurfaceSpan[] = [];
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1]!; const end = cuts[i]!;
    if (end - start < 1e-8) continue;
    const midpoint = (start + end) / 2;
    const front = polygons.some(polygon => inside([midpoint, offset], polygon));
    const back = polygons.some(polygon => inside([midpoint, -offset], polygon));
    const previous = spans.at(-1);
    if (previous && previous.front === front && previous.back === back) previous.end = end;
    else spans.push({ start, end, front, back });
  }
  return spans;
}
