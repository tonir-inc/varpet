import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { FLAG_TEXT, searchPages, toProduct, type Catalog, type FetchPage, type ProductHit, type RawCatalogItem } from './catalog.ts'
import { mountOf } from './mount.ts'
import { gltfBounds, type Bounds } from './model-bounds.ts'
import { createSceneServer } from './server.ts'

const TEMPLATE = join(import.meta.dirname, '../../../apps/web/lib/flats/templates/sunday-b12121.json')
const ORIGIN = 'https://varpet.example'

test('mountOf: the catalog placement tag first, then kind and name', () => {
  const cases: Array<[Parameters<typeof mountOf>[0], string]> = [
    [{ kind: 'light', name: 'Rivet Modern Industrial Geometric Cage Pendant Light' }, 'ceiling'],
    [{ kind: 'light', name: 'Stone & Beam Industrial Rectangle Cage Flush Mount' }, 'ceiling'],
    [{ kind: 'light', name: 'Ravenna Home Traditional Wall Sconce with Linen Shade' }, 'wall'],
    [{ kind: 'lamp', name: 'Oak wall sconce with a hanging paper cone shade', placement: 'wall' }, 'wall'],
    [{ kind: 'lamp', name: 'Arc floor lamp, brass', size: [0.4, 1.8, 0.4] }, 'floor'],
    [{ kind: 'lamp', name: 'Ceramic table lamp', size: [0.3, 0.5, 0.3] }, 'surface'],
    [{ kind: 'lamp', name: 'Globe lamp', size: [0.3, 1.5, 0.3] }, 'floor'],
    [{ kind: 'wall_art', name: 'A River Landscape, framed' }, 'wall'],
    [{ kind: 'mirror', name: 'Round brass mirror' }, 'wall'],
    [{ kind: 'mirror', name: 'Full Length Floor Mirror, leaning' }, 'floor'],
    [{ kind: 'mirror', name: 'Oval mirror', placement: 'floor' }, 'floor'],
    [{ kind: 'curtain', name: 'Natural linen wave curtains on black rod' }, 'wall'],
    [{ kind: 'blind', name: 'Grey blackout roller blind' }, 'wall'],
    [{ kind: 'shelf', name: 'Floating shelves, set of 3' }, 'wall'],
    [{ kind: 'shelf', name: 'Five-tier bookcase' }, 'floor'],
    [{ kind: 'tv', name: '55 inch TV' }, 'surface'],
    [{ kind: 'tv', name: '65 inch TV', placement: 'wall' }, 'wall'],
    [{ kind: 'decor', name: 'Stoneware vase', placement: 'surface' }, 'surface'],
    [{ kind: 'decor', name: 'Stoneware vase' }, 'surface'],
    [{ kind: 'sofa', name: 'Three-seat sofa' }, 'floor'],
    [{ kind: 'fan', name: 'Ceiling fan with light' }, 'ceiling'],
  ]
  for (const [item, mount] of cases) assert.equal(mountOf(item), mount, item.name)
})

test('toProduct gives the mount and flags what is known to be off, without hiding the product', () => {
  const pendant = toProduct(
    { id: 'abo:B0711Q7WK7', name: 'Cage Pendant Light', kind: 'light', size_m: [0.49, 0.43, 1.76], size_status: 'conflict', price: 24000 },
    ORIGIN,
  )
  assert.equal(pendant.mount, 'ceiling')
  assert.deepEqual(pendant.flags, [FLAG_TEXT.size_conflict])
  const cabinet = toProduct(
    { id: 'abo:X', name: 'Cabinet', kind: 'cabinet', size_m: [1, 0.4, 0.8], size_status: 'confirmed', size_evidence: { wd_swapped: true } },
    ORIGIN,
  )
  assert.deepEqual(cabinet.flags, [FLAG_TEXT.model_sideways, FLAG_TEXT.no_price])
  const sofa = toProduct({ id: 'abo:Y', name: 'Sofa', kind: 'sofa', size_m: [2, 0.9, 0.8], size_status: 'confirmed', price: 1 }, ORIGIN)
  assert.equal(sofa.flags, undefined)
})

