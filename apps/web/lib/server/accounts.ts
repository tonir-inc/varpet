// Accounts and saved apartments (v1 apps/editor/server/accounts.mjs). Apartments point at a Pascal scene by
// `sceneId`; the scene itself lives in the Pascal store (lane A), not here.
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { accountsDb, transaction } from './db'
import { HttpError, badRequest, cookieToken, hashToken, isObject, json, readJson, sessionCookie } from './http'

const deriveKey = promisify(scrypt) as (password: string, salt: string, length: number, options: object) => Promise<Buffer>
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const SESSION_DAYS = 30
const RATE = { max: 20, windowMs: 15 * 60_000 }
const SMALL_BODY = 16_384

export interface User { id: string; name: string; email: string }
interface ApartmentRow {
  id: string; user_id: string; name: string; template_id: string | null; updated_at: string; version: number; scene_id: string
  share_id?: string | null; share_token?: string | null; share_scene_id?: string | null
}

const publicUser = (row: User): User => ({ id: row.id, name: row.name, email: row.email })

function credentials(body: Record<string, unknown>, registration = false) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email address.')
  if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) {
    throw badRequest('Use a password between 12 and 128 characters.')
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (registration && (!name || name.length > 80)) throw badRequest('Enter a name between 1 and 80 characters.')
  return { email, password: body.password, name }
}

function apartmentInput(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 120) throw badRequest('Enter an apartment name between 1 and 120 characters.')
  const templateId = body.templateId ?? null
  if (templateId !== null && (typeof templateId !== 'string' || !templateId || templateId.length > 120)) {
    throw badRequest('The apartment template is invalid.')
  }
  // The scene is Pascal's; this boundary only checks the reference's shape.
  const sceneId = body.sceneId
  if (typeof sceneId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(sceneId)) throw badRequest('Save a valid Varpet apartment scene.')
  return { name, templateId: templateId as string | null, sceneId }
}

function sharingInput(body: Record<string, unknown>) {
  if (body.reference === null) return null
  const reference = body.reference
  if (!isObject(reference) || typeof reference.id !== 'string' || !/^[a-f0-9]{32}$/.test(reference.id)
    || typeof reference.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(reference.token)) {
    throw badRequest('A valid sharing reference is required.')
  }
  return { id: reference.id, token: reference.token }
}

function apartment(row: ApartmentRow, full = true) {
  const summary = { id: row.id, name: row.name, templateId: row.template_id, sceneId: row.scene_id, updatedAt: row.updated_at, version: row.version }
  return full ? { ...summary, sharing: row.share_id ? { id: row.share_id, token: row.share_token, sceneId: row.share_scene_id } : null } : summary
}

const ownedApartment = (id: string, userId: string) => accountsDb().prepare(`SELECT apartments.*,
  apartment_shares.share_id, apartment_shares.token AS share_token, apartment_shares.scene_id AS share_scene_id
  FROM apartments LEFT JOIN apartment_shares ON apartment_shares.apartment_id = apartments.id
  WHERE apartments.id = ? AND apartments.user_id = ?`).get(id, userId) as ApartmentRow | undefined

/* ---- sessions ---- */

