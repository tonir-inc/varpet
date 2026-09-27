import type { CatalogAsset, ObjectPatch, Operation, SceneDocument, SceneObject, Vec2 } from '../contracts';
import { expandFurnitureSelection, furnitureUpdates } from './grouping';
import { patchObject } from './material-slots';
import { EditorStore, type SceneNormalizer } from './store';

/** A temporary selection applies one rigid transform without changing saved group membership. */
export function selectionFurnitureUpdates(scene: SceneDocument, id: string, patch: ObjectPatch, ids: readonly string[]): SceneObject[] {
  const anchor = scene.objects.find(object => object.id === id);
  if (!anchor) throw new Error(`Object “${id}” no longer exists.`);
  const selection = new Set(expandFurnitureSelection(scene, [id, ...ids]));
  const members = scene.objects.filter(object => selection.has(object.id));
  const moving = patch.position !== undefined || patch.rotation !== undefined || patch.scale !== undefined;
  if (members.length < 2 || !moving) return furnitureUpdates(scene, id, patch);
  if (patch.scale) throw new Error('Select one ungrouped piece before resizing.');
  if (members.some(object => scene.project?.metadata[object.id]?.locked)) throw new Error('Unlock every selected piece before moving or rotating the selection.');
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

/** Store updates already move persistent groups; emit exactly one anchor per group. */
export function selectionTransformOperations(scene: SceneDocument, id: string, patch: ObjectPatch, ids: readonly string[]): Operation[] {
  const updates = selectionFurnitureUpdates(scene, id, patch, ids);
  const groups = new Set<string>();
  const anchor = updates.find(object => object.id === id)!;
  return [anchor, ...updates.filter(object => object.id !== id)].flatMap(object => {
    if (object.groupId && groups.has(object.groupId)) return [];
    if (object.groupId) groups.add(object.groupId);
    return [{ type: 'update' as const, id: object.id, patch: object.id === id ? patch : { position: object.position, rotation: object.rotation } }];
  });
}

/** Absolute endpoints are captured together from the original document. */
export function wallSelectionOperations(scene: SceneDocument, ids: readonly string[], delta: Vec2): Operation[] {
  return [...new Set(ids)].map(id => {
    const wall = scene.walls.find(wall => wall.id === id);
    if (!wall) throw new Error(`Wall “${id}” no longer exists.`);
    return { type: 'update-wall', id, patch: {
      start: [wall.start[0] + delta[0], wall.start[1] + delta[1]],
      end: [wall.end[0] + delta[0], wall.end[1] + delta[1]],
    } };
  });
}

/** Disposable checked command: preview and commit share locks, topology and validation. */
export function previewSelectionOperations(scene: SceneDocument, operations: Operation[], catalog: CatalogAsset[], normalize?: SceneNormalizer): SceneDocument {
  const store = new EditorStore(scene, catalog, normalize);
  const result = store.execute({ id: 'selection-preview', label: 'Preview selection', source: 'human', baseRevision: 0, operations }, true);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return store.scene;
}
