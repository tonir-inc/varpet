import type { Room, SceneDocument, Vec2, Wall } from '../contracts';
import { polygonArea } from './geometry';

export { polygonArea } from './geometry';

const EPSILON = 0.00001;
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const subtract = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const distance = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const signedArea = (points: Vec2[]) => points.reduce((sum, a, i) => sum + cross(a, points[(i + 1) % points.length]!), 0) / 2;

export interface FloorPlanEdgeMeasurement {
  start: Vec2;
  end: Vec2;
  length: number;
  inwardNormal: Vec2;
}

export interface FloorPlanRoomMeasurement {
  roomId: string;
  /** Area of polygon, in m². This is modeled geometry, never a surveyed claim. */
  area: number;
  /** Unadjusted room polygon area, retained for inspection. */
  modelArea: number;
  perimeter: number;
  labelPoint: Vec2;
  /** Wall-face polygon when safely derivable; otherwise modeled room boundary. */
  polygon: Vec2[];
  edges: FloorPlanEdgeMeasurement[];
  /** X/Z extents. Only an axis-aligned rectangle has two room-wide dimensions. */
  width: number;
  depth: number;
  rectangular: boolean;
  insetApplied: boolean;
  /** All boundary edges must have known wall support before claiming interior dimensions. */
  basis: 'interior' | 'boundary';
  note: string;
}

function cleanPolygon(points: Vec2[]): Vec2[] {
  const result = points.filter((p, i) => i === 0 || distance(p, points[i - 1]!) > EPSILON).map(p => [...p] as Vec2);
  if (result.length > 1 && distance(result[0]!, result[result.length - 1]!) < EPSILON) result.pop();
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      const before = subtract(result[i]!, result[(i + result.length - 1) % result.length]!);
      const after = subtract(result[(i + 1) % result.length]!, result[i]!);
      if (Math.abs(cross(before, after)) <= EPSILON * Math.max(1, Math.hypot(...before), Math.hypot(...after)) && before[0] * after[0] + before[1] * after[1] > 0) {
        result.splice(i, 1); changed = true; break;
      }
    }
  }
  return result;
}

function edgeMeasurements(points: Vec2[]): FloorPlanEdgeMeasurement[] {
  const winding = signedArea(points) >= 0 ? 1 : -1;
  return points.map((start, i) => {
    const end = points[(i + 1) % points.length]!, length = distance(start, end);
    return { start, end, length, inwardNormal: length > EPSILON ? [winding * (start[1] - end[1]) / length, winding * (end[0] - start[0]) / length] : [0, 0] };
  });
}

function segmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const delta = subtract(end, start), lengthSquared = delta[0] ** 2 + delta[1] ** 2;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - start[0]) * delta[0] + (point[1] - start[1]) * delta[1]) / lengthSquared)) : 0;
  return Math.hypot(point[0] - start[0] - t * delta[0], point[1] - start[1] - t * delta[1]);
}

/** Positive inside, negative outside, zero on the boundary. */
function polygonDistance(point: Vec2, points: Vec2[]): number {
  let inside = false, nearest = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!, b = points[j]!;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    nearest = Math.min(nearest, segmentDistance(point, a, b));
  }
  return (inside ? 1 : -1) * nearest;
}

/**
 * Find a point inside a simple room polygon, including concave L/U-shaped rooms.
 * Scanline seeds guarantee an interior candidate; a bounded pole-of-inaccessibility
 * search then moves the label away from edges without depending on polygon winding.
 */
