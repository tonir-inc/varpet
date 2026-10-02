import { setApartmentSharing } from '@/lib/server/accounts'
import { assertSameOrigin, handle } from '@/lib/server/http'

type Context = { params: Promise<{ id: string }> }
export const PUT = (request: Request, { params }: Context) => handle('varpet-accounts', async () => {
  assertSameOrigin(request)
  return setApartmentSharing(request, (await params).id)
}, 'Your account request could not be completed. Please try again.')
