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
  decor: 'decor', wall_art: 'wall_art', mirror: 'mirror', curtain: 'curtain', clock: 'wall_art', wall_hanging: 'wall_art', blind: 'curtain', crib: 'bed', changing_table: 'dresser', pet_bed: 'decor', towel_rack: 'shelf',
  vase: 'decor', candle: 'decor', book: 'decor', books: 'decor', throw_blanket: 'decor', cushion: 'decor', basket: 'decor', bowl: 'decor', tray: 'decor', sculpture: 'decor', lantern: 'decor', toy: 'decor', picture_frame: 'decor', poster: 'wall_art', framed_print: 'wall_art', canvas: 'wall_art',
  sofa: 'sofa', chair: 'chair', table: 'table', desk: 'desk', bed: 'bed', cabinet: 'cabinet',
  dresser: 'dresser', wardrobe: 'wardrobe', nightstand: 'cabinet', storage: 'cabinet',
  shelf: 'shelf', bench: 'chair', ottoman: 'chair', stool: 'chair', lamp: 'lamp', rug: 'rug', planter: 'decor', plant: 'plant',
  toilet: 'toilet', sink: 'sink', bathtub: 'bathtub', shower: 'shower', fridge: 'fridge', stove: 'stove', oven: 'oven', washing_machine: 'washing_machine', dryer: 'dryer', dishwasher: 'dishwasher', microwave: 'microwave', tv: 'tv', monitor: 'monitor', computer: 'computer', laptop: 'laptop', speaker: 'speaker', printer: 'printer', game_console: 'game_console', kitchen_cabinet: 'kitchen_cabinet', kitchen_counter: 'kitchen_counter', kitchen_island: 'kitchen_island', radiator: 'radiator', fan: 'fan', coat_rack: 'coat_rack', shoe_rack: 'shoe_rack',
};
export const catalogCategories: Record<string, readonly string[]> = {"Decoration": ["decor", "wall_art", "mirror", "curtain"], "Bathroom": ["toilet", "sink", "bathtub", "shower"], "Appliances": ["fridge", "stove", "oven", "washing_machine", "dryer", "dishwasher", "microwave"], "Electronics": ["tv", "monitor", "computer", "laptop", "speaker", "printer", "game_console"], "Kitchen": ["kitchen_cabinet", "kitchen_counter", "kitchen_island"], "Home": ["radiator", "fan", "coat_rack", "shoe_rack", "plant"]};
export function catalogCategory(kind: string): string {
  return Object.entries(catalogCategories).find(([, kinds]) => kinds.includes(kind))?.[0] ?? kind;
}
export const catalogKinds = Object.keys(kinds);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/** Only complete database products with an approved downloadable model reach the editor. */
export function catalogProduct(raw: unknown): CatalogProduct | null {
  if (!record(raw) || !text(raw.id, 100) || !(raw.id.startsWith('abo:') || raw.id.startsWith('extra:')) || !text(raw.name, 4000)
    || typeof raw.kind !== 'string' || !Object.hasOwn(kinds, raw.kind) || raw.currency !== 'AMD'
    || typeof raw.price !== 'number' || !Number.isSafeInteger(raw.price) || raw.price < 0 || raw.price > 1e7
    || !text(raw.glb_url, 2048) || !text(raw.license, 200)) return null;
  const size = raw.fit_size_m ?? raw.size_m;
  if (!Array.isArray(size) || size.length !== 3 || !size.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= 20)) return null;
  let url: URL;
  try { url = new URL(raw.glb_url); } catch { return null; }
  const original = url.protocol === 'https:' && url.hostname === 'amazon-berkeley-objects.s3.amazonaws.com'
    && !url.port && /^\/3dmodels\/original\/[a-zA-Z0-9/_-]+\.glb$/.test(url.pathname);
  const model = /^\/models\/([A-Za-z0-9_-]{1,120}\.glb)$/.exec(url.pathname);
  const catalogModel = (url.protocol === 'http:' || url.protocol === 'https:')
    && url.hostname === '100.107.246.46' && url.port === '8765' && model;
  if (url.username || url.password || url.search || (!original && !catalogModel)) return null;
  const orientation = raw.wd_swapped === true ? '#varpet-rotate-y=90' : '';
  url.hash = orientation;
  const modelUrl = catalogModel ? `/api/catalog/models/${model![1]}${orientation}` : url.href;
  const [width, depth, height] = size as [number, number, number];
  const imageColor = Array.isArray(raw.colors_img) ? raw.colors_img.find(c => record(c) && typeof c.hex === 'string' && /^#[a-f0-9]{6}$/i.test(c.hex)) : undefined;
  return {
    asset: { id: raw.id, name: raw.name.trim().slice(0, 120), kind: kinds[raw.kind]!, category: catalogCategory(kinds[raw.kind]!),
      dimensions: raw.wd_swapped === true ? [depth, height, width] : [width, height, depth],
      color: record(imageColor) ? imageColor.hex as string : '#b8b4ad', price: raw.price,
      source: { type: 'gltf', url: modelUrl } },
    priceSource: text(raw.price_source, 100) ? raw.price_source : 'unverified',
    sizeStatus: text(raw.size_status, 100) ? raw.size_status : 'unverified',
    attribution: `${raw.id.startsWith('extra:') ? 'Extra catalog' : 'Amazon Berkeley Objects'} · ${raw.license}`,
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
