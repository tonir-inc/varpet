import type { CatalogAsset, SceneDocument } from '../contracts';
import { EditorStore } from './store';
import { normalizeWallJunctions } from './wall-junctions';

/** The interactive apartment uses one selectable wall per span between junctions. */
export function createApartmentStore(scene: SceneDocument, catalog: CatalogAsset[]): EditorStore {
  return new EditorStore(scene, catalog, normalizeWallJunctions);
}
