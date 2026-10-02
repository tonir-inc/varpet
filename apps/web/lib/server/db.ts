// SQLite files under VARPET_DATA_DIR (default ./.data): accounts.sqlite (users, sessions, apartments, shares) and
// developers.sqlite (profiles, published plan bundles). Same tables as v1, except apartments reference a Pascal
// scene by `scene_id` instead of storing the scene JSON. Handles are cached on globalThis so dev reloads reuse them.
import { chmodSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const dataDir = () => resolve(process.env.VARPET_DATA_DIR || './.data')

function open(name: string, schema: string): DatabaseSync {
  const dir = dataDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, name)
  const db = new DatabaseSync(path)
  try { chmodSync(path, 0o600) } catch { /* not ours to change */ }
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; ${schema}`)
  return db
}

const ACCOUNTS = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS apartments (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, template_id TEXT, updated_at TEXT NOT NULL, version INTEGER NOT NULL,
    scene_id TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS apartments_owner ON apartments(user_id, updated_at);
  CREATE TABLE IF NOT EXISTS apartment_shares (
    apartment_id TEXT PRIMARY KEY REFERENCES apartments(id) ON DELETE CASCADE,
    share_id TEXT NOT NULL, token TEXT NOT NULL, scene_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY, scene_id TEXT NOT NULL, view_token TEXT NOT NULL, edit_token_hash TEXT NOT NULL,
    version INTEGER NOT NULL, updated_at TEXT NOT NULL
  );
`

const DEVELOPERS = `
  CREATE TABLE IF NOT EXISTS developers (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    city TEXT NOT NULL, tagline TEXT NOT NULL, about TEXT NOT NULL, website TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bundles (
    id TEXT PRIMARY KEY, developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    name TEXT NOT NULL, building TEXT, bedrooms INTEGER NOT NULL, area REAL NOT NULL, pieces INTEGER NOT NULL,
    scene_id TEXT, blueprint BLOB NOT NULL, blueprint_type TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bundles_developer ON bundles(developer_id, updated_at);
`

const cache = globalThis as unknown as { __varpetDb?: Record<string, DatabaseSync> }
function cached(key: string, name: string, schema: string): DatabaseSync {
  cache.__varpetDb ??= {}
  const id = `${dataDir()}:${key}`
  return (cache.__varpetDb[id] ??= open(name, schema))
}

export const accountsDb = () => cached('accounts', 'accounts.sqlite', ACCOUNTS)
export const developersDb = () => cached('developers', 'developers.sqlite', DEVELOPERS)

/** Runs `action` inside BEGIN IMMEDIATE, so version guards hold across server processes. */
export function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = action()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
