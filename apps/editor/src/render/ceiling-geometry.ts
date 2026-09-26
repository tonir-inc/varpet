import * as THREE from 'three';
import type { Room, SceneDocument, Vec2 } from '../contracts';
import { roomCeilingHeight } from '../core/heights';
import { wallFootprint } from './wall-geometry';

const EPS = 1e-5;
const MAX_SEAM = .1;
const OVERLAP = .02;
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const subtract = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];

/** Clear-floor outlines can stop slightly short of traced wall faces. Close
 * only those narrow seams, with an overlap inside the actual wall footprint.
 * Free edges, outdoor space and walls below this ceiling remain untouched.
 * The visible underside and shadow roof must use the same coverage. */
export function makeCeilingGeometry(scene: SceneDocument, room: Room, upward = false): THREE.BufferGeometry {
  const metadata = scene.project?.metadata ?? {};
  const ceilingY = (metadata[room.id]?.elevation ?? 0) + roomCeilingHeight(scene, room);
  const polygon = room.polygon;
  const area = polygon.reduce((sum, point, i) => sum + cross(point, polygon[(i + 1) % polygon.length]!), 0);
  const winding = area < 0 ? -1 : 1;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const triangle = (a: Vec2, b: Vec2, c: Vec2) => {
    const signedArea = cross(subtract(b, a), subtract(c, a));
    if (Math.abs(signedArea) < 1e-12) return;
    if ((signedArea > 0) === upward) [b, c] = [c, b];
    for (const [x, z] of [a, b, c]) { positions.push(x, 0, z); normals.push(0, upward ? 1 : -1, 0); uvs.push(x, z); }
  };
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(polygon.map(([x, z]) => new THREE.Vector2(x, z)), [])) {
    triangle(polygon[a!]!, polygon[b!]!, polygon[c!]!);
  }
  const walls = scene.walls.filter(wall => {
    const base = metadata[wall.id]?.elevation ?? 0;
    return metadata[wall.id]?.phase !== 'remove' && base < ceilingY - EPS && base + wall.height >= ceilingY - EPS;
  }).map(wall => {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    return { overlap: Math.min(OVERLAP, wall.thickness / 2, length / 2),
      footprint: wallFootprint(wall, scene.walls, metadata).map(([x, z]): Vec2 =>
        [wall.start[0] + (x * dx - z * dz) / length, wall.start[1] + (x * dz + z * dx) / length]) };
  });
  const edges = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!, delta = subtract(b, a), length = Math.hypot(...delta);
    const u: Vec2 = length > EPS ? [delta[0] / length, delta[1] / length] : [0, 0];
    const outward: Vec2 = [winding * u[1], -winding * u[0]];
    const edge = { outward, startDepth: 0, endDepth: 0 };
    if (length <= EPS) return edge;
    for (const { footprint, overlap } of walls) for (let j = 0; j < footprint.length; j++) {
      const p = footprint[j]!, q = footprint[(j + 1) % footprint.length]!;
      const direction = subtract(q, p), wallLength = Math.hypot(...direction);
      if (wallLength <= EPS) continue;
      // Wall footprints wind counterclockwise; their inward normal must face
      // out of this room. Includes pier end faces as well as long wall faces.
      const inward: Vec2 = [-direction[1] / wallLength, direction[0] / wallLength];
      if (dot(inward, outward) < 1 - EPS) continue;
      const gap = dot(subtract(p, a), outward);
      if (gap < -EPS || gap > MAX_SEAM) continue;
      const pAlong = dot(subtract(p, a), u), qAlong = dot(subtract(q, a), u);
      const start = Math.max(0, Math.min(pAlong, qAlong)), end = Math.min(length, Math.max(pAlong, qAlong));
      if (end - start <= EPS) continue;
      const gapAt = (along: number) => gap + dot(subtract(q, p), outward) * (along - pAlong) / (qAlong - pAlong);
      const startGap = gapAt(start), endGap = gapAt(end);
      if (Math.min(startGap, endGap) < -EPS || Math.max(startGap, endGap) > MAX_SEAM) continue;
      const startDepth = Math.max(0, startGap) + overlap, endDepth = Math.max(0, endGap) + overlap;
      const at = (along: number, away: number): Vec2 => [a[0] + u[0] * along + outward[0] * away, a[1] + u[1] * along + outward[1] * away];
      const left = at(start, 0), right = at(end, 0), outerLeft = at(start, startDepth), outerRight = at(end, endDepth);
      triangle(left, right, outerRight); triangle(left, outerRight, outerLeft);
      if (start < EPS) edge.startDepth = Math.max(edge.startDepth, startDepth);
      if (end > length - EPS) edge.endDepth = Math.max(edge.endDepth, endDepth);
    }
    return edge;
  });
  // Join adjacent strips at convex corners. Separate triangles avoid changing
  // or self-intersecting the room outline around narrow concave returns.
  polygon.forEach((point, i) => {
    const previous = edges[(i + edges.length - 1) % edges.length]!, next = edges[i]!;
    if (!previous.endDepth || !next.startDepth || winding * cross(previous.outward, next.outward) <= EPS) return;
    const p: Vec2 = [point[0] + previous.outward[0] * previous.endDepth, point[1] + previous.outward[1] * previous.endDepth];
    const q: Vec2 = [point[0] + next.outward[0] * next.startDepth, point[1] + next.outward[1] * next.startDepth];
    const determinant = cross(previous.outward, next.outward);
    const miter: Vec2 = [
      (previous.endDepth * next.outward[1] - next.startDepth * previous.outward[1]) / determinant,
      (previous.outward[0] * next.startDepth - next.outward[0] * previous.endDepth) / determinant,
    ];
    if (Math.hypot(...miter) <= 4 * Math.max(previous.endDepth, next.startDepth)) {
      const corner: Vec2 = [point[0] + miter[0], point[1] + miter[1]];
      triangle(point, p, corner); triangle(point, corner, q);
    } else triangle(point, p, q);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}
