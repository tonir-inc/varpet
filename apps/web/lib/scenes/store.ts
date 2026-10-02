import path from 'node:path'
import type { SceneStore } from '@pascal-app/mcp/storage'

// One SQLite scene store per server process, shared with every scene MCP process through PASCAL_DB_PATH.
// Cached on globalThis so dev HMR does not open a new database handle per edit.
const globalKey = Symbol.for('varpet.sceneStore')
type GlobalWithStore = typeof globalThis & { [globalKey]?: Promise<SceneStore> }

export function scenesDbPath(): string {
  return process.env.PASCAL_DB_PATH || path.resolve(process.cwd(), '.data/pascal.db')
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
