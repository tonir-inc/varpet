import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { getMaterialPresetByRef, MATERIAL_CATALOG } from '@pascal-app/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { FINISHES, getFinish, suggestFinishes } from '../../contracts/src/finishes.ts'
import type { Catalog } from './catalog.ts'
import { createSceneServer } from './server.ts'
import { facesToward, slotForFace } from './wall-sides.ts'

const noCatalog: Catalog = {
  async search() {
    return { results: [], candidates: 0, nextOffset: null }
  },
  async get() {
    return null
  },
}

// Pascal keeps one global scene per process and loadDefault keeps what is there, so take the empty default once.
const EMPTY = (() => {
  const bridge = new SceneBridge()
  bridge.loadDefault()
  return bridge.exportJSON()
})()

type Node = { id: string; type: string; slots?: Record<string, string>; frontSide?: string; backSide?: string; name?: string }

/** A level with two rooms side by side (bedroom x 0..4, living x 4..9, z 0..3) built with Pascal's create_room. */
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'scene-mcp-finish-'))
  const store = await createSceneStore({ PASCAL_DB_PATH: join(dir, 'pascal.db') })
  const graph = EMPTY
  const meta = await store.save({ name: 'Finish flat', graph })
  const levelId = Object.values(graph.nodes).find((node) => (node as { type: string }).type === 'level')!.id as string
  const { server } = await createSceneServer({ store, sceneId: meta.id, catalog: noCatalog, publicOrigin: 'https://varpet.example' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args })
  const bedroom = json(await call('create_room', { levelId, name: 'Bedroom', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }))
  const living = json(await call('create_room', { levelId, name: 'Living room', polygon: [[4, 0], [9, 0], [9, 3], [4, 3]] }))
  const nodes = async () => (await store.load(meta.id))!.graph.nodes as unknown as Record<string, Node>
  return { store, call, sceneId: meta.id, bedroom, living, nodes }
}

const json = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text)
const message = (result: unknown) => (result as { content: Array<{ text: string }> }).content[0]!.text

test('every Pascal finish in the catalogue exists in Pascal 1.0.3; ids are unique', () => {
  const pascal = new Set(MATERIAL_CATALOG.map((item) => item.id))
  for (const finish of FINISHES.filter((f) => f.source === 'pascal')) assert.ok(pascal.has(finish.id), finish.id)
  assert.equal(new Set(FINISHES.map((f) => f.id)).size, FINISHES.length)
  assert.equal(getFinish('library:varpet-oak')?.id, 'varpet-oak')
  assert.equal(suggestFinishes('herringbone oak', 'floor')[0]?.id, 'wood-hungarianparquet10')
  assert.ok(suggestFinishes('deep green', 'wall').some((f) => f.id === 'varpet-paint-emerald'))
})

test('the scene server registers varpet finishes with Pascal, so they resolve outside the browser', async () => {
  await setup()
  const oak = getMaterialPresetByRef('library:varpet-oak')
  assert.equal(oak?.maps?.albedoMap, 'https://varpet.example/finishes/oak/basecolor.jpg')
  assert.equal(getMaterialPresetByRef('library:varpet-paint-emerald')?.mapProperties?.color, '#1f6b50')
})

test('list_finishes filters by surface and family and ranks a query', async () => {
  const { call } = await setup()
  const paints = json(await call('list_finishes', { surface: 'wall', family: 'paint' }))
  assert.ok(paints.count > 40)
  assert.ok(paints.finishes.every((f: { family: string }) => f.family === 'paint'))
  const floors = json(await call('list_finishes', { surface: 'floor', query: 'herringbone oak' }))
  assert.equal(floors.finishes[0].id, 'wood-hungarianparquet10')
})

