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
