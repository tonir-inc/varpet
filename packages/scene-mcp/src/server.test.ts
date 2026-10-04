import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { Catalog, ProductHit } from './catalog.ts'
import { toProduct } from './catalog.ts'
import { createSceneServer, HIDDEN_TOOLS } from './server.ts'

const bed = toProduct(
  {
    id: 'abo:B07K7NXVXR',
    source_id: 'B07K7NXVXR',
    name: 'Hayes Double Bed',
    kind: 'bed',
    brand: 'Alkove',
    size_m: [1.4719, 1.9919, 0.9398],
    size_status: 'confirmed',
    price: 213000,
    main_image_url: 'https://example.com/bed.jpg',
  },
  'https://varpet.example',
)

const fakeCatalog: Catalog = {
  async search() {
    return { results: [bed], candidates: 1, nextOffset: null }
  },
  async get(id) {
    return id === bed.id ? (bed as ProductHit) : null
  },
}

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'scene-mcp-'))
  const store = await createSceneStore({ PASCAL_DB_PATH: join(dir, 'pascal.db') })
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const graph = bridge.exportJSON()
  const meta = await store.save({ name: 'Test flat', graph })
  const levelId = Object.values(graph.nodes).find((node) => (node as { type: string }).type === 'level')!.id as string
  const { server } = await createSceneServer({ store, sceneId: meta.id, catalog: fakeCatalog })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
  return { store, client, sceneId: meta.id, levelId, version: meta.version }
}

const json = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text)

test('lists product tools, hides scene-switching tools, keeps Pascal tools', async () => {
  const { client } = await setup()
  const names = (await client.listTools()).tools.map((tool) => tool.name)
  for (const name of ['search_products', 'get_product', 'place_product', 'list_finishes', 'set_wall_finish', 'set_floor_finish', 'get_scene', 'create_room', 'check_collisions', 'check_clearances']) {
    assert.ok(names.includes(name), name)
  }
  for (const name of HIDDEN_TOOLS) assert.ok(!names.includes(name), name)
})

test('place_product writes a real item node into the bound scene and publishes an event', async () => {
  const { store, client, sceneId, levelId, version } = await setup()
  const result = await client.callTool({
    name: 'place_product',
    arguments: { product_id: bed.id, target_id: levelId, position: [1, 0, 2], rotation: Math.PI / 2 },
  })
  assert.ok(!result.isError, JSON.stringify(result))
  const payload = json(result)
  assert.equal(payload.productId, bed.id)
  assert.deepEqual(payload.footprint, { x: 1.992, z: 1.472, center: [1, 2] })

  const saved = await store.load(sceneId)
  assert.ok(saved && saved.version > version)
  const item = saved!.graph.nodes[payload.itemId] as unknown as {
    type: string
    parentId: string
    position: number[]
    asset: { src: string; dimensions: number[] }
    metadata: Record<string, unknown>
  }
  assert.equal(item.type, 'item')
  assert.equal(item.parentId, levelId)
  assert.deepEqual(item.position, [1, 0, 2])
  assert.equal(item.asset.src, 'https://varpet.example/api/catalog/models/B07K7NXVXR.glb')
  assert.deepEqual(item.asset.dimensions, [1.472, 0.94, 1.992])
  assert.deepEqual(item.metadata, { productId: bed.id, priceAmd: 213000, shop: 'Alkove' })

  const events = await store.listSceneEvents!(sceneId)
  assert.equal(events.at(-1)?.kind, 'place_product')
  assert.ok(events.at(-1)!.graph.nodes[payload.itemId])
})

test('a second placement does not conflict with the first save', async () => {
  const { client, levelId } = await setup()
  for (const x of [1, 3]) {
    const result = await client.callTool({
      name: 'place_product',
      arguments: { product_id: bed.id, target_id: levelId, position: [x, 0, 1] },
    })
    assert.ok(!result.isError, JSON.stringify(result))
  }
})

test('parallel place_product calls all land', async () => {
  const { store, client, sceneId, levelId } = await setup()
  const results = await Promise.all(
    [1, 3, 5, 7].map((x) =>
      client.callTool({ name: 'place_product', arguments: { product_id: bed.id, target_id: levelId, position: [x, 0, 1] } }),
    ),
  )
  for (const result of results) assert.ok(!result.isError, JSON.stringify(result))
  const saved = await store.load(sceneId)
  for (const result of results) assert.ok(saved!.graph.nodes[json(result).itemId], 'saved')
})

test('place_product refuses unknown products and bad targets', async () => {
  const { client, levelId } = await setup()
  const unknown = await client.callTool({
    name: 'place_product',
    arguments: { product_id: 'abo:nope', target_id: levelId, position: [0, 0, 0] },
  })
  assert.ok(unknown.isError)
  const missing = await client.callTool({
    name: 'place_product',
    arguments: { product_id: bed.id, target_id: 'wall_nope', position: [0, 0, 0] },
  })
  assert.ok(missing.isError)
})

test('search_products returns products without model urls', async () => {
  const { client } = await setup()
  const out = json(await client.callTool({ name: 'search_products', arguments: { kind: 'bed' } }))
  assert.equal(out.results[0].id, bed.id)
  assert.deepEqual(out.results[0].dimensions, [1.472, 0.94, 1.992])
  assert.equal(out.results[0].glbUrl, undefined)
})

test('no tool schema uses tuples (prefixItems): Claude Code silently drops such tools', async () => {
  const { client } = await setup()
  for (const tool of (await client.listTools()).tools) {
    assert.ok(!JSON.stringify(tool.inputSchema).includes('prefixItems'), tool.name)
  }
})

test('saving does not rewrite what the agent built: wall sides stay as Pascal left them', async () => {
  const { store, client, sceneId, levelId } = await setup()
  const room = await client.callTool({
    name: 'create_room',
    arguments: { levelId, name: 'Bedroom', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] },
  })
  assert.ok(!room.isError, JSON.stringify(room))
  const saved = (await store.load(sceneId))!
  const live = json(await client.callTool({ name: 'get_node', arguments: { id: json(room).wallIds[0] } }))
  const stored = saved.graph.nodes[json(room).wallIds[0]] as unknown as { frontSide?: string; backSide?: string }
  assert.equal(stored.frontSide, live.node.frontSide)
  assert.equal(stored.backSide, live.node.backSide)
})
