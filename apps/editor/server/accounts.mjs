import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync, readFileSync, unlinkSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

// Shared by account revocation and capability writes so an in-flight save cannot resurrect a link.
const shareWrites = new Map();
export async function withShareWrite(directory, id, action) {
  let canonical;
  try { canonical = realpathSync(directory); } catch { canonical = resolve(directory); }
  const key = join(canonical, id);
  const previous = shareWrites.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise(resolveLock => { release = resolveLock; });
  shareWrites.set(key, current);
  await previous;
  try { return await action(); }
  finally { release(); if (shareWrites.get(key) === current) shareWrites.delete(key); }
}

function revokeStoredShare(directory, id, token) {
  const path = join(directory, `${id}.json`);
  let record;
  try { record = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (record.id !== id || !/^[a-f0-9]{64}$/.test(record.editTokenHash ?? '')
    || !timingSafeEqual(createHash('sha256').update(token).digest(), Buffer.from(record.editTokenHash, 'hex'))) {
    throw new HttpError(404, 'not_found', 'This sharing link is unavailable.');
  }
  unlinkSync(path);
}

const deriveKey = promisify(scrypt);
const COOKIE_NAME = 'varpet_session';
const MAX_PROJECT_BYTES = 24 * 1024 * 1024;
const SAFE_ERROR_CODES = new Set(['ERR_SQLITE_ERROR', 'ERR_INVALID_ARG_TYPE', 'ERR_OUT_OF_RANGE',
  'ERR_CRYPTO_INVALID_SCRYPT_PARAMS', 'ERR_CRYPTO_OPERATION_FAILED', 'ERR_OSSL_EVP_MEMORY_LIMIT_EXCEEDED']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hashToken = token => createHash('sha256').update(token).digest('hex');
const publicUser = row => ({ id: row.id, name: row.name, email: row.email });

class HttpError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const badRequest = message => new HttpError(400, 'invalid_request', message);

function send(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

function readBody(request, limit) {
  if ((request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    request.resume();
    throw new HttpError(415, 'content_type', 'Send this request as application/json.');
  }
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    const cleanup = () => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
    };
    const fail = error => { cleanup(); request.resume(); reject(error); };
    const onData = chunk => {
      size += chunk.length;
      if (size > limit) return fail(new HttpError(413, 'body_too_large', 'This request is too large. Reduce attached source images and try again.'));
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!object(value)) throw badRequest('Send a JSON object.');
        resolveBody(value);
      } catch (error) { reject(error instanceof HttpError ? error : badRequest('The request contains invalid JSON.')); }
    };
    const onError = () => fail(badRequest('The request could not be read.'));
    const onAborted = () => fail(badRequest('The request was interrupted.'));
    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
    request.on('aborted', onAborted);
    if (Number(request.headers['content-length']) > limit) {
      fail(new HttpError(413, 'body_too_large', 'This request is too large. Reduce attached source images and try again.'));
    }
  });
}

function credentials(body, registration = false) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email address.');
  if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) {
    throw badRequest('Use a password between 12 and 128 characters.');
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (registration && (!name || name.length > 80)) throw badRequest('Enter a name between 1 and 80 characters.');
  return { email, password: body.password, name };
}

function apartmentInput(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120) throw badRequest('Enter an apartment name between 1 and 120 characters.');
  const templateId = body.templateId ?? null;
  if (templateId !== null && (typeof templateId !== 'string' || !templateId || templateId.length > 120)) {
    throw badRequest('The apartment template is invalid.');
  }
  const scene = body.scene;
  // Store the complete editor document, including evidence, options and baseline.
  // Geometry and catalog-reference validation stays at the editor's own boundary.
  if (!object(scene) || scene.format !== 'varpet.editor' || ![1, 2].includes(scene.version)
    || typeof scene.id !== 'string' || !scene.id || typeof scene.name !== 'string'
    || scene.units !== 'm' || scene.upAxis !== 'Y'
    || !Array.isArray(scene.rooms) || !Array.isArray(scene.walls) || !Array.isArray(scene.objects)
    || (scene.project !== undefined && !object(scene.project))) {
    throw badRequest('Save a valid Varpet apartment document.');
  }
  const catalog = body.catalog ?? [];
  if (!Array.isArray(catalog) || catalog.length > 10_000 || catalog.some(product => !object(product))) {
    throw badRequest('The apartment catalog must be a list of products.');
  }
  return { name, templateId, sceneId: scene.id, scene: JSON.stringify(scene), catalog: JSON.stringify(catalog) };
}