const art = (id: string, w: number, h: number, extra: Partial<RawCatalogItem> = {}): RawCatalogItem => ({
  id,
  name: `Art ${id}`,
  kind: 'wall_art',
  source: 'extra',
  size_m: [w, 0.03, h],
  size_status: 'confirmed',
  price: 10000,
  glb_url: `http://catalog/models/extra-${id}.glb`,
  ...extra,
})

test('searchPages asks the whole catalog, sends target_size as [w, d, h] and keeps one page without minima', async () => {
  const calls: Array<Record<string, unknown>> = []
  const fetchPage: FetchPage = async (args) => {
    calls.push(args)
    return { results: [art('a', 0.3, 0.4), art('b', 1, 0.7)], candidates: 2, next_offset: null }
  }
  const out = await searchPages(fetchPage, { kind: 'wall_art', targetSize: [1.2, 0.8, 0.04], limit: 8 }, ORIGIN)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.scope, 'all')
  assert.deepEqual(calls[0]!.target_size, [1.2, 0.04, 0.8])
  assert.equal(calls[0]!.limit, 8)
  assert.deepEqual(out.results.map((r) => r.id), ['a', 'b'])
  assert.equal(out.nextOffset, null)
})

test('searchPages with minima reads pages until enough pieces are big enough, and pages on from where it stopped', async () => {
  // 50 items; every fifth is 1 m wide.
  const all = Array.from({ length: 50 }, (_, i) => art(`p${i}`, i % 5 === 0 ? 1 : 0.3, 0.5))
  const fetchPage: FetchPage = async (args) => {
    const offset = args.offset as number
    const limit = args.limit as number
    const page = all.slice(offset, offset + limit)
    return { results: page, candidates: all.length, next_offset: offset + limit < all.length ? offset + limit : null }
  }
  const first = await searchPages(fetchPage, { min_w: 0.8, limit: 3 }, ORIGIN)
  assert.deepEqual(first.results.map((r) => r.id), ['p0', 'p5', 'p10'])
  assert.equal(first.nextOffset, 11)
  assert.match(first.minimumFilter!, /0\.8 m wide/)
  const second = await searchPages(fetchPage, { min_w: 0.8, limit: 3, offset: first.nextOffset! }, ORIGIN)
  assert.deepEqual(second.results.map((r) => r.id), ['p15', 'p20', 'p25'])
})

test('searchPages leaves out items without a model instead of failing the page', async () => {
  const fetchPage: FetchPage = async () => ({
    results: [art('ok', 1, 1), { ...art('none', 1, 1), source: 'extra', glb_url: null }],
    candidates: 2,
    next_offset: null,
  })
  const out = await searchPages(fetchPage, {}, ORIGIN)
  assert.deepEqual(out.results.map((r) => r.id), ['ok'])
})

// ---- place_product mounting, on the Sunday flat ----

