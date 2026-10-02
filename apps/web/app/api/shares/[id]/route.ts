import { readShare, revokeShare, shareMethodNotAllowed } from '@/lib/server/shares'

type Context = { params: Promise<{ id: string }> }
export const GET = async (request: Request, { params }: Context) => readShare(request, (await params).id)
export const DELETE = async (request: Request, { params }: Context) => revokeShare(request, (await params).id)
/** v1 replaced the shared snapshot; in v2 the scene lives in the Pascal store, so there is nothing to replace. */
export const PUT = (request: Request) => shareMethodNotAllowed(request, 'GET, DELETE')
