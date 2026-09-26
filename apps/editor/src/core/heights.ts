import type { Operation, Room, SceneDocument, Wall } from '../contracts';
import { wallSurfaceSpans } from './wall-surfaces';

export const DEFAULT_CEILING_HEIGHT = 2.8;
export type HeightTarget = { kind: 'wall' | 'room'; id: string };
const EPS = 1e-5;
const active = (scene: SceneDocument, id: string) => scene.project?.metadata[id]?.phase !== 'remove';
export const hasRoomCeiling = (scene: SceneDocument, room: Room) => !['balcony', 'terrace'].includes(scene.project?.metadata[room.id]?.zone ?? 'interior');

function adjoining(scene: SceneDocument, wall: Wall, room: Room): boolean {
  const base = scene.project?.metadata[wall.id]?.elevation ?? 0;
  const floor = scene.project?.metadata[room.id]?.elevation ?? 0;
  return active(scene, wall.id) && base <= floor + EPS && base + wall.height > floor + EPS
    && wallSurfaceSpans(wall, [room]).some(span => span.front || span.back);
}

/** A provisional preview inferred from the local shell; never writes evidence. */
export function roomCeilingHeight(scene: SceneDocument, room: Room): number {
  const metadata = scene.project?.metadata[room.id];
  if (metadata?.ceilingHeight !== undefined) return metadata.ceilingHeight;
  const floor = metadata?.elevation ?? 0;
  const heights = scene.walls.filter(wall => adjoining(scene, wall, room))
    .map(wall => (scene.project?.metadata[wall.id]?.elevation ?? 0) + wall.height - floor);
  return heights.length ? Math.max(...heights) : DEFAULT_CEILING_HEIGHT;
}

export function apartmentHeights(scene: SceneDocument): number[] {
  return [...scene.walls.filter(wall => active(scene, wall.id)).map(wall => wall.height),
    ...scene.rooms.filter(room => active(scene, room.id) && hasRoomCeiling(scene, room)).map(room => roomCeilingHeight(scene, room))];
}

/** One transaction: existing checks protect openings, hosts, revisions and history. */
export function buildHeightOperations(scene: SceneDocument, height: number, target?: HeightTarget): Operation[] {
  const maximum = target?.kind === 'room' ? 10 : 6;
  if (!Number.isFinite(height) || height < 0.2 || height > maximum) throw new Error(`Enter a height between 0.2 and ${maximum} metres.`);
  const requireEditable = (id: string) => {
    if (!active(scene, id)) throw new Error('Restore this element before changing its height.');
    if (scene.project?.metadata[id]?.locked) throw new Error('Unlock the affected walls and rooms in Renovate before changing their height.');
  };
  if (target && !(target.kind === 'wall' ? scene.walls : scene.rooms).some(item => item.id === target.id)) throw new Error('This element no longer exists.');
  const rooms = scene.rooms.filter(room => target ? target.kind === 'room' && room.id === target.id : active(scene, room.id) && hasRoomCeiling(scene, room));
  const walls = scene.walls.filter(wall => target ? target.kind === 'wall' && wall.id === target.id : active(scene, wall.id));
  const operations: Operation[] = [];
  for (const wall of walls) {
    const base = scene.project?.metadata[wall.id]?.elevation ?? 0;
    // A shared wall must reach the ceiling above the higher adjoining floor.
    const top = Math.max(base + height, ...rooms.filter(room => adjoining(scene, wall, room)).map(room => (scene.project?.metadata[room.id]?.elevation ?? 0) + height));
    const next = top - base;
    if (next > 6 + EPS) throw new Error('This height would make a wall taller than 6 metres across the floor elevations. Edit the rooms individually.');
    if (target) requireEditable(wall.id);
    if (Math.abs(wall.height - next) < EPS) continue;
    requireEditable(wall.id);
    const blockedOpening = wall.openings.find(opening => opening.sill + opening.height > next + EPS);
    if (blockedOpening) throw new Error(`Height must reach the top of ${blockedOpening.kind} “${blockedOpening.id}” (${(blockedOpening.sill + blockedOpening.height).toFixed(2)} m). Resize the opening first.`);
    operations.push({ type: 'update-wall', id: wall.id, patch: { height: next } });
  }
  for (const room of rooms) {
    if (target) requireEditable(room.id);
    if (!hasRoomCeiling(scene, room)) throw new Error('This outdoor space has no ceiling. Edit its walls individually.');
    if (scene.project?.metadata[room.id]?.ceilingHeight === height) continue;
    requireEditable(room.id);
    operations.push({ type: 'set-metadata', id: room.id, patch: { ceilingHeight: height } });
  }
  return operations.length && !scene.project ? [{ type: 'migrate-project' }, ...operations] : operations;
}
