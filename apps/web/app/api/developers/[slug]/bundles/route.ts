import { publishBundle } from '@/lib/server/developers'
import { assertSameOrigin, handle } from '@/lib/server/http'

type Context = { params: Promise<{ slug: string }> }
export const POST = (request: Request, { params }: Context) => handle('varpet-developers', async () => {
  assertSameOrigin(request)
  return publishBundle(request, (await params).slug)
})
