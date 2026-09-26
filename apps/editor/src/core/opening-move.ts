import type { Opening, SceneDocument, Wall } from '../contracts';
import { wallLength } from './geometry';
import { openingWallObstacles, OPENING_COLLISION_EPS } from './opening-collision';

export const OPENING_MOVE_SNAP = 0.05;

export interface OpeningMoveContext {
  wall: Wall;
  opening: Opening;
  minOffset: number;
  maxOffset: number;
}

/** The continuous free interval around an opening; dragging cannot cross neighbours or walls. */
export function findOpeningMove(scene: SceneDocument, id: string): OpeningMoveContext | undefined {
  const wall = scene.walls.find(item => item.openings.some(opening => opening.id === id));
  const opening = wall?.openings.find(item => item.id === id);
  if (!wall || !opening || scene.project?.metadata[wall.id]?.locked || scene.project?.metadata[id]?.locked) return;

  let minOffset = 0;
  let maxOffset = wallLength(wall) - opening.width;
  for (const neighbour of wall.openings) {
    if (neighbour.id === id) continue;
    // Scene validation forbids horizontal overlap even when sill heights differ.
    // Exact edge contact is valid; keep bounds exact rather than using its tolerance as extra space.
    if (neighbour.offset < opening.offset) minOffset = Math.max(minOffset, neighbour.offset + neighbour.width);
    else maxOffset = Math.min(maxOffset, neighbour.offset - opening.width);
  }
  for (const obstacle of openingWallObstacles(scene, wall, opening)) {
    if (obstacle.end <= opening.offset + OPENING_COLLISION_EPS) minOffset = Math.max(minOffset, obstacle.end);
    else if (obstacle.start >= opening.offset + opening.width - OPENING_COLLISION_EPS) maxOffset = Math.min(maxOffset, obstacle.start - opening.width);
    else return; // An invalid imported placement must be corrected before starting a drag.
  }
  if (minOffset > maxOffset) return;
  return { wall, opening, minOffset, maxOffset };
}

/** Snap the near-edge offset in metres, then clamp so snapping cannot leave the free interval. */
export function constrainOpeningOffset(context: OpeningMoveContext, offset: number, snap: boolean): number {
  const value = Number.isFinite(offset) ? offset : context.opening.offset;
  const stepsPerMetre = 1 / OPENING_MOVE_SNAP;
  const candidate = snap ? Math.round(value * stepsPerMetre) / stepsPerMetre : value;
  return Math.max(context.minOffset, Math.min(context.maxOffset, candidate));
}
