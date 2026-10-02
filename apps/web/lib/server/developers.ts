// Developer profiles and plan bundles (v1 apps/editor/server/developers.mjs, BUNDLE_API in bundles-contract.ts).
// Reads are public: read-only samples shipped in ./samples plus bundles published through a profile. Writes belong
// to the signed-in account. In v2 a bundle's furnished apartment is a Pascal scene (`sceneId`); the samples' v1
// scenes are not Pascal scenes, so their sceneId is null until they are rebuilt.
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { signedInUser, type User } from './accounts'
import { developersDb } from './db'
import { HttpError, badRequest, json, readJson } from './http'

const MAX_BODY_BYTES = 4 * 1024 * 1024
const MAX_BLUEPRINT_BYTES = 3 * 1024 * 1024
const MAX_BUNDLES_PER_DEVELOPER = 100
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/
const RESERVED_SLUGS = new Set(['api', 'new', 'mine', 'studio', 'admin', 'varpet', 'sample', 'samples', 'catalog', 'developers', 'bundles'])
const BUNDLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/
const SCENE = /^[A-Za-z0-9_-]{1,120}$/
const IMAGE_TYPES: Record<string, number[]> = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/webp': [0x52, 0x49, 0x46, 0x46] }

export interface BundleSummary {
  id: string; developerSlug: string; developerName: string; name: string; building: string | null
  bedrooms: number; area: number; blueprintUrl: string; source: 'sample' | 'published'; furnishedPieces: number; updatedAt: string
  /** The furnished apartment as a Pascal scene, opened at /editor/<sceneId>; null when none exists yet. */
  sceneId: string | null
}
export interface DeveloperSummary { slug: string; name: string; city: string; tagline: string; bundleCount: number; logoUrl: string | null }
export interface Developer extends DeveloperSummary { about: string; website: string | null; ownedByViewer: boolean; bundles: BundleSummary[] }

interface DeveloperRow { id: string; owner_id: string; slug: string; name: string; city: string; tagline: string; about: string; website: string | null }
interface BundleRow {
  id: string; name: string; building: string | null; bedrooms: number; area: number; pieces: number; updated_at: string
  slug: string; developer_name: string; owner_id: string; scene_id: string | null
}

/** "Unique constraint" races report like the pre-check does. */
function unique<T>(action: () => T, conflict: HttpError): T {
  try { return action() } catch (error) { if (/UNIQUE constraint failed/.test((error as Error)?.message ?? '')) throw conflict; throw error }
}

const text = (value: unknown, max: number, label: string, { required = true } = {}) => {
  const trimmed = typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : null
  if (trimmed === null || trimmed.length > max || (required && !trimmed)) {
    throw badRequest(required ? `Enter ${label} of 1–${max} characters.` : `Keep ${label} under ${max} characters.`)
  }
  return trimmed
}

