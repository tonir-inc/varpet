import { createShare, shareMethodNotAllowed } from '@/lib/server/shares'

export const POST = (request: Request) => createShare(request)
export const GET = (request: Request) => shareMethodNotAllowed(request, 'POST')
