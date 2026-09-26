import { furnitureDimensions } from './furniture-bounds';
import { floorHeight, supportContains } from './furniture-support';
import type { CatalogAsset, SceneDocument, SceneObject, Vec2 } from '../contracts';
import { doorBarriers } from './door-barriers';
import { floorSupported, objectFootprint, polygonsOverlap, wallCollision, wallFootprint } from './validation';

const EPS = 1e-5;
type Segment = [Vec2, Vec2];

export interface PlacementConflict {
  kind: 'support' | 'wall' | 'overlap' | 'door' | 'door-swing';
  entityId?: string;
  /** World X/Z coordinates; regions have positive area and do not include the valid portion of the footprint. */
  polygon: Vec2[];
  bottom: number;
  top: number;
}

function cross(a: Vec2, b: Vec2, point: Vec2): number {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
}

function compactPolygon(points: Vec2[]): Vec2[] {
  const polygon = points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length]!;
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-10;
  });
  if (polygon.length < 3) return [];
  const area = polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    return sum + point[0] * next[1] - point[1] * next[0];
  }, 0);
  return Math.abs(area) > 1e-12 ? polygon : [];
}

/** Exact convex clipping, gated by the same contact tolerance used by placement validation. */
function intersection(a: Vec2[], b: Vec2[]): Vec2[] {
  if (!polygonsOverlap(a, b)) return [];
  let result = a;
  for (let i = 0; i < b.length; i++) {
    const start = b[i]!, end = b[(i + 1) % b.length]!;
    const input = result; result = [];
    for (let j = 0; j < input.length; j++) {
      const point = input[j]!, next = input[(j + 1) % input.length]!;
      const distance = cross(start, end, point), nextDistance = cross(start, end, next);
      if (distance >= 0) result.push(point);
      if ((distance >= 0) !== (nextDistance >= 0)) {
        const t = distance / (distance - nextDistance);
        result.push([point[0] + t * (next[0] - point[0]), point[1] + t * (next[1] - point[1])]);
      }
    }
    if (!result.length) return [];
  }
  return compactPolygon(result);
}

const edges = (polygon: Vec2[]): Segment[] => polygon.map((point, i) => [point, polygon[(i + 1) % polygon.length]!]);
const atX = (segment: Segment, x: number): number => segment[0][1]
  + (x - segment[0][0]) * (segment[1][1] - segment[0][1]) / (segment[1][0] - segment[0][0]);

/**
 * Decompose the footprint outside the union of room floors into nonoverlapping trapezoids.
 * Room vertices and edge intersections divide X into slabs where every boundary is linear.
 * This handles concave rooms and seams between adjacent/overlapping rooms without sampling.
 */
function unsupportedRegions(scene: SceneDocument, object: SceneObject, asset: CatalogAsset): Vec2[][] {
  if (object.host || object.restsOn) object = { ...object, position: [object.position[0], floorHeight(scene, object), object.position[2]] };
  // Use the authoritative check first, including its contact and elevation tolerances.
  if (floorSupported(object, asset, scene)) return [];
  const dimensions = furnitureDimensions(object, asset);
  const halfX = dimensions[0] / 2;
  const halfZ = dimensions[2] / 2;
  const cosine = Math.cos(object.rotation), sine = Math.sin(object.rotation);
  const polygons = scene.rooms.filter(room => scene.project?.metadata[room.id]?.phase !== 'remove'
    && (scene.version === 1 || Math.abs((scene.project?.metadata[room.id]?.elevation ?? 0) - object.position[1]) < EPS))
    .map(room => room.polygon.map(([x, z]): Vec2 => {
      const dx = x - object.position[0], dz = z - object.position[2];
      return [cosine * dx - sine * dz, sine * dx + cosine * dz];
    })).filter(p => Math.min(...p.map(v => v[0])) <= halfX + EPS && Math.max(...p.map(v => v[0])) >= -halfX - EPS
      && Math.min(...p.map(v => v[1])) <= halfZ + EPS && Math.max(...p.map(v => v[1])) >= -halfZ - EPS);
  const segments = polygons.flatMap(edges);
  const critical = [-halfX, halfX];
  const addX = (x: number) => { if (x > -halfX + EPS && x < halfX - EPS) critical.push(x); };
  for (const [a, b] of segments) {
    addX(a[0]);
    if (Math.abs(b[1] - a[1]) > EPS) for (const z of [-halfZ, halfZ]) {
      const t = (z - a[1]) / (b[1] - a[1]);
      if (t > 0 && t < 1) addX(a[0] + t * (b[0] - a[0]));
    }
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const [a, b] = segments[i]!, [c, d] = segments[j]!;
    const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
    const denominator = rx * sz - rz * sx;
    if (Math.abs(denominator) < EPS) continue;
    const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / denominator;
    const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / denominator;
    const z = a[1] + t * rz;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS && z >= -halfZ - EPS && z <= halfZ + EPS) addX(a[0] + t * rx);
  }
  critical.sort((a, b) => a - b);
  const result: Vec2[][] = [];
  for (let i = 0; i < critical.length - 1; i++) {
    const left = critical[i]!, right = critical[i + 1]!;
    if (right - left < EPS) continue;
    const x = (left + right) / 2;
    const intervals: { low: Segment; high: Segment; start: number; end: number }[] = [];
    for (const polygon of polygons) {
      const crossings = edges(polygon).filter(([a, b]) => (a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x))
        .map(segment => ({ segment, z: atX(segment, x) })).sort((a, b) => a.z - b.z);
      for (let j = 0; j + 1 < crossings.length; j += 2) {
        const low = crossings[j]!, high = crossings[j + 1]!;
        intervals.push({ low: low.segment, high: high.segment, start: low.z, end: high.z });
      }
    }
    intervals.sort((a, b) => a.start - b.start);
    const bottom: Segment = [[left, -halfZ], [right, -halfZ]];
    const top: Segment = [[left, halfZ], [right, halfZ]];
    const clamp = (z: number) => Math.max(-halfZ, Math.min(halfZ, z));
    const addGap = (low: Segment, high: Segment) => {
      const local = compactPolygon([[left, clamp(atX(low, left))], [right, clamp(atX(low, right))],
        [right, clamp(atX(high, right))], [left, clamp(atX(high, left))]]);
      if (local.length) result.push(local.map(([dx, dz]) =>
        [object.position[0] + cosine * dx + sine * dz, object.position[2] - sine * dx + cosine * dz]));
    };
    let covered = -halfZ, boundary = bottom;
    for (const interval of intervals) {
      if (interval.end < covered - EPS) continue;
      if (interval.start > covered + EPS) addGap(boundary, interval.low);
      if (interval.end > covered) { covered = interval.end; boundary = interval.high; }
      if (covered >= halfZ - EPS) break;
    }
    if (covered < halfZ - EPS) addGap(boundary, top);
  }
  return result;
}

