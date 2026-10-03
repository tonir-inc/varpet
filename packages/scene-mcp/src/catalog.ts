// The varpet catalog seen from the scene MCP: real products, real sizes, public model URLs.
// The catalog service (Python, on the VM) speaks MCP at {VARPET_CATALOG_URL}/mcp. Its sizes are [w, d, h];
// Product.dimensions is Pascal's [w, h, d]. This file is the one place that converts.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Product } from '../../contracts/src/index.ts'
import { mountOf, type Mount } from './mount.ts'
import type { Hang } from './model-bounds.ts'

/**
 * search_furniture filters, as the catalog service names them (max sizes in metres), plus ours: `targetSize` in
 * Pascal's [w, h, d] (ranks by closeness; the service takes [w, d, h]) and `min_*` (the piece's own width, depth,
 * height at least this; filtered here, see searchPages).
 */
export interface ProductQuery {
  text?: string
  kind?: string
  colors?: string[]
  styles?: string[]
  materials?: string[]
  max_w?: number
  max_d?: number
  max_h?: number
  min_w?: number
  min_d?: number
  min_h?: number
  targetSize?: [number, number, number]
  price_max?: number
  exclude_ids?: string[]
  room_items?: string[]
  limit?: number
  offset?: number
}

export interface ProductHit extends Product {
  /** confirmed, estimated or conflict (mesh, listing and name disagree). */
  sizeStatus: string | null
  materials?: string[]
  /** How it goes up: on the floor, on a surface (table, shelf), hung on a wall, or hung from the ceiling. */
  mount: Mount
  /** What to check before trusting it; absent when nothing is known to be wrong. */
  flags?: string[]
  /** Generated lights: the hang contract from the catalog entry (`raw.hang`); the GLB's root extras win over it. */
  hang?: Hang
}

/**
 * Catalog flags, as short codes the agent reads. Nothing is hidden for them (the agent decides): `size_conflict`
 * (mesh, listing and name disagree on the size; most pendants, whose listing includes the cord), `model_sideways`
 * (the mesh's width and depth are swapped, so its front faces sideways at rotation 0), `no_price`.
 */
export const FLAG_TEXT = {
  size_conflict: 'size_conflict: listing and model disagree on the size; look at it with show_products',
  model_sideways: 'model_sideways: the model faces sideways at rotation 0 and its footprint is turned; prefer another or check it in view_scene',
  no_price: 'no_price: not in the quote total',
} as const

export interface ProductSearch {
  results: ProductHit[]
  candidates: number | null
  nextOffset: number | null
  /** Present when nothing passed the hard filters: which constraint failed and by how much. */
  nearestMisses?: unknown
  /** Present when min_* filtered the pages read. */
  minimumFilter?: string
}

/** An MCP image block, passed through to the agent. */
export interface ImageBlock {
  type: 'image'
  data: string
  mimeType: string
}

export interface Catalog {
  search(query: ProductQuery): Promise<ProductSearch>
  get(productId: string): Promise<ProductHit | null>
  /** One numbered grid image of the products' exact 3D models, plus a text legend. */
  show?(productIds: string[]): Promise<Array<ImageBlock | { type: 'text'; text: string }>>
}

/** A raw catalog item from search_furniture or get_item. */
export interface RawCatalogItem {
  id: string
  name: string
  kind: string
  source?: string
  source_id?: string
  brand?: string | null
  shop?: string | null
  size_m: [number, number, number]
  size_status?: string
  size_evidence?: { wd_swapped?: boolean } | null
  wd_swapped?: boolean
  /** tags.extra.placement: floor, surface, wall, ceiling (generated and shop models; null for Amazon items). */
  placement?: string | null
  price?: number | null
  styles?: string[]
  materials?: string[]
  colors_astra?: string[]
  colors_image?: string[]
  colors_listing?: string[]
  glb_url?: string | null
  image?: string | null
  main_image_url?: string | null
  /** Generated lights' hang data (the ingested entry keeps it in `raw`). */
  hang?: Hang | null
  raw?: { hang?: Hang | null } | null
}

