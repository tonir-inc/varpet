// POST /api/agents/{architect|designer}/turn: TurnRequest in, one AgentEvent per NDJSON line out.
// Relative import until apps/web depends on @varpet/agents (workspace:*).
import { runTurn } from '../../../../../../../packages/agents/src/index'
import type { AgentEvent, AgentRole, TurnRequest } from '../../../../../../../packages/contracts/src/index'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

const ROLES: AgentRole[] = ['architect', 'designer']
const MAX_IMAGE_CHARS = 12_000_000

function ndjson(events: AgentEvent[], status = 200) {
  return new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(''), {
    status,
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
  })
}

export async function POST(request: Request, context: { params: Promise<{ role: string }> }) {
  const { role } = await context.params
  if (!ROLES.includes(role as AgentRole)) return ndjson([{ type: 'error', message: `unknown agent: ${role}` }], 404)
  let body: TurnRequest
  try {
    body = (await request.json()) as TurnRequest
  } catch {
    return ndjson([{ type: 'error', message: 'body must be a JSON TurnRequest' }], 400)
  }
  const images = Array.isArray(body?.images) ? body.images : []
  if (images.some((image) => typeof image !== 'string' || image.length > MAX_IMAGE_CHARS)) {
    return ndjson([{ type: 'error', message: 'images must be data: URLs under 9 MB each' }], 400)
  }
  const turn: TurnRequest = {
    sceneId: String(body?.sceneId ?? ''),
    message: String(body?.message ?? ''),
    images,
    ...(typeof body?.conversationId === 'string' ? { conversationId: body.conversationId } : {}),
  }

  const abort = new AbortController()
  request.signal.addEventListener('abort', () => abort.abort(), { once: true })
  const events = runTurn(role as AgentRole, turn, { signal: abort.signal })
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await events.next()
      if (next.done) controller.close()
      else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`))
    },
    async cancel() {
      abort.abort()
      await events.return(undefined)
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
