import { studio } from '@/lib/server/developers'
import { handle } from '@/lib/server/http'

export const GET = (request: Request) => handle('varpet-developers', () => studio(request))
