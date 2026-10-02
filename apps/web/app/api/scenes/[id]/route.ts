import { isProposalBusy } from '@varpet/agents'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { countGraphNodes, isEmptyGraphOverwrite } from '@/lib/scenes/empty-graph-guard'
import { apiGraphSchema } from '@/lib/scenes/graph-schema'
import { json, parseIfMatch, readJson, storeError } from '@/lib/scenes/http'
import { getSceneStore } from '@/lib/scenes/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const putSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  graph: apiGraphSchema,
  thumbnailUrl: z.string().url().nullable().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  /** Overwriting a populated scene with an empty graph is refused (409 `empty_graph_rejected`) unless set. */
  force: z.boolean().optional(),
})

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params
  try {
    const scene = await (await getSceneStore()).load(id)
    if (!scene) return json({ error: 'not_found' }, { status: 404 })
    const { graph, ...meta } = scene
    return json({ meta, graph }, { headers: { ETag: `"${meta.version}"` } })
  } catch (error) {
    return storeError(error)
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params
  const read = await readJson(request)
  if (!read.ok) return read.response
  const parsed = putSchema.safeParse(read.body)
  if (!parsed.success) return json({ error: 'invalid_request', details: parsed.error.issues }, { status: 400 })

  const store = await getSceneStore()
  try {
    const existing = await store.load(id)
    if (!existing) return json({ error: 'not_found' }, { status: 404 })
    if (!parsed.data.force && isEmptyGraphOverwrite(countGraphNodes(parsed.data.graph), existing.nodeCount)) {
      return json(
        { error: 'empty_graph_rejected', currentVersion: existing.version, currentNodeCount: existing.nodeCount },
        { status: 409 },
      )
    }
    // The store refuses to overwrite an existing id without an expected version, so one is always passed.
    const expectedVersion = parseIfMatch(request.headers.get('If-Match')) ?? parsed.data.expectedVersion ?? existing.version
    const meta = await store.save({
      id,
      name: parsed.data.name ?? existing.name,
      projectId: existing.projectId,
      ownerId: existing.ownerId,
      graph: parsed.data.graph as never,
      thumbnailUrl: parsed.data.thumbnailUrl === undefined ? existing.thumbnailUrl : parsed.data.thumbnailUrl,
      expectedVersion,
    })
    return json(meta, { headers: { ETag: `"${meta.version}"` } })
  } catch (error) {
    return storeError(error, id)
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params
  if (isProposalBusy(id)) {
    return json({ error: 'agent_working', details: 'An agent is still working on this scene.' }, { status: 409 })
  }
  try {
    const removed = await (await getSceneStore()).delete(id, {
      expectedVersion: parseIfMatch(request.headers.get('If-Match')),
    })
    if (!removed) return json({ error: 'not_found' }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return storeError(error, id)
  }
}
