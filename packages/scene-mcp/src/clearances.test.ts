import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkClearances, type ClearanceReport, type Finding } from './clearances.ts'

// The M6 flat: zone polygons at the wall faces. Bedroom 1's door (door_door-bedroom-large) is on a wall running +x at
// z 0.71, 0.91 m wide (x -3.51..-2.60), hinged at its west jamb, swinging inward (+z) into the bedroom.
const TEMPLATE = join(import.meta.dirname, '../../../apps/web/lib/flats/templates/m6-12-54.json')
const LEVEL = 'level_m6-12-54'

function flat(items: Array<[id: string, name: string, category: string, dims: number[], pos: number[], yaw?: number]>) {
  const nodes = JSON.parse(readFileSync(TEMPLATE, 'utf8')).nodes
  for (const [id, name, category, dimensions, position, yaw = 0] of items) {
    nodes[id] = { id, type: 'item', name, parentId: LEVEL, position, rotation: [0, yaw, 0], scale: [1, 1, 1], asset: { category, dimensions } }
  }
  return nodes
}

const room = (report: ReturnType<typeof checkClearances>) => (report as ClearanceReport).rooms[0]!
const find = (findings: Finding[], check: string, key?: string, value?: unknown) =>
  findings.filter((f) => f.check === check && (key === undefined || f[key] === value))

const bedroom = () =>
  flat([
    // Headboard on the west wall: at yaw pi/2 the front (+z local) faces +x, so the foot is east.
    ['item_bed', 'Oak double bed', 'bed', [1.6, 1, 2.1], [-4.62, 0, 2.5], Math.PI / 2],
    ['item_ns', 'Walnut nightstand', 'nightstand', [0.45, 0.55, 0.4], [-5.47, 0, 1.45]],
    ['item_wardrobe', 'White two door wardrobe', 'wardrobe', [1, 2, 0.6], [-5, 0, 0.161]],
    ['item_chair', 'Reading armchair', 'chair', [0.7, 0.8, 0.7], [-3.3, 0, 1.15]],
    ['item_dresser', 'Six drawer dresser', 'dresser', [1.2, 0.8, 0.5], [-2.86, 0, 3.6], -Math.PI / 2],
    ['item_rug', 'Wool rug', 'rug', [2, 0.01, 3], [-4, 0, 2.5]],
    ['item_lamp', 'Table lamp', 'lamp', [0.3, 0.5, 0.3], [-5.47, 0.55, 1.45]],
  ])

test('bed sides and foot are measured out from the bed in its own frame, to the nearest wall or piece', () => {
  const { findings } = room(checkClearances(bedroom(), 'zone_room-bedroom-large'))
  const [bed] = find(findings, 'bed') as unknown as Array<{ sides: Array<{ side: string; clear: number; to: string }>; foot: { side: string; clear: number; to: string } }>
  assert.deepEqual(bed!.foot, { side: 'east', clear: 0.46, to: 'item_dresser' })
  assert.deepEqual(bed!.sides, [
    { side: 'south', clear: 1.62, to: 'wall' },
    { side: 'north', clear: 0.2, to: 'item_chair' },
  ])
})

test('a chair in front of a door blocks its approach and its swing; a dresser stops the balcony door part way', () => {
  const { findings } = room(checkClearances(bedroom(), 'zone_room-bedroom-large'))
  assert.deepEqual(find(findings, 'door_swing', 'door', 'door_door-bedroom-large'), [{ check: 'door_swing', door: 'door_door-bedroom-large', opens: 0, by: 'item_chair' }])
  assert.equal(find(findings, 'door_approach', 'door', 'door_door-bedroom-large')[0]!.clear, 0)
  const balcony = find(findings, 'door_swing', 'door', 'door_door-balcony-large')[0]!
  assert.equal(balcony.by, 'item_dresser')
  assert.ok((balcony.opens as number) > 0 && (balcony.opens as number) < 90, String(balcony.opens))
})

