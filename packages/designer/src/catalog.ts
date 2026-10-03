import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import type { PlaceRequest } from './place.js';

const text = z.string().trim().min(1), positive = z.number().finite().positive();
export const searchCatalogInputSchema = z.object({
  kind: text.optional(), max_w: positive.optional(), max_d: positive.optional(), max_h: positive.optional(),
  price_max: z.number().int().nonnegative().safe().optional(),
  colors: z.array(text).max(20).optional(), styles: z.array(text).max(20).optional(),
  text: text.max(1000).optional(), allow_rotate: z.boolean().optional(), limit: z.number().int().min(1).max(20).optional(),
}).strict();
export type CatalogInput = z.infer<typeof searchCatalogInputSchema>;
export type CatalogQuery = (input: CatalogInput) => Promise<unknown>;
type PlaceItem = NonNullable<PlaceRequest['item']>;
export interface CatalogProduct {
  sku: string; kind: string; name: string; size: [number, number, number]; price: number; currency: 'AMD';
  vendor: string | null; source: string | null; price_source: string | null;
  size_status: string | null; size_evidence: unknown; wd_swapped: boolean;
  colors_listing: string[]; colors_image: string[]; styles: string[]; styles_inferred?: string[]; item: PlaceItem;
  fit_slots?: unknown[];
}
export interface CatalogResult {
  status: 'available' | 'unavailable'; results: CatalogProduct[]; excluded_records: number;
  ranking_note: string; reason?: string; retryable?: boolean; fit_budget_exhausted?: boolean; fit_note?: string; timing?: unknown;
}

const sizedRecord = z.object({
  id: text, kind: text, name: text.nullish(), size_m: z.tuple([positive, positive, positive]),
  price: z.number().int().nonnegative().safe(), currency: z.literal('AMD'),
  vendor: text.nullish(), source: text.nullish(), price_source: text.nullish(),
  size_status: text.nullish(), size_evidence: z.unknown().optional(), wd_swapped: z.boolean().optional(),
  colors_listing: z.array(z.string()).nullish(), colors_image: z.array(z.string()).nullish(), styles: z.array(z.string()).nullish(), style_astra:z.array(z.string()).nullish(),
  fit_slots:z.array(z.unknown()).optional(),
});
const rankingNote = 'Colors, styles and text rank catalog matches; kind, dimensions and price are hard filters. Price provenance is explicit; mock prices are not shop quotations.';
const execute = promisify(execFile);

// Use the catalog lane's search implementation. FTS avoids embedding-model downloads;
// metadata comes from the same database records, never from a generated fallback.
const pythonSearch = `
import json, os, sys
import psycopg
from search import Query, search
p = json.loads(sys.argv[1])
box = [p.get(k, 1e30) for k in ('max_w', 'max_d', 'max_h')] if any(k in p for k in ('max_w', 'max_d', 'max_h')) else None
q = Query(kind=p.get('kind'), text=p.get('text'), colors=p.get('colors', []), styles=p.get('styles', []),
          fit_box=box, allow_rotate=p.get('allow_rotate', True), price_max=p.get('price_max'),
          limit=p.get('limit', 10), text_mode='fts')
with psycopg.connect(os.environ['VARPET_DB_URL'], connect_timeout=5) as c:
    c.execute("set statement_timeout = '10s'")
    result = search(c, q)
    ids = [r['id'] for r in result['results']]
    if ids:
        rows = c.execute('select id, source, price_source, currency, size_evidence from item where id = any(%s)', (ids,)).fetchall()
        metadata = {r[0]: dict(zip(('source', 'price_source', 'currency', 'size_evidence'), r[1:])) for r in rows}
        for r in result['results']:
            r.update(metadata.get(r['id'], {}))
print(json.dumps(result))
`;

const queryDatabase: CatalogQuery = async input => {
  if (!process.env.VARPET_DB_URL) throw new Error('Catalog database is not configured');
  const directory = fileURLToPath(new URL('../../../catalog/', import.meta.url));
  const { stdout } = await execute('uv', ['run', '--no-sync', '--offline', '--directory', directory, 'python', '-c', pythonSearch, JSON.stringify(input)], {
    timeout: 20_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, UV_PYTHON_DOWNLOADS: 'never' },
  });
  return JSON.parse(stdout);
};

