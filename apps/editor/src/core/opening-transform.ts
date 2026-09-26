import type { Opening, SceneDocument, Wall } from '../contracts';
import { wallLength } from './geometry';
import { openingWallObstacles, OPENING_COLLISION_EPS } from './opening-collision';
import { OPENING_MOVE_SNAP } from './opening-move';
import { emptyProject } from './renovation';

export type OpeningTransformMode = 'move' | 'move-x' | 'move-y' | 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type OpeningDimensions = Pick<Opening, 'offset' | 'sill' | 'width' | 'height'>;
interface Obstacle { start: number; end: number; bottom: number; top: number }
export interface OpeningTransformContext {
  scene: SceneDocument;
  wall: Wall;
  opening: Opening;
  /** Free edge bounds between same-wall neighbours, independent of sill height. */
  minAlong: number;
  maxAlong: number;
  /** Horizontal translation limits for the original width. */
  minOffset: number;
  maxOffset: number;
  obstacles: readonly Obstacle[];
  /** Other intersecting apertures must not be filled by this host's new solid area. */
  retainedClearance?: Obstacle;
}

const MIN_SIZE = 0.2;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const dimensions = ({ offset, sill, width, height }: OpeningDimensions): OpeningDimensions => ({ offset, sill, width, height });

/** Partition intersecting solids at their vertical boundaries using the shared collision contract. */
function transformObstacles(scene: SceneDocument, host: Wall, opening: Opening): Obstacle[] {
  const result: Obstacle[] = [];
  const hostBase = scene.project?.metadata[host.id]?.elevation ?? 0;
  for (const other of scene.walls) {
    if (other.id === host.id || scene.project?.metadata[other.id]?.phase === 'remove') continue;
    const base = (scene.project?.metadata[other.id]?.elevation ?? 0) - hostBase;
    const levels = [...new Set([0, host.height, base, base + other.height,
      ...other.openings.flatMap(aperture => [base + aperture.sill, base + aperture.sill + aperture.height])]
      .filter(value => value >= 0 && value <= host.height))].sort((a, b) => a - b);
    const pair = { ...scene, walls: [host, other] };
    for (let index = 1; index < levels.length; index++) {
      const bottom = levels[index - 1]!, top = levels[index]!;
      if (top - bottom <= OPENING_COLLISION_EPS) continue;
      for (const span of openingWallObstacles(pair, host, { ...opening, sill: bottom, height: top - bottom })) {
        result.push({ start: span.start, end: span.end, bottom, top });
      }
    }
  }
  return result;
}

function retainedClearance(scene: SceneDocument, host: Wall, opening: Opening): Obstacle | undefined {
  const hostBase = scene.project?.metadata[host.id]?.elevation ?? 0;
  let retained: Obstacle | undefined;
  for (const other of scene.walls) {
    if (other.id === host.id || scene.project?.metadata[other.id]?.phase === 'remove') continue;
    const length = wallLength(other), ux = (other.end[0] - other.start[0]) / length, uz = (other.end[1] - other.start[1]) / length;
    for (const aperture of other.openings) {
      if (scene.project?.metadata[aperture.id]?.phase === 'remove') continue;
      const base = (scene.project?.metadata[other.id]?.elevation ?? 0) + aperture.sill;
      const bottom = Math.max(0, base - hostBase), top = Math.min(host.height, base + aperture.height - hostBase);
      if (top <= bottom + OPENING_COLLISION_EPS) continue;
      // Treat the other aperture's volume as a solid temporarily to obtain its
      // exact overlap with the host using the same wall-thickness geometry.
      const volume: Wall = { ...other, height: aperture.height, openings: [],
        start: [other.start[0] + ux * aperture.offset, other.start[1] + uz * aperture.offset],
        end: [other.start[0] + ux * (aperture.offset + aperture.width), other.start[1] + uz * (aperture.offset + aperture.width)] };
      const project = scene.project ?? emptyProject();
      const pair = { ...scene, walls: [host, volume], project: { ...project,
        metadata: { ...project.metadata, [other.id]: { ...project.metadata[other.id], elevation: base } } } };
      for (const span of openingWallObstacles(pair, host, opening)) {
        if (span.start >= opening.offset + opening.width - OPENING_COLLISION_EPS || span.end <= opening.offset + OPENING_COLLISION_EPS) continue;
        retained = retained ? { start: Math.min(retained.start, span.start), end: Math.max(retained.end, span.end),
          bottom: Math.min(retained.bottom, bottom), top: Math.max(retained.top, top) } : { start: span.start, end: span.end, bottom, top };
      }
    }
  }
  return retained;
}

