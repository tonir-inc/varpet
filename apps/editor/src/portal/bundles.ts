/**
 * Client reads of the plan-bundle API (`bundles-contract.ts`) and the pure helpers the Catalog tab uses:
 * checked summaries, filtering, grouping by developer, and turning a bundle into an editor scene.
 */
import type { SceneDocument } from '../contracts';
import { databaseCatalog, resolveSceneProducts, type CatalogProduct } from '../adapters/database-catalog';
import { parseScene } from '../core/persistence';
import { isRecord } from '../core/validation';
import { BUNDLE_API, type Bundle, type BundleSummary, type Developer, type DeveloperSummary } from './bundles-contract';

export class BundleError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

async function read<T>(path: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(30000);
    response = await fetcher(path, { credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new BundleError('Could not reach the plan catalog. Check your connection and try again.', 0, 'network');
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new BundleError('The plan catalog is unavailable right now. Please try again.', response.status, 'unavailable'); }
  if (!response.ok) {
    const record = isRecord(body) ? body : {};
    throw new BundleError(typeof record.error === 'string' ? record.error : 'Could not load the plan catalog.', response.status, String(record.code ?? 'request_failed'));
  }
  if (!isRecord(body)) throw new BundleError('The plan catalog returned an unexpected response.', response.status, 'invalid');
  return body as T;
}

const text = (value: unknown, max = 400): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
/** Plan images must come from this site: the contract promises same-origin URLs, and a card never loads a foreign image. */
const sameOrigin = (value: unknown): value is string => text(value, 2048) && value.startsWith('/') && !value.startsWith('//');

/** A malformed record is dropped rather than rendered half-empty. */
export function checkBundleSummary(raw: unknown): BundleSummary | null {
  if (!isRecord(raw) || !text(raw.id, 200) || !/^[A-Za-z0-9._~:-]+$/.test(raw.id) || !text(raw.developerSlug, 200) || !text(raw.developerName)
    || !text(raw.name) || !(raw.building === null || raw.building === undefined || text(raw.building))
    || !count(raw.bedrooms) || !count(raw.area) || !sameOrigin(raw.blueprintUrl)
    || (raw.source !== 'sample' && raw.source !== 'published') || !count(raw.furnishedPieces)) return null;
  return {
    id: raw.id, developerSlug: raw.developerSlug, developerName: raw.developerName, name: raw.name,
    building: typeof raw.building === 'string' ? raw.building : null,
    bedrooms: Math.round(raw.bedrooms), area: raw.area, blueprintUrl: raw.blueprintUrl, source: raw.source,
    furnishedPieces: Math.round(raw.furnishedPieces), updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
}

export function checkDeveloperSummary(raw: unknown): DeveloperSummary | null {
  if (!isRecord(raw) || !text(raw.slug, 200) || !text(raw.name)) return null;
  return {
    slug: raw.slug, name: raw.name, city: typeof raw.city === 'string' ? raw.city : '',
    tagline: typeof raw.tagline === 'string' ? raw.tagline : '', bundleCount: count(raw.bundleCount) ? raw.bundleCount : 0,
    logoUrl: sameOrigin(raw.logoUrl) ? raw.logoUrl : null,
  };
}

const list = <T>(value: unknown, check: (raw: unknown) => T | null): T[] => Array.isArray(value) ? value.map(check).filter((item): item is T => item !== null) : [];

export const bundlesApi = {
  async developers(signal?: AbortSignal, fetcher?: typeof fetch): Promise<DeveloperSummary[]> {
    return list((await read<{ developers: unknown }>(BUNDLE_API.developers, signal, fetcher)).developers, checkDeveloperSummary);
  },
  async developer(slug: string, signal?: AbortSignal, fetcher?: typeof fetch): Promise<Developer> {
    return (await read<{ developer: Developer }>(BUNDLE_API.developer(slug), signal, fetcher)).developer;
  },
  async bundles(options: { developer?: string; signal?: AbortSignal; fetcher?: typeof fetch } = {}): Promise<BundleSummary[]> {
    const path = options.developer ? `${BUNDLE_API.bundles}?${new URLSearchParams({ developer: options.developer })}` : BUNDLE_API.bundles;
    return list((await read<{ bundles: unknown }>(path, options.signal, options.fetcher)).bundles, checkBundleSummary);
  },
  async bundle(id: string, signal?: AbortSignal, fetcher?: typeof fetch): Promise<Bundle> {
    const body = await read<{ bundle: unknown }>(BUNDLE_API.bundle(id), signal, fetcher);
    const summary = checkBundleSummary(body.bundle);
    if (!summary || !isRecord(body.bundle) || !isRecord(body.bundle.scene) || !Array.isArray(body.bundle.catalog))
      throw new BundleError('This plan could not be read. Choose another plan from the catalog.', 200, 'invalid');
    return { ...summary, scene: body.bundle.scene as unknown as SceneDocument, catalog: body.bundle.catalog as CatalogProduct[] };
  },
};

/** `null` shows every size; 3 means three bedrooms or more. */
export interface BundleFilter { bedrooms: number | null; developer: string | null }
export const BEDROOM_FILTERS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: null, label: 'All' }, { value: 0, label: 'Studio' }, { value: 1, label: '1 bedroom' }, { value: 2, label: '2 bedrooms' }, { value: 3, label: '3+ bedrooms' },
];
export function matchesFilter(bundle: BundleSummary, filter: BundleFilter): boolean {
  if (filter.developer && bundle.developerSlug !== filter.developer) return false;
  if (filter.bedrooms === null) return true;
  return filter.bedrooms >= 3 ? bundle.bedrooms >= 3 : bundle.bedrooms === filter.bedrooms;
}

