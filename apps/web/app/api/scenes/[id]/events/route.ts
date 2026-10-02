// Ported from Pascal (MIT), apps/editor/app/api/scenes/[id]/events/route.ts.
// SSE of scene_events rows: every event is a full {eventId, sceneId, version, kind, createdAt, graph}.
import type { SceneEvent } from '@pascal-app/mcp/storage/types'
import { json } from '@/lib/scenes/http'
import { getEventStore } from '@/lib/scenes/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const POLL_MS = 250
const HEARTBEAT_MS = 15_000
const MAX_EVENTS_PER_POLL = 50
const TAIL_PAGE = 200

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params
  const store = await getEventStore()
  if (!(await store.load(id))) return json({ error: 'not_found' }, { status: 404 })

  const url = new URL(request.url)
  const afterParam = url.searchParams.get('after') ?? request.headers.get('Last-Event-ID')
  const after = afterParam === null ? Number.NaN : Number.parseInt(afterParam, 10)

  // Without a cursor, skip history: start at the newest event and send only that one (the client drops it
  // unless its version is newer than the page it rendered). With a cursor, replay from there.
  let cursor = 0
  let initial: SceneEvent | null = null
  if (Number.isFinite(after) && after >= 0) {
    cursor = after
  } else {
    for (;;) {
      const page = await store.listSceneEvents(id, { afterEventId: cursor, limit: TAIL_PAGE })
      if (page.length === 0) break
      initial = page[page.length - 1] ?? null
      cursor = initial?.eventId ?? cursor
      if (page.length < TAIL_PAGE) break
    }
  }

  const encoder = new TextEncoder()
  let closed = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk))
      }
      const send = (event: SceneEvent) => enqueue(`id: ${event.eventId}\nevent: scene\ndata: ${JSON.stringify(event)}\n\n`)
      const close = () => {
        if (closed) return
        closed = true
        clearTimeout(pollTimer)
        clearInterval(heartbeatTimer)
        try {
          controller.close()
        } catch {
          // already closed by the client
        }
      }

      request.signal.addEventListener('abort', close, { once: true })
      enqueue('retry: 1000\n\n')
      if (initial) send(initial)

      const poll = async () => {
        if (closed) return
        try {
          const events = await store.listSceneEvents(id, { afterEventId: cursor, limit: MAX_EVENTS_PER_POLL })
          for (const event of events) {
            cursor = event.eventId
            send(event)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          enqueue(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
        } finally {
          if (!closed) pollTimer = setTimeout(poll, POLL_MS)
        }
      }

      heartbeatTimer = setInterval(() => enqueue(': keepalive\n\n'), HEARTBEAT_MS)
      void poll()
    },
    cancel() {
      closed = true
      clearTimeout(pollTimer)
      clearInterval(heartbeatTimer)
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  })
}