/** A drag owns the original checked snapshot; doors retain their existing horizontal move path. */
export function findOpeningTransform(scene: SceneDocument, id: string): OpeningTransformContext | undefined {
  const wall = scene.walls.find(candidate => candidate.openings.some(opening => opening.id === id));
  const opening = wall?.openings.find(candidate => candidate.id === id);
  if (!wall || !opening || opening.kind !== 'window') return;
  if ([wall.id, id].some(entity => scene.project?.metadata[entity]?.locked || scene.project?.metadata[entity]?.phase === 'remove')) return;
  let minAlong = 0, maxAlong = wallLength(wall);
  for (const neighbour of wall.openings) {
    if (neighbour.id === id) continue;
    // Document validation disallows horizontal overlap at every sill height,
    // including openings whose removal is only a proposed renovation phase.
    if (neighbour.offset < opening.offset) minAlong = Math.max(minAlong, neighbour.offset + neighbour.width);
    else maxAlong = Math.min(maxAlong, neighbour.offset);
  }
  if (opening.width < MIN_SIZE || opening.height < MIN_SIZE || opening.offset < minAlong - OPENING_COLLISION_EPS
    || opening.offset + opening.width > maxAlong + OPENING_COLLISION_EPS || opening.sill < 0
    || opening.sill + opening.height > wall.height + OPENING_COLLISION_EPS) return;
  if (openingWallObstacles(scene, wall, opening).some(obstacle => opening.offset < obstacle.end - OPENING_COLLISION_EPS
    && opening.offset + opening.width > obstacle.start + OPENING_COLLISION_EPS)) return;
  const retained = retainedClearance(scene, wall, opening);
  return { scene, wall, opening, minAlong, maxAlong,
    minOffset: Math.max(minAlong, retained ? retained.end - opening.width : minAlong),
    maxOffset: Math.min(maxAlong - opening.width, retained?.start ?? maxAlong),
    obstacles: transformObstacles(scene, wall, opening), retainedClearance: retained };
}

/** First solid contact during the full drag path, so large pointer deltas cannot tunnel. */
function contactTime(before: OpeningDimensions, after: OpeningDimensions, obstacle: Obstacle): number {
  let enter = 0, leave = 1;
  const inequalities = [
    [before.offset + before.width - obstacle.start, after.offset + after.width - obstacle.start],
    [obstacle.end - before.offset, obstacle.end - after.offset],
    [before.sill + before.height - obstacle.bottom, after.sill + after.height - obstacle.bottom],
    [obstacle.top - before.sill, obstacle.top - after.sill],
  ];
  for (const [start, end] of inequalities as [number, number][]) {
    const change = end - start;
    if (change === 0) { if (start <= 0) return 1; }
    else if (change > 0) enter = Math.max(enter, -start / change);
    else leave = Math.min(leave, -start / change);
  }
  return enter < leave && enter < 1 && leave > 0 ? Math.max(0, enter) : 1;
}

/** Deltas are host-local metres from pointer-down; snapping never moves an untouched axis. */
export function constrainOpeningTransform(context: OpeningTransformContext, mode: OpeningTransformMode, deltaAlong: number, deltaUp: number, snap: boolean): OpeningDimensions {
  const original = dimensions(context.opening);
  if (!Number.isFinite(deltaAlong) || !Number.isFinite(deltaUp)) return original;
  const snapDelta = (value: number) => {
    if (!snap) return value;
    const snapped = Math.round(value / OPENING_MOVE_SNAP) * OPENING_MOVE_SNAP;
    return Number.isFinite(snapped) ? snapped : value;
  };
  const dx = snapDelta(deltaAlong), dy = snapDelta(deltaUp);
  const next = { ...original };
  const moveX = mode === 'move' || mode === 'move-x', moveY = mode === 'move' || mode === 'move-y';
  const left = mode === 'left' || mode === 'top-left' || mode === 'bottom-left';
  const right = mode === 'right' || mode === 'top-right' || mode === 'bottom-right';
  const top = mode === 'top' || mode === 'top-left' || mode === 'top-right';
  const bottom = mode === 'bottom' || mode === 'bottom-left' || mode === 'bottom-right';
  const retained = context.retainedClearance;
  if (dx !== 0) {
    if (moveX) next.offset = clamp(original.offset + dx, context.minOffset, context.maxOffset);
    if (left) { next.width = clamp(original.width - dx, Math.max(MIN_SIZE, retained ? original.offset + original.width - retained.start : MIN_SIZE), original.offset + original.width - context.minAlong); next.offset = original.offset + original.width - next.width; }
    if (right) next.width = clamp(original.width + dx, Math.max(MIN_SIZE, retained ? retained.end - original.offset : MIN_SIZE), context.maxAlong - original.offset);
  }
  if (dy !== 0) {
    if (moveY) next.sill = clamp(original.sill + dy, Math.max(0, retained ? retained.top - original.height : 0), Math.min(context.wall.height - original.height, retained?.bottom ?? context.wall.height));
    if (top) next.height = clamp(original.height + dy, Math.max(MIN_SIZE, retained ? retained.top - original.sill : MIN_SIZE), context.wall.height - original.sill);
    if (bottom) { next.height = clamp(original.height - dy, Math.max(MIN_SIZE, retained ? original.sill + original.height - retained.bottom : MIN_SIZE), original.sill + original.height); next.sill = original.sill + original.height - next.height; }
  }
  let time = 1;
  for (const obstacle of context.obstacles) time = Math.min(time, contactTime(original, next, obstacle));
  if (time === 1) return next;
  if (time === 0) return original;
  return {
    offset: original.offset + (next.offset - original.offset) * time,
    sill: original.sill + (next.sill - original.sill) * time,
    width: original.width + (next.width - original.width) * time,
    height: original.height + (next.height - original.height) * time,
  };
}
