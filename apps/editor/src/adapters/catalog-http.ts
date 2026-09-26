import type { AssetKind, CatalogAdapter, CatalogAsset } from '../contracts';

export const DEFAULT_CATALOG_ASSETS_URL = 'http://100.107.246.46:8765/editor/assets';
export const CATALOG_CURRENCY = 'AMD' as const;

const kinds: readonly AssetKind[] = ['sofa', 'chair', 'table', 'desk', 'bed', 'cabinet', 'wardrobe', 'dresser', 'lamp', 'plant', 'rug', 'shelf', 'toilet', 'sink', 'bathtub', 'shower', 'fridge', 'stove', 'oven', 'washing_machine', 'dryer', 'dishwasher', 'microwave', 'tv', 'monitor', 'computer', 'laptop', 'speaker', 'printer', 'game_console', 'kitchen_cabinet', 'kitchen_counter', 'kitchen_island', 'radiator', 'fan', 'coat_rack', 'shoe_rack', 'decor', 'wall_art', 'mirror', 'curtain'];
const allowedHosts = new Set(['amazon-berkeley-objects.s3.amazonaws.com', '100.107.246.46']);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function validAsset(value: unknown): value is CatalogAsset {
  if (!record(value) || typeof value.id !== 'string' || typeof value.name !== 'string' ||
      typeof value.category !== 'string' || !kinds.includes(value.kind as AssetKind) ||
      !Array.isArray(value.dimensions) || value.dimensions.length !== 3 ||
      !value.dimensions.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 10) ||
      typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color) ||
      typeof value.price !== 'number' || !Number.isSafeInteger(value.price) || value.price < 0 ||
      !record(value.source)) return false;
  if (value.source.type === 'procedural') return true;
  if (value.source.type !== 'gltf' || typeof value.source.url !== 'string') return false;
  if (/^\/api\/catalog\/models\/[A-Za-z0-9_-]{1,120}\.glb(?:#varpet-rotate-y=90)?$/.test(value.source.url)) return true;
  try {
    const url = new URL(value.source.url);
    return (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '100.107.246.46')) &&
      allowedHosts.has(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function createCatalogHttpAdapter(options: {
  url?: string; timeoutMs?: number; fetch?: typeof fetch; models?: 'original' | 'web';
} = {}): CatalogAdapter {
  let url = options.url ?? import.meta.env?.VITE_CATALOG_ASSETS_URL ?? DEFAULT_CATALOG_ASSETS_URL;
  const models = options.models ?? import.meta.env?.VITE_CATALOG_MODELS ?? 'original';
  if (models === 'web') {
    const fragmentStart = url.indexOf('#');
    const fragment = fragmentStart < 0 ? '' : url.slice(fragmentStart);
    const base = fragmentStart < 0 ? url : url.slice(0, fragmentStart);
    const queryStart = base.indexOf('?');
    const path = queryStart < 0 ? base : base.slice(0, queryStart);
    const query = new URLSearchParams(queryStart < 0 ? '' : base.slice(queryStart + 1));
    query.set('models', 'web');
    url = `${path}?${query}${fragment}`;
  }
  const timeoutMs = options.timeoutMs ?? 15_000;
  const fetchCatalog = options.fetch ?? globalThis.fetch;
  return {
    async list(signal) {
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      if (signal?.aborted) abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(new DOMException('Catalog request timed out.', 'TimeoutError')), timeoutMs);
      let onAbort: () => void = () => {};
      try {
        controller.signal.throwIfAborted();
        // Also bound JSON body reads and injected transports that ignore cancellation.
        const cancelled = new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(controller.signal.reason);
          controller.signal.addEventListener('abort', onAbort, { once: true });
        });
        const data: unknown = await Promise.race([
          (async () => {
            const response = await fetchCatalog(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Catalog HTTP ${response.status}.`);
            return response.json();
          })(), cancelled,
        ]);
        controller.signal.throwIfAborted();
        if (!Array.isArray(data)) throw new Error('Catalog response must be an array.');
        const assets: CatalogAsset[] = [];
        const ids = new Set<string>();
        let dropped = 0;
        for (const entry of data) {
          if (!validAsset(entry) || ids.has(entry.id)) { dropped++; continue; }
          ids.add(entry.id);
          assets.push(entry);
        }
        if (dropped) console.warn(`Catalog: dropped ${dropped} invalid entries.`);
        if (!assets.length) throw new Error(`Catalog contains no valid entries (${dropped} dropped).`);
        // The existing CatalogAdapter contract uses a mutable array type.
        Object.freeze(assets);
        return assets;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        controller.signal.removeEventListener('abort', onAbort);
      }
    },
  };
}

export function mergeCatalogs(local: CatalogAsset[], remote: CatalogAsset[]): CatalogAsset[] {
  const merged = [...local];
  const ids = new Set(local.map(asset => asset.id));
  for (const asset of remote) {
    if (ids.has(asset.id)) continue;
    ids.add(asset.id);
    merged.push(asset);
  }
  return merged;
}
