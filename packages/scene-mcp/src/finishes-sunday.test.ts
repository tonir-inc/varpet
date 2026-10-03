// Zone-scoped wall tools on a real flat (the Sunday template): a room treatment covers every wall face that bounds
// the room, piers, returns and column ends included, and nothing of the neighbouring rooms.
import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createSceneStore } from '@pascal-app/mcp/storage'
import type { Catalog } from './catalog.ts'
import { topBandSlot } from './finishes.ts'
import { createSceneServer, productItemNode } from './server.ts'
import { slotForFace, type WallFace, wallSideUpdates } from './wall-sides.ts'
import { trimSideForFace } from './wall-trim.ts'

type Point = [number, number]
type Node = { id: string; type: string; parentId?: string; children?: string[]; [key: string]: unknown }

const TEMPLATE = join(import.meta.dirname, '../../../apps/web/lib/flats/templates/sunday-b12121.json')
const noCatalog: Catalog = {
  async search() {
    return { results: [], candidates: 0, nextOffset: null }
  },
  async get() {
    return null
  },
}

async function sunday() {
  const dir = mkdtempSync(join(tmpdir(), 'scene-mcp-sunday-'))
  const store = await createSceneStore({ PASCAL_DB_PATH: join(dir, 'pascal.db') })
  const meta = await store.save({ name: 'Sunday', graph: JSON.parse(readFileSync(TEMPLATE, 'utf8')) })
  const { server, operations } = await createSceneServer({
    store,
    sceneId: meta.id,
    catalog: noCatalog,
    publicOrigin: 'https://varpet.example',
    modelBounds: async () => null,
    modelHeights: async () => null,
  } as never)
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean }
    assert.ok(!result.isError, result.content[0]!.text)
    return JSON.parse(result.content[0]!.text)
  }
  const nodes = async () => (await store.load(meta.id))!.graph.nodes as unknown as Record<string, Node>
  return { call, nodes, operations }
}

function inside([x, y]: Point, polygon: Point[]) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/**
 * Every face that shows along a room's outline: walk each outline edge every 10 cm (clear of corners), step 2 cm
 * into the wall there and take the face of that wall on the room's side. Open edges (no wall) are skipped. A wall
 * end on the outline (a column or pier cap) is split at the centreline, each half showing its face (Pascal patch 17).
 */
function facesOnOutline(all: Record<string, Node>, zoneId: string): Array<{ wall: Node; face: WallFace; at: Point }> {
  const polygon = all[zoneId]!.polygon as Point[]
  const walls = Object.values(all).filter((node) => node.type === 'wall' && node.parentId === all[zoneId]!.parentId)
  const found: Array<{ wall: Node; face: WallFace; at: Point }> = []
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!
    const q = polygon[(i + 1) % polygon.length]!
    const length = Math.hypot(q[0] - p[0], q[1] - p[1])
    const dir: Point = [(q[0] - p[0]) / length, (q[1] - p[1]) / length]
    for (let s = 0.08; s < length - 0.08; s += 0.1) {
      const at: Point = [p[0] + dir[0] * s, p[1] + dir[1] * s]
      let normal: Point = [-dir[1], dir[0]]
      if (!inside([at[0] + normal[0] * 0.05, at[1] + normal[1] * 0.05], polygon)) normal = [dir[1], -dir[0]]
      const room: Point = [at[0] + normal[0] * 0.05, at[1] + normal[1] * 0.05]
      const probe: Point = [at[0] - normal[0] * 0.02, at[1] - normal[1] * 0.02]
      for (const wall of walls) {
        const [sx, sy] = wall.start as Point
        const [ex, ey] = wall.end as Point
        const len = Math.hypot(ex - sx, ey - sy)
        const d: Point = [(ex - sx) / len, (ey - sy) / len]
        const along = (pt: Point) => (pt[0] - sx) * d[0] + (pt[1] - sy) * d[1]
        const across = (pt: Point) => -(pt[0] - sx) * d[1] + (pt[1] - sy) * d[0]
        const half = (wall.thickness as number) / 2
        if (along(probe) < 0 || along(probe) > len || Math.abs(across(probe)) > half) continue
        found.push({ wall, face: across(room) > 0 ? 'front' : 'back', at })
      }
    }
  }
  return found
}

