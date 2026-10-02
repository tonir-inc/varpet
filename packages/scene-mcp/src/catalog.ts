// The varpet catalog seen from the scene MCP: real products, real sizes, public model URLs.
// The catalog service (Python, on the VM) speaks MCP at {VARPET_CATALOG_URL}/mcp. Its sizes are [w, d, h];
// Product.dimensions is Pascal's [w, h, d]. This file is the one place that converts.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Product } from '../../contracts/src/index.ts'

/** search_furniture filters, as the catalog service names them. Sizes are maxima in metres. */
export interface ProductQuery {
  text?: string
  kind?: string
  colors?: string[]
  styles?: string[]
  materials?: string[]
  max_w?: number
  max_d?: number
  max_h?: number
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
}

export interface ProductSearch {
  results: ProductHit[]
  candidates: number | null
  nextOffset: number | null
  /** Present when nothing passed the hard filters: which constraint failed and by how much. */
  nearestMisses?: unknown
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
  price?: number | null
  styles?: string[]
  materials?: string[]
  colors_astra?: string[]
  colors_image?: string[]
  colors_listing?: string[]
  glb_url?: string | null
  image?: string | null
  main_image_url?: string | null
}

/** Convert a catalog item to a Product: [w, d, h] to [w, h, d], model URL on the public origin. */
export function toProduct(raw: RawCatalogItem, publicOrigin: string): ProductHit {
  const [w, d, h] = raw.size_m
  const origin = publicOrigin.replace(/\/+$/, '')
  const glbUrl = modelUrl(raw, origin)
  if (!glbUrl) throw new Error(`catalog item ${raw.id} has no model`)
  const colors = raw.colors_astra?.length ? raw.colors_astra : raw.colors_listing?.length ? raw.colors_listing : raw.colors_image
  return {
    id: raw.id,
    name: raw.name,
    kind: raw.kind,
    dimensions: [round(w), round(h), round(d)],
    priceAmd: typeof raw.price === 'number' ? raw.price : null,
    // The catalog has no shop yet; the brand is the closest thing a buyer can look for.
    shop: raw.shop ?? raw.brand ?? null,
    glbUrl,
    thumbnailUrl: raw.main_image_url ?? raw.image ?? null,
    colors: colors ? [...new Set(colors)] : undefined,
    styles: raw.styles,
    materials: raw.materials,
    sizeStatus: raw.size_status ?? null,
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
      const out = await json('search_furniture', { ...query, scope: 'placeable' })
      return {
        results: ((out?.results ?? []) as RawCatalogItem[]).map((raw) => toProduct(raw, publicOrigin)),
        candidates: out?.candidates ?? null,
        nextOffset: out?.next_offset ?? null,
        ...(out?.nearest_misses ? { nearestMisses: out.nearest_misses } : {}),
      }
    },
    async get(productId) {
      try {
        const raw = (await json('get_item', { item_id: productId })) as RawCatalogItem | null
        return raw?.size_m ? toProduct(raw, publicOrigin) : null
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
