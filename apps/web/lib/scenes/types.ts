import type { SceneGraph } from '@pascal-app/editor'
import type { SceneEvent, SceneMeta } from '@pascal-app/mcp/storage/types'

export type { SceneMeta }

/** `GET /api/scenes/:id` body (CONTRACTS.md). */
export interface SceneResponse {
  meta: SceneMeta
  graph: SceneGraph
}

/** One `event: scene` payload on `GET /api/scenes/:id/events`. */
export type LiveSceneEvent = Omit<SceneEvent, 'graph'> & { graph: SceneGraph }
