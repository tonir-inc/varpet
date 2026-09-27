import { patchObject } from './material-slots';
import type { ObjectPatch, SceneDocument, SceneObject } from '../contracts';

/** Groups are flat, explicit v2 membership; world-space furniture remains authoritative. */
export function furnitureMembers(scene: SceneDocument, id: string): SceneObject[] {
  const anchor = scene.objects.find(object => object.id === id);
  return anchor ? anchor.groupId ? scene.objects.filter(object => object.groupId === anchor.groupId) : [anchor] : [];
}

export function expandFurnitureSelection(scene: SceneDocument, ids: readonly string[]): string[] {
  return [...new Set(ids.flatMap(id => furnitureMembers(scene, id).map(object => object.id)))];
}

/** The same rigid transform drives the command and its disposable viewport preview. */
export function furnitureUpdates(scene: SceneDocument, id: string, patch: ObjectPatch): SceneObject[] {
  const anchor = scene.objects.find(object => object.id === id);
  if (!anchor) throw new Error(`Object “${id}” no longer exists.`);
  const members = furnitureMembers(scene, id);
  if (members.length > 1 && patch.scale) throw new Error('Ungroup furniture before resizing an individual piece.');
  const moving = patch.position !== undefined || patch.rotation !== undefined || patch.scale !== undefined;
  if (moving && members.some(object => scene.project?.metadata[object.id]?.locked)) throw new Error('Unlock every selected piece before moving or rotating its group.');
  if (members.length === 1 || !moving) return [patchObject(anchor, patch)];
  const destination = patch.position ?? anchor.position;
  const delta = (patch.rotation ?? anchor.rotation) - anchor.rotation;
  const cosine = Math.cos(delta), sine = Math.sin(delta);
  return members.map(object => {
    if (object.id === id) return patchObject(object, patch);
    const dx = object.position[0] - anchor.position[0], dz = object.position[2] - anchor.position[2];
    return { ...object, position: [destination[0] + cosine * dx + sine * dz,
      object.position[1] + destination[1] - anchor.position[1], destination[2] - sine * dx + cosine * dz], rotation: object.rotation + delta };
  });
}

export function removeSingletonGroups(scene: SceneDocument): void {
  const counts = new Map<string, number>();
  for (const object of scene.objects) if (object.groupId) counts.set(object.groupId, (counts.get(object.groupId) ?? 0) + 1);
  for (const object of scene.objects) if (object.groupId && counts.get(object.groupId)! < 2) delete object.groupId;
}
