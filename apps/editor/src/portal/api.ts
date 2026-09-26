import type { ShareReference } from '../core/sharing';
import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';

export interface User { id: string; name: string; email: string }
export interface ApartmentSummary { id: string; name: string; templateId: string | null; updatedAt: string; version: number }
export interface Apartment extends ApartmentSummary { scene: SceneDocument; catalog: CatalogProduct[]; sharing?: ShareReference & {sceneId:string} | null }
export interface ApartmentPayload { name: string; templateId: string | null; scene: SceneDocument; catalog: CatalogProduct[] }
export class AccountError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
      headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(30000) });
  } catch { throw new AccountError('Could not reach your account. Check your connection and try again.', 0, 'network'); }
  let result: Record<string, unknown>;
  try { result = await response.json(); }
  catch { throw new AccountError('The account service is unavailable. Please try again.', response.status, 'unavailable'); }
  if (!response.ok) throw new AccountError(typeof result.error === 'string' ? result.error : 'Could not complete this request.', response.status, String(result.code ?? 'request_failed'));
  return result as T;
}

export const api = {
  async session() { return (await request<{user: User | null}>('/api/account/session')).user; },
  async login(email: string, password: string) { return (await request<{user: User}>('/api/account/login', 'POST', {email, password})).user; },
  async register(name: string, email: string, password: string) { return (await request<{user: User}>('/api/account/register', 'POST', {name, email, password})).user; },
  async logout() { await request('/api/account/logout', 'POST', {}); },
  async listApartments() { return (await request<{apartments: ApartmentSummary[]}>('/api/apartments')).apartments; },
  async apartment(id: string) { return (await request<{apartment: Apartment}>(`/api/apartments/${encodeURIComponent(id)}`)).apartment; },
  async createApartment(payload: ApartmentPayload) { return (await request<{apartment: Apartment}>('/api/apartments', 'POST', payload)).apartment; },
  async setApartmentShare(id: string, version: number, reference: ShareReference) {
    return (await request<{apartment: Apartment}>(`/api/apartments/${encodeURIComponent(id)}/sharing`, 'PUT', {version, reference})).apartment;
  },
  async updateApartment(id: string, version: number, payload: ApartmentPayload) {
    return (await request<{apartment: Apartment}>(`/api/apartments/${encodeURIComponent(id)}`, 'PUT', {...payload, version})).apartment;
  },
};