export function signedInUser(request: Request): User | null {
  const token = cookieToken(request)
  if (!token) return null
  return (accountsDb().prepare(`SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hashToken(token), Date.now()) as User | undefined) ?? null
}

function revokeSession(request: Request) {
  const token = cookieToken(request)
  if (token) accountsDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

function startSession(request: Request, user: User): string {
  revokeSession(request)
  const db = accountsDb()
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  const token = randomBytes(32).toString('base64url')
  const maxAge = Math.floor(SESSION_DAYS * 86_400)
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), user.id, Date.now() + maxAge * 1000)
  return sessionCookie(request, token, maxAge)
}

const attempts = ((globalThis as unknown as { __varpetAuthAttempts?: Map<string, { count: number; until: number }> }).__varpetAuthAttempts ??= new Map())
function rateLimit(request: Request) {
  const now = Date.now()
  for (const [key, bucket] of attempts) if (bucket.until <= now) attempts.delete(key)
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local'
  let bucket = attempts.get(key)
  if (!bucket) {
    if (attempts.size >= 10_000) throw new HttpError(429, 'rate_limited', 'Too many requests. Try again later.')
    bucket = { count: 0, until: now + RATE.windowMs }
    attempts.set(key, bucket)
  }
  if (++bucket.count > RATE.max) {
    throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts. Try again later.', {}, { 'Retry-After': String(Math.ceil((bucket.until - now) / 1000)) })
  }
}

export function session(request: Request): Response {
  const user = signedInUser(request)
  return json(200, { user: user ? publicUser(user) : null })
}

export function logout(request: Request): Response {
  revokeSession(request)
  return json(200, { user: null }, { 'Set-Cookie': sessionCookie(request, '', 0) })
}

export async function register(request: Request): Promise<Response> {
  rateLimit(request)
  const input = credentials(await readJson(request, SMALL_BODY), true)
  const db = accountsDb()
  const taken = () => db.prepare('SELECT id FROM users WHERE email = ?').get(input.email)
  if (taken()) throw new HttpError(409, 'email_in_use', 'An account with this email already exists. Sign in instead.')
  const salt = randomBytes(32).toString('hex')
  const hash = (await deriveKey(input.password, salt, 64, SCRYPT)).toString('hex')
  const user = { id: randomUUID(), name: input.name, email: input.email }
  // Recheck after async password hashing: simultaneous registrations cannot create duplicates.
  if (taken()) throw new HttpError(409, 'email_in_use', 'An account with this email already exists. Sign in instead.')
  db.prepare('INSERT INTO users (id, name, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(user.id, user.name, user.email, hash, salt, new Date().toISOString())
  return json(201, { user }, { 'Set-Cookie': startSession(request, user) })
}

export async function login(request: Request): Promise<Response> {
  rateLimit(request)
  const input = credentials(await readJson(request, SMALL_BODY))
  const user = accountsDb().prepare('SELECT * FROM users WHERE email = ?').get(input.email) as (User & { password_hash: string; password_salt: string }) | undefined
  // An absent account still incurs the same password hash work.
  const hash = await deriveKey(input.password, user?.password_salt ?? '0'.repeat(64), 64, SCRYPT)
  const matches = timingSafeEqual(hash, user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64))
  if (!user || !matches) throw new HttpError(401, 'invalid_credentials', 'The email or password is incorrect.')
  return json(200, { user: publicUser(user) }, { 'Set-Cookie': startSession(request, user) })
}

/* ---- apartments ---- */

function requireUser(request: Request): User {
  const user = signedInUser(request)
  if (!user) throw new HttpError(401, 'sign_in_required', 'Sign in to save and open your apartments.')
  return user
}

export function listApartments(request: Request): Response {
  const user = requireUser(request)
  const rows = accountsDb().prepare('SELECT id, name, template_id, updated_at, version, scene_id FROM apartments WHERE user_id = ? ORDER BY updated_at DESC, id')
    .all(user.id) as unknown as ApartmentRow[]
  return json(200, { apartments: rows.map(row => apartment(row, false)) })
}

export async function createApartment(request: Request): Promise<Response> {
  const user = requireUser(request)
  const input = apartmentInput(await readJson(request, SMALL_BODY))
  const id = randomUUID()
  accountsDb().prepare('INSERT INTO apartments (id, user_id, name, template_id, updated_at, version, scene_id) VALUES (?, ?, ?, ?, ?, 1, ?)')
    .run(id, user.id, input.name, input.templateId, new Date().toISOString(), input.sceneId)
  return json(201, { apartment: apartment(ownedApartment(id, user.id)!) })
}

function owned(request: Request, id: string): { user: User; current: ApartmentRow } {
  const user = requireUser(request)
  const current = /^[a-zA-Z0-9-]{1,100}$/.test(id) ? ownedApartment(id, user.id) : undefined
  if (!current) throw new HttpError(404, 'not_found', 'This apartment could not be found.')
  return { user, current }
}

export function getApartment(request: Request, id: string): Response {
  return json(200, { apartment: apartment(owned(request, id).current) })
}

function version(body: Record<string, unknown>): number {
  if (!Number.isInteger(body.version) || (body.version as number) < 1) throw badRequest('A saved apartment version is required.')
  return body.version as number
}
const conflict = (id: string, userId: string) => new HttpError(409, 'version_conflict',
  'This apartment was saved in another tab. Open the latest version before saving again.', { apartment: apartment(ownedApartment(id, userId)!) })

export async function updateApartment(request: Request, id: string): Promise<Response> {
  const { user } = owned(request, id)
  const body = await readJson(request, SMALL_BODY)
  const expected = version(body)
  const input = apartmentInput(body)
  const db = accountsDb()
  const saved = transaction(db, () => {
    const result = db.prepare(`UPDATE apartments SET name = ?, template_id = ?, updated_at = ?, version = version + 1, scene_id = ?
      WHERE id = ? AND user_id = ? AND version = ?`).run(input.name, input.templateId, new Date().toISOString(), input.sceneId, id, user.id, expected)
    if (result.changes === 0) throw conflict(id, user.id)
    // A link made for another scene no longer belongs to this apartment.
    db.prepare('DELETE FROM apartment_shares WHERE apartment_id = ? AND scene_id <> ?').run(id, input.sceneId)
    return apartment(ownedApartment(id, user.id)!)
  })
  return json(200, { apartment: saved })
}

/** PUT /api/apartments/:id/sharing {version, reference: {id, token} | null}: attach or revoke the share link. */
export async function setApartmentSharing(request: Request, id: string): Promise<Response> {
  const { user } = owned(request, id)
  const body = await readJson(request, SMALL_BODY)
  const expected = version(body)
  const input = sharingInput(body)
  const db = accountsDb()
  const saved = transaction(db, () => {
    const result = db.prepare('UPDATE apartments SET updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ? AND version = ?')
      .run(new Date().toISOString(), id, user.id, expected)
    if (result.changes === 0) throw conflict(id, user.id)
    const linked = ownedApartment(id, user.id)!
    if (input) {
      db.prepare(`INSERT INTO apartment_shares (apartment_id, share_id, token, scene_id) VALUES (?, ?, ?, ?)
        ON CONFLICT(apartment_id) DO UPDATE SET share_id = excluded.share_id, token = excluded.token, scene_id = excluded.scene_id`)
        .run(id, input.id, input.token, linked.scene_id)
    } else {
      if (linked.share_id && linked.share_token) {
        const share = db.prepare('SELECT edit_token_hash FROM shares WHERE id = ?').get(linked.share_id) as { edit_token_hash: string } | undefined
        if (share) {
          if (!timingSafeEqual(Buffer.from(hashToken(linked.share_token), 'hex'), Buffer.from(share.edit_token_hash, 'hex'))) {
            throw new HttpError(404, 'not_found', 'This sharing link is unavailable.')
          }
          db.prepare('DELETE FROM shares WHERE id = ?').run(linked.share_id)
        }
      }
      db.prepare('DELETE FROM apartment_shares WHERE apartment_id = ?').run(id)
    }
    return apartment(ownedApartment(id, user.id)!)
  })
  return json(200, { apartment: saved })
}
