// POST /api/render: RenderRequest in, RenderResponse (a JPEG of the graph with the editor's look) out.
// Internal: the scene MCP's view_scene calls it. See lib/render/ and CONTRACTS.md.
import { renderQueue, warmUp } from '@/lib/render/browser'
import { handleRender, handleWarm } from '@/lib/render/handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export const POST = (request: Request) => handleRender(request, renderQueue(), process.env.VARPET_RENDER_TOKEN)
export const GET = (request: Request) => handleWarm(request, () => warmUp(), process.env.VARPET_RENDER_TOKEN)
