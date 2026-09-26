import * as THREE from 'three';
import type { EntityMetadata, Vec2, Wall } from '../contracts';

const EPS = 1e-6;
const MITER_LIMIT = 4;
const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

/** A wall's physical footprint in its own X/Z coordinates. Connected outer
 * faces meet at the intersection of their offset lines, including unequal
 * thicknesses. Inner overlaps are retained only when trimming would invert
 * a short return that is narrower than its neighbouring walls. No authored
 * endpoints are moved and nearby, disconnected walls are never snapped. */
export function wallFootprint(wall: Wall, walls: readonly Wall[], metadata: Record<string, EntityMetadata> = {}, padding = 0): Vec2[] {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const half = wall.thickness / 2 + padding;
  const base = metadata[wall.id]?.elevation ?? 0;
  const extension = (atEnd: boolean, side: 1 | -1): number => {
    const point = atEnd ? wall.end : wall.start;
    const sign = atEnd ? -1 : 1;
    const u: Vec2 = [sign * (wall.end[0] - wall.start[0]) / length, sign * (wall.end[1] - wall.start[1]) / length];
    const hasOpeningAt = (source: Wall, offset: number) => source.openings.some(opening => offset >= opening.offset - EPS && offset <= opening.offset + opening.width + EPS);
    let openJunction = hasOpeningAt(wall, atEnd ? length : 0);
    let nearest: { direction: Vec2; half: number; angle: number } | undefined;
    for (const other of walls) {
      if (other.id === wall.id || Math.abs((metadata[other.id]?.elevation ?? 0) - base) > EPS || Math.abs(other.height - wall.height) > EPS
        || (metadata[other.id]?.phase === 'remove') !== (metadata[wall.id]?.phase === 'remove')) continue;
      const dx = other.end[0] - other.start[0], dz = other.end[1] - other.start[1];
      const otherLength = Math.hypot(dx, dz);
      if (otherLength < EPS) continue;
      const along = ((point[0] - other.start[0]) * dx + (point[1] - other.start[1]) * dz) / otherLength;
      const away = Math.abs((point[0] - other.start[0]) * dz - (point[1] - other.start[1]) * dx) / otherLength;
      if (away > EPS || along < -EPS || along > otherLength + EPS) continue;
      openJunction ||= hasOpeningAt(other, along);
      // A T host contributes both outgoing rays, even before topology splitting.
      for (const directionSign of [-1, 1]) {
        if (directionSign < 0 ? along < EPS : along > otherLength - EPS) continue;
        const v: Vec2 = [directionSign * dx / otherLength, directionSign * dz / otherLength];
        let angle = Math.atan2(side * cross(u, v), u[0] * v[0] + u[1] * v[1]);
        if (angle < 0) angle += 2 * Math.PI;
        if (angle < EPS || 2 * Math.PI - angle < EPS) continue;
        if (!nearest || angle < nearest.angle) nearest = { direction: v, half: other.thickness / 2 + padding, angle };
      }
    }
    if (!nearest) return 0;
    const v = nearest.direction, determinant = cross(u, v);
    // Collinear joins need no extension.
    if (Math.abs(determinant) < EPS) return 0;
    const delta: Vec2 = [side * (v[1] * nearest.half + u[1] * half), -side * (v[0] * nearest.half + u[0] * half)];
    const distance = cross(delta, v) / determinant;
    // A very acute join, or an almost straight join with unequal thicknesses,
    // can put the line intersection many metres away. Keep the original butt
    // endpoint instead. Both members measure the same corner radius, so this
    // fallback is symmetric and cannot create an unbounded projection spike.
    if (Math.hypot(distance, half) > MITER_LIMIT * Math.max(half, nearest.half)) return 0;
    // An opening can remove one junction ray below its lintel. Retain the
    // original inner overlap through the wall height rather than cutting a
    // wedge that assumes the neighbouring wall remains solid at every height.
    return openJunction ? Math.min(0, distance) : distance;
  };
  if (length < EPS) return [];
  const startBack = extension(false, -1), endBack = extension(true, 1);
  const startFront = extension(false, 1), endFront = extension(true, -1);
  const keepOverlaps = startBack + endBack >= length - EPS || startFront + endFront >= length - EPS;
  const inset = (value: number) => keepOverlaps ? Math.min(0, value) : value;
  return [[inset(startBack), -half], [length - inset(endBack), -half],
    [length - inset(endFront), half], [inset(startFront), half]];
}

/** Clip at opening/finish boundaries, leaving endpoint miters intact when the
 * respective bound is infinite. Face material indices match BoxGeometry. */
export function wallPrismGeometry(footprint: readonly Vec2[], bottom: number, top: number, start = -Infinity, end = Infinity): THREE.BufferGeometry {
  let polygon = footprint.map(([x, z]): Vec2 => [x, z]);
  for (const [bound, sign] of [[start, 1], [end, -1]] as const) {
    if (!Number.isFinite(bound)) continue;
    const clipped: Vec2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const aInside = sign * (a[0] - bound) >= -EPS, bInside = sign * (b[0] - bound) >= -EPS;
      if (aInside) clipped.push(a);
      if (aInside !== bInside) clipped.push([bound, a[1] + (b[1] - a[1]) * (bound - a[0]) / (b[0] - a[0])]);
    }
    polygon = clipped;
  }
  const geometry = new THREE.BufferGeometry();
  if (polygon.length < 3 || top <= bottom) return geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, material: number): void => {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const offset = positions.length / 3;
    for (const point of [a, b, c]) { positions.push(point.x, point.y, point.z); normals.push(normal.x, normal.y, normal.z); uvs.push(point.x, point.y); }
    const previous = geometry.groups.at(-1);
    if (previous?.materialIndex === material) previous.count += 3;
    else geometry.addGroup(offset, 3, material);
  };
  const point = (index: number, y: number) => new THREE.Vector3(polygon[index]![0], y, polygon[index]![1]);
  const back = Math.min(...footprint.map(p => p[1])), front = Math.max(...footprint.map(p => p[1]));
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const a = polygon[i]!, b = polygon[j]!;
    const material = Math.abs(a[1] - front) < EPS && Math.abs(b[1] - front) < EPS ? 4
      : Math.abs(a[1] - back) < EPS && Math.abs(b[1] - back) < EPS ? 5 : 0;
    triangle(point(i, bottom), point(i, top), point(j, top), material);
    triangle(point(i, bottom), point(j, top), point(j, bottom), material);
  }
  const caps = THREE.ShapeUtils.triangulateShape(polygon.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [a, b, c] of caps) triangle(point(a!, bottom), point(b!, bottom), point(c!, bottom), 3);
  for (const [a, b, c] of caps) triangle(point(a!, top), point(c!, top), point(b!, top), 2);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}
