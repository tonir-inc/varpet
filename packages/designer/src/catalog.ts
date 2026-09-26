import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
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
  colors_listing: string[]; colors_image: string[]; styles: string[]; item: PlaceItem;
}
export interface CatalogResult {
  status: 'available' | 'unavailable'; results: CatalogProduct[]; excluded_records: number;
  ranking_note: string; reason?: string;
}

const sizedRecord = z.object({
  id: text, kind: text, name: text.nullish(), size_m: z.tuple([positive, positive, positive]),
  price: z.number().int().nonnegative().safe(), currency: z.literal('AMD'),
  vendor: text.nullish(), source: text.nullish(), price_source: text.nullish(),
  size_status: text.nullish(), size_evidence: z.unknown().optional(), wd_swapped: z.boolean().optional(),
  colors_listing: z.array(z.string()).nullish(), colors_image: z.array(z.string()).nullish(), styles: z.array(z.string()).nullish(),
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

const queryCatalog: CatalogQuery = async input => {
  if (!process.env.VARPET_DB_URL) throw new Error('Catalog database is not configured');
  const directory = fileURLToPath(new URL('../../../catalog/', import.meta.url));
  const { stdout } = await execute('uv', ['run', '--no-sync', '--offline', '--directory', directory, 'python', '-c', pythonSearch, JSON.stringify(input)], {
    timeout: 20_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, UV_PYTHON_DOWNLOADS: 'never' },
  });
  return JSON.parse(stdout);
};

/** Read-only catalog search. The injected query is also the deterministic test seam. */
export async function searchCatalog(input: unknown, query: CatalogQuery = queryCatalog): Promise<CatalogResult> {
  const request = searchCatalogInputSchema.parse(input);
  let response: unknown;
  try { response = await query(request); }
  catch {
    // Subprocess errors can contain a database URL; never return their raw text.
    return { status: 'unavailable', results: [], excluded_records: 0, ranking_note: rankingNote,
      reason: 'Catalog unavailable. Configure VARPET_DB_URL and the installed catalog Python environment. No products or prices are available to propose.' };
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
      || !(fits(w, d) || (request.allow_rotate !== false && fits(d, w)))) { excluded++; continue; }
    const name = record.name ?? record.id;
    const item: PlaceItem = { id: record.id, kind: record.kind, name, size: record.size_m, sku: record.id, price: record.price,
      ...(record.vendor ? { vendor: record.vendor } : {}) };
    products.push({ sku: record.id, kind: record.kind, name, size: record.size_m, price: record.price, currency: 'AMD',
      vendor: record.vendor ?? null, source: record.source ?? null, price_source: record.price_source ?? null,
      size_status: record.size_status ?? null, size_evidence: record.size_evidence ?? null, wd_swapped: record.wd_swapped ?? false,
      colors_listing: record.colors_listing ?? [], colors_image: record.colors_image ?? [], styles: record.styles ?? [], item });
  }
  const results = products.slice(0, request.limit ?? 10);
  return { status: 'available', results, excluded_records: excluded, ranking_note: rankingNote,
    ...(results.length ? {} : { reason: 'No sized, priced AMD products match these constraints.' }) };
}
