import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { getMaterialPresetByRef, getWallBandSlotId, getWallFaceBandForHeight, WallNode } from '@pascal-app/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { listFinishes } from '../../contracts/src/finishes.ts'
import type { Catalog } from './catalog.ts'
import { createSceneServer } from './server.ts'
import { faceOfTrimSide, nextTrim, trimProfile, trimSideForFace } from './wall-trim.ts'
import { slotForFace } from './wall-sides.ts'

const noCatalog: Catalog = {
  async search() {
    return { results: [], candidates: 0, nextOffset: null }
  },
  async get() {
    return null
  },
}

const EMPTY = (() => {
  const bridge = new SceneBridge()
  bridge.loadDefault()
  return bridge.exportJSON()
})()

type Wall = {
  id: string
  type: string
  start: [number, number]
  end: [number, number]
  slots?: Record<string, string>
  frontSide?: string
  backSide?: string
  skirting?: { enabled: boolean; sides: string; height: number; profile: string }
  crown?: { enabled: boolean; sides: string }
  chairRail?: { enabled: boolean; sides: string; offsetY?: number; height: number }
  faceBands?: { enabled: boolean; count: number; lowerHeight: number }
}

/** Bedroom x 0..4 and living room x 4..9 (z 0..3), built with Pascal's create_room. */
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'scene-mcp-trim-'))
  const store = await createSceneStore({ PASCAL_DB_PATH: join(dir, 'pascal.db') })
  const graph = EMPTY
  const meta = await store.save({ name: 'Trim flat', graph })
  const levelId = Object.values(graph.nodes).find((node) => (node as { type: string }).type === 'level')!.id as string
  const { server } = await createSceneServer({ store, sceneId: meta.id, catalog: noCatalog, publicOrigin: 'https://varpet.example' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args })
  const bedroom = json(await call('create_room', { levelId, name: 'Bedroom', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }))
  const living = json(await call('create_room', { levelId, name: 'Living room', polygon: [[4, 0], [9, 0], [9, 3], [4, 3]] }))
  const nodes = async () => (await store.load(meta.id))!.graph.nodes as unknown as Record<string, Wall>
  const before = await nodes()
  const between = (living.wallIds as string[]).find((id) => before[id]!.start[0] === 4 && before[id]!.end[0] === 4)!
  const north = (living.wallIds as string[]).find((id) => before[id]!.start[1] === 0 && before[id]!.end[1] === 0)!
  return { store, call, sceneId: meta.id, bedroom, living, nodes, between, north }
}

const json = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text)
const message = (result: unknown) => (result as { content: Array<{ text: string }> }).content[0]!.text

/** The slot Pascal's viewer paints at height y on one face (wall-system getWallFaceMaterialIndex). */
function shownSlot(wall: Wall, face: 'front' | 'back', y: number) {
  const parsed = WallNode.parse(wall)
  const side = slotForFace(wall as never, face)
  if (!parsed.faceBands?.enabled) return side
  return getWallBandSlotId(side, getWallFaceBandForHeight(parsed, y, 2.5))
}

test('a trim side draws on the face Pascal resolves, and each face maps back to one trim side', () => {
  const wall = { id: 'w', type: 'wall', start: [0, 0], end: [4, 0] }
  const tagged = { ...wall, frontSide: 'exterior', backSide: 'interior' }
  assert.equal(faceOfTrimSide(tagged, 'interior'), 'back')
  assert.equal(trimSideForFace(tagged, 'front'), 'exterior')
  // A partition with rooms on both sides: interior draws on the front, exterior reaches the back.
  const partition = { ...wall, frontSide: 'interior', backSide: 'interior' }
  assert.equal(trimSideForFace(partition, 'front'), 'interior')
  assert.equal(trimSideForFace(partition, 'back'), 'exterior')
  // Both faces exterior: Pascal draws both trim sides on the front, the back is out of reach.
  const outside = { ...wall, frontSide: 'exterior', backSide: 'exterior' }
  assert.equal(trimSideForFace(outside, 'back'), null)
  const untagged = { ...wall, frontSide: 'unknown', backSide: 'unknown' }
  assert.equal(trimSideForFace(untagged, 'front'), 'interior')
  assert.equal(trimSideForFace(untagged, 'back'), 'exterior')
})

test('trim configs add and remove faces; profiles accept short names per kind', () => {
  const one = nextTrim('skirting', undefined, ['interior'], { enabled: true })
  assert.deepEqual([one.enabled, one.sides, one.height], [true, 'interior', 0.12])
  const two = nextTrim('skirting', one, ['exterior'], { enabled: true, height: 0.15 })
  assert.deepEqual([two.sides, two.height], ['both', 0.15])
  const back = nextTrim('skirting', two, ['interior'], { enabled: false })
  assert.deepEqual([back.enabled, back.sides], [true, 'exterior'])
  assert.equal(nextTrim('skirting', back, ['exterior'], { enabled: false }).enabled, false)
  assert.equal(trimProfile('skirting', 'ogee'), 'base-ogee')
  assert.equal(trimProfile('crown', 'cove'), 'cove')
  assert.equal(trimProfile('chairRail', 'base-ogee'), null)
})

