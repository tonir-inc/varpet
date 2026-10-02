import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eyeSpots, roomSlug, roomZones, withSpawn } from './eye.ts'

// Living (x 0..4, z 0..4) with a door at (4, 1) to the hall (x 4..6) and a balcony door at (2, 0).
const graph = {
  nodes: {
    level_1: { id: 'level_1', type: 'level', children: ['spawn_old'] },
    spawn_old: { id: 'spawn_old', type: 'spawn', parentId: 'level_1' },
    living: { id: 'living', type: 'zone', name: 'Living', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
    hall: { id: 'hall', type: 'zone', name: 'Hall', polygon: [[4, 0], [6, 0], [6, 4], [4, 4]] },
    balcony: { id: 'balcony', type: 'zone', name: 'Balcony', polygon: [[0, -2], [4, -2], [4, 0], [0, 0]] },
    wall_e: { id: 'wall_e', type: 'wall', start: [4, 0], end: [4, 4] },
    wall_n: { id: 'wall_n', type: 'wall', start: [0, 0], end: [4, 0] },
    door_hall: { id: 'door_hall', type: 'door', wallId: 'wall_e', position: [1, 1, 0] },
    door_balcony: { id: 'door_balcony', type: 'door', wallId: 'wall_n', position: [2, 1, 0] },
  },
}

test('the camera stands in the interior door, stepped in, looking at the room centre', () => {
  const [spot] = eyeSpots(graph, ['living'])
  assert.equal(spot!.room, 'Living')
  assert.deepEqual(spot!.position.map((v) => Math.round(v * 100) / 100), [3.4, 0, 1])
  // Looking from (3.4, 1) toward (2, 2): forward (-sin yaw, -cos yaw) points there.
  const forward = [-Math.sin(spot!.yaw), -Math.cos(spot!.yaw)]
  const want = [2 - 3.4, 2 - 1].map((v) => v / Math.hypot(1.4, 1))
  assert.ok(Math.abs(forward[0]! - want[0]!) < 1e-9 && Math.abs(forward[1]! - want[1]!) < 1e-9)
})

test('a room with no door gets a corner spot', () => {
  const [spot] = eyeSpots({ nodes: { z: { id: 'z', type: 'zone', name: 'Box', polygon: [[0, 0], [3, 0], [3, 3], [0, 3]] } } }, ['Box'])
  assert.ok(spot!.position[0] > 0 && spot!.position[0] < 3 && spot!.position[2] > 0 && spot!.position[2] < 3)
})

test('withSpawn replaces spawn nodes with one under the level', () => {
  const [spot] = eyeSpots(graph, ['Living'])
  const out = withSpawn(graph, spot!)
  const spawns = Object.values(out.nodes).filter((n) => (n as { type: string }).type === 'spawn')
  assert.equal(spawns.length, 1)
  assert.deepEqual((out.nodes.level_1 as { children: string[] }).children, ['spawn_eval'])
  assert.deepEqual((graph.nodes.level_1 as { children: string[] }).children, ['spawn_old'])
})

test('room shots go to the named zone, the furnished one when two share a name', () => {
  const twin = {
    nodes: {
      ...graph.nodes,
      living_2: { id: 'living_2', type: 'zone', name: 'living', polygon: [[10, 0], [14, 0], [14, 4], [10, 4]] },
      sofa: { id: 'sofa', type: 'item', position: [12, 0, 2] },
    },
  }
  assert.deepEqual(roomZones(twin, ['Living', 'Hall', 'living', 'Garage']), [{ room: 'living', zoneId: 'living_2' }, { room: 'Hall', zoneId: 'hall' }])
  assert.equal(roomSlug('Living room & kitchen'), 'living-room-kitchen')
})
