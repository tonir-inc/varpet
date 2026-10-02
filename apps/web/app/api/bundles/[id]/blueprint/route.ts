import { blueprint } from '@/lib/server/developers'
import { handle } from '@/lib/server/http'

type Context = { params: Promise<{ id: string }> }
export const GET = (_request: Request, { params }: Context) => handle('varpet-developers', async () => blueprint((await params).id))
