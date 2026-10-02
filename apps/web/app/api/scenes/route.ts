import { z } from 'zod'
import { apiGraphSchema } from '@/lib/scenes/graph-schema'
import { json, readJson, storeError } from '@/lib/scenes/http'
import { getSceneStore } from '@/lib/scenes/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const createSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(200),
  projectId: z.string().min(1).max(200).nullable().optional(),
  /** Optional; a new scene starts empty and the editor fills Pascal's default site on first load. */
  graph: apiGraphSchema.optional(),
})

const listSchema = z.object({
  projectId: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = listSchema.safeParse({
    projectId: url.searchParams.get('projectId') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) return json({ error: 'invalid_request', details: parsed.error.issues }, { status: 400 })
  const scenes = await (await getSceneStore()).list(parsed.data)
  return json({ scenes })
}

export async function POST(request: Request) {
  const read = await readJson(request)
  if (!read.ok) return read.response
  const parsed = createSchema.safeParse(read.body)
  if (!parsed.success) return json({ error: 'invalid_request', details: parsed.error.issues }, { status: 400 })
  try {
    const meta = await (await getSceneStore()).save({
      id: parsed.data.id,
      name: parsed.data.name,
      projectId: parsed.data.projectId ?? null,
      graph: (parsed.data.graph ?? { nodes: {}, rootNodeIds: [] }) as never,
    })
    return json(meta, { status: 201, headers: { Location: `/editor/${meta.id}` } })
  } catch (error) {
    return storeError(error)
  }
}
