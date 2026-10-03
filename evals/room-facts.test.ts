import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roleOf, roomFacts, worldPose } from './room-facts.ts'

const item = (id: string, category: string, name: string, position: number[], dimensions: number[], rotation = 0) => ({
  id, type: 'item', name, position, rotation: [0, rotation, 0], asset: { category, name, dimensions },
})

// A 4 x 5 m room (x 0..4, z 0..5) with a 1 m door in the south wall (z = 0, x 1.5..2.5).
const graph = {
  nodes: {
    zone_a: { id: 'zone_a', type: 'zone', name: 'Living', ceilingHeight: 2.8, polygon: [[0, 0], [4, 0], [4, 5], [0, 5]] },
    zone_b: { id: 'zone_b', type: 'zone', name: 'Empty', polygon: [[10, 0], [12, 0], [12, 2], [10, 2]] },
    wall_s: { id: 'wall_s', type: 'wall', start: [0, 0], end: [4, 0], children: ['door_1'] },
    door_1: { id: 'door_1', type: 'door', wallId: 'wall_s', parentId: 'wall_s', position: [2, 1.1, 0], width: 1 },
    // Sofa against the north wall (z = 5), 2 m wide, facing south.
    sofa: item('sofa', 'sofa', 'Linen sofa', [2, 0, 4.55], [2, 0.9, 0.9], Math.PI),
    rug: item('rug', 'rug', 'Wool rug', [2, 0, 3.5], [2, 0.01, 3]),
    armchair: item('armchair', 'chair', 'Reading armchair', [0.5, 0, 1.5], [0.8, 0.9, 0.8]),
    lamp: item('lamp', 'lamp', 'Floor lamp', [3.4, 0, 4.6], [0.4, 1.6, 0.4]),
    side: item('side', 'table', 'Side table', [3.3, 0, 4.6], [0.4, 0.5, 0.4]),
    // Art hung on the east wall (x = 4).
    art: item('art', 'wall_art', 'Canvas print', [3.98, 1.2, 2], [1, 0.8, 0.04], -Math.PI / 2),
  },
}

test('roles come from the catalog category, then the name', () => {
  assert.equal(roleOf({ asset: { category: 'sofa', name: 'x' } }), 'seat')
  assert.equal(roleOf({ asset: { category: '', name: 'Brass pendant light' } }), 'light')
  assert.equal(roleOf({ asset: { name: 'Linen curtains, pair' } }), 'textile')
})

test('facts for the furnished room only, with shares, bare wall and seat stations', () => {
  const facts = roomFacts(graph)
  assert.deepEqual(facts.map((f) => f.room), ['Living'])
  const [living] = facts
  assert.equal(living!.areaM2, 20)
  assert.equal(living!.ceilingM, 2.8)
  assert.equal(living!.pieces, 6)
  // sofa 1.8 + armchair 0.64 + lamp 0.16 + side 0.16 = 2.76 of 20 m2
  assert.equal(living!.footprintShare, 0.14)
  assert.equal(living!.rugShare, 0.3)
  // 18 m of outline minus the 1 m door (plus the 0.3 m sample margin on each side).
  assert.ok(living!.wallLengthM > 16 && living!.wallLengthM < 17.1, String(living!.wallLengthM))
  // Dressed: the sofa run on the north wall, the armchair corner, the art on the east wall, the lamp corner.
  assert.ok(living!.bareWallM < living!.wallLengthM - 4, String(living!.bareWallM))
  assert.deepEqual(living!.counts.lights, { floor: 1, table: 0, ceiling: 0, wall: 0 })
  assert.equal(living!.counts.wallDecor, 1)
  assert.deepEqual(living!.seatsWithoutSurface, ['Reading armchair'])
  assert.deepEqual(living!.seatsWithoutLight, ['Reading armchair'])
})

test('named rooms are reported even when empty, by name or zone id', () => {
  const [empty] = roomFacts(graph, ['empty'])
  assert.equal(empty!.pieces, 0)
  assert.equal(empty!.empty, true)
  assert.equal(empty!.bareWallM, empty!.wallLengthM)
  assert.equal(empty!.bareWallShare, 1)
  assert.equal(empty!.itemsPerM2, 0)
  assert.deepEqual(empty!.openFloor, { largestM2: 4, share: 1, centre: [11, 1] })
  assert.deepEqual(roomFacts(graph, ['zone_b']).map((f) => f.zoneId), ['zone_b'])
})

test('open floor: the largest stretch of floor 0.9 m clear of every floor piece', () => {
  const [living] = roomFacts(graph, ['Living'])
  assert.equal(living!.empty, false)
  assert.equal(living!.itemsPerM2, 0.3)
  // The rug and sofa fill the north half, the armchair the south-west corner: what is left is the south-east.
  assert.ok(living!.openFloor && living!.openFloor.largestM2 > 0.5 && living!.openFloor.largestM2 < 4, JSON.stringify(living!.openFloor))
  assert.ok(living!.openFloor!.centre[1] < 2.5)
})

