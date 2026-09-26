import { SharingSession, readSharedProject, createShareSnapshot, type ShareSnapshot } from '../core/sharing';
import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';
import { sceneCatalogIds } from '../adapters/database-catalog';
import { parseScene } from '../core/persistence';
import { isRecord } from '../core/validation';
import type { Apartment, ApartmentPayload, User } from './api';

export interface EditorSession {
  scene: SceneDocument;
  catalog: CatalogProduct[];
  user: User | null;
  apartment: Apartment | null;
  templateId: string | null;
  sharingSession?: SharingSession | null;
  sharingError?: string;
}
export let editorSession: EditorSession | null = null;
export function setEditorSession(session: EditorSession) { editorSession = session; }

export function apartmentPayload(scene: SceneDocument, products: readonly CatalogProduct[], templateId: string | null, name = scene.name): ApartmentPayload {
  name = name.trim();
  if (!name || name.length > 120) throw new Error('Give your apartment a name of 1–120 characters.');
  const ids = new Set(sceneCatalogIds(scene));
  const catalog = products.filter(product => ids.has(product.asset.id));
  const snapshot = parseScene(JSON.stringify({...scene, name}), catalog.map(product => product.asset));
  return structuredClone({ name, templateId, scene: snapshot, catalog });
}

export function restoreApartment(apartment: Apartment): {scene: SceneDocument; catalog: CatalogProduct[]} {
  if (!Array.isArray(apartment.catalog) || apartment.catalog.length > 1000 || apartment.catalog.some(product =>
    !isRecord(product) || !isRecord(product.asset) || typeof product.priceSource !== 'string'
    || typeof product.sizeStatus !== 'string' || typeof product.attribution !== 'string')) {
    throw new Error('This apartment has invalid saved catalog data. Your saved apartment has not been changed.');
  }
  const catalog = structuredClone(apartment.catalog);
  const scene = parseScene(JSON.stringify(apartment.scene), catalog.map(product => product.asset));
  return {scene, catalog};
}

/** Restore link/version metadata without replacing the independently saved account scene. */
export async function restoreApartmentSharing(apartment: Apartment, scene: SceneDocument, products: CatalogProduct[], fetcher: typeof fetch = fetch): Promise<SharingSession | null> {
  const reference = apartment.sharing;
  if (!reference || reference.sceneId !== scene.id) return null;
  const project = await readSharedProject(reference, fetcher);
  if (project.scene.id !== scene.id) throw new Error('This shared link belongs to a different apartment.');
  const snapshot = createShareSnapshot(scene, products.map(product => product.asset));
  const sameSnapshot = JSON.stringify(snapshot.scene) === JSON.stringify(project.scene)
    && JSON.stringify(snapshot.catalog) === JSON.stringify(project.catalog);
  return new SharingSession(reference, project, sameSnapshot ? 0 : -1, fetcher, apartment.id);
}

/** View/edit link choices share one owner-version attachment while creation is in flight. */
export class ApartmentShareAttachment {
  private readonly pending = new WeakMap<SharingSession, Promise<Apartment>>();
  private creation: { ownerId: string; sceneId: string; promise: Promise<{session: SharingSession; apartment: Apartment}> } | null = null;
  async create(snapshot: ShareSnapshot, revision: number, apartment: Apartment, fetcher: typeof fetch,
    write: (id: string, version: number, reference: SharingSession['reference']) => Promise<Apartment>) {
    if (!this.creation || this.creation.ownerId !== apartment.id || this.creation.sceneId !== snapshot.scene.id) {
      const promise = (async () => {
        const session = await SharingSession.create(snapshot, revision, fetcher, apartment.id);
        return {session, apartment: await this.attach(apartment, session, write)};
      })();
      this.creation = {ownerId: apartment.id, sceneId: snapshot.scene.id, promise};
    }
    const creation = this.creation;
    try { return await creation.promise; }
    finally { if (this.creation === creation) this.creation = null; }
  }
  async attach(apartment: Apartment, session: SharingSession,
    write: (id: string, version: number, reference: SharingSession['reference']) => Promise<Apartment>): Promise<Apartment> {
    if (!session.matchesProject(apartment.scene.id, apartment.id))
      throw new Error('This sharing link belongs to a different apartment.');
    let pending = this.pending.get(session);
    if (!pending) {
      pending = write(apartment.id, apartment.version, session.reference);
      this.pending.set(session, pending);
    }
    try { return await pending; }
    finally { if (this.pending.get(session) === pending) this.pending.delete(session); }
  }
}