export const DEFAULT_CATALOG_URL = 'http://100.107.246.46:8765/mcp';
/** The one catalog endpoint for every designer call; an empty setting counts as unset. */
export const catalogUrl = () => process.env.VARPET_CATALOG_URL || DEFAULT_CATALOG_URL;
/** The catalog slows sharply under concurrent requests; fan out at most this far. */
export const CATALOG_CONCURRENCY = 2;
export async function mapLimited<T, R>(values: readonly T[], limit: number, work: (value: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(values.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) { const index = next++; out[index] = await work(values[index]!); }
  }));
  return out;
}
export const CATALOG_BUSY = 'The catalog is slow or busy right now (the request timed out). This is temporary: retry the same call in a moment. It is not a missing product or a broken connection.';
/** A timeout anywhere in the cause chain (abort, undici connect/headers timeout, MCP request timeout). */
export function catalogTimedOut(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && typeof current === 'object' && depth < 4; depth++) {
    const e = current as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
    if (/AbortError|TimeoutError|timed? ?out|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT/i.test(`${e.name ?? ''} ${e.code ?? ''} ${e.message ?? ''}`)) return true;
    current = e.cause;
  }
  return false;
}
interface HttpCatalogOptions { url?: string; timeoutMs?: number; fetch?: typeof globalThis.fetch }

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toolPayload(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
  if (result.isError) throw new Error('Catalog tool failed');
  if (object(result.structuredContent)) return result.structuredContent;
  for (const content of Array.isArray(result.content) ? result.content : []) {
    if (!object(content) || content.type !== 'text' || typeof content.text !== 'string') continue;
    try {
      const payload: unknown = JSON.parse(content.text);
      if (object(payload)) return payload;
    } catch { /* Another text block may contain the structured result. */ }
  }
  throw new Error('Catalog returned no structured result');
}

type CatalogCall = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;

interface Live { client: Client; transport: StreamableHTTPClientTransport; controller: AbortController }
/** Default-endpoint sessions shared by every query and items function in this process (keyed by URL). */
const shared = new Map<string, { live?: Promise<Live> }>();

/** One read-only MCP session per process and endpoint, opened lazily on the first call and kept alive; a failed or
 * timed-out call drops it so the next call reconnects, and a call that failed on a reused session is retried once on a
 * fresh one. Every call of the returned function has one wall deadline for everything in it (connect included). */
function catalogSession(options: HttpCatalogOptions) {
  const url = new URL(options.url || catalogUrl()), timeoutMs = options.timeoutMs ?? 20_000;
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Catalog URL must use HTTP or HTTPS');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Catalog timeout must be positive and finite');
  const fetch = options.fetch ?? globalThis.fetch;
  // An injected fetch (tests) gets its own session; the real endpoint is shared across the process.
  const slot = options.fetch ? { live: undefined as Promise<Live> | undefined } : (shared.get(url.href) ?? shared.set(url.href, {}).get(url.href)!);
  const open = async (signal: AbortSignal): Promise<Live> => {
    const controller = new AbortController();
    const transport = new StreamableHTTPClientTransport(url, {
      // No standalone GET event stream: it would hold the process open, and search needs only request/response.
      fetch: (target, init) => (init?.method ?? 'GET').toUpperCase() === 'GET' ? Promise.resolve(new Response(null, { status: 405 }))
        : fetch(target, { ...init, signal: init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal }),
      reconnectionOptions: { initialReconnectionDelay: 100, maxReconnectionDelay: 100, reconnectionDelayGrowFactor: 1, maxRetries: 0 },
    });
    const client = new Client({ name: 'varpet-designer-catalog', version: '1' });
    await client.connect(transport, { signal, timeout: timeoutMs, maxTotalTimeout: timeoutMs });
    return { client, transport, controller };
  };
  const drop = async (session: Promise<Live>) => {
    if (slot.live === session) slot.live = undefined;
    const live = await session.catch(() => undefined);
    if (!live) return;
    live.controller.abort();
    await live.client.close().catch(() => undefined);
  };
  return async <T>(work: (call: CatalogCall) => Promise<T>): Promise<T> => {
    const deadline = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const expired = new Promise<never>((_, reject) => {
      // A stalled request leaves the session unusable: abort its HTTP traffic and let the next call reconnect.
      timer = setTimeout(() => { deadline.abort(); if (slot.live) void drop(slot.live); reject(new Error('Catalog request timed out')); }, timeoutMs);
    });
    const requestOptions = { signal: deadline.signal, timeout: timeoutMs, maxTotalTimeout: timeoutMs };
    const attempt = async (retry: boolean): Promise<T> => {
      const reused = slot.live !== undefined, session = slot.live ??= open(deadline.signal);
      try {
        const { client } = await session;
        return await work(async (name, args) => toolPayload(await client.callTool({ name, arguments: args }, undefined, requestOptions)));
      } catch (error) {
        // A tool error is an answer, not a broken session; anything else (timeout, transport, expired session) reconnects.
        if (error instanceof Error && error.message === 'Catalog tool failed') throw error;
        await drop(session);
        if (retry && reused && !deadline.signal.aborted) return attempt(false);
        throw error;
      }
    };
    try { return await Promise.race([attempt(true), expired]); }
    finally { clearTimeout(timer!); }
  };
}

