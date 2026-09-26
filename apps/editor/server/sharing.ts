import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import type { CatalogAsset, SceneDocument } from '../src/contracts';
import { isRecord, validateScene } from '../src/core/validation';

const MAX_BODY_BYTES = 24_000_000;
const ID = /^[a-f0-9]{32}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[a-f0-9]{64}$/;
const writes = new Map<string, Promise<void>>();

interface SharingOptions {
  directory?: string;
  /** Exact externally served origin when a trusted proxy terminates HTTPS. */
  publicOrigin?: string;
  /** Additional web-served roots. Storage is always excluded from the current working directory. */
  forbiddenRoots?: string[];
}
interface Snapshot { scene: SceneDocument; catalog: CatalogAsset[] }
interface StoredShare extends Snapshot {
  storageVersion: 1;
  id: string;
  viewToken: string;
  editTokenHash: string;
  version: number;
  updatedAt: string;
}
class SharingError extends Error {
  constructor(readonly status: number, reason: string) { super(reason); }
}

// Resolve existing parents too, so a not-yet-created directory cannot bypass the
// served-root check through a symlink in its parent path.
function canonicalPath(path: string): string {
  const absolute = resolve(path);
  try { return realpathSync(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(absolute) === absolute) return absolute;
    return join(canonicalPath(dirname(absolute)), basename(absolute));
  }
}
function containedIn(path: string, root: string): boolean {
  const part = relative(root, path);
  return part === '' || (part !== '..' && !part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(part));
}
function storageDirectory(options: SharingOptions): string {
  const directory = canonicalPath(options.directory || process.env.VARPET_SHARES_DIR || join(homedir(), '.varpet', 'shares'));
  const roots = [process.cwd(), ...(options.forbiddenRoots ?? [])].map(canonicalPath);
  if (roots.some(root => containedIn(directory, root))) {
    throw new Error('Sharing storage must be outside web-served directories.');
  }
  return directory;
}
function hash(token: string): Buffer { return createHash('sha256').update(token).digest(); }
function access(record: StoredShare, token: string): 'view' | 'edit' | null {
  const candidate = hash(token);
  if (timingSafeEqual(candidate, Buffer.from(record.editTokenHash, 'hex'))) return 'edit';
  return timingSafeEqual(candidate, hash(record.viewToken)) ? 'view' : null;
}
function send(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(JSON.stringify(data));
}
function configuredOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && url.origin === value) return value;
  } catch { /* Report only the configuration field, never its value. */ }
  throw new Error('Sharing public origin must be an exact HTTP or HTTPS origin without a path.');
}
function sameOrigin(request: IncomingMessage, publicOrigin: string | undefined): boolean {
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  if (!origin) return true; // CLI and server clients do not send Origin.
  try {
    const protocol = 'encrypted' in request.socket && request.socket.encrypted ? 'https:' : 'http:';
    return new URL(origin).origin === (publicOrigin ?? `${protocol}//${request.headers.host}`);
  } catch { return false; }
}
function bearer(request: IncomingMessage): string {
  const value = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.authorization ?? '')?.[1];
  if (!value) throw new SharingError(401, 'A valid sharing link is required.');
  return value;
}
function body(request: IncomingMessage): Promise<unknown> {
  const type = request.headers['content-type'];
  if (!type || !/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(type)) {
    request.resume();
    throw new SharingError(415, 'Sharing requests must use application/json.');
  }
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
    request.resume();
    throw new SharingError(413, 'The shared project exceeds the 24 MB limit.');
  }
  return new Promise((resolveBody, reject) => {
    let chunks: Buffer[] = [], bytes = 0, rejected = false;
    request.on('data', (chunk: Buffer) => {
      if (rejected) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        rejected = true; chunks = [];
        reject(new SharingError(413, 'The shared project exceeds the 24 MB limit.'));
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejected) return;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new SharingError(400, 'The shared project must contain valid JSON.')); }
    });
    const aborted = () => reject(new SharingError(400, 'The sharing request was interrupted.'));
    request.on('error', aborted);
    request.on('aborted', aborted);
  });
}
function snapshot(value: unknown, updating: boolean): Snapshot & { version?: number } {
  if (!isRecord(value) || Object.keys(value).some(key => !['scene', 'catalog', ...(updating ? ['version'] : [])].includes(key))
    || !Array.isArray(value.catalog) || value.catalog.length > 1000
    || (updating && (!Number.isSafeInteger(value.version) || (value.version as number) < 1))) {
    throw new SharingError(400, 'The shared project payload is invalid.');
  }
  let valid = false;
  try { valid = validateScene(value.scene, value.catalog as CatalogAsset[]).ok; }
  catch { /* Validator diagnostics and input strings must not leak through this boundary. */ }
  if (!valid) throw new SharingError(400, 'The shared scene or furniture catalog is invalid.');
  return { scene: value.scene as unknown as SceneDocument, catalog: value.catalog as CatalogAsset[],
    ...(updating ? { version: value.version as number } : {}) };
}
async function read(directory: string, id: string): Promise<StoredShare> {
  let text: string;
  try { text = await readFile(join(directory, `${id}.json`), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new SharingError(404, 'This sharing link is unavailable.');
    throw error;
  }
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.storageVersion !== 1 || value.id !== id
    || typeof value.viewToken !== 'string' || !TOKEN.test(value.viewToken)
    || typeof value.editTokenHash !== 'string' || !HASH.test(value.editTokenHash)
    || !Number.isSafeInteger(value.version) || (value.version as number) < 1
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
    || !Array.isArray(value.catalog) || !validateScene(value.scene, value.catalog as CatalogAsset[]).ok) {
    throw new Error('Invalid stored sharing record.');
  }
  return value as unknown as StoredShare;
}
async function atomicWrite(directory: string, record: StoredShare): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${record.id}.${randomBytes(12).toString('hex')}.tmp`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(record)); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, join(directory, `${record.id}.json`));
    const folder = await open(directory, 'r');
    try { await folder.sync(); } finally { await folder.close(); }
  } finally { await rm(temporary, { force: true }); }
}
async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = writes.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolveLock => { release = resolveLock; });
  writes.set(key, current);
  await previous;
  try { return await action(); }
  finally { release(); if (writes.get(key) === current) writes.delete(key); }
}

/** Single-process capability API. The disk directory must never be a public asset directory. */
export function createSharingMiddleware(options: SharingOptions = {}) {
  const directory = storageDirectory(options);
  const publicOrigin = configuredOrigin(options.publicOrigin ?? process.env.VARPET_PUBLIC_ORIGIN);
  return async (request: IncomingMessage, response: ServerResponse, next: () => void): Promise<void> => {
    const path = (request.url ?? '/').split('?')[0]!;
    if (path !== '/api/shares' && !path.startsWith('/api/shares/')) return next();
    try {
      if (!sameOrigin(request, publicOrigin)) throw new SharingError(403, 'Sharing requests must come from this site.');
      if (path === '/api/shares' && request.method === 'POST') {
        const content = snapshot(await body(request), false);
        const id = randomBytes(16).toString('hex');
        const viewToken = randomBytes(32).toString('base64url'), editToken = randomBytes(32).toString('base64url');
        const updatedAt = new Date().toISOString();
        await atomicWrite(directory, { ...content, storageVersion: 1, id, viewToken,
          editTokenHash: hash(editToken).toString('hex'), version: 1, updatedAt });
        return send(response, 201, { id, viewToken, editToken, version: 1, updatedAt });
      }
      const id = path.slice('/api/shares/'.length);
      if (path !== '/api/shares' && !ID.test(id)) throw new SharingError(404, 'This sharing link is unavailable.');
      if (path === '/api/shares' || !['GET', 'PUT'].includes(request.method ?? '')) {
        response.setHeader('Allow', path === '/api/shares' ? 'POST' : 'GET, PUT');
        throw new SharingError(405, 'This sharing request method is not supported.');
      }
      const token = bearer(request);
      const record = await read(directory, id);
      const permission = access(record, token);
      if (!permission) throw new SharingError(404, 'This sharing link is unavailable.');
      if (request.method === 'GET') return send(response, 200, { id, scene: record.scene, catalog: record.catalog,
        version: record.version, updatedAt: record.updatedAt, access: permission,
        ...(permission === 'edit' ? { viewToken: record.viewToken } : {}) });
      if (permission !== 'edit') throw new SharingError(403, 'This sharing link only allows viewing.');
      const content = snapshot(await body(request), true);
      const saved = await serialized(join(directory, id), async () => {
        const current = await read(directory, id);
        if (access(current, token) !== 'edit') throw new SharingError(404, 'This sharing link is unavailable.');
        if (content.scene.id !== current.scene.id) throw new SharingError(400, 'A different project needs its own sharing link.');
        if (content.version !== current.version) throw new SharingError(409, 'This shared project has changed. Reopen its latest version before saving.');
        if (current.version >= Number.MAX_SAFE_INTEGER) throw new Error('Sharing version limit reached.');
        const version = current.version + 1;
        const updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
        await atomicWrite(directory, { ...current, scene: content.scene, catalog: content.catalog, version, updatedAt });
        return { version, updatedAt };
      });
      send(response, 200, saved);
    } catch (error) {
      request.resume();
      if (!response.destroyed && !response.writableEnded) send(response,
        error instanceof SharingError ? error.status : 503,
        { reason: error instanceof SharingError ? error.message : 'Sharing storage is unavailable. Please try again.' });
    }
  };
}

/** Vite serves the same sharing API during development and production preview. */
export function sharingPlugin(options: SharingOptions = {}): Plugin {
  let middleware: ReturnType<typeof createSharingMiddleware>;
  return {
    name: 'varpet-sharing',
    configResolved(config: ResolvedConfig) {
      middleware = createSharingMiddleware({ ...options, forbiddenRoots: [
        ...(options.forbiddenRoots ?? []), config.root, resolve(config.root, '../..'),
        ...config.server.fs.allow, ...(config.publicDir ? [config.publicDir] : []),
        resolve(config.root, config.build.outDir),
      ] });
    },
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
