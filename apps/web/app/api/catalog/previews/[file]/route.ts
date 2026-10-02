import { relay } from '@/lib/server/catalog'

type Context = { params: Promise<{ file: string }> }
export const GET = async (request: Request, { params }: Context) => relay(request, 'previews', (await params).file)