const products: Record<string, ProductHit> = Object.fromEntries(
  [
    toProduct(art('big', 1.2, 0.8), ORIGIN),
    toProduct({ id: 'extra:m', name: 'Round brass mirror', kind: 'mirror', source: 'extra', size_m: [0.6, 0.04, 0.6], glb_url: 'http://c/models/extra-m.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'extra:sconce', name: 'Black metal wall sconce', kind: 'lamp', placement: 'wall', source: 'extra', size_m: [0.2, 0.24, 0.33], glb_url: 'http://c/models/extra-s.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'extra:curtain', name: 'Natural linen wave curtains, 210x260', kind: 'curtain', placement: 'wall', source: 'extra', size_m: [2.1, 0.27, 2.66], glb_url: 'http://c/models/extra-c.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'abo:pendant', name: 'Glass ceiling pendant', kind: 'light', size_m: [0.3, 0.3, 1.05], price: 5 }, ORIGIN),
    toProduct({ id: 'abo:tv', name: '55 inch TV', kind: 'tv', size_m: [1.23, 0.06, 0.71], price: 5 }, ORIGIN),
  ].map((p) => [p.id, p]),
)

const fakeCatalog: Catalog = {
  async search() {
    return { results: Object.values(products), candidates: 0, nextOffset: null }
  },
  async get(id) {
    return products[id] ?? null
  },
}

type Item = {
  type: string
  parentId: string
  position: number[]
  rotation: number[]
  side?: string
  wallId?: string
  wallT?: number
  asset: { attachTo?: string; offset: number[] }
}

async function sundayScene() {
  const dir = mkdtempSync(join(tmpdir(), 'scene-mcp-mount-'))
  const store = await createSceneStore({ PASCAL_DB_PATH: join(dir, 'pascal.db') })
  const graph = JSON.parse(readFileSync(TEMPLATE, 'utf8'))
  const meta = await store.save({ name: 'Sunday', graph })
  // Models as the catalog serves them: generated ones stand on their origin, Amazon's lights hang from it.
  const bounds: Record<string, Bounds> = {
    'abo:pendant': { min: [-0.15, -1.2, -0.15], max: [0.15, 0, 0.15] },
  }
  const modelBounds = async (url: string) => {
    const product = Object.values(products).find((p) => p.glbUrl === url)
    return product ? (bounds[product.id] ?? null) : null
  }
  const { server } = await createSceneServer({ store, sceneId: meta.id, catalog: fakeCatalog, modelBounds })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
  const place = async (args: Record<string, unknown>) => {
    const result = await client.callTool({ name: 'place_product', arguments: args })
    const textOut = (result as { content: Array<{ text: string }> }).content[0]!.text
    if (result.isError) return { error: textOut }
    const payload = JSON.parse(textOut)
    const saved = await store.load(meta.id)
    return { payload, item: saved!.graph.nodes[payload.itemId] as unknown as Item }
  }
  return { place }
}

test('art hangs on the wall face toward the room: wall child, wall-side, model back on the face', async () => {
  const { place } = await sundayScene()
  // wall_w-top runs +x at z = -9.768, 0.383 thick; the living room is on its front (+z) side.
  const { payload, item } = (await place({ product_id: 'big', wall_id: 'wall_w-top', along: 2.2, height: 1.1 })) as { payload: any; item: Item }
  assert.equal(item.parentId, 'wall_w-top')
  assert.equal(item.wallId, 'wall_w-top')
  assert.equal(item.asset.attachTo, 'wall-side')
  assert.equal(item.side, 'front')
  assert.deepEqual(item.rotation, [0, 0, 0])
  assert.deepEqual(item.position, [2.2, 1.1, 0.192])
  assert.deepEqual(item.asset.offset, [0, 0, 0.015])
  assert.ok(Math.abs(item.wallT! - 2.2 / 4.4543) < 1e-3)
  assert.equal(payload.mount, 'wall')
  assert.deepEqual(payload.wall, { id: 'wall_w-top', side: 'front', along: 2.2, bottom: 1.1, top: 1.9, facing: [0, 1] })
  assert.deepEqual(payload.center, [-3.36, 1.5, -9.562])
})

test('a point by the wall snaps to it; a wall the room is behind takes the back face, turned round', async () => {
  const { place } = await sundayScene()
  // wall_w-west runs +z at x = -5.56; its front faces -x (outside), the living room is behind it.
  const { payload, item } = (await place({ product_id: 'extra:m', target_id: 'zone_r-living', position: [-5.2, 1.2, -6] })) as { payload: any; item: Item }
  assert.equal(item.parentId, 'wall_w-west')
  assert.equal(item.side, 'back')
  assert.deepEqual(item.rotation, [0, Math.PI, 0])
  assert.equal(item.position[1], 1.2)
  assert.ok(Math.abs(item.position[0] - (-6 - -9.7681)) < 1e-3)
  assert.ok(item.position[2] < 0)
  assert.deepEqual(payload.wall.facing, [1, 0])
})

test('a wall lamp without a height goes near 1.6 m; art over a window says so', async () => {
  const { place } = await sundayScene()
  const lamp = (await place({ product_id: 'extra:sconce', wall_id: 'wall_w-west', target_id: 'zone_r-living', along: 3 })) as { payload: any }
  assert.equal(lamp.payload.wall.bottom, 1.435)
  assert.equal(lamp.payload.notes, undefined)
  // win-living-1 is centred 1.239 m along wall_w-top, 0.9-2.3 m up.
  const over = (await place({ product_id: 'big', wall_id: 'wall_w-top', along: 1.24, height: 1.2 })) as { payload: any }
  assert.ok(over.payload.notes.some((n: string) => n.includes('covers window window_win-living-1')), JSON.stringify(over.payload.notes))
})

test('curtains hang over their window: centred on it, from above it to the floor', async () => {
  const { place } = await sundayScene()
  const { payload, item } = (await place({ product_id: 'extra:curtain', window_id: 'window_win-living-1' })) as { payload: any; item: Item }
  assert.equal(item.parentId, 'wall_w-top')
  assert.equal(item.side, 'front')
  assert.equal(payload.wall.along, 1.239)
  assert.equal(payload.wall.bottom, 0.01)
  assert.ok(payload.wall.top <= 2.7)
  // 2.1 m of curtain on a 0.7 m window is wide enough; it runs over the balcony door beside the window, which is worth a word.
  assert.deepEqual(payload.notes.length, 1)
  assert.match(payload.notes[0], /covers door door_d-living-bal4/)
})

test('a pendant hangs from the room ceiling, top at the ceiling, by its model\'s real drop', async () => {
  const { place } = await sundayScene()
  const { payload, item } = (await place({ product_id: 'abo:pendant', target_id: 'zone_r-living', position: [-3, 0, -5] })) as { payload: any; item: Item }
  assert.equal(item.parentId, 'ceiling_r-living')
  assert.equal(item.asset.attachTo, 'ceiling')
  // The model hangs from its origin (y -1.2..0): lifted by 1.2 so it spans 0..1.2, then hung 1.2 below the ceiling.
  assert.deepEqual(item.asset.offset, [0, 1.2, 0])
  assert.deepEqual(item.position, [-3, -1.2, -5])
  assert.equal(payload.mount, 'ceiling')
  assert.ok(payload.ceiling.height > 2.3 && payload.ceiling.height < 2.8, String(payload.ceiling.height))
  assert.ok(Math.abs(payload.bottom - (payload.ceiling.height - 1.2)) < 1e-3)
})

test('gltfBounds reads the box from accessor min/max under node transforms', () => {
  const box = gltfBounds({
    scenes: [{ nodes: [0] }],
    nodes: [
      { translation: [0, 2, 0], children: [1] },
      // Quarter turn about y: x -> -z.
      { mesh: 0, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: [2, 1, 1] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ min: [0, -1, -0.5], max: [1, 0, 0.5] }],
  })!
  const r = (v: number[]) => v.map((x) => Math.round(x * 1000) / 1000 || 0)
  assert.deepEqual(r(box.min), [-0.5, 1, -2])
  assert.deepEqual(r(box.max), [0.5, 2, 0])
})

test('mount overrides the product: a TV on the wall; floor pieces still need a floor target', async () => {
  const { place } = await sundayScene()
  const tv = (await place({ product_id: 'abo:tv', mount: 'wall', wall_id: 'wall_w-west', target_id: 'zone_r-living', along: 4 })) as { item: Item }
  assert.equal(tv.item.asset.attachTo, 'wall-side')
  const floor = await place({ product_id: 'abo:tv', target_id: 'wall_w-west', position: [0, 0, 0] })
  assert.match((floor as { error: string }).error, /bad_target/)
})

test('a partition with rooms on both sides needs the room', async () => {
  const { place } = await sundayScene()
  const out = await place({ product_id: 'big', wall_id: 'wall_w-hall-south', along: 1, height: 1.2 })
  assert.match((out as { error: string }).error, /ambiguous_side/)
  const ok = (await place({ product_id: 'big', wall_id: 'wall_w-hall-south', target_id: 'zone_r-entrance', along: 1, height: 1.2 })) as { item: Item }
  assert.equal(ok.item.parentId, 'wall_w-hall-south')
})
