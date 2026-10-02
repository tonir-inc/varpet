import { getDeveloper, updateDeveloper } from '@/lib/server/developers'
import { assertSameOrigin, handle } from '@/lib/server/http'

type Context = { params: Promise<{ slug: string }> }
export const GET = (request: Request, { params }: Context) => handle('varpet-developers', async () => getDeveloper(request, (await params).slug))
export const PUT = (request: Request, { params }: Context) => handle('varpet-developers', async () => {
  assertSameOrigin(request)
  return updateDeveloper(request, (await params).slug)
})