/** Convert a catalog item to a Product: [w, d, h] to [w, h, d], model URL on the public origin. */
export function toProduct(raw: RawCatalogItem, publicOrigin: string): ProductHit {
  const [w, d, h] = raw.size_m
  const origin = publicOrigin.replace(/\/+$/, '')
  const glbUrl = modelUrl(raw, origin)
  if (!glbUrl) throw new Error(`catalog item ${raw.id} has no model`)
  const colors = raw.colors_astra?.length ? raw.colors_astra : raw.colors_listing?.length ? raw.colors_listing : raw.colors_image
  const dimensions: [number, number, number] = [round(w), round(h), round(d)]
  const flags: string[] = []
  if (raw.size_status === 'conflict') flags.push(FLAG_TEXT.size_conflict)
  if (raw.wd_swapped || raw.size_evidence?.wd_swapped) flags.push(FLAG_TEXT.model_sideways)
  if (typeof raw.price !== 'number') flags.push(FLAG_TEXT.no_price)
  return {
    id: raw.id,
    name: raw.name,
    kind: raw.kind,
    dimensions,
    priceAmd: typeof raw.price === 'number' ? raw.price : null,
    // The catalog has no shop yet; the brand is the closest thing a buyer can look for.
    shop: raw.shop ?? raw.brand ?? null,
    glbUrl,
    thumbnailUrl: raw.main_image_url ?? raw.image ?? null,
    colors: colors ? [...new Set(colors)] : undefined,
    styles: raw.styles,
    materials: raw.materials,
    sizeStatus: raw.size_status ?? null,
    mount: mountOf({ kind: raw.kind, name: raw.name, placement: raw.placement, size: dimensions }),
    ...(flags.length ? { flags } : {}),
    ...(hangOf(raw) ? { hang: hangOf(raw)! } : {}),
  }
}

function hangOf(raw: RawCatalogItem): Hang | null {
  const hang = raw.hang ?? raw.raw?.hang
  return hang && typeof hang.drop_m === 'number' ? hang : null
}

/** Has a model the browser can load (an item without one cannot be placed at all, so search leaves it out). */
export function hasModel(raw: RawCatalogItem): boolean {
  return Boolean(raw.glb_url) || raw.source === 'abo' || raw.id.startsWith('abo:')
}

/** The piece's own width, depth and height meet the minima (no turning: a wide wall piece must be wide). */
export function meetsMinimum(product: Product, query: Pick<ProductQuery, 'min_w' | 'min_d' | 'min_h'>): boolean {
  const [w, h, d] = product.dimensions
  return (query.min_w ?? 0) <= w + 1e-6 && (query.min_d ?? 0) <= d + 1e-6 && (query.min_h ?? 0) <= h + 1e-6
}

/** One page from the catalog service, raw. */
export type FetchPage = (args: Record<string, unknown>) => Promise<{
  results?: RawCatalogItem[]
  candidates?: number
  next_offset?: number | null
  nearest_misses?: unknown
} | null>

/** Service pages a min-size search reads before it answers with what it has (20 each). */
export const MIN_SIZE_PAGES = 6

/**
 * Search through the service, every scope ('all': the agent sees the whole catalog, flagged, not filtered). The
 * service has no minimum sizes, so with `min_*` this reads up to MIN_SIZE_PAGES pages of 20 and keeps the pieces
 * that are big enough; `nextOffset` is the service offset to continue from, so paging stays exact. `targetSize`
 * (ranking) goes to the service as [w, d, h]; give it with `min_*` and the big-enough pieces come first.
 */
