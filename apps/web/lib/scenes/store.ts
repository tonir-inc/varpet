import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SceneStore } from '@pascal-app/mcp/storage'

// One SQLite scene store per server process, shared with every scene MCP process through PASCAL_DB_PATH.
// Cached on globalThis so dev HMR does not open a new database handle per edit.
const globalKey = Symbol.for('varpet.sceneStore')
type GlobalWithStore = typeof globalThis & { [globalKey]?: Promise<SceneStore> }

/** Same default as the agent runner (`packages/agents`): `$VARPET_DATA_DIR/pascal.db`, else `<repo root>/.data`. */
export function scenesDbPath(): string {
  if (process.env.PASCAL_DB_PATH) return path.resolve(process.env.PASCAL_DB_PATH)
  if (process.env.VARPET_DATA_DIR) return path.resolve(process.env.VARPET_DATA_DIR, 'pascal.db')
  return path.join(repoRoot(), '.data', 'pascal.db')
}

function repoRoot(): string {
  if (process.env.VARPET_ROOT) return path.resolve(process.env.VARPET_ROOT)
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    if (path.dirname(dir) === dir) return process.cwd()
  }
}

export function getSceneStore(): Promise<SceneStore> {
  const g = globalThis as GlobalWithStore
  if (!g[globalKey]) {
    g[globalKey] = (async () => {
      const mod = await import('@pascal-app/mcp/storage')
      return mod.createSceneStore({ ...process.env, PASCAL_DB_PATH: scenesDbPath() })
    })()
  }
  return g[globalKey]
}

/** The store's optional event methods, asserted present (the SQLite backend has both). */
export async function getEventStore() {
  const store = await getSceneStore()
  if (!store.appendSceneEvent || !store.listSceneEvents) throw new Error('scene store has no scene_events')
  return store as SceneStore & Required<Pick<SceneStore, 'appendSceneEvent' | 'listSceneEvents'>>
}
