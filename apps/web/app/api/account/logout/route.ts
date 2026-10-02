import { logout } from '@/lib/server/accounts'
import { assertSameOrigin, handle } from '@/lib/server/http'

export const POST = (request: Request) => handle('varpet-accounts', () => { assertSameOrigin(request); return logout(request) },
  'Your account request could not be completed. Please try again.')