test('set_wall_finish paints the room side of every wall around a zone and publishes it', async () => {
  const { store, call, sceneId, bedroom, living, nodes } = await setup()
  const before = await nodes()
  const isEast = (id: string) => (before[id] as unknown as { start: number[] }).start[0] === 4
  const result = await call('set_wall_finish', { zone_id: living.zoneId, finish_id: 'varpet-paint-emerald' })
  assert.ok(!result.isError, message(result))
  const out = json(result)
  // Its own four walls, plus the bedroom's east wall, which create_room drew on the same line.
  const ids = (out.walls as Array<{ id: string }>).map(({ id }) => id)
  for (const id of living.wallIds as string[]) assert.ok(ids.includes(id), id)
  assert.ok(!ids.some((id) => (bedroom.wallIds as string[]).includes(id) && !isEast(id)))
  const saved = await nodes()
  for (const { id, slots } of out.walls as Array<{ id: string; slots: string[] }>) {
    const wall = saved[id]!
    assert.equal(slots.length, 1)
    assert.equal(wall.slots?.[slots[0]!], 'library:varpet-paint-emerald', id)
  }
  const events = await store.listSceneEvents!(sceneId)
  assert.equal(events.at(-1)?.kind, 'set_wall_finish')
})

test('set_wall_finish picks the face toward the named room on a wall between two rooms', async () => {
  const { call, bedroom, living, nodes } = await setup()
  const before = await nodes()
  // The living room's west wall at x = 4 is the one between the rooms.
  const between = (living.wallIds as string[]).find((id) => {
    const wall = before[id] as unknown as { start: number[]; end: number[] }
    return wall.start[0] === 4 && wall.end[0] === 4
  })!
  const toLiving = json(await call('set_wall_finish', { wall_ids: [between], zone_id: living.zoneId, finish_id: 'preset-plum' }))
  const toBedroom = json(await call('set_wall_finish', { wall_ids: [between], zone_id: bedroom.zoneId, finish_id: 'preset-sage' }))
  assert.notDeepEqual(toLiving.walls[0].slots, toBedroom.walls[0].slots)
  const wall = (await nodes())[between]!
  assert.equal(wall.slots?.[toLiving.walls[0].slots[0]], 'library:preset-plum')
  assert.equal(wall.slots?.[toBedroom.walls[0].slots[0]], 'library:preset-sage')
})

test('set_wall_finish refuses unknown finishes with close matches, and ambiguous sides without a room', async () => {
  const { call, living } = await setup()
  const unknown = await call('set_wall_finish', { zone_id: living.zoneId, finish_id: 'preset-emerald' })
  assert.ok(unknown.isError)
  assert.match(message(unknown), /unknown_finish: preset-emerald\. Closest: .*varpet-paint-emerald/)
  const noTarget = await call('set_wall_finish', { finish_id: 'preset-plum' })
  assert.ok(noTarget.isError)
  const between = await call('set_wall_finish', { wall_ids: [living.wallIds[3]], finish_id: 'preset-plum' })
  assert.ok(between.isError, message(between))
  assert.match(message(between), /ambiguous_side/)
})

test('set_floor_finish writes the slab surface under a zone; unknown ids fail with suggestions', async () => {
  const { call, living, nodes } = await setup()
  const result = await call('set_floor_finish', { zone_id: living.zoneId, finish_id: 'wood-hungarianparquet10' })
  assert.ok(!result.isError, message(result))
  assert.equal(json(result).slab.id, living.slabId)
  assert.equal((await nodes())[living.slabId]!.slots?.surface, 'library:wood-hungarianparquet10')
  const bad = await call('set_floor_finish', { slab_id: living.slabId, finish_id: 'herringbone' })
  assert.ok(bad.isError)
  assert.match(message(bad), /wood-hungarianparquet10/)
})

test('slot per face follows the side tags, else front is interior and back exterior', () => {
  const wall = { id: 'w', type: 'wall', start: [0, 0], end: [4, 0], thickness: 0.1 }
  assert.equal(slotForFace({ ...wall, frontSide: 'unknown', backSide: 'unknown' }, 'back'), 'exterior')
  assert.equal(slotForFace({ ...wall, frontSide: 'exterior', backSide: 'interior' }, 'back'), 'interior')
  assert.deepEqual(facesToward(wall, [[0, 0], [4, 0], [4, 3], [0, 3]]), ['front'])
})