test('the door swing is clear once the chair moves out of the arc', () => {
  const nodes = bedroom()
  nodes.item_chair.position = [-4.9, 0, 4.4]
  const { findings } = room(checkClearances(nodes, 'zone_room-bedroom-large'))
  assert.deepEqual(find(findings, 'door_swing', 'door', 'door_door-bedroom-large'), [{ check: 'door_swing', door: 'door_door-bedroom-large', opens: 90 }])
})

test('walkways give the pinch on the widest route, between which pieces; rugs and pieces on pieces are not obstacles', () => {
  const report = room(checkClearances(bedroom(), 'zone_room-bedroom-large'))
  const toBalcony = find(report.findings, 'walkway', 'to', 'door_door-balcony-large')[0]!
  assert.equal(toBalcony.from, 'door_door-bedroom-large')
  assert.ok(Math.abs((toBalcony.width as number) - 0.46) < 0.06, String(toBalcony.width))
  assert.deepEqual([...(toBalcony.between as string[])].sort(), ['item_bed', 'item_dresser'])
  const json = JSON.stringify(report)
  assert.ok(!json.includes('item_rug') && !json.includes('item_lamp'), json)
  assert.equal(find(report.findings, 'storage_front', 'piece', 'item_wardrobe')[0]!.front, 0.79)
})

test('dining: each table edge to the nearest wall or piece, its own chairs ignored; open-plan edges are routes', () => {
  const nodes = flat([
    ['item_table', 'Walnut dining table', 'table', [1.35, 0.75, 0.8], [2.3, 0, -1.5], Math.PI / 2],
    ['item_c1', 'Dining chair', 'chair', [0.45, 0.8, 0.5], [1.75, 0, -1.8], Math.PI / 2],
    ['item_c2', 'Dining chair', 'chair', [0.45, 0.8, 0.5], [2.85, 0, -1.2], -Math.PI / 2],
    ['item_sofa', 'Three seat sofa', 'sofa', [2.1, 0.85, 0.9], [2.3, 0, 2.8], Math.PI],
    ['item_coffee', 'Oak coffee table', 'table', [1, 0.42, 0.6], [2.3, 0, 1.8]],
  ])
  const { findings } = room(checkClearances(nodes, 'zone_room-living'))
  const dining = find(findings, 'dining')[0] as unknown as { chairs: number; sides: Array<{ side: string; clear: number; to: string }> }
  assert.equal(dining.chairs, 2)
  assert.deepEqual(dining.sides.find((s) => s.side === 'north'), { side: 'north', clear: 0.85, to: 'wall' })
  assert.deepEqual(dining.sides.find((s) => s.side === 'south'), { side: 'south', clear: 2.32, to: 'item_coffee' })
  assert.deepEqual(find(findings, 'seating'), [{ check: 'seating', piece: 'item_sofa', table: 'item_coffee', gap: 0.25 }])
  // The living room meets the hall with no wall: that stretch is a way in, so the balcony door has a route to it.
  const route = find(findings, 'walkway', 'from', 'door_door-balcony-living')
  assert.ok(route.some((f) => String(f.to).startsWith('opening (')), JSON.stringify(route))
})

test('tall pieces in front of a window are reported with how much glass they cover', () => {
  const nodes = flat([['item_shelf', 'Tall bookcase', 'shelf', [0.8, 1.9, 0.35], [-4.2, 0, 4.73]]])
  const { findings } = room(checkClearances(nodes, 'zone_room-bedroom-large'))
  const window = find(findings, 'window', 'piece', 'item_shelf')
  assert.equal(window.length, 1)
  assert.ok((window[0]!.covers as number) > 0.3, JSON.stringify(window))
})

test('without zone_id only furnished rooms are measured; an unknown zone is an error', () => {
  const report = checkClearances(bedroom()) as ClearanceReport
  assert.deepEqual(report.rooms.map((r) => r.zone), ['zone_room-bedroom-large'])
  assert.ok('error' in checkClearances(bedroom(), 'zone_nope'))
})
