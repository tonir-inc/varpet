import { createDeveloper, listDevelopers } from '@/lib/server/developers'
import { assertSameOrigin, handle } from '@/lib/server/http'

export const GET = () => handle('varpet-developers', () => listDevelopers())
export const POST = (request: Request) => handle('varpet-developers', () => { assertSameOrigin(request); return createDeveloper(request) })