export function polygonLabelPoint(points: Vec2[]): Vec2 {
  if (points.length < 3) return points[0] ? [...points[0]] : [0, 0];
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const width = maxX - minX, depth = maxZ - minZ;
  if (Math.min(width, depth) <= EPSILON) return [...points[0]!];
  let best: Vec2 = [...points[0]!], bestDistance = 0;
  const consider = (point: Vec2) => {
    const d = polygonDistance(point, points);
    if (d > bestDistance) { best = point; bestDistance = d; }
    return d;
  };
  consider([(minX + maxX) / 2, (minZ + maxZ) / 2]);
  const levels = [...new Set(zs)].sort((a, b) => a - b);
  for (let i = 1; i < levels.length; i++) {
    const z = (levels[i - 1]! + levels[i]!) / 2, intersections: number[] = [];
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length]!;
      if ((a[1] > z) !== (b[1] > z)) intersections.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    });
    intersections.sort((a, b) => a - b);
    for (let j = 0; j + 1 < intersections.length; j += 2) consider([(intersections[j]! + intersections[j + 1]!) / 2, z]);
  }
  type Cell = { x: number; z: number; half: number; maximum: number };
  const queue: Cell[] = [];
  const add = (x: number, z: number, half: number) => {
    const d = consider([x, z]);
    queue.push({ x, z, half, maximum: d + half * Math.SQRT2 });
  };
  const size = Math.max(width, depth) / 4;
  for (let x = minX; x < maxX; x += size) for (let z = minZ; z < maxZ; z += size) add(x + size / 2, z + size / 2, size / 2);
  const precision = Math.max(EPSILON, Math.min(width, depth) / 200);
  for (let count = 0; queue.length && count < 2048; count++) {
    queue.sort((a, b) => b.maximum - a.maximum);
    const cell = queue.shift()!;
    if (cell.maximum - bestDistance <= precision) break;
    const h = cell.half / 2;
    add(cell.x - h, cell.z - h, h); add(cell.x + h, cell.z - h, h);
    add(cell.x - h, cell.z + h, h); add(cell.x + h, cell.z + h, h);
  }
  return best;
}

interface WallSupport { offset: number; known: boolean }

/** Match an entire edge, including a wall split into adjacent collinear segments. */
function wallSupport(edge: FloorPlanEdgeMeasurement, walls: Wall[]): WallSupport {
  if (edge.length <= EPSILON) return { offset: 0, known: false };
  const tangent: Vec2 = [(edge.end[0] - edge.start[0]) / edge.length, (edge.end[1] - edge.start[1]) / edge.length];
  const along = (p: Vec2) => (p[0] - edge.start[0]) * tangent[0] + (p[1] - edge.start[1]) * tangent[1];
  const across = (p: Vec2) => (p[0] - edge.start[0]) * edge.inwardNormal[0] + (p[1] - edge.start[1]) * edge.inwardNormal[1];
  const candidates: { low: number; high: number; offset: number }[] = [];
  for (const wall of walls) {
    const from = across(wall.start), to = across(wall.end);
    if (Math.abs(from - to) > EPSILON || wall.thickness <= 0) continue;
    // A room already on the inward wall face must not lose another half thickness.
    const centerline = Math.abs(from) <= EPSILON;
    const clearFace = Math.abs(from + wall.thickness / 2) <= EPSILON;
    if (!centerline && !clearFace) continue;
    const low = Math.max(0, Math.min(along(wall.start), along(wall.end)));
    const high = Math.min(edge.length, Math.max(along(wall.start), along(wall.end)));
    if (high - low > EPSILON) candidates.push({ low, high, offset: centerline ? wall.thickness / 2 : 0 });
  }
  if (!candidates.length) return { offset: 0, known: false };
  // Unequal thicknesses and partial walls cannot be represented by one straight
  // room edge. Preserve that edge and identify the result as boundary dimensions.
  const offset = candidates[0]!.offset;
  if (candidates.some(candidate => Math.abs(candidate.offset - offset) > EPSILON)) return { offset: 0, known: false };
  let covered = 0;
  for (const candidate of candidates.sort((a, b) => a.low - b.low)) {
    if (candidate.low > covered + EPSILON) return { offset: 0, known: false };
    covered = Math.max(covered, candidate.high);
  }
  return covered >= edge.length - EPSILON ? { offset, known: true } : { offset: 0, known: false };
}

function insetPolygon(edges: FloorPlanEdgeMeasurement[], offsets: number[]): Vec2[] | null {
  const result: Vec2[] = [];
  for (let i = 0; i < edges.length; i++) {
    const previousIndex = (i + edges.length - 1) % edges.length;
    const previous = edges[previousIndex]!, current = edges[i]!;
    const a: Vec2 = [previous.start[0] + previous.inwardNormal[0] * offsets[previousIndex]!, previous.start[1] + previous.inwardNormal[1] * offsets[previousIndex]!];
    const b: Vec2 = [current.start[0] + current.inwardNormal[0] * offsets[i]!, current.start[1] + current.inwardNormal[1] * offsets[i]!];
    const u = subtract(previous.end, previous.start), v = subtract(current.end, current.start), determinant = cross(u, v);
    if (Math.abs(determinant) < EPSILON) return null;
    const t = cross(subtract(b, a), v) / determinant;
    result.push([a[0] + t * u[0], a[1] + t * u[1]]);
  }
  return result;
}

