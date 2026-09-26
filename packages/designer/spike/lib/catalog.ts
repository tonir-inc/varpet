/** Designer-spike catalog lookup: compact products for a Codex thread, plus a labelled contact
 * sheet PNG so a vision model can compare looks. Read-only reuse of ../../src/catalog.ts; this
 * file only reshapes its output and renders SVG -> PNG with @resvg/resvg-js. */
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { catalogItems, createHttpCatalogQuery, type CatalogInput } from '../../src/catalog.js';

export interface Product {
  sku: string;
  kind: string;
  name: string;
  size: [number, number, number];
  price: number;
  vendor: string;
  image?: string;
}

export interface SearchInput {
  kind?: string;
  text?: string;
  maxW?: number;
  maxD?: number;
  maxH?: number;
  maxPrice?: number;
  style?: string;
  limit?: number;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asSize(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [w, d, h] = value.map(asNumber);
  return w !== undefined && d !== undefined && h !== undefined ? [w, d, h] : undefined;
}

function shorten(name: string, max: number): string {
  return name.length <= max ? name : name.slice(0, max - 1).trimEnd() + '…';
}

/** Compact, priced, sized products. kind/size/price are hard filters (as in the underlying
 * catalog); text and style only rank what passed. Prices are whole-AMD integers. */
export async function search(input: SearchInput = {}): Promise<Product[]> {
  const query = createHttpCatalogQuery();
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 10), 1), 20);
  const request: CatalogInput = {
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.text ? { text: input.text } : {}),
    ...(input.maxW !== undefined ? { max_w: input.maxW } : {}),
    ...(input.maxD !== undefined ? { max_d: input.maxD } : {}),
    ...(input.maxH !== undefined ? { max_h: input.maxH } : {}),
    ...(input.maxPrice !== undefined ? { price_max: Math.round(input.maxPrice) } : {}),
    ...(input.style ? { styles: [input.style] } : {}),
    limit,
  };
  const response = await query(request);
  const results = response && typeof response === 'object' && Array.isArray((response as { results?: unknown }).results)
    ? (response as { results: unknown[] }).results : [];

  const products: Product[] = [];
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const sku = asString(record.id);
    const kind = asString(record.kind);
    const name = asString(record.name);
    const size = asSize(record.size_m);
    const price = asNumber(record.price);
    if (!sku || !kind || !name || !size || price === undefined) continue;
    const image = asString(record.main_image_url) ?? asString(record.image) ?? asString(record.preview);
    products.push({
      sku, kind, name: shorten(name, 70), size, price: Math.round(price),
      vendor: asString(record.brand) ?? asString(record.source) ?? 'unknown',
      ...(image ? { image } : {}),
    });
  }
  return products;
}

const TILE = 220, GUTTER = 16, LABEL_H = 76, COLUMNS = 4;

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** http(s) urls are fetched; anything else is read as a local file path. Missing or failed
 * images leave the tile blank rather than failing the whole sheet. */
async function imageDataUri(source: string | undefined): Promise<string | undefined> {
  if (!source) return undefined;
  try {
    if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return undefined;
      const buffer = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get('content-type') || 'image/jpeg';
      return `data:${type};base64,${buffer.toString('base64')}`;
    }
    const buffer = await readFile(source);
    const ext = source.split('.').pop()?.toLowerCase();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** Numbered grid contact sheet: sku, short name, size and price under each tile. Looks up
 * images/metadata for `skus` via the shared catalog client (get_item per id). */
export async function productSheet(skus: string[], outPng: string): Promise<string> {
  const ids = skus.slice(0, 16);
  const details = await catalogItems(ids);
  const byId = new Map(details.map(d => [String((d as Record<string, unknown>).id), d as Record<string, unknown>]));

  const columns = Math.max(1, Math.min(COLUMNS, ids.length || 1));
  const rowCount = Math.max(1, Math.ceil(ids.length / columns));
  const cellW = TILE + GUTTER, cellH = TILE + LABEL_H + GUTTER;
  const width = columns * cellW + GUTTER, height = rowCount * cellH + GUTTER;

  const images = await Promise.all(ids.map(id => {
    const record = byId.get(id);
    const url = record ? (asString(record.main_image_url) ?? asString(record.preview_url)) : undefined;
    return imageDataUri(url);
  }));

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
  ];
  ids.forEach((id, index) => {
    const record = byId.get(id);
    const column = index % columns, row = Math.floor(index / columns);
    const x = GUTTER + column * cellW, y = GUTTER + row * cellH;
    parts.push(`<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" fill="#eeeeee" stroke="#cccccc"/>`);
    const dataUri = images[index];
    if (dataUri) parts.push(`<image x="${x}" y="${y}" width="${TILE}" height="${TILE}" href="${dataUri}" preserveAspectRatio="xMidYMid meet"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="32" height="24" fill="#000000"/>`);
    parts.push(`<text x="${x + 16}" y="${y + 17}" font-size="14" fill="#ffffff" text-anchor="middle" font-family="sans-serif">${index + 1}</text>`);

    const name = record ? shorten(asString(record.name) ?? id, 32) : id;
    const size = record ? asSize(record.size_m) : undefined;
    const sizeLabel = size ? `${size[0].toFixed(2)}×${size[1].toFixed(2)}×${size[2].toFixed(2)} m` : 'size unknown';
    const price = record ? asNumber(record.price) : undefined;
    const priceLabel = price !== undefined ? `${Math.round(price)} AMD` : 'price unknown';

    const textX = x + TILE / 2, baseY = y + TILE + 16;
    parts.push(`<text x="${textX}" y="${baseY}" font-size="12" fill="#111111" text-anchor="middle" font-family="sans-serif">${escapeXml(id)}</text>`);
    parts.push(`<text x="${textX}" y="${baseY + 16}" font-size="12" fill="#111111" text-anchor="middle" font-family="sans-serif">${escapeXml(name)}</text>`);
    parts.push(`<text x="${textX}" y="${baseY + 32}" font-size="12" fill="#111111" text-anchor="middle" font-family="sans-serif">${escapeXml(sizeLabel)}</text>`);
    parts.push(`<text x="${textX}" y="${baseY + 48}" font-size="12" fill="#111111" text-anchor="middle" font-family="sans-serif">${escapeXml(priceLabel)}</text>`);
  });
  parts.push('</svg>');

  const png = new Resvg(parts.join(''), { font: { loadSystemFonts: true } }).render().asPng();
  await writeFile(outPng, png);
  return outPng;
}
