import { item } from '@/lib/server/catalog'

type Context = { params: Promise<{ id: string }> }
export const GET = async (request: Request, { params }: Context) => item(request, (await params).id)
