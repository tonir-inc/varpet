import type { Opening, SceneDocument, Wall } from '../contracts';
import { roomCeilingHeight } from './heights';
import { wallSurfaceSpans } from './wall-surfaces';

export interface InspectorOpening { wall: Wall; opening: Opening }

/** Opening selection must remain available when cutaway hides its host wall. */
export function inspectorOpenings(scene: SceneDocument, id: string): InspectorOpening[] {
  const selectedWall = scene.walls.find(wall => wall.id === id);
  if (selectedWall) return selectedWall.openings.map(opening => ({ wall: selectedWall, opening }));
  const room = scene.rooms.find(candidate => candidate.id === id);
  if (!room) return [];
  const metadata = scene.project?.metadata ?? {};
  const floor = metadata[room.id]?.elevation ?? 0;
  const ceiling = floor + roomCeilingHeight(scene, room);
  const roomMetadata = { ...metadata, [room.id]: { ...metadata[room.id], ceilingHeight: ceiling - floor } };
  return scene.walls.flatMap(wall => {
    const spans = wallSurfaceSpans(wall, [room], roomMetadata).filter(span => span.front || span.back);
    const base = metadata[wall.id]?.elevation ?? 0;
    return wall.openings.filter(opening => base + opening.sill < ceiling - 1e-5
      && base + opening.sill + opening.height > floor + 1e-5
      && spans.some(span => Math.min(span.end, opening.offset + opening.width) - Math.max(span.start, opening.offset) > 1e-5))
      .map(opening => ({ wall, opening }));
  });
}