/** search_furniture rows already carry currency, provenance and fit size; only rows without them need get_item. */
const complete = (raw: Record<string, unknown>) => typeof raw.currency === 'string' && 'source' in raw && 'price_source' in raw
  && 'size_evidence' in raw && Array.isArray(raw.size_m);

/** One read-only MCP session with one wall deadline for connect, search and provenance. */
export function createHttpCatalogQuery(options: HttpCatalogOptions = {}): CatalogQuery {
  const session = catalogSession(options);
  return input => session(async call => {
    const response = await call('search_furniture', input);
    if (!Array.isArray(response.results)) throw new Error('Catalog search returned no result list');
    // Bare bed bases are dropped here too, so every caller of this query (including the designer spike) is covered.
    const results = await mapLimited(response.results.filter(raw => !bareBedBase(raw)).slice(0, input.limit ?? 10), CATALOG_CONCURRENCY, async raw => {
      if (!object(raw) || typeof raw.id !== 'string' || !raw.id) return raw;
      if (complete(raw)) return raw;
      // search_furniture supplies ranked fit dimensions; get_item supplies the
      // actual currency and provenance. Neither is inferred from the endpoint.
      const detail = await call('get_item', { item_id: raw.id });
      if (detail.id !== raw.id) throw new Error('Catalog detail identity does not match search');
      return { ...raw, ...detail, size_m: detail.fit_size_m ?? raw.size_m ?? detail.size_m,
        colors_listing: raw.colors_listing, colors_image: raw.colors_image,
        currency: detail.currency, source: detail.source, price_source: detail.price_source,
        size_evidence: detail.size_evidence };
    });
    return { ...response, results };
  });
}

/** get_item records by id over one session; ids the catalog does not have are left out. */
export function createHttpCatalogItems(options: HttpCatalogOptions = {}): (ids: string[]) => Promise<Record<string, unknown>[]> {
  const session = catalogSession(options);
  return ids => session(async call => {
    const found: Record<string, unknown>[] = [];
    for (const id of new Set(ids)) {
      const detail = await call('get_item', { item_id: id });
      if (typeof detail.error === 'string') continue;
      if (detail.id !== id) throw new Error('Catalog detail identity does not match the requested id');
      found.push(detail);
    }
    return found;
  });
}

/** Products by id from the configured catalog service (VARPET_CATALOG_URL, else the documented endpoint). */
export const catalogItems = (ids: string[]) => createHttpCatalogItems({ url: process.env.VARPET_CATALOG_URL || undefined })(ids);

const queryCatalog: CatalogQuery = input => {
  if(process.env.VARPET_CATALOG_PROXY)return proxyCatalogQuery()(input);
  const url = process.env.VARPET_CATALOG_URL;
  if (url) return createHttpCatalogQuery({ url })(input);
  if (process.env.VARPET_DB_URL) return queryDatabase(input);
  return createHttpCatalogQuery()(input);
};