function profileInput(body: Record<string, unknown>) {
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  if (!SLUG.test(slug) || slug.includes('--')) throw badRequest('Choose a profile address of 3–48 lowercase letters, numbers and single hyphens.')
  let website = typeof body.website === 'string' ? body.website.trim() : ''
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`
    let url: URL
    try { url = new URL(website) } catch { throw badRequest('Enter a website such as https://example.com.') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || website.length > 200 || !url.hostname.includes('.')) {
      throw badRequest('Enter a website such as https://example.com.')
    }
    website = url.href
  }
  return {
    slug, name: text(body.name, 80, 'a company name'), city: text(body.city, 80, 'a city', { required: false }),
    tagline: text(body.tagline, 140, 'a tagline', { required: false }), about: text(body.about, 2000, 'the about text', { required: false }),
    website: website || null,
  }
}

function decodeBlueprint(value: unknown) {
  const match = typeof value === 'string' ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value) : null
  if (!match) throw badRequest('Attach the original floor plan as a PNG, JPEG or WebP image.')
  const bytes = Buffer.from(match[2]!, 'base64')
  if (!bytes.length || bytes.length > MAX_BLUEPRINT_BYTES) throw badRequest('The floor plan image must be under 3 MB.')
  const magic = IMAGE_TYPES[match[1]!]!
  if (!magic.every((byte, i) => bytes[i] === byte) || (match[1] === 'image/webp' && bytes.toString('latin1', 8, 12) !== 'WEBP')) {
    throw badRequest('The floor plan file does not match its image type.')
  }
  return { type: match[1]!, bytes }
}

/** v2 publish body: {name, building, bedrooms, area, sceneId, pieces?, blueprint}. No scene to derive figures from. */
function bundleInput(body: Record<string, unknown>, partial = false) {
  const name = text(body.name, 120, 'a plan name')
  const building = text(body.building, 80, 'the building name', { required: false }) || null
  const sceneId = body.sceneId ?? null
  if (sceneId !== null && (typeof sceneId !== 'string' || !SCENE.test(sceneId))) throw badRequest('Publish a Varpet apartment scene.')
  const bedrooms = body.bedrooms
  if (!Number.isInteger(bedrooms) || (bedrooms as number) < 0 || (bedrooms as number) > 20) throw badRequest('Bedrooms must be a whole number from 0 to 20.')
  const area = body.area
  if (typeof area !== 'number' || !Number.isFinite(area) || area < 1 || area > 5000) throw badRequest('Area must be between 1 and 5000 m².')
  const pieces = body.pieces ?? 0
  if (!Number.isInteger(pieces) || (pieces as number) < 0 || (pieces as number) > 10_000) throw badRequest('Pieces must be a whole number.')
  const blueprint = partial && body.blueprint === undefined ? null : decodeBlueprint(body.blueprint)
  return { name, building, bedrooms: bedrooms as number, area: Math.round(area * 10) / 10, pieces: pieces as number, sceneId: sceneId as string | null, blueprint }
}

/* ---- samples ---- */

const SAMPLE_NOTE = 'A sample collection prepared by Varpet from plans the developer published. Not a verified listing, offer or price list.'
const SAMPLE_DEVELOPERS = [
  { slug: 'sunday-towers', name: 'Sunday Towers', city: 'Yerevan', tagline: 'Building B · Arabkir, Yerevan',
    about: `${SAMPLE_NOTE} The plan and room areas come from the developer's published unit data for apartment B12121; Varpet traced it into 3D and furnished it with catalog pieces for illustration.` },
  { slug: 'orion', name: 'Orion', city: '', tagline: 'Top-floor plans from the developer’s floor-plate drawing',
    about: `${SAMPLE_NOTE} Types 7 and 8 were traced from the developer's floor-plate PDF, scaled to the printed total area, and furnished with catalog pieces for illustration. Location not supplied.` },
  { slug: 'm6', name: 'M6', city: '', tagline: 'A two-bedroom plan with two balconies',
    about: `${SAMPLE_NOTE} Traced from the M6 developer plan. The image has no printed dimensions, so the scale is an estimate from the printed room areas; the original plan and its measurement assumptions stay with the 3D model. Location not supplied.` },
]

interface Sample extends BundleSummary { file: string }
function samplesDir(): string | null {
  for (const dir of [resolve('lib/server/samples'), resolve('apps/web/lib/server/samples')]) if (existsSync(join(dir, 'bundles.json'))) return dir
  return null
}
let samplesCache: Sample[] | undefined
/** Read-only samples. A sample whose plan image is missing is skipped, never invented. */
function samples(): Sample[] {
  if (samplesCache) return samplesCache
  const dir = samplesDir()
  const list: Sample[] = []
  if (dir) {
    const records = JSON.parse(readFileSync(join(dir, 'bundles.json'), 'utf8')) as Array<Record<string, unknown>>
    for (const record of records) {
      const file = join(dir, `${String(record.flat)}.png`)
      const developer = SAMPLE_DEVELOPERS.find(item => item.slug === record.developerSlug)
      if (!developer || !existsSync(file)) continue
      list.push({ id: String(record.id), developerSlug: developer.slug, developerName: developer.name, name: String(record.name),
        building: (record.building as string | null) ?? null, bedrooms: Number(record.bedrooms), area: Number(record.area),
        blueprintUrl: `/api/bundles/${String(record.id)}/blueprint`, source: 'sample', furnishedPieces: Number(record.furnishedPieces),
        updatedAt: String(record.updatedAt), sceneId: null, file })
    }
  }
  return (samplesCache = list)
}
const sampleSummary = ({ file: _file, ...summary }: Sample): BundleSummary => summary
const sampleDevelopers = () => SAMPLE_DEVELOPERS.map(developer => ({ ...developer, bundles: samples().filter(bundle => bundle.developerSlug === developer.slug) }))
  .filter(developer => developer.bundles.length)
