// Proof of the agents lane: build a one-bedroom test scene, run ONE real designer turn (spends Felix's
// subscription), print every AgentEvent, then show the proposal graph's item nodes and their product ids.
// Run: node packages/agents/scripts/prove-designer.ts   (env: VARPET_CATALOG_URL, VARPET_PUBLIC_ORIGIN optional)
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'
import { CeilingNode, DoorNode, SlabNode, WallNode, ZoneNode } from '@pascal-app/core/schema'
import { runTurn } from '../src/index.ts'

const root = resolve(import.meta.dirname, '../../..')
const dataDir = join(root, '.data/prove')
mkdirSync(dataDir, { recursive: true })
const dbPath = join(dataDir, 'pascal.db')
const env = { ...process.env, VARPET_DATA_DIR: dataDir, PASCAL_DB_PATH: dbPath }
const store = await createSceneStore(env)

// A 3.6 x 4.2 m bedroom: walls on the room's edges, a door near one corner of the first wall.
const bridge = new SceneBridge()
bridge.loadDefault()
const levelId = Object.values(bridge.getNodes()).find((n) => n.type === 'level')!.id
const polygon: Array<[number, number]> = [[0, 0], [3.6, 0], [3.6, 4.2], [0, 4.2]]
const zone = ZoneNode.parse({ name: 'Bedroom', polygon })
const walls = polygon.map((start, i) =>
  WallNode.parse({ name: `Bedroom wall ${i + 1}`, start, end: polygon[(i + 1) % polygon.length], thickness: 0.12, height: 2.8 }),
)
bridge.applyPatch([
  { op: 'create', node: zone, parentId: levelId },
  { op: 'create', node: SlabNode.parse({ polygon }), parentId: levelId },
  { op: 'create', node: CeilingNode.parse({ polygon }), parentId: levelId },
  ...walls.map((node) => ({ op: 'create' as const, node, parentId: levelId })),
] as never)
const door = DoorNode.parse({ wallId: walls[0]!.id, parentId: walls[0]!.id, position: [0.6, 1.05, 0], width: 0.9, height: 2.1 })
bridge.createNode(door as never, walls[0]!.id as never)
const scene = await store.save({ name: `Proof bedroom ${new Date().toISOString().slice(0, 16)}`, graph: bridge.exportJSON() })
console.log(`# test scene ${scene.id}: one bedroom 3.6 x 4.2 m, door on the wall from (0,0) to (3.6,0) at x 0.15-1.05`)

const rawPath = join(dataDir, `raw-${scene.id}.ndjson`)
writeFileSync(rawPath, '')
const message = 'put a double bed and two bedside tables in the bedroom'
console.log(`# designer turn: "${message}"`)
let proposalSceneId: string | null = null
for await (const event of runTurn('designer', { sceneId: scene.id, message }, { root, env, onRawLine: (l) => appendFileSync(rawPath, `${l}\n`) })) {
  console.log(JSON.stringify(event))
  if (event.type === 'session') proposalSceneId = event.proposalSceneId
}
console.log(`# raw stream-json: ${rawPath}`)

if (!proposalSceneId) throw new Error('no proposal scene')
const proposal = await store.load(proposalSceneId)
const items = Object.values(proposal!.graph.nodes).filter((n) => (n as { type: string }).type === 'item') as unknown as Array<{
  id: string
  position: number[]
  rotation: number[]
  asset: { name: string; src: string; dimensions: number[] }
  metadata: Record<string, unknown>
}>
console.log(`# proposal ${proposalSceneId} item nodes:`)
for (const item of items) {
  console.log(JSON.stringify({ id: item.id, productId: item.metadata.productId, priceAmd: item.metadata.priceAmd, shop: item.metadata.shop, name: item.asset.name, src: item.asset.src, dimensions: item.asset.dimensions, position: item.position, rotationY: item.rotation[1] }))
}
const base = await store.load(scene.id)
console.log(`# base scene ${scene.id} item nodes: ${Object.values(base!.graph.nodes).filter((n) => (n as { type: string }).type === 'item').length}`)
if (!items.some((item) => typeof item.metadata.productId === 'string')) process.exit(1)
