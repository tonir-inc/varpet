// What the flat costs, from the scene: v1's quote (folio-shell.ts renderQuote) on Pascal item nodes. Items placed
// from the catalog or by the designer carry `metadata: {productId, priceAmd, shop}`; anything else came with the flat.

export interface QuoteLine {
  key: string
  name: string
  size: string
  count: number
  /** Price of one, or null when the catalog has none. */
  unit: number | null
  shop: string | null
}

export interface Quote {
  shops: QuoteLine[]
  developer: QuoteLine[]
  total: number
  /** Pieces with a catalog product id, of all pieces. */
  priced: number
  pieces: number
}

type ItemNode = {
  type?: string
  name?: string
  metadata?: unknown
  asset?: { id?: unknown; name?: unknown; dimensions?: unknown }
}

const cm = (metres: unknown) => (typeof metres === 'number' && Number.isFinite(metres) ? Math.round(metres * 100) : null)

/** Pascal dimensions are [w, h, d] in metres; v1 lists width × depth × height in cm. */
function sizeOf(dimensions: unknown): string {
  if (!Array.isArray(dimensions) || dimensions.length < 3) return ''
  const [w, h, d] = dimensions.map(cm)
  return w && h && d ? `${w} × ${d} × ${h} cm` : ''
}

export function buildQuote(nodes: Record<string, unknown>): Quote {
  const shops = new Map<string, QuoteLine>()
  const developer = new Map<string, QuoteLine>()
  let total = 0, priced = 0, pieces = 0
  for (const raw of Object.values(nodes)) {
    const node = raw as ItemNode
    if (!node || node.type !== 'item') continue
    const meta = (node.metadata && typeof node.metadata === 'object' ? node.metadata : {}) as Record<string, unknown>
    if (meta.isTransient) continue
    pieces += 1
    const name = (typeof node.name === 'string' && node.name) || (typeof node.asset?.name === 'string' ? node.asset.name : 'Piece')
    const size = sizeOf(node.asset?.dimensions)
    const productId = typeof meta.productId === 'string' ? meta.productId : null
    const unit = typeof meta.priceAmd === 'number' && Number.isFinite(meta.priceAmd) ? meta.priceAmd : null
    const target = productId ? shops : developer
    if (productId) priced += 1
    if (unit !== null) total += unit
    const key = productId ?? `${String(node.asset?.id ?? name)}|${size}`
    const line = target.get(key)
    if (line) line.count += 1
    else target.set(key, { key, name, size, count: 1, unit, shop: typeof meta.shop === 'string' ? meta.shop : null })
  }
  const byName = (a: QuoteLine, b: QuoteLine) => a.name.localeCompare(b.name)
  return { shops: [...shops.values()].sort(byName), developer: [...developer.values()].sort(byName), total, priced, pieces }
}