const reserved = (slug: string) => RESERVED_SLUGS.has(slug) || SAMPLE_DEVELOPERS.some(developer => developer.slug === slug)

/* ---- published ---- */

const summaryOf = (row: BundleRow): BundleSummary => ({ id: row.id, developerSlug: row.slug, developerName: row.developer_name, name: row.name,
  building: row.building, bedrooms: row.bedrooms, area: row.area, blueprintUrl: `/api/bundles/${row.id}/blueprint`,
  source: 'published', furnishedPieces: row.pieces, updatedAt: row.updated_at, sceneId: row.scene_id })
const bundleColumns = `bundles.id, bundles.name, bundles.building, bundles.bedrooms, bundles.area, bundles.pieces, bundles.scene_id,
  bundles.updated_at, developers.slug, developers.name AS developer_name, developers.owner_id`
const publishedBundles = (developerId?: string) => developersDb().prepare(`SELECT ${bundleColumns} FROM bundles JOIN developers ON developers.id = bundles.developer_id
  ${developerId ? 'WHERE developers.id = ?' : ''} ORDER BY bundles.updated_at DESC, bundles.id`).all(...(developerId ? [developerId] : [])) as unknown as BundleRow[]
const developerRow = (slug: string) => developersDb().prepare('SELECT * FROM developers WHERE slug = ?').get(slug) as DeveloperRow | undefined
const developerSummary = (row: DeveloperRow): DeveloperSummary => ({ slug: row.slug, name: row.name, city: row.city, tagline: row.tagline, logoUrl: null,
  bundleCount: (developersDb().prepare('SELECT COUNT(*) AS count FROM bundles WHERE developer_id = ?').get(row.id) as { count: number }).count })
const developerFull = (row: DeveloperRow, user: Pick<User, 'id'> | null): Developer => ({ ...developerSummary(row), about: row.about, website: row.website,
  ownedByViewer: Boolean(user && user.id === row.owner_id), bundles: publishedBundles(row.id).map(summaryOf) })

function fullBundle(id: string): BundleSummary | null {
  const sample = samples().find(bundle => bundle.id === id)
  if (sample) return sampleSummary(sample)
  const row = developersDb().prepare(`SELECT ${bundleColumns} FROM bundles JOIN developers ON developers.id = bundles.developer_id WHERE bundles.id = ?`).get(id) as BundleRow | undefined
  return row ? summaryOf(row) : null
}

function requireUser(request: Request): User {
  const user = signedInUser(request)
  if (!user) throw new HttpError(401, 'sign_in_required', 'Sign in to manage your developer profile.')
  return user
}

function ownedBundle(id: string, user: User) {
  const row = developersDb().prepare('SELECT bundles.id, developers.owner_id FROM bundles JOIN developers ON developers.id = bundles.developer_id WHERE bundles.id = ?').get(id) as { owner_id: string } | undefined
  if (!row || samples().some(sample => sample.id === id)) throw new HttpError(404, 'not_found', 'This plan could not be found.')
  if (row.owner_id !== user.id) throw new HttpError(403, 'forbidden', 'Only the developer who published this plan can change it.')
}

/* ---- handlers ---- */

