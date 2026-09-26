import type { CatalogAsset } from '../contracts';

export interface CatalogProduct {
  asset: CatalogAsset;
  priceSource: string;
  sizeStatus: string;
  attribution: string;
}

/** Endpoints may label the same SKU differently; never rewrite a registered asset. */
export function retainRegisteredProducts(products: readonly CatalogProduct[], known: ReadonlyMap<string, CatalogProduct>): CatalogProduct[] {
  return products.map(product => {
    const previous = known.get(product.asset.id)?.asset;
    const incoming = product.asset;
    if (!previous || previous.kind !== incoming.kind || previous.price !== incoming.price
      || !previous.dimensions.every((value, index) => value === incoming.dimensions[index])
      || JSON.stringify(previous.source) !== JSON.stringify(incoming.source)) return product;
    // Preserve names, categories and fallback colors for this session. Updated
    // provenance is useful, but size/price/source changes still reach the store
    // unchanged so its immutable-reference check can reject them.
    return { ...product, asset: previous };
  });
}

const kinds: Record<string, CatalogAsset['kind']> = {
  sofa: 'sofa', chair: 'chair', table: 'table', desk: 'desk', bed: 'bed', cabinet: 'cabinet',
  dresser: 'dresser', wardrobe: 'wardrobe', nightstand: 'cabinet', storage: 'cabinet',
  shelf: 'shelf', bench: 'chair', ottoman: 'chair', stool: 'chair', lamp: 'lamp', rug: 'rug', planter: 'plant',
};
export const catalogKinds = Object.keys(kinds);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/** Only complete database products with an approved downloadable model reach the editor. */
export function catalogProduct(raw: unknown): CatalogProduct | null {
  if (!record(raw) || !text(raw.id, 100) || !raw.id.startsWith('abo:') || !text(raw.name, 4000)
    || typeof raw.kind !== 'string' || !Object.hasOwn(kinds, raw.kind) || raw.currency !== 'AMD'
    || typeof raw.price !== 'number' || !Number.isSafeInteger(raw.price) || raw.price < 0 || raw.price > 1e7
    || !text(raw.glb_url, 2048) || !text(raw.license, 200)) return null;
  const size = raw.fit_size_m ?? raw.size_m;
  if (!Array.isArray(size) || size.length !== 3 || !size.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= 20)) return null;
  let url: URL;
  try { url = new URL(raw.glb_url); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'amazon-berkeley-objects.s3.amazonaws.com' || url.port
    || url.username || url.password || url.search || !/^\/3dmodels\/original\/[a-zA-Z0-9/_-]+\.glb$/.test(url.pathname)) return null;
  url.hash = raw.wd_swapped === true ? 'varpet-rotate-y=90' : '';
  const [width, depth, height] = size as [number, number, number];
  const imageColor = Array.isArray(raw.colors_img) ? raw.colors_img.find(c => record(c) && typeof c.hex === 'string' && /^#[a-f0-9]{6}$/i.test(c.hex)) : undefined;
  return {
    asset: { id: raw.id, name: raw.name.trim().slice(0, 120), kind: kinds[raw.kind]!, category: raw.kind,
      dimensions: raw.wd_swapped === true ? [depth, height, width] : [width, height, depth],
      color: record(imageColor) ? imageColor.hex as string : '#b8b4ad', price: raw.price,
      source: { type: 'gltf', url: url.href } },
    priceSource: text(raw.price_source, 100) ? raw.price_source : 'unverified',
    sizeStatus: text(raw.size_status, 100) ? raw.size_status : 'unverified',
    attribution: `Amazon Berkeley Objects · ${raw.license}`,
  };
}

async function request(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/catalog/${path}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  const body: unknown = await response.json();
  if (!response.ok || !record(body)) throw new Error('Furniture database unavailable. Check the catalog connection, then retry.');
  return body;
}

function products(body: Record<string, unknown>): { products: CatalogProduct[]; excluded: number } {
  if (!Array.isArray(body.results)) throw new Error('Furniture database returned an invalid result list.');
  const mapped = body.results.map(catalogProduct).filter((p): p is CatalogProduct => p !== null);
  return { products: mapped, excluded: body.results.length - mapped.length };
}

export const databaseCatalog = {
  /** One ranked page of 20; nextOffset is where the following page starts, or null at the end. */
  async search(text = '', kind = '', signal?: AbortSignal, offset = 0) {
    const body = await request(`search?${new URLSearchParams({ text, kind, ...(offset ? { offset: String(offset) } : {}) })}`, signal);
    return { ...products(body), nextOffset: typeof body.next_offset === 'number' ? body.next_offset : null };
  },
  async resolve(ids: string[], signal?: AbortSignal): Promise<CatalogProduct[]> {
    const result: CatalogProduct[] = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      result.push(...products(await request(`items?${new URLSearchParams({ ids: ids.slice(offset, offset + 100).join(',') })}`, signal)).products);
    }
    const found = new Set(result.map(p => p.asset.id));
    if (ids.some(id => !found.has(id))) throw new Error('This project references furniture unavailable in the database. Its current contents have been kept.');
    return result;
  },
};

/** Resolve references in the current scene, baseline and saved design options before validation. */
export function sceneCatalogIds(input: unknown): string[] {
  if (!record(input)) return [];
  const snapshots: Record<string, unknown>[] = [input];
  if (record(input.project)) {
    if (record(input.project.baseline)) snapshots.push(input.project.baseline);
    if (Array.isArray(input.project.options)) for (const option of input.project.options) {
      if (record(option) && record(option.snapshot)) snapshots.push(option.snapshot);
    }
  }
  const ids = new Set<string>();
  for (const snapshot of snapshots) if (Array.isArray(snapshot.objects)) for (const object of snapshot.objects) {
    if (record(object) && text(object.assetId, 100)) ids.add(object.assetId);
  }
  if (ids.size > 1000) throw new Error('This project references too many catalog products.');
  return [...ids];
}

/** Capture cached import references before I/O; a search may replace the browsing cache meanwhile. */
export async function resolveSceneProducts(input: unknown, known: ReadonlyMap<string, CatalogProduct>, resolve = databaseCatalog.resolve): Promise<CatalogProduct[]> {
  const ids = sceneCatalogIds(input);
  const existing = ids.flatMap(id => known.has(id) ? [known.get(id)!] : []);
  const missing = ids.filter(id => !known.has(id));
  return [...existing, ...await resolve(missing)];
}
