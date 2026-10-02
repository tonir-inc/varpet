import type { AssetInput } from '@pascal-app/core'
import type { Product } from '@varpet/contracts'

/** Pascal's Items panel shows only these categories while the search box is empty. */
type PanelCategory = 'furniture' | 'appliance' | 'kitchen' | 'bathroom' | 'outdoor'

const CATEGORY_RULES: [PanelCategory, RegExp][] = [
  ['bathroom', /bath|shower|toilet|wc|bidet|basin|vanity|towel/i],
  ['kitchen', /kitchen|cooktop|hob|sink|countertop|worktop|range.?hood|extractor/i],
  ['appliance', /appliance|fridge|refrigerator|freezer|oven|microwave|washer|washing|dryer|dishwasher|\btv\b(?![ _-]?(stand|unit|cabinet))|television|air.?con|heater/i],
  ['outdoor', /outdoor|garden|balcony|terrace|patio/i],
]

export function panelCategory(product: Pick<Product, 'kind' | 'name'>): PanelCategory {
  const text = `${product.kind} ${product.name}`
  for (const [category, rule] of CATEGORY_RULES) if (rule.test(text)) return category
  return 'furniture'
}

/**
 * A catalog product as a Pascal catalog tile. `Product.dimensions` is already Pascal's [w, h, d].
 * `thumbnailFallback` must be absolute: Pascal prefixes relative paths with its asset CDN.
 */
export function productToAsset(product: Product, thumbnailFallback: string): AssetInput {
  return {
    id: product.id,
    category: panelCategory(product),
    name: product.name,
    thumbnail: product.thumbnailUrl ?? thumbnailFallback,
    src: product.glbUrl,
    dimensions: product.dimensions,
    source: 'library',
    tags: [product.kind, ...(product.styles ?? [])].filter(Boolean),
  }
}

/** What an item placed from the catalog carries, the same as the agent's `place_product`. */
export interface ProductMetadata {
  productId: string
  priceAmd: number | null
  shop: string | null
}

// Products the catalog tab has shown, by id, so a placed tile (Pascal keeps only the asset) can be stamped.
const seenProducts = new Map<string, ProductMetadata>()

export function rememberProducts(products: Product[]) {
  for (const product of products) seenProducts.set(product.id, { productId: product.id, priceAmd: product.priceAmd, shop: product.shop })
}

export function productMetadata(assetId: unknown): ProductMetadata | null {
  return typeof assetId === 'string' ? (seenProducts.get(assetId) ?? null) : null
}

export interface CatalogQuery {
  q?: string
  kind?: string
  limit?: number
}

/** `GET /api/catalog/search` (lane B), or the local fixture when `fixture` is set. */
export async function searchProducts(query: CatalogQuery, opts: { fixture?: boolean; signal?: AbortSignal } = {}): Promise<Product[]> {
  if (opts.fixture) {
    const q = query.q?.trim().toLowerCase()
    return q ? CATALOG_FIXTURE.filter((p) => `${p.name} ${p.kind}`.toLowerCase().includes(q)) : CATALOG_FIXTURE
  }
  // The route pages at most PAGE results; follow nextOffset up to the wanted count.
  const wanted = query.limit ?? 60
  const products: Product[] = []
  let offset: number | null = 0
  while (offset !== null && products.length < wanted) {
    const params = new URLSearchParams()
    if (query.q) params.set('q', query.q)
    if (query.kind) params.set('kind', query.kind)
    params.set('limit', String(Math.min(PAGE, wanted - products.length)))
    if (offset) params.set('offset', String(offset))
    const response = await fetch(`/api/catalog/search?${params}`, { signal: opts.signal })
    if (!response.ok) throw new Error(`catalog search failed (${response.status})`)
    const body = (await response.json()) as { results?: Product[]; nextOffset?: number | null }
    products.push(...(body.results ?? []))
    offset = body.results?.length && typeof body.nextOffset === 'number' && body.nextOffset > offset ? body.nextOffset : null
  }
  return products
}

/** `/api/catalog/search` returns at most this many per request. */
const PAGE = 20

// Test fixture: Pascal's public demo models stand in for shop products until lane B's route lands.
const PASCAL_ITEMS = 'https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system'
const fixture = (id: string, slug: string, name: string, kind: string, dimensions: [number, number, number], priceAmd: number, shop: string): Product => ({
  id,
  name,
  kind,
  dimensions,
  priceAmd,
  shop,
  glbUrl: `${PASCAL_ITEMS}/${slug}/model.glb`,
  thumbnailUrl: `${PASCAL_ITEMS}/${slug}/thumbnail.png`,
})

export const CATALOG_FIXTURE: Product[] = [
  fixture('fixture-tv-stand', 'tv-stand', 'TV stand', 'tv_stand', [1.86, 0.35, 0.32], 89_000, 'Fixture shop'),
  fixture('fixture-cactus', 'cactus', 'Cactus coat stand', 'decor', [0.34, 0.39, 0.27], 24_000, 'Fixture shop'),
]
