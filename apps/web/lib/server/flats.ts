// Team saves (v1 apps/editor/server/flats.mjs): a checked pass-through to the catalog service's /flats API.
import { catalogBase } from './catalog'
import { assertSameOrigin, HttpError, readJson } from './http'

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const ROUTE = new RegExp(`^/api/flats(?:/(${UUID})(?:/(thumbnail|versions|restore)(?:/([1-9][0-9]*))?)?)?$`)
const revision = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0
const MAX_BODY = 25 * 1024 * 1024

class FlatError extends Error { constructor(readonly status: number, message: string) { super(message) } }
const send = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function proxyFlats(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const match = ROUTE.exec(url.pathname)
    if (!match) throw new FlatError(400, 'Invalid flat path.')
    const [, id, action, version] = match
    if (version && (action !== 'versions' || !revision(Number(version)))) throw new FlatError(400, 'Invalid revision.')
    const allowed = !id ? ['GET', 'POST'] : !action ? ['GET', 'PUT', 'PATCH', 'DELETE'] : action === 'restore' ? ['POST'] : ['GET']
    if (!allowed.includes(request.method)) throw new FlatError(405, 'Method not allowed.')
    const params = url.searchParams
    if ([...params].some(([key, value]) => id || request.method !== 'GET' || key !== 'include_deleted' || !['0', '1'].includes(value))) throw new FlatError(400, 'Invalid query.')
    let body: Record<string, unknown> | undefined
    if (request.method !== 'GET') {
      try { assertSameOrigin(request) } catch { throw new FlatError(403, 'Same-origin writes only.') }
      if (request.method !== 'DELETE') {
        try { body = await readJson(request, MAX_BODY, 'Body exceeds 25 MB.') }
        catch (error) {
          if (error instanceof HttpError) throw new FlatError(error.status, error.status === 415 ? 'Send application/json.' : error.status === 413 ? 'Body exceeds 25 MB.' : 'Invalid JSON.')
          throw error
        }
        if (request.method === 'PUT' && !revision(body.base_revision) || action === 'restore' && !revision(body.revision)) throw new FlatError(400, 'Invalid revision.')
      }
    }
    const query = [...params].length ? `?${params}` : ''
    const upstream = await fetch(new URL(`${url.pathname.slice('/api/'.length)}${query}`, catalogBase()), {
      method: request.method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000), redirect: 'error', cache: 'no-store',
    })
    const bytes = new Uint8Array(await upstream.arrayBuffer())
    return new Response(bytes, { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) {
    if (error instanceof FlatError) return send(error.status, { error: { code: 'invalid_request', message: error.message } })
    return send((error as Error)?.name === 'TimeoutError' ? 504 : 502, { error: { code: 'unavailable', message: 'Team saves service unavailable.' } })
  }
}
