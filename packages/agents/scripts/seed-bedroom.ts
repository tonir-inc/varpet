// Dev helper: save an empty 3.6 x 4.2 m bedroom (walls, slab, ceiling, one door) into the shared scene store
// and print its editor URL. Run: node packages/agents/scripts/seed-bedroom.ts
import { join, resolve } from 'node:path'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { CeilingNode, DoorNode, SlabNode, WallNode, ZoneNode } from '@pascal-app/core/schema'

const root = resolve(import.meta.dirname, '../../..')
const dataDir = resolve(process.env.VARPET_DATA_DIR ?? join(root, '.data'))
const store = await createSceneStore({ ...process.env, PASCAL_DB_PATH: process.env.PASCAL_DB_PATH ?? join(dataDir, 'pascal.db') })

const bridge = new SceneBridge()
bridge.loadDefault()
const levelId = Object.values(bridge.getNodes()).find((n) => n.type === 'level')!.id
const polygon: Array<[number, number]> = [[0, 0], [3.6, 0], [3.6, 4.2], [0, 4.2]]
const walls = polygon.map((start, i) =>
  WallNode.parse({ name: `Bedroom wall ${i + 1}`, start, end: polygon[(i + 1) % polygon.length], thickness: 0.12, height: 2.8 }),
)
bridge.applyPatch([
  { op: 'create', node: ZoneNode.parse({ name: 'Bedroom', polygon }), parentId: levelId },
  { op: 'create', node: SlabNode.parse({ polygon }), parentId: levelId },
  { op: 'create', node: CeilingNode.parse({ polygon }), parentId: levelId },
  ...walls.map((node) => ({ op: 'create' as const, node, parentId: levelId })),
] as never)
const door = DoorNode.parse({ wallId: walls[0]!.id, parentId: walls[0]!.id, position: [0.6, 1.05, 0], width: 0.9, height: 2.1 })
bridge.createNode(door as never, walls[0]!.id as never)
const scene = await store.save({ name: 'Bedroom', graph: bridge.exportJSON() })
console.log(`http://localhost:3010/editor/${scene.id}`)
