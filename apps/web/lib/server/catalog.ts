// The catalog boundary (v1 apps/editor/server/catalog.mjs). Talks to the Python catalog service over MCP
// (streamable HTTP, stateless tools/call) and returns the contract `Product`: Pascal-order dimensions [w, h, d],
// price in AMD, and only URLs the browser can load (tailnet files are relayed through /api/catalog/*).
// apps/web does not depend on @varpet/contracts yet (shared package.json); a type-only relative import erases at build.
import type { Product } from '@varpet/contracts'
import { isObject, json, publicOrigin } from './http'

const DEFAULT_CATALOG_URL = 'http://100.107.246.46:8765'
const TIMEOUT_MS = 15_000
const MODEL_TIMEOUT_MS = 60_000
const unavailable = { status: 'unavailable', results: [], reason: 'Catalog unavailable. Check the catalog service connection and try again.' }

/** Service root without a trailing /mcp. */
export function catalogBase(): URL {
  const url = new URL((process.env.VARPET_CATALOG_URL || DEFAULT_CATALOG_URL).replace(/\/mcp\/?$/, '').replace(/\/+$/, '') + '/')
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Catalog URL must use HTTP or HTTPS')
  return url
}

class CatalogError extends Error {}

function payload(result: unknown): Record<string, unknown> {
  if (!isObject(result) || result.isError) throw new CatalogError('Catalog tool failed')
  if (isObject(result.structuredContent)) return result.structuredContent
  for (const block of Array.isArray(result.content) ? result.content : []) {
    if (!isObject(block) || block.type !== 'text' || typeof block.text !== 'string') continue
    try { const parsed = JSON.parse(block.text); if (isObject(parsed)) return parsed } catch { /* a later block may parse */ }
  }
  throw new CatalogError('Catalog tool returned no record')
}

/** One stateless MCP tools/call; the reply is JSON or a single SSE `data:` message. */
async function callTool(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(new URL('mcp', catalogBase()), {
    method: 'POST', redirect: 'error', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
  })
  if (!response.ok) throw new CatalogError(`Catalog answered ${response.status}`)
  const text = await response.text()
  let message: unknown
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const data = text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim())
    for (const chunk of data) { try { const parsed = JSON.parse(chunk); if (isObject(parsed) && ('result' in parsed || 'error' in parsed)) { message = parsed; break } } catch { /* next */ } }
  } else message = JSON.parse(text)
  if (!isObject(message) || message.error || !('result' in message)) throw new CatalogError('Catalog call failed')
  return payload(message.result)
}

/* ---- conversion ---- */

const FILE = /^[A-Za-z0-9_.-]{1,160}$/
const MODEL = /^[A-Za-z0-9_-]{1,120}\.glb$/
const PREVIEW = /^[A-Za-z0-9_-]{1,120}\.(?:webp|png|jpe?g)$/

/** A URL the browser can load: public https passes through, catalog-host files are relayed by this app. */
function browserUrl(raw: unknown, origin: string, kind: 'models' | 'previews'): string | null {
  if (typeof raw !== 'string' || !raw) return null
  let url: URL
  try { url = new URL(raw, catalogBase()) } catch { return null }
  const base = catalogBase()
  if (url.host === base.host) {
    const file = url.pathname.split('/').pop() ?? ''
    if (!url.pathname.startsWith(`/${kind}/`) || !FILE.test(file) || !(kind === 'models' ? MODEL : PREVIEW).test(file)) return null
    return `${origin}/api/catalog/${kind}/${file}`
  }
  return url.protocol === 'https:' ? url.href : null
}

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))] : undefined

