import { search } from '@/lib/server/catalog'

export const GET = (request: Request) => search(request)
