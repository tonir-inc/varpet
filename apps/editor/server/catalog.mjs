import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const DEFAULT_CATALOG_URL = 'http://100.107.246.46:8765/mcp';
const unavailable = { status: 'unavailable', results: [],
  reason: 'Catalog unavailable. Check the catalog service connection and try again.' };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function payload(result) {
  if (result.isError) throw new Error('Catalog tool failed');
  if (object(result.structuredContent)) return result.structuredContent;
  for (const block of result.content ?? []) {
    if (block.type !== 'text') continue;
    try {
      const parsed = JSON.parse(block.text);
      if (object(parsed)) return parsed;
    } catch { /* Continue to a later structured text block. */ }
  }
  throw new Error('Catalog tool returned no record');
}

/** Each browser request uses a read-only MCP session and a single wall deadline. */
async function queryCatalog(options, action) {
  const controller = new AbortController();
  const requestOptions = { signal: controller.signal, timeout: options.timeoutMs, maxTotalTimeout: options.timeoutMs };
  const transport = new StreamableHTTPClientTransport(options.url, {
    fetch: (url, init) => options.fetch(url, { ...init,
      signal: init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal }),
    reconnectionOptions: { initialReconnectionDelay: 100, maxReconnectionDelay: 100,
      reconnectionDelayGrowFactor: 1, maxRetries: 0 },
  });
  const client = new Client({ name: 'varpet-editor-catalog', version: '1' });
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Catalog deadline exceeded')); }, options.timeoutMs);
  });
  const read = async (name, args = {}) => payload(await client.callTool({ name, arguments: args }, undefined, requestOptions));
  const work = async () => {
    await client.connect(transport, requestOptions);
    return action(read);
  };
  try {
    return await Promise.race([work(), expired]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    await Promise.allSettled([client.close(), transport.close()]);
  }
}

async function item(read, id, allowMissing = false) {
  const detail = await read('get_item', { item_id: id });
  if (allowMissing && typeof detail.error === 'string' && /^no item\b/.test(detail.error)) return null;
  if (detail.id !== id) throw new Error('Catalog detail identity mismatch');
  return detail;
}

function send(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

const MODEL = /^\/api\/catalog\/models\/([A-Za-z0-9_-]{1,120}\.glb)$/;
const MODEL_TIMEOUT_MS = 60_000;

/** The catalog's 1024 px copy of a model (optimize_models.py), relayed so the browser never needs the tailnet.
 * No copy is an uncached 404, and the asset loader falls back to the S3 original. */
async function relayModel(settings, name, response) {
  let upstream = null;
  try {
    upstream = await settings.fetch(new URL(`/models/${name}`, settings.url), { method: 'GET', signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) });
  } catch { /* 502 below */ }
  if (!upstream?.ok || !upstream.body) {
    response.writeHead(upstream?.status === 404 ? 404 : 502, { 'Cache-Control': 'no-store' });
    return response.end();
  }
  const length = upstream.headers.get('content-length');
  response.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'public, max-age=31536000, immutable',
    ...(length ? { 'Content-Length': length } : {}) });
  await pipeline(Readable.fromWeb(upstream.body), response).catch(() => response.destroy());
}

/** Server-only URL; never exposed through Vite's client environment or bundled source. */
export function createCatalogMiddleware(options = {}) {
  const url = new URL(options.url || DEFAULT_CATALOG_URL);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Catalog URL must use HTTP or HTTPS');
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15_000) throw new Error('Invalid catalog timeout');
  const settings = { url, timeoutMs, fetch: options.fetch ?? globalThis.fetch };
  return async (request, response, next) => {
    const path = new URL(request.url ?? '/', 'http://localhost');
    if (path.pathname.startsWith('/api/catalog/models/')) {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return send(response, 405, { reason: 'Model files only support GET.' });
      }
      const model = MODEL.exec(path.pathname);
      if (!model) { response.writeHead(404, { 'Cache-Control': 'no-store' }); return response.end(); }
      return relayModel(settings, model[1], response);
    }
    if (!['/api/catalog/search', '/api/catalog/items', '/api/catalog/vocab'].includes(path.pathname)) return next();
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return send(response, 405, { reason: 'Catalog endpoints only support GET.' });
    }
    const text = path.searchParams.get('text')?.trim();
    const kind = path.searchParams.get('kind')?.trim();
    const ids = [...new Set((path.searchParams.get('ids') ?? '').split(',').map(id => id.trim()).filter(Boolean))];
    const offsetText = path.searchParams.get('offset') ?? '0';
    const offset = /^\d{1,6}$/.test(offsetText) ? Number(offsetText) : -1;
    if ((path.pathname.endsWith('/search') && ((text?.length ?? 0) > 1000 || (kind?.length ?? 0) > 100 || offset < 0 || offset > 100_000))
      || (path.pathname.endsWith('/items') && (!ids.length || ids.length > 100 || ids.some(id => id.length > 256)))) {
      return send(response, 400, { reason: 'Invalid catalog query.' });
    }
    try {
      const data = await queryCatalog(settings, async read => {
        if (path.pathname.endsWith('/vocab')) return read('list_vocab');
        if (path.pathname.endsWith('/items')) {
          const rows = await Promise.all(ids.map(id => item(read, id, true)));
          return { results: rows.filter(Boolean), missing_ids: ids.filter((_, index) => !rows[index]) };
        }
        const search = await read('search_furniture', { ...(text ? { text } : {}), ...(kind ? { kind } : {}), limit: 20, ...(offset ? { offset } : {}) });
        if (!Array.isArray(search.results)) throw new Error('Catalog search returned no list');
        const results = await Promise.all(search.results.slice(0, 20).map(async raw => {
          if (!object(raw) || typeof raw.id !== 'string' || !raw.id) throw new Error('Invalid catalog search record');
          // Keep actual mesh/listing size and conservative fit size separate. The
          // client chooses fit dimensions for placement and rotates wd_swapped meshes.
          return { ...raw, ...await item(read, raw.id) };
        }));
        return { ...search, results };
      });
      send(response, 200, data);
    } catch {
      // Upstream exceptions can contain URLs, credentials or SQL diagnostics.
      send(response, 503, unavailable);
    }
  };
}

export function catalogPlugin(options = {}) {
  const middleware = createCatalogMiddleware(options);
  return {
    name: 'varpet-catalog',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
