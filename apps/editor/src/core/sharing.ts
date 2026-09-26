import type { CatalogAsset, SceneDocument } from '../contracts';
import { sceneCatalogIds } from '../adapters/database-catalog';
import { isRecord, validateScene } from './validation';

export type ShareAccess = 'view' | 'edit';
export interface ShareReference { id: string; token: string }
export interface ShareSnapshot { scene: SceneDocument; catalog: CatalogAsset[] }
export interface SharedProject extends ShareSnapshot {
  id: string; version: number; updatedAt: string; access: ShareAccess; viewToken?: string;
}
const ID = /^[a-f0-9]{32}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_BYTES = 24_000_000;

export function parseShareReference(hash: string): ShareReference | null {
  if (!hash.startsWith('#share=')) return null;
  const [id, token, extra] = hash.slice(7).split('.');
  if (!id || !ID.test(id) || !token || !TOKEN.test(token) || extra !== undefined)
    throw new Error('This sharing link is incomplete or invalid. Ask for a new link.');
  return { id, token };
}

export function shouldReloadShareNavigation(previousHash: string, nextHash: string): boolean {
  return previousHash !== nextHash && (previousHash.startsWith('#share=') || nextHash.startsWith('#share='));
}

export function shareLink(reference: ShareReference, base: string): string {
  if (!ID.test(reference.id) || !TOKEN.test(reference.token)) throw new Error('Invalid sharing link.');
  const url = new URL(base);
  url.search = ''; url.hash = `share=${reference.id}.${reference.token}`;
  return url.href;
}

export function createShareSnapshot(scene: SceneDocument, catalog: CatalogAsset[]): ShareSnapshot {
  const needed = new Set(sceneCatalogIds(scene));
  const snapshot = { scene, catalog: catalog.filter(asset => needed.has(asset.id)) };
  const validation = validateScene(scene, snapshot.catalog);
  if (!validation.ok) throw new Error(`Cannot share this project: ${validation.errors.join(' ')}`);
  const json = JSON.stringify(snapshot);
  if (new TextEncoder().encode(json).byteLength > MAX_BYTES - 100)
    throw new Error('This project is too large to share. Keep the project and attached evidence under 24 MB.');
  return JSON.parse(json) as ShareSnapshot;
}

function versionFields(value: unknown): value is { version: number; updatedAt: string } & Record<string, unknown> {
  return isRecord(value) && Number.isSafeInteger(value.version) && (value.version as number) >= 1
    && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt));
}