export function listDevelopers(): Response {
  const published = (developersDb().prepare('SELECT * FROM developers ORDER BY updated_at DESC').all() as unknown as DeveloperRow[]).map(developerSummary)
  const listed = [...sampleDevelopers().map(developer => ({ slug: developer.slug, name: developer.name, city: developer.city,
    tagline: developer.tagline, bundleCount: developer.bundles.length, logoUrl: null })), ...published]
  return json(200, { developers: listed.sort((a, b) => b.bundleCount - a.bundleCount || a.name.localeCompare(b.name)) })
}

export function studio(request: Request): Response {
  const user = signedInUser(request)
  const row = user ? developersDb().prepare('SELECT * FROM developers WHERE owner_id = ?').get(user.id) as DeveloperRow | undefined : undefined
  return json(200, { user: user ? { id: user.id, name: user.name } : null, developer: row ? developerFull(row, user) : null })
}

export async function createDeveloper(request: Request): Promise<Response> {
  const user = requireUser(request)
  const input = profileInput(await readJson(request, 32_768))
  const db = developersDb()
  if (reserved(input.slug)) throw new HttpError(409, 'slug_taken', 'That profile address is taken. Choose another.')
  if (db.prepare('SELECT id FROM developers WHERE owner_id = ?').get(user.id)) throw new HttpError(409, 'profile_exists', 'Your account already has a developer profile.')
  if (developerRow(input.slug)) throw new HttpError(409, 'slug_taken', 'That profile address is taken. Choose another.')
  const now = new Date().toISOString()
  unique(() => db.prepare(`INSERT INTO developers (id, owner_id, slug, name, city, tagline, about, website, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), user.id, input.slug, input.name, input.city, input.tagline, input.about, input.website, now, now),
    new HttpError(409, 'slug_taken', 'That profile address is taken, or your account already has a profile.'))
  return json(201, { developer: developerFull(developerRow(input.slug)!, user) })
}

const decodeParam = (value: string) => { try { return decodeURIComponent(value) } catch { throw new HttpError(404, 'not_found', 'Not found.') } }

export function getDeveloper(request: Request, rawSlug: string): Response {
  const slug = decodeParam(rawSlug)
  const sample = sampleDevelopers().find(developer => developer.slug === slug)
  if (sample) {
    return json(200, { developer: { slug: sample.slug, name: sample.name, city: sample.city, tagline: sample.tagline, bundleCount: sample.bundles.length,
      logoUrl: null, about: sample.about, website: null, ownedByViewer: false, bundles: sample.bundles.map(sampleSummary) } satisfies Developer })
  }
  const row = developerRow(slug)
  if (!row) throw new HttpError(404, 'not_found', 'This developer profile could not be found.')
  return json(200, { developer: developerFull(row, signedInUser(request)) })
}

export async function updateDeveloper(request: Request, rawSlug: string): Promise<Response> {
  const user = requireUser(request)
  const row = developerRow(decodeParam(rawSlug))
  if (!row) throw new HttpError(404, 'not_found', 'This developer profile could not be found.')
  if (row.owner_id !== user.id) throw new HttpError(403, 'forbidden', 'Only the owner can edit this profile.')
  const input = profileInput(await readJson(request, 32_768))
  if (input.slug !== row.slug && (reserved(input.slug) || developerRow(input.slug))) throw new HttpError(409, 'slug_taken', 'That profile address is taken. Choose another.')
  unique(() => developersDb().prepare('UPDATE developers SET slug = ?, name = ?, city = ?, tagline = ?, about = ?, website = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .run(input.slug, input.name, input.city, input.tagline, input.about, input.website, new Date().toISOString(), row.id, user.id),
    new HttpError(409, 'slug_taken', 'That profile address is taken. Choose another.'))
  return json(200, { developer: developerFull(developerRow(input.slug)!, user) })
}

const tooLarge = 'This upload is too large. Keep the plan image under 3 MB.'

export async function publishBundle(request: Request, rawSlug: string): Promise<Response> {
  const user = requireUser(request)
  const row = developerRow(decodeParam(rawSlug))
  if (!row) throw new HttpError(404, 'not_found', 'This developer profile could not be found.')
  if (row.owner_id !== user.id) throw new HttpError(403, 'forbidden', 'Only the owner can publish to this profile.')
  const input = bundleInput(await readJson(request, MAX_BODY_BYTES, tooLarge))
  const db = developersDb()
  if ((db.prepare('SELECT COUNT(*) AS count FROM bundles WHERE developer_id = ?').get(row.id) as { count: number }).count >= MAX_BUNDLES_PER_DEVELOPER) {
    throw new HttpError(409, 'too_many_bundles', `A profile can hold up to ${MAX_BUNDLES_PER_DEVELOPER} plans. Unpublish one first.`)
  }
  const id = `p-${randomUUID()}`, now = new Date().toISOString()
  db.prepare(`INSERT INTO bundles (id, developer_id, name, building, bedrooms, area, pieces, scene_id, blueprint, blueprint_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, row.id, input.name, input.building, input.bedrooms, input.area, input.pieces, input.sceneId,
    input.blueprint!.bytes, input.blueprint!.type, now, now)
  db.prepare('UPDATE developers SET updated_at = ? WHERE id = ?').run(now, row.id)
  return json(201, { bundle: fullBundle(id) })
}

export function listBundles(request: Request): Response {
  const slug = new URL(request.url).searchParams.get('developer')
  let bundles: BundleSummary[]
  if (slug) {
    const sample = sampleDevelopers().find(developer => developer.slug === slug)
    const row = sample ? null : developerRow(slug)
    bundles = sample ? sample.bundles.map(sampleSummary) : row ? publishedBundles(row.id).map(summaryOf) : []
  } else bundles = [...samples().map(sampleSummary), ...publishedBundles().map(summaryOf)]
  return json(200, { bundles })
}

export function blueprint(rawId: string): Response {
  const id = decodeParam(rawId)
  const sample = samples().find(bundle => bundle.id === id)
  const row = sample ? null : BUNDLE_ID.test(id) ? developersDb().prepare('SELECT blueprint, blueprint_type FROM bundles WHERE id = ?').get(id) as { blueprint: Uint8Array; blueprint_type: string } | undefined : undefined
  if (!sample && !row) throw new HttpError(404, 'not_found', 'This plan could not be found.')
  const bytes = sample ? readFileSync(sample.file) : Buffer.from(row!.blueprint)
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'Content-Type': sample ? 'image/png' : row!.blueprint_type, 'Content-Length': String(bytes.length),
    'Cache-Control': sample ? 'public, max-age=3600' : 'no-cache', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' } })
}

export function getBundle(rawId: string): Response {
  const id = decodeParam(rawId)
  const bundle = BUNDLE_ID.test(id) ? fullBundle(id) : null
  if (!bundle) throw new HttpError(404, 'not_found', 'This plan could not be found.')
  return json(200, { bundle })
}

export async function updateBundle(request: Request, rawId: string): Promise<Response> {
  const id = decodeParam(rawId)
  const user = requireUser(request)
  ownedBundle(id, user)
  const input = bundleInput(await readJson(request, MAX_BODY_BYTES, tooLarge), true)
  const now = new Date().toISOString()
  developersDb().prepare(`UPDATE bundles SET name = ?, building = ?, bedrooms = ?, area = ?, pieces = ?, scene_id = ?, updated_at = ?
    ${input.blueprint ? ', blueprint = ?, blueprint_type = ?' : ''} WHERE id = ?`)
    .run(input.name, input.building, input.bedrooms, input.area, input.pieces, input.sceneId, now,
      ...(input.blueprint ? [input.blueprint.bytes, input.blueprint.type] : []), id)
  return json(200, { bundle: fullBundle(id) })
}

export function deleteBundle(request: Request, rawId: string): Response {
  const id = decodeParam(rawId)
  const user = requireUser(request)
  ownedBundle(id, user)
  developersDb().prepare('DELETE FROM bundles WHERE id = ?').run(id)
  return json(200, { ok: true })
}