export async function searchPages(fetchPage: FetchPage, query: ProductQuery, publicOrigin: string): Promise<ProductSearch> {
  const { min_w, min_d, min_h, targetSize, limit = 8, offset = 0, ...rest } = query
  const args: Record<string, unknown> = { ...rest, scope: 'all' }
  if (targetSize) args.target_size = [targetSize[0], targetSize[2], targetSize[1]]
  const filtering = [min_w, min_d, min_h].some((v) => typeof v === 'number' && v > 0)
  const results: ProductHit[] = []
  let cursor: number | null = offset
  let candidates: number | null = null
  let nearestMisses: unknown
  for (let page = 0; cursor !== null && results.length < limit && page < (filtering ? MIN_SIZE_PAGES : 1); page++) {
    const out = await fetchPage({ ...args, limit: filtering ? 20 : limit, offset: cursor })
    candidates ??= out?.candidates ?? null
    if (out?.nearest_misses) nearestMisses = out.nearest_misses
    const raws = out?.results ?? []
    let used = 0
    for (const raw of raws) {
      used++
      if (!hasModel(raw)) continue
      const product = toProduct(raw, publicOrigin)
      if (filtering && !meetsMinimum(product, { min_w, min_d, min_h })) continue
      results.push(product)
      if (results.length >= limit) break
    }
    const next: number | null = out?.next_offset ?? null
    // Stopped inside this page: continue right after the last item read.
    cursor = used < raws.length ? cursor + used : next
  }
  return {
    results,
    candidates,
    nextOffset: cursor,
    ...(filtering ? { minimumFilter: `kept pieces at least ${[min_w && `${min_w} m wide`, min_d && `${min_d} m deep`, min_h && `${min_h} m tall`].filter(Boolean).join(', ')}` } : {}),
    ...(nearestMisses && results.length === 0 ? { nearestMisses } : {}),
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * The model the browser loads, relayed by the web app from the catalog host's /models/. Generated items name their
 * file in glb_url (`extra-<group>-<slug>.glb`); Amazon items keep the S3 original there, and the catalog serves
 * its web-optimised copy as `<ASIN>.glb`.
 */
function modelUrl(raw: RawCatalogItem, origin: string): string | null {
  const relay = (file: string) => `${origin}/api/catalog/models/${encodeURIComponent(file)}`
  if (raw.glb_url) {
    try {
      const url = new URL(raw.glb_url)
      const file = url.pathname.split('/').pop() ?? ''
      if (url.pathname.startsWith('/models/') && file.endsWith('.glb')) return relay(file)
    } catch {
      // not a URL: fall through
    }
  }
  const sourceId = raw.source_id ?? (raw.id.includes(':') ? raw.id.split(':').at(-1)! : null)
  if (sourceId && (raw.source === 'abo' || raw.id.startsWith('abo:'))) return relay(`${sourceId}.glb`)
  return raw.glb_url ?? null
}

/** Catalog over the service's MCP endpoint. Connects lazily and reconnects after a failure. */
export function createMcpCatalog(catalogUrl: string, publicOrigin: string): Catalog {
  let client: Promise<Client> | null = null
  const connect = () => {
    client ??= (async () => {
      const c = new Client({ name: 'varpet-scene-mcp', version: '0.0.0' })
      await c.connect(new StreamableHTTPClientTransport(new URL(`${catalogUrl.replace(/\/+$/, '')}/mcp`)))
      return c
    })().catch((error) => {
      client = null
      throw error
    })
    return client
  }
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await (await connect()).callTool({ name, arguments: args })
    const content = (result.content ?? []) as Array<{ type: string; text?: string; data?: string; mimeType?: string }>
    if (result.isError) throw new Error(content.map((c) => c.text ?? '').join(' ') || `${name} failed`)
    return content
  }
  const json = async (name: string, args: Record<string, unknown>) => {
    const text = (await call(name, args)).find((c) => c.type === 'text')?.text
    return text ? JSON.parse(text) : null
  }
  return {
    async search(query) {
      return searchPages((args) => json('search_furniture', args), query, publicOrigin)
    },
    async get(productId) {
      try {
        const raw = (await json('get_item', { item_id: productId })) as RawCatalogItem | null
        return raw?.size_m && hasModel(raw) ? toProduct(raw, publicOrigin) : null
      } catch (error) {
        if (/not found|unknown/i.test(String(error))) return null
        throw error
      }
    },
    async show(productIds) {
      const content = await call('show_candidates', { item_ids: productIds })
      const blocks: Array<ImageBlock | { type: 'text'; text: string }> = []
      for (const c of content) {
        if (c.type === 'image' && c.data) blocks.push({ type: 'image', data: c.data, mimeType: c.mimeType ?? 'image/webp' })
        else if (c.type === 'text' && c.text) blocks.push({ type: 'text', text: c.text })
      }
      return blocks
    },
  }
}
