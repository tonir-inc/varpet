// Browser clients for the portal API (v1 portal/api.ts, bundles.ts, developer-api.ts, adapters/flats-http.ts).

export interface User { id: string; name: string; email: string }
export interface ApartmentSummary { id: string; name: string; templateId: string | null; sceneId: string; updatedAt: string; version: number }

export interface DeveloperSummary { slug: string; name: string; city: string; tagline: string; bundleCount: number; logoUrl: string | null }
export interface BundleSummary {
  id: string; developerSlug: string; developerName: string; name: string; building: string | null; bedrooms: number; area: number
  blueprintUrl: string; source: 'sample' | 'published'; furnishedPieces: number; updatedAt: string; sceneId: string | null
}
export interface Developer extends DeveloperSummary { about: string; website: string | null; ownedByViewer: boolean; bundles: BundleSummary[] }
export interface ProfileInput { name: string; slug: string; city: string; tagline: string; about: string; website: string }

export interface FlatMeta {
  id: string; name: string; kind: 'template' | 'upload' | 'blank' | 'other'; designed: boolean; revision: number
  created_at: string; updated_at: string; updated_by: string | null; has_thumbnail: boolean
}

/** One error type for every portal request; `status` 0 is a network failure. */
export class PortalError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message) }
}

interface Messages { network: string; unavailable: string; failed: string }
const ACCOUNT: Messages = { network: 'Could not reach your account. Check your connection and try again.',
  unavailable: 'The account service is unavailable. Please try again.', failed: 'Could not complete this request.' }
const CATALOG: Messages = { network: 'Could not reach the plan catalog. Check your connection and try again.',
  unavailable: 'The plan catalog is unavailable right now. Please try again.', failed: 'Could not load the plan catalog.' }
const PROFILE: Messages = { network: 'Could not reach Varpet. Check your connection and try again.',
  unavailable: 'Developer profiles are unavailable right now. Please try again.', failed: 'Could not complete this request.' }

async function request<T>(path: string, messages: Messages, method = 'GET', data?: unknown, signal?: AbortSignal, timeout = 30_000): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
      headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new PortalError(messages.network, 0, 'network')
  }
  if (response.status === 204 && response.ok) return undefined as T
  let result: Record<string, unknown>
  try { result = await response.json() } catch { throw new PortalError(messages.unavailable, response.status, 'unavailable') }
  if (!response.ok) {
    const nested = result.error && typeof result.error === 'object' ? result.error as Record<string, unknown> : null
    const message = typeof result.error === 'string' ? result.error : typeof nested?.message === 'string' ? nested.message
      : typeof result.reason === 'string' ? result.reason : messages.failed
    throw new PortalError(message, response.status, String(result.code ?? nested?.code ?? 'request_failed'))
  }
  return result as T
}

const enc = encodeURIComponent

export const accountApi = {
  async session() { return (await request<{ user: User | null }>('/api/account/session', ACCOUNT)).user },
  async login(email: string, password: string) { return (await request<{ user: User }>('/api/account/login', ACCOUNT, 'POST', { email, password })).user },
  async register(name: string, email: string, password: string) { return (await request<{ user: User }>('/api/account/register', ACCOUNT, 'POST', { name, email, password })).user },
  async logout() { await request('/api/account/logout', ACCOUNT, 'POST', {}) },
  async listApartments() { return (await request<{ apartments: ApartmentSummary[] }>('/api/apartments', ACCOUNT)).apartments },
  async createApartment(payload: { name: string; templateId: string | null; sceneId: string }) {
    return (await request<{ apartment: ApartmentSummary }>('/api/apartments', ACCOUNT, 'POST', payload)).apartment
  },
}

/** Lane A's scene store (CONTRACTS.md): `POST /api/scenes {name}` -> SceneMeta with an `id`. */
export async function createScene(name: string): Promise<string> {
  const scene = await request<{ id?: unknown }>('/api/scenes', { network: ACCOUNT.network,
    unavailable: 'The editor cannot create apartments yet. Try again once the editor is available.', failed: 'Could not create the apartment.' },
  'POST', { name })
  const id = typeof scene.id === 'string' ? scene.id : null
  if (!id) throw new PortalError('The editor did not return the new apartment.', 200, 'invalid')
  return id
}

export const bundlesApi = {
  async developers(signal?: AbortSignal) { return (await request<{ developers: DeveloperSummary[] }>('/api/developers', CATALOG, 'GET', undefined, signal)).developers },
  async bundles(signal?: AbortSignal) { return (await request<{ bundles: BundleSummary[] }>('/api/bundles', CATALOG, 'GET', undefined, signal)).bundles },
}

export const developerApi = {
  async developer(slug: string, signal?: AbortSignal) { return (await request<{ developer: Developer }>(`/api/developers/${enc(slug)}`, PROFILE, 'GET', undefined, signal, 60_000)).developer },
  async studio(signal?: AbortSignal) {
    return request<{ user: Pick<User, 'id' | 'name'> | null; developer: Developer | null }>('/api/studio', PROFILE, 'GET', undefined, signal, 60_000)
  },
  async createProfile(input: ProfileInput) { return (await request<{ developer: Developer }>('/api/developers', PROFILE, 'POST', input, undefined, 60_000)).developer },
  async updateProfile(slug: string, input: ProfileInput) { return (await request<{ developer: Developer }>(`/api/developers/${enc(slug)}`, PROFILE, 'PUT', input, undefined, 60_000)).developer },
  async unpublish(id: string) { await request<{ ok: true }>(`/api/bundles/${enc(id)}`, PROFILE, 'DELETE', undefined, undefined, 60_000) },
}

const FLATS: Messages = { network: 'Team saves service unavailable.', unavailable: 'Team saves service unavailable.', failed: 'Could not update apartment.' }
export const flatsApi = {
  async list() { return (await request<{ flats: FlatMeta[] }>('/api/flats?include_deleted=0', FLATS)).flats },
  thumbnail: (id: string) => `/api/flats/${enc(id)}/thumbnail`,
  async rename(id: string, name: string) { await request(`/api/flats/${enc(id)}`, FLATS, 'PATCH', { name }) },
  async remove(id: string) { await request(`/api/flats/${enc(id)}`, FLATS, 'DELETE') },
}

/* ---- helpers shared by the pages (v1 bundles.ts, developer-api.ts) ---- */

export const editorHref = (sceneId: string) => `/editor/${enc(sceneId)}`
export const developerHref = (slug: string) => `/developers/${enc(slug)}`
export const catalogHref = '/catalog'
export const studioHref = '/studio'
export const bedroomLabel = (bedrooms: number) => bedrooms === 0 ? 'Studio' : `${bedrooms} bedroom${bedrooms === 1 ? '' : 's'}`

/** Catalog shelves: "AH" from "Ararat Homes", two letters from one word. */
export function shelfInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0]!.charAt(0) + words[1]!.charAt(0) : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}
/** Profiles: "Ararat Homes" -> "AH"; a short single word stays whole ("M6"). */
export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 1 && [...words[0]!].length <= 3) return words[0]!.toUpperCase()
  return words.slice(0, 2).map(word => [...word][0] ?? '').join('').toUpperCase() || 'V'
}
/** "Ararat Homes LLC" -> "ararat-homes-llc". */
export function slugify(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '')
}
