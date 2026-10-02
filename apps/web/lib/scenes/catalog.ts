import type { AssetInput } from '@pascal-app/core'
// Type-only: apps/web does not depend on @varpet/contracts yet (see lane A report).
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
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.kind) params.set('kind', query.kind)
  params.set('limit', String(query.limit ?? 60))
  const response = await fetch(`/api/catalog/search?${params}`, { signal: opts.signal })
  if (!response.ok) throw new Error(`catalog search failed (${response.status})`)
  const body = (await response.json()) as { results?: Product[] }
  return body.results ?? []
}

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
