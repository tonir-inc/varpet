import type { CatalogAsset, EntityMetadata, Operation, SceneDocument } from '../contracts';
import { invalidateAssumptions } from './renovation';

export const OPENING_TYPES: Record<'door' | 'window', { value: EntityMetadata['mechanism']; label: string }[]> = {
  door: [
    { value: 'hinged', label: 'Hinged' },
    { value: 'double', label: 'Double' },
    { value: 'sliding', label: 'Sliding' },
    { value: 'pocket', label: 'Pocket' },
  ],
  window: [
    { value: 'fixed', label: 'Fixed' },
    { value: 'casement', label: 'Casement' },
    { value: 'tilt', label: 'Tilt' },
    { value: 'sliding', label: 'Sliding' },
    { value: 'double', label: 'Double' },
  ],
};

function requireEditable(scene: SceneDocument, id: string, label: string): void {
  const metadata = scene.project?.metadata[id];
  if (metadata?.locked) throw new Error(`${label} is locked. Unlock it before changing its options.`);
  if (metadata?.phase === 'remove') throw new Error(`${label} is marked for removal. Restore it before changing its options.`);
}

export function buildOpeningTypeOperations(scene: SceneDocument, id: string, mechanism: EntityMetadata['mechanism']): Operation[] {
  const wall = scene.walls.find(candidate => candidate.openings.some(opening => opening.id === id));
  const opening = wall?.openings.find(candidate => candidate.id === id);
  if (!wall || !opening) throw new Error('This opening no longer exists.');
  if (!OPENING_TYPES[opening.kind].some(option => option.value === mechanism)) throw new Error(`Choose a supported ${opening.kind} type.`);
  requireEditable(scene, wall.id, 'The host wall');
  requireEditable(scene, id, `This ${opening.kind}`);
  // An unspecified type is not an explicit choice, even when the renderer's
  // provisional preview happens to match the selected mechanism.
  if (scene.project?.metadata[id]?.mechanism === mechanism) return [];
  const operations: Operation[] = scene.version === 1 ? [{ type: 'migrate-project' }] : [];
  // Preserve geometry while going through the normal opening alteration path:
  // it guards the host, marks renovation review, and invalidates assumptions.
  operations.push({ type: 'update-opening', id, patch: { kind: opening.kind } });
  operations.push({ type: 'set-metadata', id, patch: { mechanism } });
  return operations;
}

export function buildAssetReplacementOperations(scene: SceneDocument, catalog: CatalogAsset[], objectId: string, assetId: string): Operation[] {
  const object = scene.objects.find(candidate => candidate.id === objectId);
  if (!object) throw new Error('This item no longer exists.');
  const currentAsset = catalog.find(asset => asset.id === object.assetId);
  const replacement = catalog.find(asset => asset.id === assetId);
  if (!currentAsset || !replacement) throw new Error('This catalog item is unavailable. Choose another option.');
  if (currentAsset.category !== replacement.category) throw new Error(`Choose another item from ${currentAsset.category}.`);
  requireEditable(scene, objectId, 'This item');
  if (object.assetId === assetId) return [];

  // Object patches cannot change assetId. Constrain the existing replace-scene
  // command here to one object, retaining its ID and all project references.
  // EditorStore still validates the full replacement atomically and owns history.
  const next = structuredClone(scene);
  const target = next.objects.find(candidate => candidate.id === objectId)!;
  target.assetId = replacement.id;
  target.name = object.name === currentAsset.name ? replacement.name : object.name;
  target.color = replacement.color;
  target.scale = [1, 1, 1];
  if (next.project?.mode === 'renovate') {
    const metadata = next.project.metadata[objectId] ??= {};
    metadata.phase = metadata.phase === 'new' ? 'new' : 'replace';
    metadata.review = 'required';
  }
  invalidateAssumptions(next, [objectId]);
  return [{ type: 'replace-scene', scene: next }];
}
