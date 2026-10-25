// Dev helper: save an empty scene (Pascal's default site, building and level) into the shared scene store and print
// its id and editor URL. Run: node --experimental-strip-types packages/agents/scripts/new-scene.ts [name]
import { join, resolve } from 'node:path'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'

const root = resolve(import.meta.dirname, '../../..')
const dataDir = resolve(process.env.VARPET_DATA_DIR ?? join(root, '.data'))
const store = await createSceneStore({ ...process.env, PASCAL_DB_PATH: process.env.PASCAL_DB_PATH ?? join(dataDir, 'pascal.db') })

const bridge = new SceneBridge()
bridge.loadDefault()
const scene = await store.save({ name: process.argv[2] ?? 'Empty scene', graph: bridge.exportJSON() })
console.log(`${scene.id} http://localhost:3010/editor/${scene.id}`)
