import type { SceneDocument, Vec2, Vec3 } from '../contracts';
import { pointInPolygon } from './validation';
import { WALK_EYE_HEIGHT } from './walkthrough';

/** Camera travel is a preview: walls, furniture, door states and floor gaps never block it. */
export function moveFreeWalkPosition(scene: SceneDocument | null, position: Vec3, delta: Vec2): Vec3 {
  if (!delta.every(Number.isFinite)) return [...position];
  const x = position[0] + delta[0], z = position[2] + delta[1];
  const room = scene?.rooms.find(room => scene.project?.metadata[room.id]?.phase !== 'remove' && pointInPolygon([x, z], room.polygon));
  const y = room ? (scene?.project?.metadata[room.id]?.elevation ?? 0) + WALK_EYE_HEIGHT : position[1];
  return [x, y, z];
}

/** A fallback view remains available even if every standing location has furniture. */
export function freeWalkSpawn(scene: SceneDocument, roomId?: string) {
  const room = scene.rooms.find(room => room.id === roomId && scene.project?.metadata[room.id]?.phase !== 'remove')
    ?? scene.rooms.find(room => scene.project?.metadata[room.id]?.phase !== 'remove');
  if (!room) return null;
  const x = room.polygon.reduce((sum, point) => sum + point[0], 0) / room.polygon.length;
  const z = room.polygon.reduce((sum, point) => sum + point[1], 0) / room.polygon.length;
  const y = (scene.project?.metadata[room.id]?.elevation ?? 0) + WALK_EYE_HEIGHT;
  return { position: [x, y, z] as Vec3, target: [x, y, z - 1] as Vec3 };
}