async function request(url: string, init: RequestInit, fetcher: typeof fetch): Promise<unknown> {
  let response: Response;
  try { response = await fetcher(url, { ...init, cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error('Sharing is unavailable. Check your connection and try again. Your changes are still here.'); }
  if (response.status === 409) throw new Error('Someone saved a newer version. Your changes are still here. Export your project from File before reopening the link to get their changes.');
  if (response.status === 401 || response.status === 403 || response.status === 404)
    throw new Error('This link is unavailable or does not allow saving. Ask for a new link with the access you need.');
  if (response.status === 413) throw new Error('This project is too large to share. Keep attached evidence under the 24 MB limit.');
  if (!response.ok) throw new Error('The shared project could not be saved or opened. Try again; your current project is unchanged.');
  try { return await response.json(); }
  catch { throw new Error('The sharing service returned an invalid response.'); }
}

export async function readSharedProject(reference: ShareReference, fetcher: typeof fetch = fetch): Promise<SharedProject> {
  shareLink(reference, 'https://varpet.invalid/');
  const body = await request(`/api/shares/${reference.id}`, { headers: { Authorization: `Bearer ${reference.token}` } }, fetcher);
  if (!versionFields(body) || body.id !== reference.id || !['view', 'edit'].includes(body.access as string)
    || (body.access === 'edit' && (typeof body.viewToken !== 'string' || !TOKEN.test(body.viewToken))))
    throw new Error('The sharing service returned an invalid response.');
  if (!Array.isArray(body.catalog)) throw new Error('This shared project has an invalid catalog.');
  const validation = validateScene(body.scene, body.catalog as CatalogAsset[]);
  if (!validation.ok) throw new Error(`This shared project cannot be opened: ${validation.errors.join(' ')}`);
  return { id: reference.id, scene: body.scene as SceneDocument, catalog: body.catalog as CatalogAsset[],
    version: body.version, updatedAt: body.updatedAt, access: body.access as ShareAccess,
    ...(body.access === 'edit' ? { viewToken: body.viewToken as string } : {}) };
}

/** Server versions are independent of editor history; only the captured revision becomes saved. */
export class SharingSession {
  version: number;
  updatedAt: string;
  savedRevision: number;
  saving = false;
  private readonly sceneId: string;
  private readonly viewToken: string;
  constructor(readonly reference: ShareReference, project: SharedProject, localRevision = 0, private fetcher: typeof fetch = fetch,
    private readonly ownerId?: string) {
    if (project.access !== 'edit' || !project.viewToken) throw new Error('View-only links cannot open an editing session.');
    this.version = project.version; this.updatedAt = project.updatedAt; this.savedRevision = localRevision;
    this.sceneId = project.scene.id; this.viewToken = project.viewToken;
  }
  static async create(snapshot: ShareSnapshot, localRevision: number, fetcher: typeof fetch = fetch, ownerId?: string): Promise<SharingSession> {
    const captured = createShareSnapshot(snapshot.scene, snapshot.catalog);
    const body = await request('/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(captured) }, fetcher);
    if (!versionFields(body) || body.version !== 1 || typeof body.id !== 'string' || !ID.test(body.id)
      || typeof body.editToken !== 'string' || !TOKEN.test(body.editToken) || typeof body.viewToken !== 'string' || !TOKEN.test(body.viewToken)
      || body.editToken === body.viewToken) throw new Error('The sharing service returned an invalid response.');
    return new SharingSession({ id: body.id, token: body.editToken }, { ...captured, id: body.id, access: 'edit',
      viewToken: body.viewToken, version: body.version, updatedAt: body.updatedAt }, localRevision, fetcher, ownerId);
  }
  /** Account copies can retain the same scene ID while belonging to separate saved apartments. */
  matchesProject(sceneId: string, ownerId?: string): boolean {
    return sceneId === this.sceneId && ownerId === this.ownerId;
  }
  link(access: ShareAccess, base: string): string {
    return shareLink({ id: this.reference.id, token: access === 'edit' ? this.reference.token : this.viewToken }, base);
  }
  async save(snapshot: ShareSnapshot, localRevision: number, ownerId?: string): Promise<void> {
    if (this.saving) throw new Error('A save is already in progress.');
    if (!this.matchesProject(snapshot.scene.id, ownerId)) throw new Error('This is a different project. Open a new editor tab to share it separately.');
    const captured = createShareSnapshot(snapshot.scene, snapshot.catalog), expected = this.version;
    this.saving = true;
    try {
      const body = await request(`/api/shares/${this.reference.id}`, { method: 'PUT', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${this.reference.token}`,
      }, body: JSON.stringify({ ...captured, version: expected }) }, this.fetcher);
      if (!versionFields(body) || body.version !== expected + 1) throw new Error('The sharing service returned an invalid response. Reopen the link to check the saved version.');
      this.version = body.version; this.updatedAt = body.updatedAt; this.savedRevision = localRevision;
    } finally { this.saving = false; }
  }
}

/** Coalesce access-choice requests only while they belong to the same project. */
export class ShareCreation {
  private pending: { sceneId: string; ownerId?: string; promise: Promise<SharingSession> } | null = null;
  async create(snapshot: ShareSnapshot, revision: number, fetcher: typeof fetch = fetch, ownerId?: string): Promise<SharingSession> {
    if (!this.pending || this.pending.sceneId !== snapshot.scene.id || this.pending.ownerId !== ownerId) {
      this.pending = { sceneId: snapshot.scene.id, ownerId, promise: SharingSession.create(snapshot, revision, fetcher, ownerId) };
    }
    const request = this.pending;
    try { return await request.promise; }
    finally { if (this.pending === request) this.pending = null; }
  }
}

let startup: { reference: ShareReference; project: SharedProject } | undefined;
export function setSharedStartup(value: { reference: ShareReference; project: SharedProject }) { startup = value; }
export function getSharedStartup() { return startup; }
