// POST /api/render: internal callers only (the scene MCP's view_scene). Validates the RenderRequest, runs it through
// the queue and answers a RenderResponse, or {error} with 400/403/503/504/500.
import type { RenderRequest, RenderResponse } from '@varpet/contracts'
import { z } from 'zod'
import { RenderError, type RenderQueue } from './queue.ts'

const vec3 = z.tuple([z.number(), z.number(), z.number()])

const RenderRequestSchema = z.object({
  graph: z.object({ nodes: z.record(z.string(), z.unknown()), rootNodeIds: z.array(z.string()) }).passthrough(),
  camera: z.object({
    projection: z.literal('perspective'),
    position: vec3,
    target: vec3,
    up: vec3.optional(),
    fov: z.number().min(10).max(120).optional(),
  }),
  wallMode: z.enum(['up', 'cutaway', 'down']),
  hideCeilings: z.boolean().optional(),
  width: z.number().int().min(256).max(2048),
  height: z.number().int().min(256).max(2048),
})

export const RENDER_TOKEN_HEADER = 'x-varpet-render-token'
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * With VARPET_RENDER_TOKEN set, the caller must send it. Without, only requests addressed to a loopback host pass
 * (a public reverse proxy forwards its own Host, so outside callers fail).
 */
export function renderAllowed(request: Request, token: string | undefined) {
  if (token) return request.headers.get(RENDER_TOKEN_HEADER) === token
  const host = request.headers.get('host') ?? new URL(request.url).host
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]!
  return LOOPBACK.has(hostname)
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const STATUS: Record<RenderError['code'], number> = { render_busy: 503, render_timeout: 504, render_failed: 500 }

export async function handleRender(request: Request, queue: RenderQueue, token: string | undefined): Promise<Response> {
  if (!renderAllowed(request, token)) return json({ error: 'forbidden' }, 403)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'body must be a JSON RenderRequest' }, 400)
  }
  const parsed = RenderRequestSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return json({ error: `bad_request: ${issue?.path.join('.') || 'body'} ${issue?.message ?? ''}`.trim() }, 400)
  }
  const renderRequest = parsed.data as RenderRequest
  try {
    const result = await queue.render(renderRequest)
    // One line per render: how long it waited for a page and how long it drew (the eval sums these).
    console.log(`[render] slot ${result.slot} queued ${result.queuedMs} ms render ${result.renderMs} ms${result.cold ? ' cold' : ''} depth ${queue.depth}`)
    const response: RenderResponse = {
      image: result.image.toString('base64'),
      mimeType: 'image/jpeg',
      backend: result.backend,
      width: renderRequest.width,
      height: renderRequest.height,
      renderMs: result.renderMs,
      queuedMs: result.queuedMs,
      cold: result.cold,
    }
    return json(response)
  } catch (error) {
    if (error instanceof RenderError) return json({ error: error.message }, STATUS[error.code])
    return json({ error: `render_failed: ${error instanceof Error ? error.message : String(error)}` }, 500)
  }
}

/** GET /api/render: start the renderer ahead of the first job (the scene MCP calls it when it starts). */
export async function handleWarm(request: Request, warm: () => Promise<{ cold: boolean; ms: number }>, token: string | undefined) {
  if (!renderAllowed(request, token)) return json({ error: 'forbidden' }, 403)
  try {
    return json({ ready: true, ...(await warm()) })
  } catch (error) {
    return json({ error: `render_failed: ${error instanceof Error ? error.message : String(error)}` }, 500)
  }
}
