import { z } from 'zod'
import { json, parseIfMatch, readJson, storeError } from '@/lib/scenes/http'
import { getEventStore } from '@/lib/scenes/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const applySchema = z.object({ proposalSceneId: z.string().min(1).max(64) })

/** Copies the proposal graph onto the base scene, tells open editors (scene_events), deletes the proposal. */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params
  const read = await readJson(request)
  if (!read.ok) return read.response
  const parsed = applySchema.safeParse(read.body)
  if (!parsed.success) return json({ error: 'invalid_request', details: parsed.error.issues }, { status: 400 })
  const { proposalSceneId } = parsed.data
  if (proposalSceneId === id) return json({ error: 'invalid_request', details: 'proposal is the base scene' }, { status: 400 })

  const store = await getEventStore()
  try {
    const [base, proposal] = await Promise.all([store.load(id), store.load(proposalSceneId)])
    if (!base) return json({ error: 'not_found', details: `scene ${id}` }, { status: 404 })
    if (!proposal) return json({ error: 'not_found', details: `proposal ${proposalSceneId}` }, { status: 404 })

    const meta = await store.save({
      id,
      name: base.name,
      projectId: base.projectId,
      ownerId: base.ownerId,
      thumbnailUrl: base.thumbnailUrl,
      graph: proposal.graph,
      expectedVersion: parseIfMatch(request.headers.get('If-Match')) ?? base.version,
    })
    await store.appendSceneEvent({ sceneId: id, version: meta.version, kind: 'apply', graph: proposal.graph })
    await store.delete(proposalSceneId)
    return json(meta, { headers: { ETag: `"${meta.version}"` } })
  } catch (error) {
    return storeError(error, id)
  }
}
