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