export interface DeveloperShelf { developer: DeveloperSummary; bundles: BundleSummary[] }

/**
 * One shelf per developer, in the order the developers list gives (then by name for developers only seen
 * through their bundles). Bundles sort by bedrooms, then area. Developers without a visible bundle are left out.
 */
export function groupByDeveloper(bundles: readonly BundleSummary[], developers: readonly DeveloperSummary[] = []): DeveloperShelf[] {
  const shelves = new Map<string, DeveloperShelf>();
  for (const developer of developers) shelves.set(developer.slug, { developer, bundles: [] });
  const unknown: DeveloperShelf[] = [];
  for (const bundle of bundles) {
    let shelf = shelves.get(bundle.developerSlug);
    if (!shelf) {
      shelf = { developer: { slug: bundle.developerSlug, name: bundle.developerName, city: '', tagline: '', bundleCount: 0, logoUrl: null }, bundles: [] };
      shelves.set(bundle.developerSlug, shelf); unknown.push(shelf);
    }
    shelf.bundles.push(bundle);
  }
  unknown.sort((a, b) => a.developer.name.localeCompare(b.developer.name));
  const ordered = [...developers.map(developer => shelves.get(developer.slug)!), ...unknown];
  for (const shelf of ordered) shelf.bundles.sort((a, b) => a.bedrooms - b.bedrooms || a.area - b.area || a.name.localeCompare(b.name));
  return ordered.filter(shelf => shelf.bundles.length > 0);
}

export function bedroomLabel(bedrooms: number): string {
  return bedrooms === 0 ? 'Studio' : `${bedrooms} bedroom${bedrooms === 1 ? '' : 's'}`;
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]!.charAt(0) + words[1]!.charAt(0) : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

function checkProducts(catalog: unknown): CatalogProduct[] {
  if (!Array.isArray(catalog) || catalog.length > 1000 || catalog.some(product =>
    !isRecord(product) || !isRecord(product.asset) || typeof product.asset.id !== 'string' || typeof product.priceSource !== 'string'
    || typeof product.sizeStatus !== 'string' || typeof product.attribution !== 'string')) {
    throw new BundleError('This plan has invalid furniture data. Choose another plan from the catalog.', 200, 'invalid_catalog');
  }
  return structuredClone(catalog as CatalogProduct[]);
}

/**
 * The person's own copy of a bundle's furnished scene: checked by the editor's scene validation, with every
 * referenced catalog product known. Products the bundle did not ship are resolved through the furniture database.
 * The copy gets a fresh scene id, so saving it never collides with the developer's original.
 */
export async function restoreBundle(bundle: Pick<Bundle, 'scene' | 'catalog'>, resolve: (ids: string[], signal?: AbortSignal) => Promise<CatalogProduct[]> = databaseCatalog.resolve): Promise<{ scene: SceneDocument; catalog: CatalogProduct[] }> {
  const shipped = checkProducts(bundle.catalog);
  const known = new Map(shipped.map(product => [product.asset.id, product]));
  let catalog: CatalogProduct[];
  try { catalog = await resolveSceneProducts(bundle.scene, known, resolve); }
  catch { throw new BundleError('Some furniture in this design is unavailable right now. Check your connection, then try again.', 0, 'catalog_unavailable'); }
  // Keep shipped products the scene does not reference (options, baselines) out of the session.
  const scene = parseScene(JSON.stringify(bundle.scene), catalog.map(product => product.asset));
  scene.id = crypto.randomUUID();
  return { scene, catalog };
}
