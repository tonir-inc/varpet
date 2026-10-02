import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildShell, loadShell, shellToV1, type ShellSpec } from './shell.ts'

// Two rooms side by side (x 0..4 and 4..7, y 0..5, in decimetres), open between y 30..50.
const spec: ShellSpec = {
  id: 'two-rooms',
  name: 'Two rooms',
  scale: 10,
  rooms: [
    { name: 'Living', rect: [0, 0, 40, 50] },
    { name: 'Bedroom', rect: [40, 0, 70, 50] },
  ],
  open: [[40, 30, 40, 50]],
  openings: [
    { kind: 'door', at: [40, 15], width: 0.8 },
    { kind: 'window', at: [20, 0], width: 1.5, sill: 0.9 },
  ],
}

test('room edges become merged walls, open segments have none, openings land on their wall', () => {
  const v1 = shellToV1(spec)
  assert.deepEqual(v1.rooms.map((r) => r.polygon[2]), [[4, 5], [7, 5]])
  const shared = v1.walls.filter((w) => w.start[0] === 4 && w.end[0] === 4)
  assert.deepEqual(shared.map((w) => [w.start, w.end]), [[[4, 0], [4, 3]]])
  assert.deepEqual(shared[0]!.openings!.map((o) => [o.kind, o.offset, o.width]), [['door', 1.1, 0.8]])
  const north = v1.walls.find((w) => w.start[1] === 0 && w.end[1] === 0)!
  assert.deepEqual([north.start, north.end], [[0, 0], [7, 0]])
  assert.deepEqual(north.openings!.map((o) => [o.kind, o.offset, o.sill]), [['window', 1.25, 0.9]])
})

test('the shell converts to a Pascal graph with a zone per room', () => {
  const shell = buildShell(spec)
  assert.deepEqual(shell.rooms.map((r) => [r.name, r.area]), [['Living', 20], ['Bedroom', 15]])
  const zones = Object.values(shell.graph.nodes).filter((n) => n.type === 'zone')
  assert.equal(zones.length, 2)
})

test('an opening off every wall fails loudly', () => {
  assert.throws(() => shellToV1({ ...spec, openings: [{ kind: 'door', at: [20, 25], width: 0.9 }] }), /on no wall/)
})

test('the traced real shells build', () => {
  const dir = join(import.meta.dirname, 'shells')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const shell = loadShell(join(dir, file))
    assert.ok(shell.area > 20, `${file}: ${shell.area} m2`)
  }
})

test('kitchen runs stand in the room against their edge, with a sink and a hob where drawn; islands stand free', () => {
  const shell = buildShell({
    ...spec,
    kitchen: [
      { from: [0, 50], to: [24, 50], sink: [5, 46], hob: [19, 46] },
      { from: [20, 20], to: [20, 32], island: true, depth: 0.9 },
    ],
  })
  const nodes = Object.values(shell.graph.nodes) as Array<Record<string, any>>
  const runs = nodes.filter((n) => n.type === 'cabinet')
  const units = nodes.filter((n) => n.type === 'cabinet-module')
  assert.equal(runs.length, 2)
  assert.equal(units.length, 4 + 2)
  // Living is x 0..4, z 0..5 before the flat is centred (shift -3.5, -2.5): the run's back is on z = 5 minus half a wall.
  const [wallRun, island] = runs
  assert.deepEqual(wallRun!.position, [-2.3, 0, 2.5 - 0.075 - 0.3])
  assert.equal(Math.abs(wallRun!.rotation), Math.PI) // fronts face -z, into the room
  assert.deepEqual(island!.position, [-1.5, 0, 0.1])
  assert.deepEqual(units.filter((u) => u.stack).map((u) => [u.stack[0].type, u.position[0]]), [['cooktop-induction', -0.9], ['sink', 0.9]]) // fronts face -z, so local +x runs west
  const level = nodes.find((n) => n.type === 'level')!
  assert.ok(runs.every((r) => level.children.includes(r.id)))
})
