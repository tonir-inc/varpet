import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import '@pascal-app/mcp/bridge'
import { wallSideUpdates } from './wall-sides.ts'

const level = { id: 'level_a', type: 'level', parentId: 'building_a' }
const zone = (id: string, name: string, polygon: number[][]) => ({ id, type: 'zone', parentId: level.id, name, polygon })
const wall = (id: string, start: number[], end: number[], sides: Record<string, string> = {}) => ({
  id, type: 'wall', parentId: level.id, start, end, thickness: 0.1, frontSide: 'unknown', backSide: 'unknown', ...sides,
})

test('a wall that does not close a room takes its sides from the zone beside it', () => {
  // Wall along the room's south edge, running +x: its front (left normal, +z) faces the room.
  const nodes = { level_a: level, zone_r: zone('zone_r', 'Bedroom', [[0, 0], [4, 0], [4, 3], [0, 3]]), wall_s: wall('wall_s', [0, 0], [4, 0]) }
  assert.deepEqual(wallSideUpdates(nodes), [{ id: 'wall_s', frontSide: 'interior', backSide: 'exterior' }])
})

test('partitions, balcony zones and walls already tagged are left alone', () => {
  const nodes = {
    level_a: level,
    zone_a: zone('zone_a', 'Bedroom', [[0, 0], [2, 0], [2, 3], [0, 3]]),
    zone_b: zone('zone_b', 'Living room', [[2, 0], [4, 0], [4, 3], [2, 3]]),
    zone_c: zone('zone_c', 'Balcony', [[0, -2], [4, -2], [4, 0], [0, 0]]),
    wall_mid: wall('wall_mid', [2, 0], [2, 3]),
    wall_s: wall('wall_s', [0, 0], [4, 0]),
    wall_n: wall('wall_n', [4, 3], [0, 3], { frontSide: 'exterior', backSide: 'interior' }),
  }
  assert.deepEqual(wallSideUpdates(nodes), [{ id: 'wall_s', frontSide: 'interior', backSide: 'exterior' }])
})