export function proxyCatalogQuery(roomId?:string,removals:{remake?:boolean;remove_ids?:string[]}={},planning=false):CatalogQuery {
 return async query=>{
  const response=await fetch(process.env.VARPET_CATALOG_PROXY+'search',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({query,context:process.env.VARPET_CATALOG_CONTEXT,room_id:roomId,...removals,planning}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Catalog fit cache unavailable');return response.json();
 };
}

/** A support frame, base, box spring, rollaway or loose mattress is not a bed a customer can sleep in as shown.
 * The catalog files these under `bed`; the designer must never offer them as the bed (Balcony Bedroom 1, 26 Sept). */
export function isBareBedBase(name: string): boolean {
  if (/\bheadboard\b/i.test(name)) return false;
  return /\bsupport\b.*\bbed frame\b|\bbed frame\b.*\bsupport for box spring|(?<!\bno )\bbox spring\b(?! needed)|\bbed base\b|\bfoundation\b|\bslats? only\b|\bmattress only\b|\bsteel slats\b|\bmetal platform bed frame\b|\bbed (?:legs|risers?)\b|\breplacement legs\b|\brollaway\b|\bfold(?:ing|able)\b|\bguest bed\b|\bcot\b/i.test(name)
    || (/\bmattress\b/i.test(name) && !/\bbed\b/i.test(name));
}
const bareBedBase = (raw: unknown) => object(raw) && raw.kind === 'bed' && isBareBedBase(typeof raw.name === 'string' ? raw.name : '');
/** Wall fittings and the extra catalog's wall and ceiling lamps became placeable in search on 2026-10-03 for the editor,
 * which mounts them (SCONCE_NAME, CEILING_LAMP_NAME, a hood over the hob). The designer cannot mount them yet (mounts.ts
 * hangs only curtains and planters): offered, they would stand on the floor or a table. It keeps offering exactly what
 * it offered before (the three ABO pendants and sconce were placeable already). */
const MOUNTED_FITTINGS = new Set(['range_hood', 'water_heater', 'towel_rail']);
const MOUNTED_LAMP = /\bsconces?\b|\bwall[- ](lamp|light)s?\b|\bceiling (light|lamp)s?\b|\bpendant\b|\bflush[- ]mount(ed)?\b/i;
export const designerCannotMount = (kind: string, name: string, source: string | null | undefined) =>
  MOUNTED_FITTINGS.has(kind) || (kind === 'lamp' && source !== 'abo' && MOUNTED_LAMP.test(name));

/** Read-only catalog search. The injected query is also the deterministic test seam. */
export async function searchCatalog(input: unknown, query: CatalogQuery = queryCatalog): Promise<CatalogResult> {
  const request = searchCatalogInputSchema.parse(input);
  let response: unknown;
  try { response = await query(request); }
  catch (error) {
    // Subprocess errors can contain a database URL; never return their raw text.
    if (catalogTimedOut(error)) return { status: 'unavailable', results: [], excluded_records: 0, ranking_note: rankingNote, retryable: true,
      reason: CATALOG_BUSY + ' No products or prices are available from this attempt.' };
    return { status: 'unavailable', results: [], excluded_records: 0, ranking_note: rankingNote,
      reason: 'Catalog unavailable. Check the catalog MCP service and Tailscale connection (VARPET_CATALOG_URL), or the explicitly configured VARPET_DB_URL backend. No products or prices are available to propose.' };
  }
  if (!response || typeof response !== 'object' || !('results' in response) || !Array.isArray(response.results)) {
    return { status: 'unavailable', results: [], excluded_records: 0, ranking_note: rankingNote, reason: 'Catalog unavailable: the backend did not return a valid result list.' };
  }
  let excluded = 0;
  const products: CatalogProduct[] = [];
  for (const raw of response.results) {
    const parsed = sizedRecord.safeParse(raw);
    if (!parsed.success) { excluded++; continue; }
    const record = parsed.data, [w, d, h] = record.size_m;
    const fits = (width: number, depth: number) => width <= (request.max_w ?? Infinity) && depth <= (request.max_d ?? Infinity) && h <= (request.max_h ?? Infinity);
    if ((request.kind && record.kind !== request.kind) || record.price > (request.price_max ?? Infinity)
      || bareBedBase(record)
      || designerCannotMount(record.kind, record.name ?? '', record.source)
      || !(fits(w, d) || (request.allow_rotate !== false && fits(d, w)))) { excluded++; continue; }
    const name = record.name ?? record.id;
    const item: PlaceItem = { id: record.id, kind: record.kind, name, size: record.size_m, sku: record.id, price: record.price,
      ...(record.vendor ? { vendor: record.vendor } : {}) };
    products.push({ sku: record.id, kind: record.kind, name, size: record.size_m, price: record.price, currency: 'AMD',
      vendor: record.vendor ?? null, source: record.source ?? null, price_source: record.price_source ?? null,
      size_status: record.size_status ?? null, size_evidence: record.size_evidence ?? null, wd_swapped: record.wd_swapped ?? false,
      colors_listing: record.colors_listing ?? [], colors_image: record.colors_image ?? [], styles: record.styles ?? [], styles_inferred:record.style_astra??[], item,
      ...(record.fit_slots?{fit_slots:record.fit_slots}:{}) });
  }
  const results = products.slice(0, request.limit ?? 10);
  const metadata=response as Record<string,unknown>,incomplete=metadata.fit_budget_exhausted===true;
  return { status: incomplete&&!results.length?'unavailable':'available', results, excluded_records: excluded, ranking_note: rankingNote,
    ...(incomplete?{fit_budget_exhausted:true,reason:'Room-fit search budget exhausted; this is an incomplete list, not evidence of absent or impossible products.'}:results.length?{}:{reason:'No sized, priced AMD products match these constraints.'}),
    ...(typeof metadata.fit_note==='string'?{fit_note:metadata.fit_note}:{}),...(metadata.timing?{timing:metadata.timing}:{}) };
}