/** Read-only feedback for one live furniture transform; never mutates or commits the scene. */
export function placementConflicts(scene: SceneDocument, catalog: CatalogAsset[], candidate: SceneObject): PlacementConflict[] {
  const assets = new Map(catalog.map(asset => [asset.id, asset]));
  const asset = assets.get(candidate.assetId);
  if (!asset || scene.project?.metadata[candidate.id]?.phase === 'remove') return [];
  const footprint = objectFootprint(candidate, asset);
  const bottom = candidate.position[1], top = bottom + furnitureDimensions(candidate, asset)[1];
  const result: PlacementConflict[] = unsupportedRegions(scene, candidate, asset)
    .map(polygon => ({ kind: 'support', polygon, bottom, top: bottom }));
  if (candidate.restsOn) {
    const support = scene.objects.find(o => o.id === candidate.restsOn), supportAsset = support && assets.get(support.assetId);
    if (!support || !supportAsset || !supportContains(support, supportAsset, candidate)) result.push({kind:'support', entityId:candidate.restsOn, polygon:footprint, bottom, top:bottom});
  }
  for (const wall of scene.walls) {
    const elevation = scene.project?.metadata[wall.id]?.elevation ?? 0;
    if (scene.project?.metadata[wall.id]?.phase === 'remove' || !wallCollision(candidate, asset, wall, footprint, elevation)) continue;
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    // Windows remain barriers, matching validation. Doors split the wall into jambs, sill and lintel
    // so an oversized object highlights only solid wall material, not the empty aperture below it.
    const passages = wall.openings.filter(opening => opening.kind === 'door').sort((a, b) => a.offset - b.offset);
    const addWall = (from: number, to: number, low = 0, high = wall.height) => {
      const conflictBottom = Math.max(bottom, elevation + low), conflictTop = Math.min(top, elevation + high);
      if (conflictTop <= conflictBottom + EPS) return;
      const polygon = intersection(footprint, wallFootprint(wall, from, to));
      if (polygon.length) result.push({ kind: 'wall', entityId: wall.id, polygon,
        bottom: conflictBottom, top: conflictTop });
    };
    let cursor = 0;
    for (const passage of passages) {
      if (passage.offset > cursor + EPS) addWall(cursor, passage.offset);
      addWall(passage.offset, passage.offset + passage.width, 0, passage.sill);
      addWall(passage.offset, passage.offset + passage.width, passage.sill + passage.height, wall.height);
      cursor = passage.offset + passage.width;
    }
    if (cursor < length - EPS) addWall(cursor, length);
  }
  for (const barrier of doorBarriers(scene)) {
    const conflictBottom = Math.max(bottom, barrier.bottom), conflictTop = Math.min(top, barrier.top);
    if (conflictTop <= conflictBottom + EPS) continue;
    const polygon = intersection(footprint, barrier.polygon);
    if (polygon.length) result.push({ ...barrier, polygon, bottom: conflictBottom, top: conflictTop });
  }
  if (asset.kind !== 'rug') for (const other of scene.objects) {
    if (candidate.restsOn === other.id || other.restsOn === candidate.id) continue;
    if (other.id === candidate.id || scene.project?.metadata[other.id]?.phase === 'remove') continue;
    const otherAsset = assets.get(other.assetId);
    if (!otherAsset || otherAsset.kind === 'rug') continue;
    const otherBottom = other.position[1], otherTop = otherBottom + furnitureDimensions(other, otherAsset)[1];
    if (bottom >= otherTop || otherBottom >= top) continue;
    const polygon = intersection(footprint, objectFootprint(other, otherAsset));
    if (polygon.length) result.push({ kind: 'overlap', entityId: other.id, polygon,
      bottom: Math.max(bottom, otherBottom), top: Math.min(top, otherTop) });
  }
  return result;
}
