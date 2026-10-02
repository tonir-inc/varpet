import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { RenderRequest, RenderResponse } from '../../contracts/src/index.ts'
import { toProduct, type Catalog, type ProductHit } from './catalog.ts'
import { createSceneServer } from './server.ts'
import { planView, type Renderer } from './view-scene.ts'

type Point = [number, number]
const TEMPLATE = join(import.meta.dirname, '../../../apps/web/lib/flats/templates/sunday-b12121.json')
const sunday = () => JSON.parse(readFileSync(TEMPLATE, 'utf8')) as { nodes: Record<string, { id: string; type: string; polygon?: Point[]; [key: string]: unknown }> }
const size = { width: 1024, height: 768 }

function inside([x, y]: Point, polygon: Point[]) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

test('top: straight down over the room, north up, walls standing, ceilings off, the floor range in the caption', () => {
  const plan = planView(sunday(), { zoneId: 'zone_r-living', view: 'top', ...size })
  const { camera } = plan.request
  // Living room bounds: x -5.41..-0.90, z -9.58..-1.35.
  assert.deepEqual(camera.target.map((v) => Math.round(v * 100) / 100), [-3.15, 0, -5.46])
  assert.equal(camera.position[0], camera.target[0])
  assert.equal(camera.position[2], camera.target[2])
  assert.ok(camera.position[1] > 20)
  assert.deepEqual(camera.up, [0, 0, -1])
  assert.equal(plan.request.wallMode, 'up')
  assert.equal(plan.request.hideCeilings, true)
  assert.equal(plan.room, 'Living room (zone_r-living)')
  assert.match(plan.description, /North \(-z\) is up: x runs -?\d.* \(left\) to .* \(right\), z runs -10 \(top\) to -0.9 \(bottom\)/)
})

test('3d: from above and outside the room on the diagonal pointing away from the flat, walls cut away', () => {
  const plan = planView(sunday(), { zoneId: 'zone_r-living', view: '3d', ...size })
  const { position, target } = plan.request.camera
  assert.equal(plan.request.wallMode, 'cutaway')
  // The living room sits at low x, low z of the flat: the camera comes from there (north-west, -x -z).
  assert.ok(position[0] < -5.41 && position[2] < -9.58, `${position}`)
  assert.ok(position[1] > 4)
  assert.ok(Math.abs(position[0] - target[0] - (position[2] - target[2])) < 1e-9, 'on the diagonal')
  assert.match(plan.description, /from the north-west/)
})

test('inside: eye level inside the room, from an indoor door when there is one', () => {
  const graph = sunday()
  for (const zoneId of ['zone_r-bedroom-6', 'zone_r-living', 'zone_r-kitchen']) {
    const plan = planView(graph, { zoneId, view: 'inside', ...size })
    const { position, target } = plan.request.camera
    const polygon = graph.nodes[zoneId]!.polygon!
    assert.equal(position[1], 1.6)
    assert.ok(inside([position[0], position[2]], polygon), `${zoneId}: eye ${position} is in the room`)
    assert.ok(Math.hypot(target[0] - position[0], target[2] - position[2]) > 1, 'looks across the room')
    assert.equal(plan.request.wallMode, 'up')
  }
  // The bedroom has a door from the entrance hall; the living room only opens to its balcony through a door.
  assert.match(planView(graph, { zoneId: 'zone_r-bedroom-6', view: 'inside', ...size }).description, /from the door from (?!balcony)/)
  assert.match(planView(graph, { zoneId: 'zone_r-living', view: 'inside', ...size }).description, /from the door from balcony/)
})

test('a room without doors is seen from its best corner', () => {
  const graph = sunday()
  for (const [id, node] of Object.entries(graph.nodes)) if (node.type === 'door') delete graph.nodes[id]
  const plan = planView(graph, { zoneId: 'zone_r-bedroom-9', view: 'inside', ...size })
  assert.match(plan.description, /from a corner/)
  assert.ok(inside([plan.request.camera.position[0], plan.request.camera.position[2]], graph.nodes['zone_r-bedroom-9']!.polygon!))
})

