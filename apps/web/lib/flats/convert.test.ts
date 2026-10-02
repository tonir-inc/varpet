import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { apiGraphSchema } from '../scenes/graph-schema.ts'
import { buildTemplate, SOURCES } from './build-templates.ts'
import { convertV1Scene, polygonArea, type V1Scene } from './convert.ts'

const dir = import.meta.dirname
const source = (id: string) => JSON.parse(readFileSync(join(dir, 'sources', `${id}.json`), 'utf8')) as V1Scene
type Node = Record<string, any>

for (const { id } of SOURCES) {
  test(`${id}: one level with a zone, slab and ceiling per room, same areas`, () => {
    const v1 = source(id)
    const { graph, rooms, area } = convertV1Scene(v1)
    const nodes = Object.values(graph.nodes) as Node[]
    const of = (type: string) => nodes.filter((n) => n.type === type)
    assert.equal(of('site').length, 1)
    assert.equal(of('building').length, 1)
    assert.equal(of('level').length, 1)
    const level = of('level')[0]!
    for (const type of ['zone', 'slab', 'ceiling']) {
      const list = of(type)
      assert.equal(list.length, v1.rooms.length, type)
      for (const node of list) assert.equal(node.parentId, level.id)
    }
    for (const room of v1.rooms) {
      const zone = of('zone').find((z) => z.metadata.v1Id === room.id)!
      assert.equal(zone.name, room.name)
      assert.ok(Math.abs(polygonArea(zone.polygon) - polygonArea(room.polygon)) < 0.01, `${room.id} area`)
      for (const type of ['slab', 'ceiling']) {
        const surface = of(type).find((n) => n.metadata.v1Id === room.id)!
        assert.deepEqual(surface.polygon, zone.polygon)
      }
    }
    assert.equal(rooms.length, v1.rooms.length)
    assert.ok(Math.abs(area - v1.rooms.reduce((sum, r) => sum + polygonArea(r.polygon), 0)) < 0.05)
    // Ceilings follow the level top, so the storey is as tall as the walls.
    assert.equal(level.height, Math.max(...v1.walls.map((w) => w.height)))
  })

  test(`${id}: walls keep length, height and thickness; openings sit inside their wall`, () => {
    const v1 = source(id)
    const { graph } = convertV1Scene(v1)
    const nodes = graph.nodes as Record<string, Node>
    const walls = Object.values(nodes).filter((n) => n.type === 'wall')
    assert.equal(walls.length, v1.walls.length)
    let openings = 0
    for (const w1 of v1.walls) {
      const wall = walls.find((w) => w.metadata.v1Id === w1.id)!
      const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
      assert.ok(Math.abs(length - Math.hypot(w1.end[0] - w1.start[0], w1.end[1] - w1.start[1])) < 1e-3, `${w1.id} length`)
      assert.equal(wall.height, w1.height)
      assert.ok(Math.abs(wall.thickness - w1.thickness) < 1e-4)
      assert.equal(wall.children.length, (w1.openings ?? []).length)
      for (const o1 of w1.openings ?? []) {
        const node = nodes[wall.children.find((c: string) => nodes[c]!.metadata.v1Id === o1.id)]!
        openings++
        assert.equal(node.type, o1.kind)
        assert.equal(node.parentId, wall.id)
        assert.equal(node.wallId, wall.id)
        assert.ok(Math.abs(node.width - o1.width) < 1e-4 && Math.abs(node.height - o1.height) < 1e-4)
        const [x, y] = node.position as number[]
        assert.ok(x - node.width / 2 >= -1e-3 && x + node.width / 2 <= length + 1e-3, `${o1.id} inside ${w1.id}`)
        assert.ok(Math.abs(x - node.width / 2 - o1.offset) < 1e-3, `${o1.id} offset`)
        assert.ok(Math.abs(y - (o1.sill + o1.height / 2)) < 1e-3, `${o1.id} height`)
        assert.ok(o1.sill + o1.height <= wall.height + 1e-6)
      }
    }
    assert.equal(openings, Object.values(nodes).filter((n) => n.type === 'door' || n.type === 'window').length)
  })

  test(`${id}: Pascal accepts the graph and the committed template is current`, () => {
    const { graph } = buildTemplate(dir, id)
    assert.ok(apiGraphSchema.safeParse(graph).success)
    const bridge = new SceneBridge()
    bridge.loadJSON(graph as never)
    assert.deepEqual(bridge.validateScene(), { valid: true, errors: [], warnings: [] })
    assert.deepEqual(bridge.exportJSON(), graph)
    const committed = JSON.parse(readFileSync(join(dir, 'templates', `${id}.json`), 'utf8'))
    assert.deepEqual(committed, graph, 'run node apps/web/lib/flats/build-templates.ts')
  })
}

test('the manifest lists every template, Sunday B12121 first', () => {
  const manifest = JSON.parse(readFileSync(join(dir, 'templates', 'manifest.json'), 'utf8')) as Array<{ id: string; rooms: number; area: number }>
  assert.deepEqual(manifest.map((m) => m.id), SOURCES.map((s) => s.id))
  assert.equal(manifest[0]!.id, 'sunday-b12121')
  for (const entry of manifest) {
    const flat = buildTemplate(dir, entry.id)
    assert.equal(entry.rooms, flat.rooms.length)
    assert.equal(entry.area, flat.area)
  }
})

test('the flat is centred on the origin', () => {
  const { graph } = convertV1Scene(source('sunday-b12121'))
  const points = (Object.values(graph.nodes) as Node[]).filter((n) => n.type === 'wall').flatMap((w) => [w.start, w.end])
  const xs = points.map((p) => p[0]), zs = points.map((p) => p[1])
  assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 0.05)
  assert.ok(Math.abs(Math.min(...zs) + Math.max(...zs)) < 0.05)
})

test('an opening off its wall is refused', () => {
  const v1 = source('orion-t8')
  const wall = v1.walls.find((w) => w.openings?.length)!
  wall.openings![0]!.offset = 100
  assert.throws(() => convertV1Scene(v1), /runs off wall/)
})