function sharingInput(body) {
  if (body.reference === null) return null;
  const reference = body.reference;
  if (!object(reference) || typeof reference.id !== 'string' || !/^[a-f0-9]{32}$/.test(reference.id)
    || typeof reference.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(reference.token)) {
    throw badRequest('A valid sharing reference is required.');
  }
  return { id: reference.id, token: reference.token };
}

function apartment(row, full = true) {
  const summary = { id: row.id, name: row.name, templateId: row.template_id,
    updatedAt: row.updated_at, version: row.version };
  return full ? { ...summary, scene: JSON.parse(row.scene), catalog: JSON.parse(row.catalog),
    sharing: row.share_id ? { id: row.share_id, token: row.share_token, sceneId: row.share_scene_id } : null } : summary;
}

function cookieToken(request) {
  const cookie = (request.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

/** Same-origin HTTP API, backed by durable SQLite. Requires Node >=22.13. */
export function createAccountsHandler(options = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.VARPET_DATA_DIR ?? fileURLToPath(new URL('../.varpet', import.meta.url)));
  const sharesDirectory = resolve(options.sharesDirectory ?? process.env.VARPET_SHARES_DIR ?? join(homedir(), '.varpet', 'shares'));
  const maxBodyBytes = options.maxBodyBytes ?? MAX_PROJECT_BYTES;
  const sessionDays = options.sessionDays ?? 30;
  const limit = { max: 20, windowMs: 15 * 60_000, ...options.rateLimit };
  const publicOrigin = process.env.VARPET_PUBLIC_ORIGIN;
  const configuredOrigin = options.origin ?? process.env.VARPET_APP_ORIGIN ?? process.env.VARPET_PUBLIC_ORIGIN;
  const appOrigin = configuredOrigin ? new URL(configuredOrigin).origin : null;
  if (appOrigin && !/^https?:\/\//.test(appOrigin)) throw new Error('Account origin must use HTTP or HTTPS.');
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes <= 0 || maxBodyBytes > MAX_PROJECT_BYTES) throw new Error('Invalid account body limit.');
  if (!Number.isFinite(sessionDays) || sessionDays <= 0 || sessionDays > 365) throw new Error('Invalid session duration.');
  if (!Number.isInteger(limit.max) || limit.max <= 0 || !Number.isFinite(limit.windowMs) || limit.windowMs <= 0) throw new Error('Invalid authentication rate limit.');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const databasePath = join(dataDir, 'accounts.sqlite');
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
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
      scene TEXT NOT NULL, catalog TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS apartments_owner ON apartments(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS apartment_shares (
      apartment_id TEXT PRIMARY KEY REFERENCES apartments(id) ON DELETE CASCADE,
      share_id TEXT NOT NULL, token TEXT NOT NULL, scene_id TEXT NOT NULL
    );
  `);
  // Sharing capabilities belong to this account record, never to its portable scene or catalog.
  const ownedApartment = (id, userId) => db.prepare(`SELECT apartments.*,
    apartment_shares.share_id, apartment_shares.token AS share_token, apartment_shares.scene_id AS share_scene_id
    FROM apartments LEFT JOIN apartment_shares ON apartment_shares.apartment_id = apartments.id
    WHERE apartments.id = ? AND apartments.user_id = ?`).get(id, userId);
  const attempts = new Map();
  let closed = false;
  let activeRequests = 0;
  let closing = false;
  const closeIfIdle = () => {
    if (closing && activeRequests === 0 && !closed) { closed = true; db.close(); attempts.clear(); }
  };
  const rateLimit = (request, response) => {
    const now = Date.now();
    for (const [key, bucket] of attempts) if (bucket.until <= now) attempts.delete(key);
    const key = request.socket.remoteAddress ?? 'unknown';
    let bucket = attempts.get(key);
    if (!bucket) {
      if (attempts.size >= 10_000) throw new HttpError(429, 'rate_limited', 'Too many requests. Try again later.');
      bucket = { count: 0, until: now + limit.windowMs };
      attempts.set(key, bucket);
    }
    if (++bucket.count > limit.max) {
      response.setHeader('Retry-After', String(Math.ceil((bucket.until - now) / 1000)));
      throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts. Try again later.');
    }
  };
  const originFor = request => appOrigin ?? `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
  const secureCookie = request => originFor(request).startsWith('https:');
  const setCookie = (request, response, token, maxAge) => response.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie(request) ? '; Secure' : ''}`);
  const revokeSession = request => {
    const token = cookieToken(request);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  };
  const startSession = (request, response, user) => {
    revokeSession(request);
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const token = randomBytes(32).toString('base64url');
    const maxAge = Math.floor(sessionDays * 86_400);
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), user.id, Date.now() + maxAge * 1000);
    setCookie(request, response, token, maxAge);
  };
  const signedInUser = request => {
    const token = cookieToken(request);
    if (!token) return null;
    return db.prepare(`SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hashToken(token), Date.now()) ?? null;
  };

  const handler = async (request, response, next = () => send(response, 404, { error: 'Not found.', code: 'not_found' })) => {
    let path;
    try { path = new URL(request.url ?? '/', 'http://localhost').pathname; } catch { return next(); }
    if (!path.startsWith('/api/account/') && path !== '/api/apartments' && !path.startsWith('/api/apartments/')) return next();
    if (closing) return send(response, 503, { error: 'Accounts are restarting. Try again shortly.', code: 'unavailable' });
    activeRequests++;
    try {
      const routes = {
        '/api/account/session': ['GET'], '/api/account/register': ['POST'],
        '/api/account/login': ['POST'], '/api/account/logout': ['POST'], '/api/apartments': ['GET', 'POST'],
      };
      const match = /^\/api\/apartments\/([a-zA-Z0-9-]{1,100})$/.exec(path);
      const sharingMatch = /^\/api\/apartments\/([a-zA-Z0-9-]{1,100})\/sharing$/.exec(path);
      const methods = routes[path] ?? (match ? ['GET', 'PUT'] : sharingMatch ? ['PUT'] : null);
      if (!methods) throw new HttpError(404, 'not_found', 'This account endpoint does not exist.');
      if (!methods.includes(request.method)) {
        response.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, 'method_not_allowed', 'This endpoint does not support that method.');
      }
      if (request.method !== 'GET') {
        if (!request.headers.origin || (request.headers.origin !== publicOrigin && request.headers.origin !== originFor(request) && request.headers.origin !== `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`)
          || request.headers['sec-fetch-site'] === 'cross-site') {
          throw new HttpError(403, 'origin_mismatch', 'This request must come from the Varpet page.');
        }
      }
      if (path === '/api/account/session') {
        const user = signedInUser(request);
        return send(response, 200, { user: user ? publicUser(user) : null });
      }
      if (path === '/api/account/logout') {
        revokeSession(request);
        setCookie(request, response, '', 0);
        return send(response, 200, { user: null });
      }
      if (path === '/api/account/register' || path === '/api/account/login') {
        rateLimit(request, response);
        const registering = path.endsWith('/register');
        const input = credentials(await readBody(request, Math.min(maxBodyBytes, 16_384)), registering);
        if (registering) {
          if (db.prepare('SELECT id FROM users WHERE email = ?').get(input.email)) {
            throw new HttpError(409, 'email_in_use', 'An account with this email already exists. Sign in instead.');
          }
          const salt = randomBytes(32).toString('hex');
          const hash = (await deriveKey(input.password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('hex');
          const user = { id: randomUUID(), name: input.name, email: input.email };
          // Recheck after async password hashing: simultaneous registrations cannot create duplicates.
          if (db.prepare('SELECT id FROM users WHERE email = ?').get(input.email)) {
            throw new HttpError(409, 'email_in_use', 'An account with this email already exists. Sign in instead.');
          }
          db.prepare('INSERT INTO users (id, name, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(user.id, user.name, user.email, hash, salt, new Date().toISOString());
          startSession(request, response, user);
          return send(response, 201, { user });
        }
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(input.email);
        // An absent account still incurs the same password hash work.
        const hash = await deriveKey(input.password, user?.password_salt ?? '0'.repeat(64), 64,
          { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
        const matches = timingSafeEqual(hash, user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64));
        if (!user || !matches) throw new HttpError(401, 'invalid_credentials', 'The email or password is incorrect.');
        startSession(request, response, user);
        return send(response, 200, { user: publicUser(user) });
      }
      const user = signedInUser(request);
      if (!user) throw new HttpError(401, 'sign_in_required', 'Sign in to save and open your apartments.');
      if (path === '/api/apartments' && request.method === 'GET') {
        const rows = db.prepare('SELECT id, name, template_id, updated_at, version FROM apartments WHERE user_id = ? ORDER BY updated_at DESC, id')
          .all(user.id);
        return send(response, 200, { apartments: rows.map(row => apartment(row, false)) });
      }
      if (path === '/api/apartments') {
        const input = apartmentInput(await readBody(request, maxBodyBytes));
        const id = randomUUID();
        db.prepare('INSERT INTO apartments (id, user_id, name, template_id, updated_at, version, scene, catalog) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
          .run(id, user.id, input.name, input.templateId, new Date().toISOString(), input.scene, input.catalog);
        return send(response, 201, { apartment: apartment(ownedApartment(id, user.id)) });
      }
      const id = (match ?? sharingMatch)[1];
      const current = ownedApartment(id, user.id);
      if (!current) throw new HttpError(404, 'not_found', 'This apartment could not be found.');
      if (request.method === 'GET') return send(response, 200, { apartment: apartment(current) });
      const body = await readBody(request, sharingMatch ? Math.min(maxBodyBytes, 16_384) : maxBodyBytes);
      if (!Number.isInteger(body.version) || body.version < 1) throw badRequest('A saved apartment version is required.');
      const input = sharingMatch ? sharingInput(body) : apartmentInput(body);
      let saved;
      // The version guard and capability association must commit together, including across server processes.
      const update = () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = sharingMatch
            ? db.prepare(`UPDATE apartments SET updated_at = ?, version = version + 1
              WHERE id = ? AND user_id = ? AND version = ?`).run(new Date().toISOString(), id, user.id, body.version)
            : db.prepare(`UPDATE apartments SET name = ?, template_id = ?, updated_at = ?, version = version + 1, scene = ?, catalog = ?
              WHERE id = ? AND user_id = ? AND version = ?`)
              .run(input.name, input.templateId, new Date().toISOString(), input.scene, input.catalog, id, user.id, body.version);
          if (result.changes === 0) {
            throw new HttpError(409, 'version_conflict', 'This apartment was saved in another tab. Open the latest version before saving again.',
              { apartment: apartment(ownedApartment(id, user.id)) });
          }
          if (sharingMatch && input) {
            const sceneId = JSON.parse(ownedApartment(id, user.id).scene).id;
            db.prepare(`INSERT INTO apartment_shares (apartment_id, share_id, token, scene_id) VALUES (?, ?, ?, ?)
              ON CONFLICT(apartment_id) DO UPDATE SET share_id = excluded.share_id, token = excluded.token, scene_id = excluded.scene_id`)
              .run(id, input.id, input.token, sceneId);
          } else if (sharingMatch) {
            const linked = ownedApartment(id, user.id);
            if (linked.share_id) revokeStoredShare(sharesDirectory, linked.share_id, linked.share_token);
            db.prepare('DELETE FROM apartment_shares WHERE apartment_id = ?').run(id);
          } else {
            db.prepare('DELETE FROM apartment_shares WHERE apartment_id = ? AND scene_id <> ?').run(id, input.sceneId);
          }
          saved = apartment(ownedApartment(id, user.id));
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      };
      if (sharingMatch && !input && current.share_id) await withShareWrite(sharesDirectory, current.share_id, update);
      else update();
      return send(response, 200, { apartment: saved });
    } catch (error) {
      // Keep a server diagnostic without logging messages, stacks, bodies or identities.
      // Only allowlisted codes and built-in types can reach the log.
      if (!(error instanceof HttpError)) {
        const type = error instanceof TypeError ? 'TypeError' : error instanceof RangeError ? 'RangeError'
          : error instanceof SyntaxError ? 'SyntaxError' : 'Error';
        console.error('[varpet-accounts] Unexpected request failure',
          { type, code: SAFE_ERROR_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR' });
      }
      // Database, filesystem and crypto errors must never expose private diagnostics.
      if (!response.destroyed && !response.writableEnded) {
        if (error instanceof HttpError) send(response, error.status, { error: error.message, code: error.code, ...error.details });
        else send(response, 500, { error: 'Your account request could not be completed. Please try again.', code: 'server_error' });
      }
    } finally { activeRequests--; closeIfIdle(); }
  };
  handler.close = () => { closing = true; closeIfIdle(); };
  return handler;
}

/** Install lazily so a Vite production build does not create a database. */
export function accountsPlugin(options = {}) {
  const install = server => {
    const handler = createAccountsHandler(options);
    server.middlewares.use(handler);
    server.httpServer?.once('close', () => handler.close());
  };
  return { name: 'varpet-accounts', configureServer: install, configurePreviewServer: install };
}
