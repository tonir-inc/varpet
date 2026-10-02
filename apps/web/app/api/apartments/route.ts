import { createApartment, listApartments } from '@/lib/server/accounts'
import { assertSameOrigin, handle } from '@/lib/server/http'

const ERROR = 'Your account request could not be completed. Please try again.'
export const GET = (request: Request) => handle('varpet-accounts', () => listApartments(request), ERROR)
export const POST = (request: Request) => handle('varpet-accounts', () => { assertSameOrigin(request); return createApartment(request) }, ERROR)