/** The slot a face shows (side tags as the editor gives them at load), its upper band on a split wall, or its lower. */
function shown(all: Record<string, Node>, wall: Node, face: WallFace, band: 'whole' | 'lower' = 'whole') {
  const tags = wallSideUpdates(all as never).find((u) => u.id === wall.id)
  const tagged = tags ? { ...wall, frontSide: tags.frontSide, backSide: tags.backSide } : wall
  const side = slotForFace(tagged, face)
  const slots = (wall.slots as Record<string, string> | undefined) ?? {}
  if (band === 'lower') return slots[`lower${side === 'interior' ? 'Interior' : 'Exterior'}`]
  return slots[topBandSlot(wall, side) ?? side]
}

const where = ({ wall, face, at }: { wall: Node; face: WallFace; at: Point }) =>
  `${wall.id} ${face} at (${at[0].toFixed(2)}, ${at[1].toFixed(2)})`

const NEIGHBOURS: Record<string, string[]> = {
  'zone_r-living': ['zone_r-kitchen', 'zone_r-entrance', 'zone_r-balcony-4', 'zone_r-closet-1'],
  'zone_r-bedroom-9': ['zone_r-bedroom-11', 'zone_r-bedroom-6', 'zone_r-bath-10', 'zone_r-balcony-8', 'zone_r-closet-3', 'zone_r-bath-7'],
}

for (const zoneId of Object.keys(NEIGHBOURS)) {
  test(`set_wall_finish and set_wainscot on ${zoneId} cover every face around it and none of the neighbours'`, async () => {
    const { call, nodes } = await sunday()
    const paint = 'library:varpet-paint-emerald'
    const panel = 'library:wood-woodfine24'
    const painted = await call('set_wall_finish', { zone_id: zoneId, finish_id: 'varpet-paint-emerald' })
    await call('set_wainscot', { zone_id: zoneId, finish_id: 'wood-woodfine24', height: 0.9 })
    const all = await nodes()
    const faces = facesOnOutline(all, zoneId)
    assert.ok(faces.length > 100, `${faces.length} samples`)
    assert.deepEqual(faces.filter((f) => shown(all, f.wall, f.face) !== paint).map(where), [], 'faces of the room without the paint')
    assert.deepEqual(faces.filter((f) => shown(all, f.wall, f.face, 'lower') !== panel).map(where), [], 'faces of the room without the wainscot')
    for (const neighbour of NEIGHBOURS[zoneId]!) {
      const theirs = facesOnOutline(all, neighbour)
      assert.deepEqual(theirs.filter((f) => shown(all, f.wall, f.face) === paint).map(where), [], `${neighbour} faces with the paint`)
      assert.deepEqual(theirs.filter((f) => shown(all, f.wall, f.face, 'lower') === panel).map(where), [], `${neighbour} faces with the wainscot`)
    }
    // A second call finds the walls already split at the room's edges.
    const again = await call('set_wall_finish', { zone_id: zoneId, finish_id: 'varpet-paint-emerald' })
    assert.equal(again.split, undefined)
    assert.ok(painted.split?.length > 0)
  })
}

test('set_wall_trim on a bedroom puts skirting on every face around it and on no neighbour face', async () => {
  const { call, nodes } = await sunday()
  await call('set_wall_trim', { zone_id: 'zone_r-bedroom-9', skirting: { profile: 'ogee' } })
  const all = await nodes()
  const has = ({ wall, face }: { wall: Node; face: WallFace }) => {
    const skirting = wall.skirting as { enabled?: boolean; sides?: string } | undefined
    const side = trimSideForFace(wall, face)
    return !!skirting?.enabled && side !== null && (skirting.sides === 'both' || skirting.sides === side)
  }
  assert.deepEqual(facesOnOutline(all, 'zone_r-bedroom-9').filter((f) => !has(f)).map(where), [])
  for (const neighbour of NEIGHBOURS['zone_r-bedroom-9']!) {
    assert.deepEqual(facesOnOutline(all, neighbour).filter(has).map(where), [], neighbour)
  }
})