test('set_wall_trim puts skirting and crown on the room side of every wall around a zone', async () => {
  const { call, bedroom, living, nodes, between } = await setup()
  const result = await call('set_wall_trim', {
    zone_id: living.zoneId,
    skirting: { profile: 'colonial', height: 0.14, finish_id: 'preset-white' },
    crown: { profile: 'crown-cove' },
  })
  assert.ok(!result.isError, message(result))
  const out = json(result)
  const saved = await nodes()
  for (const id of living.wallIds as string[]) {
    const wall = saved[id]!
    assert.equal(wall.skirting?.enabled, true, id)
    assert.equal(wall.skirting?.profile, 'base-colonial')
    assert.equal(wall.skirting?.height, 0.14)
    assert.equal(wall.crown?.enabled, true)
    // The trim side is the one Pascal draws on the face toward the living room, and its slot holds the finish.
    const entry = (out.walls as Array<{ id: string; slots: string[]; skirting: { sides: string } }>).find((w) => w.id === id)!
    assert.equal(entry.skirting.sides, wall.skirting!.sides)
    assert.equal(entry.slots.length, 1)
    assert.equal(wall.slots?.[entry.slots[0]!], 'library:preset-white')
  }
  // The wall between the rooms: trimmed on the living side only, then on both once the bedroom asks for it.
  const living1 = saved[between]!.skirting!.sides
  assert.notEqual(living1, 'both')
  const bed = json(await call('set_wall_trim', { wall_ids: [between], zone_id: bedroom.zoneId, skirting: {} }))
  assert.equal(bed.walls[0].skirting.sides, 'both')
})

test('set_wall_trim refuses unknown profiles and finishes, and an empty request', async () => {
  const { call, living } = await setup()
  const profile = await call('set_wall_trim', { zone_id: living.zoneId, chair_rail: { profile: 'crown-ogee' } })
  assert.ok(profile.isError)
  assert.match(message(profile), /unknown_profile: crown-ogee for chairRail\. One of: .*rail-ogee/)
  const finish = await call('set_wall_trim', { zone_id: living.zoneId, skirting: { finish_id: 'oak skirting' } })
  assert.ok(finish.isError)
  assert.match(message(finish), /unknown_finish/)
  assert.ok((await call('set_wall_trim', { zone_id: living.zoneId })).isError)
})

test('set_wainscot splits the room face; the paint above and the other face keep their look', async () => {
  const { call, living, nodes, between, north } = await setup()
  await call('set_wall_finish', { wall_ids: [between], zone_id: living.zoneId, finish_id: 'preset-sage' })
  await call('set_wall_trim', { zone_id: living.zoneId, chair_rail: { finish_id: 'preset-white' } })
  const result = await call('set_wainscot', { zone_id: living.zoneId, finish_id: 'flooring-ceramic53', height: 1.1 })
  assert.ok(!result.isError, message(result))
  const out = json(result)
  assert.equal(out.walls.find((w: { id: string }) => w.id === between).chairRailAt, 1.073)
  const saved = await nodes()
  const wall = saved[between]!
  assert.deepEqual([wall.faceBands?.enabled, wall.faceBands?.count, wall.faceBands?.lowerHeight], [true, 2, 1.1])
  assert.equal(wall.chairRail?.offsetY, 1.073)
  // Which face looks into the living room: the one whose slot set_wall_finish painted sage.
  const face = (['front', 'back'] as const).find((f) => wall.slots?.[slotForFace(wall as never, f)] === 'library:preset-sage')!
  const other = face === 'front' ? 'back' : 'front'
  assert.equal(wall.slots?.[shownSlot(wall, face, 0.5)], 'library:flooring-ceramic53')
  assert.equal(wall.slots?.[shownSlot(wall, face, 1.8)], 'library:preset-sage')
  // The bedroom face had no slot of its own: both its bands stay unset, so it shows the same default as before.
  assert.equal(wall.slots?.[shownSlot(wall, other, 0.5)], wall.slots?.[slotForFace(wall as never, other)])
  assert.equal(wall.slots?.[shownSlot(wall, other, 1.8)], wall.slots?.[slotForFace(wall as never, other)])

  // Paint after the split goes above the wainscot.
  const painted = json(await call('set_wall_finish', { wall_ids: [north], zone_id: living.zoneId, finish_id: 'varpet-wallpaper-botanical' }))
  assert.equal(painted.walls[0].slots.length, 2)
  const northWall = (await nodes())[north]!
  const northFace = (['front', 'back'] as const).find((f) => painted.walls[0].slots.includes(slotForFace(northWall as never, f)))!
  assert.equal(northWall.slots?.[shownSlot(northWall, northFace, 2)], 'library:varpet-wallpaper-botanical')
  assert.equal(northWall.slots?.[shownSlot(northWall, northFace, 0.4)], 'library:flooring-ceramic53')

  // Removing it joins the face again with the finish that was above.
  const removed = json(await call('set_wainscot', { wall_ids: [north], zone_id: living.zoneId, enabled: false }))
  assert.equal(removed.walls[0].split, false)
  const joined = (await nodes())[north]!
  assert.equal(joined.faceBands?.enabled, false)
  assert.equal(joined.slots?.[shownSlot(joined, northFace, 0.4)], 'library:varpet-wallpaper-botanical')
})

test('wallpapers are wall finishes registered with Pascal, their textures tile at roll width', async () => {
  await setup()
  const papers = listFinishes({ family: 'wallpaper' })
  assert.ok(papers.length >= 4)
  for (const paper of papers) {
    const preset = getMaterialPresetByRef(paper.ref)
    assert.match(String(preset?.maps?.albedoMap), /^https:\/\/varpet\.example\/finishes\/wallpaper-[a-z-]+\/basecolor\.jpg$/)
    assert.equal(preset?.mapProperties?.color, '#ffffff')
    assert.ok(Math.abs(Number(preset?.mapProperties?.repeatX) - 1 / 0.53) < 1e-9)
  }
})
