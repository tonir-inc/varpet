import type { Opening, SceneDocument, Vec2, Wall } from '../contracts';
import { wallLength } from './geometry';
import { openingWallObstacles, OPENING_COLLISION_EPS } from './opening-collision';

export interface PlanMeasurementSegment {
  start: Vec2;
  end: Vec2;
  length: number;
}

export interface PlanOpeningGap extends PlanMeasurementSegment {
  label: 'Left' | 'Right' | 'Top' | 'Bottom';
  boundaryKind: 'wall-end' | 'wall' | 'opening';
  boundaryId: string;
  boundaryLabel: string;
}

export interface PlanOpeningMeasurements {
  width: number;
  height: number;
  sill: number;
  headroom: number;
  wallThickness: number;
  direction: Vec2;
  normal: Vec2;
  before: PlanOpeningGap;
  opening: PlanMeasurementSegment;
  after: PlanOpeningGap;
}

type Boundary = Pick<PlanOpeningGap, 'boundaryKind' | 'boundaryId' | 'boundaryLabel'> & { offset: number };

/**
 * Plan dimensions in metres, in visual left-to-right or top-to-bottom order.
 * Gaps stop at a neighbouring opening or the nearest solid wall face, including
 * angled wall thickness and elevation. Their points remain on the host centreline
 * so a renderer can offset the entire chain by `normal` without changing values.
 * Pass the current preview scene during a gesture; this function never mutates it.
 */
export function measurePlanOpening(scene: SceneDocument, wall: Wall, opening: Opening): PlanOpeningMeasurements | undefined {
  const length = wallLength(wall);
  if (!Number.isFinite(length) || length <= OPENING_COLLISION_EPS) return;
  if (![opening.offset, opening.width, opening.height, opening.sill, wall.height, wall.thickness].every(Number.isFinite)) return;
  const metadata = scene.project?.metadata ?? {};
  const ux = (wall.end[0] - wall.start[0]) / length, uz = (wall.end[1] - wall.start[1]) / length;
  const horizontal = Math.abs(ux) >= Math.abs(uz);
  const reverse = (horizontal ? ux : uz) < 0;
  const direction: Vec2 = reverse ? [-ux, -uz] : [ux, uz];
  const near = opening.offset, far = near + opening.width;
  let low: Boundary = { offset: 0, boundaryKind: 'wall-end', boundaryId: wall.id, boundaryLabel: 'Wall end' };
  let high: Boundary = { offset: length, boundaryKind: 'wall-end', boundaryId: wall.id, boundaryLabel: 'Wall end' };

  for (const neighbour of wall.openings) {
    if (neighbour.id === opening.id || metadata[neighbour.id]?.phase === 'remove') continue;
    const boundary = {
      boundaryKind: 'opening' as const, boundaryId: neighbour.id,
      boundaryLabel: metadata[neighbour.id]?.name || (neighbour.kind === 'window' ? 'Window edge' : 'Door edge'),
    };
    if (neighbour.offset < near) {
      const offset = Math.min(near, neighbour.offset + neighbour.width);
      if (offset > low.offset) low = { ...boundary, offset };
    } else {
      const offset = Math.max(far, neighbour.offset);
      if (offset < high.offset) high = { ...boundary, offset };
    }
  }
  for (const obstacle of openingWallObstacles(scene, wall, opening)) {
    const boundary = {
      boundaryKind: 'wall' as const, boundaryId: obstacle.wallId,
      boundaryLabel: metadata[obstacle.wallId]?.name || 'Wall face',
    };
    if (obstacle.end <= near + OPENING_COLLISION_EPS) {
      const offset = Math.min(near, obstacle.end);
      if (offset > low.offset) low = { ...boundary, offset };
    } else if (obstacle.start >= far - OPENING_COLLISION_EPS) {
      const offset = Math.max(far, obstacle.start);
      if (offset < high.offset) high = { ...boundary, offset };
    } else {
      // Invalid imported intersections have no free space; never report a negative gap.
      low = { ...boundary, offset: near };
      high = { ...boundary, offset: far };
    }
  }

  const point = (offset: number): Vec2 => [wall.start[0] + ux * offset, wall.start[1] + uz * offset];
  const segment = (a: number, b: number): PlanMeasurementSegment => ({ start: point(a), end: point(b), length: Math.abs(b - a) });
  const gap = (a: number, b: number, boundary: Boundary, label: PlanOpeningGap['label']): PlanOpeningGap => ({
    ...segment(a, b), label, boundaryId: boundary.boundaryId, boundaryKind: boundary.boundaryKind, boundaryLabel: boundary.boundaryLabel,
  });
  const startLabel = horizontal ? 'Left' : 'Top', endLabel = horizontal ? 'Right' : 'Bottom';
  const lowOffset = Math.min(near, low.offset), highOffset = Math.max(far, high.offset);
  return {
    width: opening.width, height: opening.height, sill: opening.sill,
    headroom: Math.max(0, wall.height - opening.sill - opening.height), wallThickness: wall.thickness,
    direction, normal: [-direction[1], direction[0]],
    before: reverse ? gap(highOffset, far, high, startLabel) : gap(lowOffset, near, low, startLabel),
    opening: reverse ? segment(far, near) : segment(near, far),
    after: reverse ? gap(near, lowOffset, low, endLabel) : gap(far, highOffset, high, endLabel),
  };
}
