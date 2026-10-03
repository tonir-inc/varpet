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
import { gltfBounds, hangAt, normalizeHang, type Bounds } from './model-bounds.ts'
import { createSceneServer } from './server.ts'
import type { HeightMap } from './surface.ts'

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

// A generated light's hang contract (catalog/blender/lights in varpet-v2-lights): canopy, cord and body nodes.
const CONE_HANG = { adjustable: true, cord_node: 'cord', body_node: 'body', canopy_m: 0.025, cord_m: 0.755, body_m: 0.2226, drop_m: 1.0026, cord_min_m: 0.1, cord_max_m: 2.0 }

const products: Record<string, ProductHit> = Object.fromEntries(
  [
    toProduct(art('big', 1.2, 0.8), ORIGIN),
    toProduct({ id: 'extra:m', name: 'Round brass mirror', kind: 'mirror', source: 'extra', size_m: [0.6, 0.04, 0.6], glb_url: 'http://c/models/extra-m.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'extra:sconce', name: 'Black metal wall sconce', kind: 'lamp', placement: 'wall', source: 'extra', size_m: [0.2, 0.24, 0.33], glb_url: 'http://c/models/extra-s.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'extra:curtain', name: 'Natural linen wave curtains, 210x260', kind: 'curtain', placement: 'wall', source: 'extra', size_m: [2.1, 0.27, 2.66], glb_url: 'http://c/models/extra-c.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'abo:pendant', name: 'Glass ceiling pendant', kind: 'light', size_m: [0.3, 0.3, 1.05], price: 5 }, ORIGIN),
    toProduct({ id: 'abo:tv', name: '55 inch TV', kind: 'tv', size_m: [1.23, 0.06, 0.71], price: 5 }, ORIGIN),
    toProduct({ id: 'extra:bed', name: 'Oak bed 160x200 with tall headboard', kind: 'bed', source: 'extra', size_m: [1.7, 2.1, 1.1], glb_url: 'http://c/models/extra-bed.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'extra:sofa', name: 'Three seat sofa', kind: 'sofa', source: 'extra', size_m: [2.1, 0.9, 0.85], glb_url: 'http://c/models/extra-sofa.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'extra:bedding', name: 'Bedding set for a 160x200 queen bed: sage linen duvet', kind: 'throw_blanket', placement: 'surface', source: 'extra', size_m: [1.7, 2.03, 0.66], glb_url: 'http://c/models/extra-bedding.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'extra:cushions', name: 'Throw pillows, set of 2', kind: 'cushion', placement: 'floor', source: 'extra', size_m: [0.94, 0.45, 0.45], glb_url: 'http://c/models/extra-cushions.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'extra:table', name: 'Oak dining table 140x80', kind: 'table', source: 'extra', size_m: [1.4, 0.8, 0.75], glb_url: 'http://c/models/extra-t.glb', price: 5 }, ORIGIN),
    toProduct({ id: 'extra:cone', name: 'Pendant light, black metal cone 45 cm', kind: 'light', placement: 'ceiling', source: 'extra', size_m: [0.452, 0.452, 1.0026], glb_url: 'http://c/models/extra-cone.glb', price: 5, raw: { hang: CONE_HANG } }, ORIGIN),
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
  asset: { attachTo?: string; offset: number[]; dimensions: number[]; nodeTransforms?: Record<string, { position?: number[]; scale?: number[] }> }
}

async function sundayScene() {
  const dir = mkdtempSync(join(tmpdir(), 'scene-mcp-mount-'))
  const store = await createSceneStore({ PASCAL_DB_PATH: join(dir, 'pascal.db') })
  const graph = JSON.parse(readFileSync(TEMPLATE, 'utf8'))
  const meta = await store.save({ name: 'Sunday', graph })
  // Models as the catalog serves them: generated ones stand on their origin, Amazon's lights hang from it.
  const bounds: Record<string, Bounds> = {
    'abo:pendant': { min: [-0.15, -1.2, -0.15], max: [0.15, 0, 0.15] },
    'extra:cone': { min: [-0.226, -1.0026, -0.226], max: [0.226, 0, 0.226], hang: normalizeHang(CONE_HANG)! },
  }
  const modelBounds = async (url: string) => {
    const product = Object.values(products).find((p) => p.glbUrl === url)
    return product ? (bounds[product.id] ?? null) : null
  }
  // Host models as height maps: a bed whose headboard (local z < -0.95) stands 1.1 m and whose mattress top is 0.52;
  // a sofa whose back (local z < -0.25) is 0.85 and whose seat is 0.44. 5 cm cells over the model's box.
  const heightMap = ([w, d]: [number, number], at: (x: number, z: number) => number): HeightMap => {
    const cell = 0.05
    const nx = Math.ceil(w / cell)
    const nz = Math.ceil(d / cell)
    const top = new Float32Array(nx * nz)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) top[j * nx + i] = at(-w / 2 + (i + 0.5) * cell, -d / 2 + (j + 0.5) * cell)
    return { x0: -w / 2, z0: -d / 2, cell, nx, nz, top }
  }
  const heights: Record<string, HeightMap> = {
    'extra:bed': heightMap([1.7, 2.1], (_x, z) => (z < -0.95 ? 1.1 : 0.52)),
    'extra:sofa': heightMap([2.1, 0.9], (_x, z) => (z < -0.25 ? 0.85 : 0.44)),
  }
  const modelHeights = async (url: string) => {
    const product = Object.values(products).find((p) => p.glbUrl === url)
    return product ? (heights[product.id] ?? null) : null
  }
  const { server } = await createSceneServer({ store, sceneId: meta.id, catalog: fakeCatalog, modelBounds, modelHeights })
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
  const call = async (name: string, args: Record<string, unknown>) =>
    JSON.parse((await client.callTool({ name, arguments: args }) as { content: Array<{ text: string }> }).content[0]!.text)
  return { place, call }
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

test('a pendant with a separate cord hangs its bottom at the asked drop above the table under it', async () => {
  const { place } = await sundayScene()
  await place({ product_id: 'extra:table', target_id: 'zone_r-living', position: [-3, 0, -5] })
  const { payload, item } = (await place({ product_id: 'extra:cone', target_id: 'zone_r-living', position: [-3, 0, -5], drop: 0.75 })) as { payload: any; item: Item }
  assert.equal(payload.aboveTable.top, 0.75)
  assert.equal(payload.bottom, 1.5)
  assert.equal(payload.aboveTable.gap, 0.75)
  assert.equal(payload.hang.met, true)
  assert.equal(payload.hang.adjustable, true)
  const height = payload.ceiling.height - 1.5
  // The node overrides of the contract: cord stretched, body moved to the cord's end; the item spans the new drop.
  const cord = height - 0.025 - 0.2226
  assert.ok(Math.abs(item.asset.nodeTransforms!.cord!.scale![1]! - cord / 0.755) < 1e-3)
  assert.ok(Math.abs(item.asset.nodeTransforms!.body!.position![1]! + 0.025 + cord) < 1e-3)
  assert.ok(Math.abs(item.asset.dimensions[1]! - height) < 1e-3)
  assert.ok(Math.abs(item.position[1]! + height) < 1e-3)
  assert.ok(Math.abs(item.asset.offset[1]! - height) < 1e-3)
})

test('a fixed-drop pendant says what drop the ask needed; drop_above floor works without a table', async () => {
  const { place } = await sundayScene()
  await place({ product_id: 'extra:table', target_id: 'zone_r-living', position: [-3, 0, -5] })
  const fixed = (await place({ product_id: 'abo:pendant', target_id: 'zone_r-living', position: [-3, 0, -5], drop: 0.75 })) as { payload: any; item: Item }
  assert.equal(fixed.payload.hang.adjustable, false)
  assert.equal(fixed.payload.hang.met, false)
  assert.ok(Math.abs(fixed.payload.hang.neededDrop - (fixed.payload.ceiling.height - 1.5)) < 1e-3)
  assert.match(fixed.payload.hang.note, /fixed at 1.2 m/)
  assert.equal(fixed.item.asset.nodeTransforms, undefined)
  const walkway = (await place({ product_id: 'extra:cone', target_id: 'zone_r-living', position: [-4, 0, -7], drop: 2.1 })) as { payload: any }
  assert.equal(walkway.payload.aboveTable, undefined)
  assert.equal(walkway.payload.bottom, 2.1)
  const noTable = await place({ product_id: 'extra:cone', target_id: 'zone_r-living', position: [-4, 0, -7], drop: 0.7, drop_above: 'table' })
  assert.match((noTable as { error: string }).error, /no_table_under/)
})

test('search and get show a ceiling piece\'s drop from its model: fixed, or the adjustable range', async () => {
  const { call } = await sundayScene()
  const found = await call('search_products', { kind: 'light' })
  const byId = Object.fromEntries(found.results.map((r: any) => [r.id, r]))
  assert.equal(byId['abo:pendant'].drop, 1.2)
  assert.deepEqual(byId['extra:cone'].drop, { min: 0.348, max: 2.248 })
  assert.equal(byId['abo:tv'].drop, undefined)
  assert.equal(byId['extra:cone'].hang, undefined)
  assert.equal((await call('get_product', { product_id: 'abo:pendant' })).drop, 1.2)
})

test('hangAt clamps the cord to its range', () => {
  const hang = normalizeHang(CONE_HANG)!
  const short = hangAt(hang, 0.1)
  assert.equal(short.clamped, true)
  assert.equal(short.cord, 0.1)
  assert.equal(short.drop, 0.3476)
  assert.deepEqual(hangAt(hang, 1).nodeTransforms.body, { position: [0, -0.7774, 0] })
})

test('gltfBounds reads the hang contract from the root extras, and drops it when the cord node is missing', () => {
  const extras = { varpet_hang: JSON.stringify(CONE_HANG) }
  const gltf = (names: string[]) => ({
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'pendant', extras, children: names.map((_, i) => i + 1) },
      ...names.map((name) => ({ name, mesh: 0, ...(name === 'body' ? { translation: [0, -0.78, 0] } : {}) })),
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ min: [-0.2, -0.2, -0.2], max: [0.2, 0, 0.2] }],
  })
  assert.equal(gltfBounds(gltf(['canopy', 'cord', 'body']))!.hang!.adjustable, true)
  assert.deepEqual(gltfBounds(gltf(['canopy', 'body']))!.hang, { adjustable: false, drop_m: 1.0026 })
})

test('a bedding set placed over a bed rests on the mattress, not the headboard top', async () => {
  const { place } = await sundayScene()
  const bed = (await place({ product_id: 'extra:bed', target_id: 'zone_r-living', position: [-3, 0, -5] })) as { payload: any }
  const { payload, item } = (await place({ product_id: 'extra:bedding', target_id: 'zone_r-living', position: [-3, 0, -5] })) as { payload: any; item: Item }
  assert.equal(payload.mount, 'surface')
  assert.deepEqual(payload.on, { id: bed.payload.itemId, name: 'Oak bed 160x200 with tall headboard', top: 0.52, from: 'model' })
  assert.deepEqual(item.position, [-3, 0.52, -5])
  // Or name the bed: position and rotation follow it.
  const named = (await place({ product_id: 'extra:bedding', target_id: bed.payload.itemId })) as { payload: any; item: Item }
  assert.equal(named.payload.on.top, 0.52)
  assert.deepEqual(named.item.position, [-3, 0.52, -5])
})

test('cushions tagged floor still dress the sofa: they land on its seat; a given height is kept', async () => {
  const { place } = await sundayScene()
  const sofa = (await place({ product_id: 'extra:sofa', target_id: 'zone_r-living', position: [-3, 0, -5], rotation: Math.PI })) as { payload: any }
  // Turned round, the sofa's back is toward +z; cushions centred 0.1 m in front of its middle sit on the seat.
  const { payload, item } = (await place({ product_id: 'extra:cushions', target_id: 'zone_r-living', position: [-3, 0, -5.1], rotation: Math.PI })) as { payload: any; item: Item }
  assert.equal(payload.mount, 'surface')
  assert.equal(payload.on.id, sofa.payload.itemId)
  assert.equal(item.position[1], 0.44)
  const given = (await place({ product_id: 'extra:cushions', target_id: 'zone_r-living', position: [-3, 0.6, -5.1] })) as { item: Item }
  assert.equal(given.item.position[1], 0.6)
  const floor = (await place({ product_id: 'extra:cushions', target_id: 'zone_r-living', position: [-4.5, 0, -7] })) as { payload: any; item: Item }
  assert.equal(floor.item.position[1], 0)
  assert.match(floor.payload.notes[0], /nothing under/)
  const refused = await place({ product_id: 'extra:sofa', target_id: sofa.payload.itemId })
  assert.match((refused as { error: string }).error, /only a surface piece/)
})
