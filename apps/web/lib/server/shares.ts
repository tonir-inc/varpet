// Sharing links (v1 apps/editor/server/sharing.ts). v1 stored a scene snapshot per link; in v2 the scene lives in
// the Pascal store, so a link is a capability on a `sceneId`: a view token (stored) and an edit token (hash only).
// Error bodies keep v1's `{reason}` shape.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { accountsDb } from './db'
import { isObject, json, readJson, HttpError } from './http'

const ID = /^[a-f0-9]{32}$/
const SCENE = /^[A-Za-z0-9_-]{1,120}$/
interface ShareRow { id: string; scene_id: string; view_token: string; edit_token_hash: string; version: number; updated_at: string }

class SharingError extends Error { constructor(readonly status: number, reason: string) { super(reason) } }
const hash = (token: string) => createHash('sha256').update(token).digest()

function send(status: number, data: unknown, headers: Record<string, string> = {}) {
  return json(status, data, { 'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer', ...headers })
}

/** v1 allows CLI clients without Origin, but never a cross-site browser. */
function sameOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  const allowed = [url.origin, `${request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')}://${host}`, process.env.VARPET_PUBLIC_ORIGIN]
  return allowed.includes(origin)
}

function bearer(request: Request): string {
  const value = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!value) throw new SharingError(401, 'A valid sharing link is required.')
  return value
}

function access(record: ShareRow, token: string): 'view' | 'edit' | null {
  const candidate = hash(token)
  if (timingSafeEqual(candidate, Buffer.from(record.edit_token_hash, 'hex'))) return 'edit'
  return timingSafeEqual(candidate, hash(record.view_token)) ? 'view' : null
}

async function run(request: Request, action: () => Promise<Response> | Response): Promise<Response> {
  try {
    if (!sameOrigin(request)) throw new SharingError(403, 'Sharing requests must come from this site.')
    return await action()
  } catch (error) {
    if (error instanceof SharingError) return send(error.status, { reason: error.message })
    if (error instanceof HttpError) return send(error.status, { reason: error.message })
    return send(503, { reason: 'Sharing storage is unavailable. Please try again.' })
  }
}

/** POST /api/shares {sceneId} -> 201 {id, sceneId, viewToken, editToken, version, updatedAt} */
export function createShare(request: Request) {
  return run(request, async () => {
    const body = await readJson(request, 16_384).catch(error => { throw new SharingError(error.status ?? 400, 'The shared project payload is invalid.') })
    if (!isObject(body) || Object.keys(body).some(key => key !== 'sceneId') || typeof body.sceneId !== 'string' || !SCENE.test(body.sceneId)) {
      throw new SharingError(400, 'The shared project payload is invalid.')
    }
    const id = randomBytes(16).toString('hex')
    const viewToken = randomBytes(32).toString('base64url'), editToken = randomBytes(32).toString('base64url')
    const updatedAt = new Date().toISOString()
    accountsDb().prepare('INSERT INTO shares (id, scene_id, view_token, edit_token_hash, version, updated_at) VALUES (?, ?, ?, ?, 1, ?)')
      .run(id, body.sceneId, viewToken, hash(editToken).toString('hex'), updatedAt)
    return send(201, { id, sceneId: body.sceneId, viewToken, editToken, version: 1, updatedAt })
  })
}

function load(request: Request, id: string) {
  if (!ID.test(id)) throw new SharingError(404, 'This sharing link is unavailable.')
  const token = bearer(request)
  const record = accountsDb().prepare('SELECT * FROM shares WHERE id = ?').get(id) as ShareRow | undefined
  const permission = record ? access(record, token) : null
  if (!record || !permission) throw new SharingError(404, 'This sharing link is unavailable.')
  return { record, permission }
}

/** GET /api/shares/:id with `Authorization: Bearer <view or edit token>`. */
export function readShare(request: Request, id: string) {
  return run(request, () => {
    const { record, permission } = load(request, id)
    return send(200, { id, sceneId: record.scene_id, version: record.version, updatedAt: record.updated_at, access: permission,
      ...(permission === 'edit' ? { viewToken: record.view_token } : {}) })
  })
}

/** DELETE /api/shares/:id with the edit token: revokes the link. */
export function revokeShare(request: Request, id: string) {
  return run(request, () => {
    const { permission } = load(request, id)
    if (permission !== 'edit') throw new SharingError(403, 'This sharing link only allows viewing.')
    accountsDb().prepare('DELETE FROM shares WHERE id = ?').run(id)
    return send(200, { revoked: true })
  })
}

export function shareMethodNotAllowed(request: Request, allow: string) {
  return run(request, () => send(405, { reason: 'This sharing request method is not supported.' }, { Allow: allow }))
}
