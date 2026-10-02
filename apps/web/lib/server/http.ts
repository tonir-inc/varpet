// Shared HTTP plumbing for the portal API routes: v1's error shapes, JSON bodies, cookies and same-origin checks.
import { createHash } from 'node:crypto'

export const COOKIE_NAME = 'varpet_session'
const TOKEN = /^[A-Za-z0-9_-]{43}$/

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {}) {
    super(message)
  }
}
export const badRequest = (message: string) => new HttpError(400, 'invalid_request', message)

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function json(status: number, data: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  })
}

/** v1's readBody: application/json only (415), size-limited (413), a JSON object (400). */
export async function readJson(request: Request, limit: number, tooLarge = 'This request is too large. Reduce attached source images and try again.'): Promise<Record<string, unknown>> {
  if ((request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'content_type', 'Send this request as application/json.')
  }
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'body_too_large', tooLarge)
  let text = ''
  if (request.body) {
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > limit) { void reader.cancel().catch(() => {}); throw new HttpError(413, 'body_too_large', tooLarge) }
        chunks.push(value)
      }
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw badRequest('The request could not be read.')
    }
    text = Buffer.concat(chunks).toString('utf8')
  }
  let value: unknown
  try { value = JSON.parse(text || '{}') } catch { throw badRequest('The request contains invalid JSON.') }
  if (!isObject(value)) throw badRequest('Send a JSON object.')
  return value
}

export function cookieToken(request: Request): string | null {
  const cookie = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`))
  const token = cookie?.slice(COOKIE_NAME.length + 1)
  return token && TOKEN.test(token) ? token : null
}

/** The origin the browser sees: VARPET_PUBLIC_ORIGIN when set, else the request's own (proxy headers first). */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  const protocol = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return `${protocol}://${host}`
}
export function publicOrigin(request: Request): string {
  const configured = process.env.VARPET_PUBLIC_ORIGIN
  if (configured) { try { return new URL(configured).origin } catch { /* fall back to the request */ } }
  return requestOrigin(request)
}

/** v1: writes must carry an Origin header naming this site, and never come cross-site. */
export function assertSameOrigin(request: Request, message = 'This request must come from the Varpet page.'): void {
  const origin = request.headers.get('origin')
  const allowed = new Set([requestOrigin(request), new URL(request.url).origin])
  for (const name of ['VARPET_PUBLIC_ORIGIN', 'VARPET_APP_ORIGIN']) {
    const value = process.env[name]
    if (value) { try { allowed.add(new URL(value).origin) } catch { /* ignore a malformed setting */ } }
  }
  if (!origin || !allowed.has(origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'origin_mismatch', message)
  }
}

export function sessionCookie(request: Request, token: string, maxAge: number): string {
  const secure = publicOrigin(request).startsWith('https:')
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

export function methodNotAllowed(methods: string[]): HttpError {
  return new HttpError(405, 'method_not_allowed', 'This endpoint does not support that method.', {}, { Allow: methods.join(', ') })
}

/** Runs a route body; HttpError becomes v1's `{error, code, ...details}`, anything else a generic 500. */
export async function handle(label: string, action: () => Promise<Response> | Response, fallback = 'This request could not be completed. Please try again.'): Promise<Response> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message, code: error.code, ...error.details }, error.headers)
    const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'INTERNAL_ERROR'
    console.error(`[${label}] Unexpected request failure`, { type: (error as Error)?.constructor?.name ?? 'Error', code })
    return json(500, { error: fallback, code: 'server_error' })
  }
}
