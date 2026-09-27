/** Browser client for `server/developers.mjs`: the public BUNDLE_API reads plus the owner's writes. */
import { BUNDLE_API, type Bundle, type BundleSummary, type Developer, type DeveloperSummary } from './bundles-contract';
import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';
import type { User } from './api';

export interface ProfileInput { name: string; slug: string; city: string; tagline: string; about: string; website: string }
export interface BundleInput {
  name: string; building: string | null; bedrooms?: number; area?: number;
  scene: SceneDocument; catalog: CatalogProduct[];
  /** The original plan as a `data:image/...;base64,` URL. Optional when updating. */
  blueprint?: string;
}

export class ProfileError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

async function request<T>(path: string, method = 'GET', data?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
      headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ProfileError('Could not reach Varpet. Check your connection and try again.', 0, 'network');
  }
  let result: Record<string, unknown>;
  try { result = await response.json(); }
  catch { throw new ProfileError('Developer profiles are unavailable right now. Please try again.', response.status, 'unavailable'); }
  if (!response.ok) throw new ProfileError(typeof result.error === 'string' ? result.error : 'Could not complete this request.', response.status, String(result.code ?? 'request_failed'));
  return result as T;
}
const enc = encodeURIComponent;

export const developerApi = {
  async developers(signal?: AbortSignal) { return (await request<{developers: DeveloperSummary[]}>(BUNDLE_API.developers, 'GET', undefined, signal)).developers; },
  async developer(slug: string, signal?: AbortSignal) { return (await request<{developer: Developer}>(BUNDLE_API.developer(slug), 'GET', undefined, signal)).developer; },
  async bundles(developer?: string, signal?: AbortSignal) {
    return (await request<{bundles: BundleSummary[]}>(developer ? `${BUNDLE_API.bundles}?developer=${enc(developer)}` : BUNDLE_API.bundles, 'GET', undefined, signal)).bundles;
  },
  async bundle(id: string, signal?: AbortSignal) { return (await request<{bundle: Bundle}>(BUNDLE_API.bundle(id), 'GET', undefined, signal)).bundle; },
  /** The signed-in account and its developer profile, if it has one. */
  async studio(signal?: AbortSignal) { return request<{user: Pick<User, 'id' | 'name'> | null; developer: Developer | null}>('/api/studio', 'GET', undefined, signal); },
  async createProfile(input: ProfileInput) { return (await request<{developer: Developer}>(BUNDLE_API.developers, 'POST', input)).developer; },
  async updateProfile(slug: string, input: ProfileInput) { return (await request<{developer: Developer}>(BUNDLE_API.developer(slug), 'PUT', input)).developer; },
  async publish(slug: string, input: BundleInput) { return (await request<{bundle: Bundle}>(`/api/developers/${enc(slug)}/bundles`, 'POST', input)).bundle; },
  async updateBundle(id: string, input: BundleInput) { return (await request<{bundle: Bundle}>(BUNDLE_API.bundle(id), 'PUT', input)).bundle; },
  async unpublish(id: string) { await request<{ok: true}>(BUNDLE_API.bundle(id), 'DELETE'); },
};

/** A profile address from a company name: "Ararat Homes LLC" → "ararat-homes-llc". */
export function slugify(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => [...word][0] ?? '').join('').toUpperCase() || 'V';
export const bedroomLabel = (bedrooms: number) => bedrooms === 0 ? 'Studio' : `${bedrooms} bedroom${bedrooms === 1 ? '' : 's'}`;
