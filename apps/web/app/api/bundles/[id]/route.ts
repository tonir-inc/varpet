import { deleteBundle, getBundle, updateBundle } from '@/lib/server/developers'
import { assertSameOrigin, handle } from '@/lib/server/http'

type Context = { params: Promise<{ id: string }> }
export const GET = (_request: Request, { params }: Context) => handle('varpet-developers', async () => getBundle((await params).id))
export const PUT = (request: Request, { params }: Context) => handle('varpet-developers', async () => {
  assertSameOrigin(request)
  return updateBundle(request, (await params).id)
})
export const DELETE = (request: Request, { params }: Context) => handle('varpet-developers', async () => {
  assertSameOrigin(request)
  return deleteBundle(request, (await params).id)
})