test('splitting a wall at a room edge keeps its geometry, its door and its hung art where they were', async () => {
  const { call, nodes, operations } = await sunday()
  const before = await nodes()
  const spine = before['wall_w-spine']!
  const length = Math.hypot((spine.end as Point)[0] - (spine.start as Point)[0], (spine.end as Point)[1] - (spine.start as Point)[1])
  // Art hung on bedroom 9's side of the spine (its back face), 13 m along.
  const art = productItemNode(
    { id: 'test:art', name: 'Framed print', kind: 'wall_art', dimensions: [0.6, 0.8, 0.03], priceAmd: 1, shop: 'test', glbUrl: 'https://varpet.example/art.glb' } as never,
    [13, 1.2, 0.015],
    Math.PI,
    { attachTo: 'wall-side', wallId: spine.id, side: 'back', wallT: 13 / length },
  )
  const artId = operations.createNode(art as never, spine.id as never) as unknown as string
  const out = await call('set_wall_finish', { zone_id: 'zone_r-bedroom-9', finish_id: 'varpet-paint-coral' })
  const split = (out.split as Array<{ wall: string; pieces: string[] }>).find((s) => s.wall === spine.id)!
  assert.ok(split.pieces.length >= 2, JSON.stringify(out.split))
  const all = await nodes()
  const pieces = split.pieces.map((id) => all[id]!)
  // Same line, end to end: the first piece starts where the wall did, each next one where the last ended.
  assert.deepEqual(pieces[0]!.start, spine.start)
  assert.deepEqual(pieces.at(-1)!.end, spine.end)
  let total = 0
  const offsets = new Map<string, number>()
  for (const [i, piece] of pieces.entries()) {
    if (i > 0) {
      assert.ok(Math.hypot((piece.start as Point)[0] - (pieces[i - 1]!.end as Point)[0], (piece.start as Point)[1] - (pieces[i - 1]!.end as Point)[1]) < 1e-6)
    }
    assert.equal(piece.thickness, spine.thickness)
    assert.equal(piece.height, spine.height)
    assert.equal((piece.metadata as { v1Id?: string }).v1Id, 'w-spine')
    offsets.set(piece.id, total)
    total += Math.hypot((piece.end as Point)[0] - (piece.start as Point)[0], (piece.end as Point)[1] - (piece.start as Point)[1])
  }
  assert.ok(Math.abs(total - length) < 1e-6)
  // Every door, window and hung item resolves to one piece, at the same place along the old wall.
  const was = new Map(['door_d-bed11', 'door_d-bed9', artId].map((id) => [id, (before[id] ?? { position: [13] }).position as number[]]))
  for (const [id, position] of was) {
    const child = all[id]!
    const piece = all[child.parentId!]!
    assert.ok(split.pieces.includes(piece.id), `${id} on ${piece.id}`)
    assert.ok(piece.children?.includes(id), `${piece.id} lists ${id}`)
    assert.equal(pieces.filter((p) => p.children?.includes(id)).length, 1)
    assert.ok(Math.abs(offsets.get(piece.id)! + (child.position as number[])[0] - position[0]) < 1e-6, id)
    if (id === artId) {
      const pieceLength = Math.hypot((piece.end as Point)[0] - (piece.start as Point)[0], (piece.end as Point)[1] - (piece.start as Point)[1])
      assert.equal(child.wallId, piece.id)
      assert.ok(Math.abs((child.wallT as number) - (child.position as number[])[0] / pieceLength) < 1e-6)
    }
  }
  // The slots the wall had ride along to every piece; only faces looking into the bedroom took the coral.
  for (const piece of pieces) {
    for (const [slot, ref] of Object.entries(spine.slots as Record<string, string>)) {
      assert.ok([ref, 'library:varpet-paint-coral'].includes((piece.slots as Record<string, string>)[slot]!), `${piece.id} ${slot}`)
    }
  }
})
