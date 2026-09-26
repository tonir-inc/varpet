import type { SceneDocument, Vec2, Wall } from '../contracts';

const EPS = 1e-6;
const CATCH = 0.08;
const grid = (n: number) => Math.round(n * 20) / 20;
const difference = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const same = (a: Vec2, b: Vec2) => Math.hypot(...difference(a, b)) < EPS;
type Line = { anchor: Vec2; movingPoint: Vec2; direction: Vec2 };

function project(point: Vec2, line: Line): Vec2 {
  if (line.direction[0] === 0) return [line.anchor[0], point[1]];
  if (line.direction[1] === 0) return [point[0], line.anchor[1]];
  const along = dot(difference(point, line.anchor), line.direction);
  return [line.anchor[0] + along * line.direction[0], line.anchor[1] + along * line.direction[1]];
}

function contains(wall: Wall, point: Vec2): boolean {
  const axis = difference(wall.end, wall.start), offset = difference(point, wall.start);
  const length = Math.hypot(...axis), along = dot(offset, axis) / length;
  return along >= -EPS && along <= length + EPS && Math.abs(cross(offset, axis)) <= EPS * length;
}

/** Only stationary, connected geometry is an alignment reference for this gesture. */
function alignmentLines(scene: SceneDocument, wall: Wall, endpoint?: 'start' | 'end'): Line[] {
  const moving = endpoint ? (point: Vec2) => same(point, wall[endpoint]) : (point: Vec2) => contains(wall, point);
  const elevation = (item: Wall) => scene.project?.metadata[item.id]?.elevation ?? 0;
  const neighbours = scene.walls.filter(item => item.id !== wall.id && scene.project?.metadata[item.id]?.phase !== 'remove'
    && Math.min(elevation(item) + item.height, elevation(wall) + wall.height) - Math.max(elevation(item), elevation(wall)) > EPS);
  const anchors: { anchor: Vec2; movingPoint: Vec2 }[] = endpoint ? [{ anchor: wall[endpoint === 'start' ? 'end' : 'start'], movingPoint: wall[endpoint] }] : [];
  for (const neighbour of neighbours) {
    for (const side of ['start', 'end'] as const) {
      const far = neighbour[side === 'start' ? 'end' : 'start'];
      if (moving(neighbour[side]) && !moving(far)) anchors.push({ anchor: far, movingPoint: neighbour[side] });
    }
  }
  const lines: Line[] = [];
  for (const { anchor, movingPoint } of anchors) {
    lines.push({ anchor, movingPoint, direction: [1, 0] }, { anchor, movingPoint, direction: [0, 1] });
    for (const reference of neighbours) {
      if (moving(reference.start) || moving(reference.end) || !contains(reference, anchor)) continue;
      const axis = difference(reference.end, reference.start), length = Math.hypot(...axis);
      if (length < EPS) continue;
      const direction: Vec2 = [axis[0] / length, axis[1] / length];
      lines.push({ anchor, movingPoint, direction }, { anchor, movingPoint, direction: [-direction[1], direction[0]] });
    }
  }
  return lines;
}

/** Alignment wins over the grid, preserving non-grid measurements exactly. */
export function snapWallEndpoint(scene: SceneDocument, wall: Wall, endpoint: 'start' | 'end', raw: Vec2, enabled: boolean): Vec2 {
  if (!enabled) return [...raw];
  const fixed = wall[endpoint === 'start' ? 'end' : 'start'];
  let nearest: Line | undefined, best = CATCH + EPS;
  const nearby: Line[] = [];
  for (const line of alignmentLines(scene, wall, endpoint)) {
    const distance = Math.abs(cross(difference(raw, line.anchor), line.direction));
    if (distance <= CATCH) nearby.push(line);
    const projected = project(raw, line);
    if (distance < best && Math.hypot(...difference(projected, fixed)) >= 0.05) { best = distance; nearest = line; }
  }
  // A returning rectangular corner can satisfy both incident walls at once.
  let corner: Vec2 | undefined, cornerDistance = CATCH * Math.SQRT2 + EPS;
  for (let i = 0; i < nearby.length; i++) for (const other of nearby.slice(i + 1)) {
    const line = nearby[i]!;
    if (Math.abs(dot(line.direction, other.direction)) > EPS) continue;
    const along = cross(difference(other.anchor, line.anchor), other.direction) / cross(line.direction, other.direction);
    const point: Vec2 = [line.anchor[0] + along * line.direction[0], line.anchor[1] + along * line.direction[1]];
    for (const target of [line, other]) {
      if (target.direction[0] === 0) point[0] = target.anchor[0];
      if (target.direction[1] === 0) point[1] = target.anchor[1];
    }
    const distance = Math.hypot(...difference(point, raw));
    if (distance < cornerDistance && Math.hypot(...difference(point, fixed)) >= 0.05) { corner = point; cornerDistance = distance; }
  }
  if (corner) return corner;
  const point: Vec2 = [grid(raw[0]), grid(raw[1])];
  if (!nearest) return point;
  // Grid only the free coordinate; projection retains an exact off-grid axis.
  const result = project(point, nearest);
  return Math.hypot(...difference(result, fixed)) >= 0.05 ? result : point;
}

/** Constrain translation to the wall normal, catching connected alignments nearby. */
export function snapWallDistance(scene: SceneDocument, wall: Wall, raw: number, enabled: boolean): number {
  if (!enabled) return raw;
  if (Math.abs(raw) < 1e-9) return 0;
  const axis = difference(wall.end, wall.start), length = Math.hypot(...axis);
  const normal: Vec2 = [-axis[1] / length, axis[0] / length];
  let result = grid(raw), best = CATCH + EPS;
  for (const line of alignmentLines(scene, wall)) {
    const denominator = cross(normal, line.direction);
    if (Math.abs(denominator) < EPS) continue;
    const distance = cross(difference(line.anchor, line.movingPoint), line.direction) / denominator;
    const error = Math.abs(distance - raw);
    if (error < best) { best = error; result = distance; }
  }
  return result;
}
