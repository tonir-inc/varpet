// Shared shapes between lanes. Change only with a note in CONTRACTS.md; every lane imports from here.

/** A purchasable catalog product, as the web app and the scene MCP see it. Sizes in metres. */
export interface Product {
  id: string
  name: string
  kind: string
  /** Pascal order: width, height, depth. The catalog stores [w, d, h]; convert at the catalog boundary. */
  dimensions: [number, number, number]
  priceAmd: number | null
  shop: string | null
  /** Absolute https URL the browser can load (public origin, never the tailnet host). */
  glbUrl: string
  thumbnailUrl: string | null
  colors?: string[]
  styles?: string[]
}

export type AgentRole = 'architect' | 'designer'

/** POST /api/agents/{role}/turn body. */
export interface TurnRequest {
  sceneId: string
  /** Absent on the first turn; the `session` event returns it. */
  conversationId?: string
  message: string
  /** data: URLs (jpeg/png/webp), e.g. a floor plan or an inspiration photo. */
  images?: string[]
}

/** One NDJSON line of the turn response stream, in order: session, then any of progress/message_delta/tool/
 * rate_limit, then at most one proposal, then exactly one done or error. */
export type AgentEvent =
  | { type: 'session'; conversationId: string; role: AgentRole; proposalSceneId: string | null }
  | { type: 'progress'; text: string }
  | { type: 'message_delta'; text: string }
  | { type: 'tool'; id: string; name: string; input: unknown; status: 'running' | 'done' | 'error'; summary?: string }
  | { type: 'rate_limit'; status: string; resetsAt: number | null }
  | { type: 'proposal'; baseSceneId: string; proposalSceneId: string; summary: string; products: ProposalProduct[] }
  | { type: 'done'; conversationId: string; durationMs: number }
  | { type: 'error'; message: string }

export interface ProposalProduct {
  productId: string
  name: string
  priceAmd: number | null
  shop: string | null
  count: number
}

/** A camera for POST /api/render, in level coordinates (metres, y up). The scene MCP computes it (view_scene). */
export interface RenderCamera {
  projection: 'perspective'
  position: [number, number, number]
  target: [number, number, number]
  /** Camera up vector; default [0, 1, 0]. A straight-down top view needs another, e.g. [0, 0, -1]. */
  up?: [number, number, number]
  /** Vertical field of view in degrees; default 50. A plan-like top view uses a narrow lens from high up. */
  fov?: number
}

/** POST /api/render body: draw this graph from this camera with the editor's look. Internal callers only. */
export interface RenderRequest {
  /** A Pascal scene graph ({nodes, rootNodeIds, ...}), as the scene MCP exports it. */
  graph: unknown
  camera: RenderCamera
  /** Pascal wall mode: walls standing, cut away toward the camera, or low. */
  wallMode: 'up' | 'cutaway' | 'down'
  /** Hide ceilings (top and 3/4 views look in from above). */
  hideCeilings?: boolean
  /** Image size in pixels; width 256..2048, height 256..2048. */
  width: number
  height: number
}

/** POST /api/render response. */
export interface RenderResponse {
  /** JPEG, base64 (no data: prefix). */
  image: string
  mimeType: 'image/jpeg'
  /** The renderer three.js ended up on: WebGPU, or the WebGL2 fallback. */
  backend: 'webgpu' | 'webgl'
  width: number
  height: number
  /** Time spent in the renderer for this job (queue wait excluded), and the wait in the queue. */
  renderMs: number
  queuedMs: number
  /** This job started the browser or loaded the render page first. */
  cold: boolean
}
