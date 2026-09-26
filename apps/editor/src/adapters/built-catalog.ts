import { builtPieces } from './architect-http';
import { databaseCatalog, type CatalogProduct } from './database-catalog';
import { createInitialScene } from '../core/initial-scene';
import { validateScene } from '../core/validation';

export const BUILT_CATEGORY = 'Built from your photos';
interface BuiltCatalogOptions { url?: string; run?: string; fetch?: typeof globalThis.fetch }

function transport(options: BuiltCatalogOptions) {
  if (!options.url?.trim()) throw new Error('Connect the architect service to load furniture built from your photos.');
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const signal = AbortSignal.timeout(20000);
  const fetcher: typeof globalThis.fetch = (input, init) => request(input, { ...init, signal });
  return { url: options.url.trim().replace(/\/$/, ''), fetch: fetcher };
}

/** Photo reconstructions are owned pieces without a shop quote or verified dimensions. */
export async function loadBuiltProducts(options: BuiltCatalogOptions): Promise<{ run: string; products: CatalogProduct[] }> {
  const result = await builtPieces({ ...transport(options), run: options.run?.trim() || undefined });
  const checked = validateScene(createInitialScene(), result.assets);
  if (!checked.ok) throw new Error(`Invalid built furniture: ${checked.errors.join(' ')}`);
  if (result.assets.some(asset => !asset.id.startsWith(`built-${result.run}-`) || asset.price !== 0
    || asset.source.type !== 'gltf' || asset.category !== BUILT_CATEGORY)) {
    throw new Error('The architect returned an invalid built furniture record.');
  }
  return { run: result.run, products: result.assets.map(asset => ({ asset,
    priceSource: 'not priced', sizeStatus: 'unverified reconstruction', attribution: `${BUILT_CATEGORY} · ${result.run}`,
  })) };
}

/** Old project references may belong to any run, not just the newest browsable set. */
export async function resolveFurnitureProducts(ids: string[], options: BuiltCatalogOptions,
  resolveDatabase = databaseCatalog.resolve): Promise<CatalogProduct[]> {
  const built = ids.filter(id => id.startsWith('built-'));
  const products: CatalogProduct[] = [];
  if (built.length) {
    const connection = transport(options);
    const response = await connection.fetch(`${connection.url}/runs`);
    if (!response.ok) throw new Error(`Built furniture unavailable (HTTP ${response.status}).`);
    const runs: unknown = await response.json();
    if (!Array.isArray(runs)) throw new Error('The architect returned an invalid run list.');
    for (const entry of runs) {
      if (!entry || typeof entry.run !== 'string' || !built.some(id => id.startsWith(`built-${entry.run}-`))) continue;
      const result = await loadBuiltProducts({ ...connection, run: entry.run });
      products.push(...result.products.filter(product => built.includes(product.asset.id)));
    }
    if (built.some(id => !products.some(product => product.asset.id === id))) {
      throw new Error('This project references built furniture unavailable from the architect. Its current contents have been kept.');
    }
  }
  const databaseIds = ids.filter(id => !id.startsWith('built-'));
  return [...products, ...(databaseIds.length ? await resolveDatabase(databaseIds) : [])];
}
