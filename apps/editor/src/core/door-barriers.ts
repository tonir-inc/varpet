import { openingMechanism } from './opening-catalog';
import type { SceneDocument, Vec2 } from '../contracts';

export interface DoorBarrier {
  entityId: string;
  kind: 'door' | 'door-swing';
  polygon: Vec2[];
  bottom: number;
  top: number;
}

const ARC_TOLERANCE = 0.0001;
const cross = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const rectangle = (left: number, right: number, back: number, front: number): Vec2[] =>
  [[left, back], [right, back], [right, front], [left, front]];

/** Monotone hull, with positive area and counterclockwise winding. */
function hull(points: Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const chain = (vertices: Vec2[]) => {
    const result: Vec2[] = [];
    for (const vertex of vertices) {
      while (result.length > 1 && cross(result[result.length - 2]!, result[result.length - 1]!, vertex) <= 1e-12) result.pop();
      result.push(vertex);
    }
    return result;
  };
  const lower = chain(sorted), upper = chain([...sorted].reverse());
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function halfAtBisector(polygon: Vec2[], upper: boolean): Vec2[] {
  const result: Vec2[] = [];
  const distance = ([x, z]: Vec2) => (z - x) * (upper ? 1 : -1);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const da = distance(a), db = distance(b);
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return hull(result);
}

/**
 * Full travel of [0,width] × [-halfThickness,halfThickness] through a positive quarter turn.
 * Each half of the leaf sweeps a convex region. Below the diagonal the lower half's sweep
 * contains the upper half's sweep; above it the converse holds. Splitting there produces two
 * disjoint convex regions, including unusually thick leaves, without filling the empty
 * quadrant behind the hinge. Tangent intersections enclose each circular tip arc with no
 * missed angle and at most 0.1 mm excess radius; an inscribed polygon would miss collisions.
 */
function hingedSweep(width: number, halfThickness: number): Vec2[][] {
  const radius = Math.hypot(width, halfThickness);
  const steps = Math.max(1, Math.ceil((Math.PI / 2) / (2 * Math.acos(radius / (radius + ARC_TOLERANCE)))));
  const increment = Math.PI / 2 / steps;
  return [-1, 1].map(side => {
    const start = Math.atan2(side * halfThickness, width);
    const points: Vec2[] = [[0, 0], [width, 0], [0, side * halfThickness], [0, width], [-side * halfThickness, 0]];
    for (let i = 0; i <= steps; i++) {
      const angle = start + i * increment;
      points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
      if (i < steps) {
        const tangentRadius = radius / Math.cos(increment / 2), midpoint = angle + increment / 2;
        points.push([tangentRadius * Math.cos(midpoint), tangentRadius * Math.sin(midpoint)]);
      }
    }
    return halfAtBisector(hull(points), side === 1);
  });
}

/**
 * Read-only furniture barriers for installed doors and their complete preview travel.
 * Dimensions/defaults match render/structure.ts makeOpening; preview angle is not scene data.
 * Hinged/casement/double leaves use bounded swept prisms. Sliding/pocket leaves follow the
 * renderer's wall-side offset and linear translation. Tilt doors use a conservative prism
 * around the entire 29.7° bottom-hinged motion: X/Z × height cannot express an inclined slab,
 * so the empty space below/behind that inclined leaf may also be reported as clearance.
 * Hardware is excluded. Windows retain their existing wall collision policy.
 */
export function doorBarriers(scene: SceneDocument): DoorBarrier[] {
  const barriers: DoorBarrier[] = [], metadata = scene.project?.metadata ?? {};
  for (const wall of scene.walls) {
    if (metadata[wall.id]?.phase === 'remove') continue;
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    if (length <= 0) continue;
    const dx = (wall.end[0] - wall.start[0]) / length, dz = (wall.end[1] - wall.start[1]) / length;
    for (const opening of wall.openings) {
      const meta = metadata[opening.id] ?? {};
      if (opening.kind !== 'door' || meta.phase === 'remove') continue;
      const base = (metadata[wall.id]?.elevation ?? 0) + opening.sill;
      const frame = Math.min(meta.frameWidth ?? 0.045, opening.width / 5, opening.height / 5);
      const width = Math.max(0.01, opening.width - frame * 2);
      const bottom = Math.min(meta.threshold ?? 0, opening.height / 4);
      const height = Math.max(0.01, opening.height - frame - bottom);
      const thickness = meta.leafThickness ?? 0.035;
      const mechanism = openingMechanism(opening, meta);
      const swing = meta.swing ?? 1;
      const add = (polygon: Vec2[], low: number, high: number, kind: DoorBarrier['kind']) => {
        const world = hull(polygon.map(([along, across]): Vec2 => [
          wall.start[0] + dx * (opening.offset + along) - dz * across,
          wall.start[1] + dz * (opening.offset + along) + dx * across,
        ]));
        if (world.length >= 3 && high > low) barriers.push({ entityId: opening.id, kind, polygon: world, bottom: base + low, top: base + high });
      };
      if (frame > 0) {
        const depth = wall.thickness / 2 + 0.01;
        add(rectangle(0, frame, -depth, depth), 0, opening.height, 'door');
        add(rectangle(opening.width - frame, opening.width, -depth, depth), 0, opening.height, 'door');
        add(rectangle(0, opening.width, -depth, depth), opening.height - frame, opening.height, 'door');
      }
      if (meta.threshold) {
        // The projection centers this trim at frame/2, even when the threshold is taller.
        const thresholdHeight = Math.max(frame, meta.threshold), depth = wall.thickness / 2 + 0.04;
        add(rectangle(0, opening.width, -depth, depth), (frame - thresholdHeight) / 2, (frame + thresholdHeight) / 2, 'door');
      }
      const count = mechanism === 'double' ? 2 : 1, leafWidth = width / count;
      for (let leaf = 0; leaf < count; leaf++) {
        const right = count === 2 ? leaf === 1 : meta.hinge === 'right';
        const sign = right ? -1 : 1, pivot = right ? opening.width - frame : frame;
        const orient = (polygon: Vec2[]) => polygon.map(([x, z]): Vec2 => [pivot + sign * x, swing * z]);
        if (mechanism === 'sliding' || mechanism === 'pocket') {
          const offset = wall.thickness / 2 + thickness;
          const ends = [pivot, pivot + sign * (leafWidth + width)].sort((a, b) => a - b);
          add(rectangle(ends[0]!, ends[1]!, offset - thickness / 2, offset + thickness / 2), bottom, bottom + height, 'door-swing');
        } else if (mechanism === 'fixed') {
          add(orient(rectangle(0, leafWidth, -thickness / 2, thickness / 2)), bottom, bottom + height, 'door');
        } else if (mechanism === 'tilt') {
          const angle = Math.PI / 2 * 0.33, half = thickness / 2;
          const peakDepthAngle = Math.min(angle, Math.atan2(height, half));
          const depth = height * Math.sin(peakDepthAngle) + half * Math.cos(peakDepthAngle);
          const peakHeightAngle = Math.min(angle, Math.atan2(half, height));
          const top = height * Math.cos(peakHeightAngle) + half * Math.sin(peakHeightAngle);
          add(orient(rectangle(0, leafWidth, -half, depth)), bottom - half * Math.sin(angle), bottom + top, 'door-swing');
        } else {
          for (const polygon of hingedSweep(leafWidth, thickness / 2)) add(orient(polygon), bottom, bottom + height, 'door-swing');
        }
      }
    }
  }
  return barriers;
}