/** Catalog record -> contract Product. Catalog sizes are [w, d, h]; Pascal's are [w, h, d]. */
export function toProduct(raw: Record<string, unknown>, origin: string): Product | null {
  const size = Array.isArray(raw.size_m) ? raw.size_m : Array.isArray(raw.fit_size_m) ? raw.fit_size_m : null
  if (typeof raw.id !== 'string' || !raw.id || !size || size.length !== 3 || !size.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null
  // Same model URL as the scene MCP's place_product: the catalog's optimized GLB by source id, relayed by this app
  // (the listing's glb_url is often the raw S3 original, tens of MB).
  // Generated items name their file on the catalog host in glb_url; Amazon items keep the S3 original there and
  // the catalog serves its optimised copy as <ASIN>.glb.
  const sourceId = typeof raw.source_id === 'string' ? raw.source_id : raw.id.includes(':') ? raw.id.split(':').at(-1)! : null
  const abo = raw.source === 'abo' || raw.id.startsWith('abo:')
  const relayed = browserUrl(raw.glb_url, origin, 'models')
  const glbUrl = relayed?.startsWith(`${origin}/api/catalog/models/`)
    ? relayed
    : abo && sourceId && MODEL.test(`${sourceId}.glb`)
      ? `${origin}/api/catalog/models/${encodeURIComponent(sourceId)}.glb`
      : relayed
  if (!glbUrl) return null
  const [w, d, h] = size as [number, number, number]
  const currency = typeof raw.currency === 'string' ? raw.currency : 'AMD'
  const price = typeof raw.price === 'number' && Number.isFinite(raw.price) && currency === 'AMD' ? raw.price : null
  const thumbnailUrl = browserUrl(raw.preview ?? raw.preview_url, origin, 'previews')
    ?? (typeof (raw.image ?? raw.main_image_url) === 'string' && /^https:\/\//.test(String(raw.image ?? raw.main_image_url)) ? String(raw.image ?? raw.main_image_url) : null)
  // The catalog has no shop field yet; the brand is the closest seller-facing name.
  const shop = typeof raw.shop === 'string' ? raw.shop : typeof raw.brand === 'string' && raw.brand ? raw.brand : null
  const colors = strings(raw.colors_astra) ?? strings(raw.color_std)
  const styles = strings(raw.style_astra) ?? strings(raw.styles)
  return {
    id: raw.id, name: typeof raw.name === 'string' ? raw.name : raw.id, kind: typeof raw.kind === 'string' ? raw.kind : 'other',
    dimensions: [w, h, d], priceAmd: price, shop, glbUrl, thumbnailUrl,
    ...(colors?.length ? { colors } : {}), ...(styles?.length ? { styles } : {}),
  }
}

/* ---- handlers ---- */

const number = (value: string | null, min: number, max: number) => {
  if (value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : NaN
}

/** GET /api/catalog/search?q=&kind=&max_w=&max_d=&max_h=&price_max=&limit=&offset= -> {results: Product[]} */
export async function search(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const text = (params.get('q') ?? params.get('text'))?.trim() || undefined
  const kind = params.get('kind')?.trim() || undefined
  const filters = { max_w: number(params.get('max_w'), 0, 100), max_d: number(params.get('max_d'), 0, 100), max_h: number(params.get('max_h'), 0, 100),
    price_max: number(params.get('price_max'), 0, 1e12), limit: number(params.get('limit'), 1, 20), offset: number(params.get('offset'), 0, 100_000) }
  if ((text?.length ?? 0) > 1000 || (kind?.length ?? 0) > 100 || Object.values(filters).some(value => Number.isNaN(value))
    || (filters.limit !== undefined && !Number.isInteger(filters.limit)) || (filters.offset !== undefined && !Number.isInteger(filters.offset))) {
    return json(400, { reason: 'Invalid catalog query.' })
  }
  const args: Record<string, unknown> = { limit: filters.limit ?? 20 }
  if (text) args.text = text
  if (kind) args.kind = kind
  for (const key of ['max_w', 'max_d', 'max_h', 'offset'] as const) if (filters[key] !== undefined) args[key] = filters[key]
  if (filters.price_max !== undefined) args.price_max = Math.floor(filters.price_max)
  try {
    const result = await callTool('search_furniture', args, request.signal)
    if (!Array.isArray(result.results)) throw new CatalogError('Catalog search returned no list')
    const origin = publicOrigin(request)
    const results = result.results.filter(isObject).map(raw => toProduct(raw, origin)).filter((product): product is Product => product !== null)
    return json(200, { results, candidates: typeof result.candidates === 'number' ? result.candidates : undefined,
      nextOffset: typeof result.next_offset === 'number' ? result.next_offset : null })
  } catch {
    // Upstream errors can carry URLs or SQL; the client retries on its next search.
    return json(503, unavailable)
  }
}

/** GET /api/catalog/items/:id -> Product */
export async function item(request: Request, rawId: string): Promise<Response> {
  let id: string
  try { id = decodeURIComponent(rawId) } catch { return json(400, { reason: 'Invalid catalog query.' }) }
  if (!id || id.length > 256) return json(400, { reason: 'Invalid catalog query.' })
  try {
    const detail = await callTool('get_item', { item_id: id }, request.signal)
    if (typeof detail.error === 'string' && /^no item\b/.test(detail.error)) return json(404, { reason: 'This catalog item does not exist.' })
    if (detail.id !== id) throw new CatalogError('Catalog detail identity mismatch')
    const product = toProduct(detail, publicOrigin(request))
    if (!product) return json(404, { reason: 'This catalog item has no 3D model the editor can place.' })
    return json(200, product)
  } catch {
    return json(503, unavailable)
  }
}

/** Relays a model or preview file from the catalog host, so the browser never needs the tailnet. */
export async function relay(request: Request, kind: 'models' | 'previews', file: string): Promise<Response> {
  if (!(kind === 'models' ? MODEL : PREVIEW).test(file)) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  let upstream: Response
  try {
    upstream = await fetch(new URL(`${kind}/${file}`, catalogBase()), { redirect: 'error', cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(MODEL_TIMEOUT_MS)]) })
  } catch (error) {
    return new Response(null, { status: (error as Error)?.name === 'TimeoutError' ? 504 : 502, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!upstream.ok || !upstream.body) {
    void upstream.body?.cancel().catch(() => {})
    return new Response(null, { status: upstream.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'no-store' } })
  }
  const type = kind === 'models' ? 'model/gltf-binary' : upstream.headers.get('content-type') ?? 'image/webp'
  const length = upstream.headers.get('content-length')
  return new Response(upstream.body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff', ...(length ? { 'Content-Length': length } : {}) } })
}