function safeInset(original: Vec2[], inset: Vec2[]): boolean {
  if (signedArea(original) * signedArea(inset) <= 0 || polygonArea(inset) > polygonArea(original) + EPSILON || polygonArea(inset) <= EPSILON) return false;
  for (let i = 0; i < inset.length; i++) {
    const a = inset[i]!, b = inset[(i + 1) % inset.length]!;
    const direction = subtract(b, a), originalDirection = subtract(original[(i + 1) % original.length]!, original[i]!);
    // An over-inset rectangle can turn inside out twice and retain its winding.
    // Each corresponding wall face must still run in its original direction.
    if (direction[0] * originalDirection[0] + direction[1] * originalDirection[1] <= EPSILON) return false;
    if (polygonDistance(a, original) < -EPSILON || polygonDistance([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], original) < -EPSILON) return false;
    // Opposing edges crossing indicates a narrow region collapsed during inset.
    for (let j = i + 2; j < inset.length; j++) {
      if (i === 0 && j === inset.length - 1) continue;
      const c = inset[j]!, d = inset[(j + 1) % inset.length]!;
      const ab = subtract(b, a), cd = subtract(d, c), denominator = cross(ab, cd);
      if (Math.abs(denominator) <= EPSILON) {
        if (segmentDistance(a, c, d) <= EPSILON || segmentDistance(b, c, d) <= EPSILON || segmentDistance(c, a, b) <= EPSILON || segmentDistance(d, a, b) <= EPSILON) return false;
        continue;
      }
      const t = cross(subtract(c, a), cd) / denominator, u = cross(subtract(c, a), ab) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return false;
    }
  }
  return true;
}

/**
 * Derive room measurements from scene geometry without mutating the source.
 * Demo and measured-shell room boundaries follow wall centerlines; imported
 * boundaries can already follow the interior wall faces. Only fully supported
 * centerline edges are offset. Doors remain within the enclosing wall envelope.
 * Unmatched/partial walls and collapsed insets retain the entire original boundary.
 */
export function measureFloorPlanRoom(scene: SceneDocument, room: Room): FloorPlanRoomMeasurement {
  const original = cleanPolygon(room.polygon), originalEdges = edgeMeasurements(original);
  const roomElevation = scene.project?.metadata[room.id]?.elevation ?? 0;
  const walls = scene.walls.filter(wall => {
    if (scene.project?.metadata[room.id]?.phase !== 'remove' && scene.project?.metadata[wall.id]?.phase === 'remove') return false;
    const elevation = scene.project?.metadata[wall.id]?.elevation ?? 0;
    return elevation <= roomElevation + EPSILON && elevation + wall.height > roomElevation + EPSILON;
  });
  const support = originalEdges.map(edge => wallSupport(edge, walls));
  const fullySupported = support.length >= 3 && support.every(edge => edge.known);
  const shouldInset = fullySupported && support.some(edge => edge.offset > 0);
  const candidate = shouldInset ? insetPolygon(originalEdges, support.map(edge => edge.offset)) : original;
  const usable = candidate !== null && (!shouldInset || safeInset(original, candidate));
  const polygon = usable ? candidate! : original;
  const edges = edgeMeasurements(polygon);
  const basis = usable && fullySupported ? 'interior' : 'boundary';
  const xs = polygon.map(p => p[0]), zs = polygon.map(p => p[1]);
  const rectangular = polygon.length === 4 && edges.every(edge => Math.abs(edge.start[0] - edge.end[0]) <= EPSILON || Math.abs(edge.start[1] - edge.end[1]) <= EPSILON);
  return {
    roomId: room.id, area: polygonArea(polygon), modelArea: polygonArea(original),
    perimeter: edges.reduce((sum, edge) => sum + edge.length, 0), labelPoint: polygonLabelPoint(polygon), polygon, edges,
    width: polygon.length ? Math.max(...xs) - Math.min(...xs) : 0,
    depth: polygon.length ? Math.max(...zs) - Math.min(...zs) : 0,
    rectangular, insetApplied: shouldInset && usable, basis,
    note: basis === 'interior'
      ? 'Calculated between modeled wall faces; excludes finishes. Verify against site measurements.'
      : 'Calculated from the modeled room boundary. Complete wall-face dimensions are not available.',
  };
}
