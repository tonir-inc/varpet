import { NextResponse } from 'next/server'
import { getSceneStore } from './store'

export function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init)
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await request.json() }
  } catch {
    return { ok: false, response: json({ error: 'invalid_request', details: 'body must be valid JSON' }, { status: 400 }) }
  }
}

/** `If-Match: "<version>"`, `W/"<version>"` or a bare integer; undefined when absent, `*` or unparseable. */
export function parseIfMatch(raw: string | null): number | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (trimmed === '*') return undefined
  const match = trimmed.match(/^(?:W\/)?"([^"]+)"$/)
  const n = Number(match ? match[1] : trimmed)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

/** Maps the store's typed errors to HTTP; a version conflict reports the current version when it can. */
export async function storeError(error: unknown, sceneId?: string): Promise<NextResponse> {
  const code = (error as { code?: string })?.code
  if (code === 'version_conflict') {
    let currentVersion: number | undefined
    if (sceneId) {
      const current = await (await getSceneStore()).load(sceneId).catch(() => null)
      currentVersion = current?.version
    }
    return json({ error: 'version_conflict', currentVersion }, { status: 409 })
  }
  if (code === 'not_found') return json({ error: 'not_found' }, { status: 404 })
  if (code === 'too_large') return json({ error: 'too_large' }, { status: 413 })
  if (code === 'invalid') return json({ error: 'invalid', message: (error as Error).message }, { status: 400 })
  const message = error instanceof Error ? error.message : 'unexpected_error'
  return json({ error: 'internal_error', message }, { status: 500 })
}