test('without a zone the whole flat is framed; inside needs a zone; unknown zones fail', () => {
  const whole = planView(sunday(), { view: 'top', ...size })
  assert.equal(whole.room, 'Whole flat')
  assert.throws(() => planView(sunday(), { view: 'inside', ...size }), /inside_needs_zone/)
  assert.throws(() => planView(sunday(), { zoneId: 'zone_nope', view: '3d', ...size }), /zone_not_found: zone_nope/)
  assert.throws(() => planView(sunday(), { zoneId: 'wall_w-top', view: '3d', ...size }), /not_a_zone/)
})

// ---------------------------------------------------------------------------------------------------------------
// The tool, with a fake renderer

const sofa = toProduct(
  { id: 'abo:SOFA1', source_id: 'SOFA1', name: 'Test Sofa', kind: 'sofa', size_m: [2.1, 0.9, 0.85], size_status: 'confirmed', price: 300000 },
  'https://varpet.example',
)
const catalog: Catalog = {
  async search() {
    return { results: [sofa], candidates: 1, nextOffset: null }
  },
  async get(id) {
    return id === sofa.id ? (sofa as ProductHit) : null
  },
}

async function setup(render?: Renderer) {
  const dir = mkdtempSync(join(tmpdir(), 'view-scene-'))
  const store = await createSceneStore({ PASCAL_DB_PATH: join(dir, 'pascal.db') })
  const meta = await store.save({ name: 'Sunday', graph: sunday() as never })
  const { server } = await createSceneServer({ store, sceneId: meta.id, catalog, render })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
  return client
}

const fakeImage = Buffer.from('fake jpeg').toString('base64')

test('view_scene renders the current work scene, edits of this turn included, and returns an image and a caption', async () => {
  const requests: RenderRequest[] = []
  const client = await setup(async (request) => {
    requests.push(request)
    return { image: fakeImage, mimeType: 'image/jpeg', backend: 'webgpu', width: request.width, height: request.height, renderMs: 1234, queuedMs: 0, cold: false } satisfies RenderResponse
  })
  const placed = await client.callTool({
    name: 'place_product',
    arguments: { product_id: sofa.id, target_id: 'zone_r-living', position: [-3, 0, -5] },
  })
  assert.ok(!placed.isError, JSON.stringify(placed))
  const itemId = JSON.parse((placed.content as Array<{ text: string }>)[0]!.text).itemId as string

  const result = await client.callTool({ name: 'view_scene', arguments: { zone_id: 'zone_r-living', view: 'top' } })
  assert.ok(!result.isError, JSON.stringify(result))
  const [image, caption] = result.content as Array<{ type: string; data?: string; mimeType?: string; text?: string }>
  assert.deepEqual(image, { type: 'image', data: fakeImage, mimeType: 'image/jpeg' })
  assert.equal(caption!.type, 'text')
  assert.match(caption!.text!, /^Living room \(zone_r-living\): top view .* Rendered with WebGPU at 1024x768 in 1.2 s\.$/)

  assert.equal(requests.length, 1)
  const graph = requests[0]!.graph as { nodes: Record<string, { type: string; asset?: { src: string } }> }
  assert.equal(graph.nodes[itemId]?.type, 'item', 'the sofa placed this turn is in the rendered graph')
  assert.equal(requests[0]!.wallMode, 'up')
  assert.deepEqual([requests[0]!.width, requests[0]!.height], [1024, 768])
})

test('view_scene defaults to 3d, and a renderer failure is an error text, not a thrown call', async () => {
  const seen: string[] = []
  const client = await setup(async (request) => {
    seen.push(request.wallMode)
    throw new Error('render_timeout: no image after 60 s')
  })
  const result = await client.callTool({ name: 'view_scene', arguments: { zone_id: 'zone_r-living' } })
  assert.equal(result.isError, true)
  assert.match((result.content as Array<{ text: string }>)[0]!.text, /^render_timeout: no image after 60 s\. Carry on without the picture\.$/)
  assert.deepEqual(seen, ['cutaway'])

  const bad = await client.callTool({ name: 'view_scene', arguments: { view: 'inside' } })
  assert.equal(bad.isError, true)
  assert.match((bad.content as Array<{ text: string }>)[0]!.text, /inside_needs_zone/)
})

test('without a renderer the tool is not offered', async () => {
  const names = (await (await setup()).listTools()).tools.map((tool) => tool.name)
  assert.ok(!names.includes('view_scene'))
  const withEyes = (await (await setup(async () => { throw new Error('unused') })).listTools()).tools.map((t) => t.name)
  assert.ok(withEyes.includes('view_scene'))
})