test('finishes: what the floor and each wall face show, and whether it is still the start scene\'s', () => {
  const finished = {
    nodes: {
      ...graph.nodes,
      slab_a: { id: 'slab_a', type: 'slab', polygon: [[0, 0], [4, 0], [4, 5], [0, 5]], slots: { surface: 'library:oak' } },
      // The south wall runs west to east: its front (left normal, +z) faces the room.
      wall_s: { ...graph.nodes.wall_s, thickness: 0.1, slots: { interior: 'library:terracotta', exterior: 'library:white' } },
      // The east wall runs south to north: its front (left normal, -x) faces the room and is tagged interior.
      wall_e: { id: 'wall_e', type: 'wall', start: [4, 0], end: [4, 5], thickness: 0.1, frontSide: 'interior', backSide: 'exterior', slots: { interior: 'library:white', exterior: 'library:sand' } },
    },
  }
  const start = { nodes: { ...finished.nodes, wall_s: { ...finished.nodes.wall_s, slots: { interior: 'library:white', exterior: 'library:white' } } } }
  const [living] = roomFacts(finished, ['Living'], start)
  assert.equal(living!.finishes.floor, 'oak')
  assert.equal(living!.finishes.floorUnchanged, true)
  assert.deepEqual(living!.finishes.walls, [
    { finish: 'white', m: 5, unchanged: true },
    { finish: 'terracotta', m: 4, unchanged: false },
  ])
  assert.equal(roomFacts(finished, ['Living'])[0]!.finishes.floorUnchanged, null, 'unknown without a start scene')
})

test('kitchen: a built-in base run and how much of it has something above on the wall', () => {
  const kitchen = {
    nodes: {
      ...graph.nodes,
      run: { id: 'run', type: 'cabinet', runTier: 'base', position: [2, 0, 0.3], rotation: 0, width: 3, depth: 0.6, carcassHeight: 0.8 },
      shelf: item('shelf', 'shelf', 'Wall shelf', [1, 1.5, 0.15], [1, 0.3, 0.1]),
    },
  }
  assert.equal(roomFacts(graph, ['Living'])[0]!.kitchen, null)
  const facts = roomFacts(kitchen, ['Living'])[0]!.kitchen!
  assert.equal(facts.baseRunM, 3)
  assert.ok(facts.dressedAboveM > 0.9 && facts.dressedAboveM < 2.1, JSON.stringify(facts))
})

test('wall and ceiling children count where they hang, not at their local coordinates', () => {
  // The north wall runs east to west (4,5) -> (0,5): its left normal points south, into the room.
  const mounted = {
    nodes: {
      ...graph.nodes,
      level_1: { id: 'level_1', type: 'level', height: 2.8 },
      wall_n: { id: 'wall_n', type: 'wall', start: [4, 5], end: [0, 5], thickness: 0.2, children: ['sconce'] },
      ceiling_a: { id: 'ceiling_a', type: 'ceiling', polygon: [[0, 0], [4, 0], [4, 5], [0, 5]], children: ['pendant'] },
      sconce: { ...item('sconce', 'lamp', 'Brass wall sconce', [1, 1.6, 0.1], [0.2, 0.3, 0.2]), parentId: 'wall_n' },
      pendant: { ...item('pendant', 'lamp', 'Rattan pendant', [2, -0.6, 3.5], [0.5, 0.4, 0.5]), parentId: 'ceiling_a' },
    },
  }
  const sconce = worldPose(mounted.nodes.sconce, mounted.nodes)
  assert.deepEqual([sconce.mount, sconce.at.map((v) => Math.round(v * 100) / 100), sconce.y], ['wall', [3, 4.8], 1.6])
  const pendant = worldPose(mounted.nodes.pendant, mounted.nodes)
  assert.deepEqual([pendant.mount, pendant.at, Math.round(pendant.y * 100) / 100], ['ceiling', [2, 3.5], 2.2])
  const [living] = roomFacts(mounted, ['Living'])
  assert.deepEqual([living!.counts.lights.wall, living!.counts.lights.ceiling], [1, 1])
})

test('changed zones: items added, moved or removed, floors and walls refinished', async () => {
  const { changedZones } = await import('./room-facts.ts')
  const start = { nodes: { ...graph.nodes, slab_b: { id: 'slab_b', type: 'slab', polygon: [[10, 0], [12, 0], [12, 2], [10, 2]], slots: { surface: 'library:oak' } } } }
  assert.deepEqual(changedZones(start, start), [])
  const moved = { nodes: { ...start.nodes, lamp: { ...start.nodes.lamp, position: [3, 0, 4.6] } } }
  assert.deepEqual(changedZones(moved, start), ['zone_a'])
  const floored = { nodes: { ...start.nodes, slab_b: { ...start.nodes.slab_b, slots: { surface: 'library:tile' } } } }
  assert.deepEqual(changedZones(floored, start), ['zone_b'])
  const { art: _art, ...rest } = start.nodes
  assert.deepEqual(changedZones({ nodes: rest }, start), ['zone_a'])
})
