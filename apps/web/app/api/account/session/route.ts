import { session } from '@/lib/server/accounts'
import { handle } from '@/lib/server/http'

export const GET = (request: Request) => handle('varpet-accounts', () => session(request), 'Your account request could not be completed. Please try again.')
