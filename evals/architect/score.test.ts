import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTemplate, scoreShell, type Graph } from './score.ts'

type Json = Record<string, any>
const template = loadTemplate('orion-t7') as Graph & { nodes: Record<string, Json> }
const clone = (): Graph & { nodes: Record<string, Json> } => structuredClone(template)

/** Every plan point moved by (dx, dz): what the architect drawing elsewhere looks like. */
function shifted(dx: number, dz: number) {
  const g = clone()
  for (const n of Object.values(g.nodes)) {
    if (n.type === 'zone' || n.type === 'slab') n.polygon = n.polygon.map(([x, z]: number[]) => [x + dx, z + dz])
    if (n.type === 'wall') {
      n.start = [n.start[0] + dx, n.start[1] + dz]
      n.end = [n.end[0] + dx, n.end[1] + dz]
    }
  }
  return g
}

test('a template scored against itself is perfect', () => {
  const s = scoreShell(template, template)
  assert.ok(s.floorIou > 0.999)
  assert.equal(s.roomsMatched, 10)
  assert.equal(s.roomsMissing + s.roomsExtra, 0)
  assert.ok(s.walls.coverage > 0.999 && s.walls.precision > 0.999)
  assert.equal(s.doors.matched, 9)
  assert.equal(s.windows.matched, 11)
  assert.ok(Math.abs(s.totalArea.err) < 1e-9)
})

test('a flat drawn somewhere else is moved onto the template', () => {
  const s = scoreShell(shifted(12.3, -7.4), template)
  assert.ok(Math.abs(s.shift[0] + 12.3) < 0.03 && Math.abs(s.shift[1] - 7.4) < 0.03, `shift ${s.shift}`)
  assert.ok(s.floorIou > 0.98)
  assert.equal(s.doors.matched, 9)
  assert.ok((s.doors.meanPosErr ?? 1) < 0.05)
})

test('a missing room, wall and door show up', () => {
  const g = clone()
  delete g.nodes['zone_living']
  const wall = Object.values(g.nodes).find((n) => n.type === 'wall' && !n.children?.length && Math.hypot(n.end[0] - n.start[0], n.end[1] - n.start[1]) > 2)!
  delete g.nodes[wall.id]
  const door = Object.values(g.nodes).find((n) => n.type === 'door')!
  delete g.nodes[door.id]
  const s = scoreShell(g, template)
  assert.equal(s.roomsMissing, 1)
  assert.ok(s.rooms.some((r) => r.template === 'Living room and kitchen' && r.built === null))
  assert.ok(s.missingAreaShare > 0.3)
  assert.ok(s.walls.coverage < 0.99)
  assert.equal(s.doors.missing, 1)
})

test('a room drawn 10% too big and a door 0.3 m off are measured', () => {
  const g = clone()
  const zone = g.nodes['zone_bedroom-3']!
  const [cx, cz] = zone.polygon.reduce(([a, b]: number[], [x, z]: number[]) => [a + x, b + z], [0, 0]).map((v: number) => v / zone.polygon.length)
  const k = Math.sqrt(1.1)
  zone.polygon = zone.polygon.map(([x, z]: number[]) => [cx + (x - cx) * k, cz + (z - cz) * k])
  g.nodes['door_door-bed2']!.position[0] += 0.3
  const s = scoreShell(g, template)
  const row = s.rooms.find((r) => r.template === 'Bedroom 3')!
  assert.ok(Math.abs(row.areaErr! - 0.1) < 0.005, `area err ${row.areaErr}`)
  assert.equal(s.doors.matched, 9)
  assert.ok(s.doors.meanPosErr! > 0.02 && s.doors.meanPosErr! < 0.05)
})

test('a flat drawn 6% too big loses area but keeps its layout score', () => {
  const g = clone()
  const k = 1.06
  for (const n of Object.values(g.nodes)) {
    if (n.type === 'zone' || n.type === 'slab') n.polygon = n.polygon.map(([x, z]: number[]) => [x * k, z * k])
    if (n.type === 'wall') {
      n.start = [n.start[0] * k, n.start[1] * k]
      n.end = [n.end[0] * k, n.end[1] * k]
    }
    if (n.type === 'door' || n.type === 'window') n.position[0] *= k
  }
  const s = scoreShell(g, template)
  assert.ok(Math.abs(s.totalArea.err - (k * k - 1)) < 0.001)
  assert.ok(s.floorIou < 0.9)
  assert.ok(Math.abs(s.scaled!.factor - 1 / k) < 0.005, `factor ${s.scaled!.factor}`)
  assert.ok(s.scaled!.floorIou > 0.98)
  assert.equal(s.scaled!.doorsMatched, 9)
})
