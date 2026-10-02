import { getApartment, updateApartment } from '@/lib/server/accounts'
import { assertSameOrigin, handle } from '@/lib/server/http'

type Context = { params: Promise<{ id: string }> }
const ERROR = 'Your account request could not be completed. Please try again.'
export const GET = (request: Request, { params }: Context) => handle('varpet-accounts', async () => getApartment(request, (await params).id), ERROR)
export const PUT = (request: Request, { params }: Context) => handle('varpet-accounts', async () => {
  assertSameOrigin(request)
  return updateApartment(request, (await params).id)
}, ERROR)
