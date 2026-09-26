import type { CatalogAsset, SceneDocument, SceneObject } from '../../editor/src/contracts';
import type { Ownership } from './contracts';

export type QuoteGroupId = 'shop' | 'workshop' | 'developer' | 'yours';
export interface QuoteLine { tag: string; name: string; size: string; count: number; unit: number | null; note?: string }
export interface QuoteGroup { id: QuoteGroupId; lines: QuoteLine[] }
export interface Quote { groups: QuoteGroup[]; total: number; real: number; pieces: number }

export interface QuoteInput {
  scene: SceneDocument;
  catalog: CatalogAsset[];
  /** Objects that came with the developer's flat. */
  original: Set<string>;
  ownership: Map<string, Ownership>;
  /** Asset ids that are custom pieces (slots and built pieces). */
  custom: Set<string>;
  /** Object id to the piece number shown in the picture, legend and room. */
  keys: Map<string, number>;
}

/** Size as a buyer reads it: width × depth × height in cm (the editor stores [w, h, d] in metres). */
export function sizeOf(asset: CatalogAsset, object?: SceneObject): string {
  const [w, h, d] = asset.dimensions.map((v, i) => Math.round(v * (object?.scale[i] ?? 1) * 100));
  return `${w} × ${d} × ${h} cm`;
}

/**
 * What it costs to make this flat real, grouped by who you would talk to.
 * Owned pieces cost 0; the developer's placeholders are still to buy; custom pieces are estimates.
 * A developer piece the designer picked from a shop counts as a shop purchase, unless the buyer owns it.
 * "Real" means owned or a product you can buy; placeholders and estimates are not counted.
 */
export function buildQuote(input: QuoteInput): Quote {
  const byId = new Map(input.catalog.map(asset => [asset.id, asset]));
  const groups = new Map<QuoteGroupId, QuoteLine[]>([['shop', []], ['workshop', []], ['developer', []], ['yours', []]]);
  let total = 0, real = 0, pieces = 0;
  for (const object of input.scene.objects) {
    const asset = byId.get(object.assetId);
    if (!asset) continue;
    pieces++;
    const key = input.keys.get(object.id);
    let group: QuoteGroupId, unit: number | null = asset.price > 0 ? asset.price : null, note: string | undefined;
    if (input.custom.has(asset.id)) { group = 'workshop'; note = 'estimate, the workshop confirms'; }
    else if (input.original.has(object.id) && input.ownership.get(object.id) === 'owned') { group = 'yours'; unit = 0; real++; }
    else if (input.original.has(object.id) && !key) { group = 'developer'; if (unit === null) note = 'placeholder, not for sale'; }
    else { group = 'shop'; if (unit !== null) real++; }
    if (unit) total += unit;
    const lines = groups.get(group)!;
    const tag = key ? String(key) : '';
    const same = !key && lines.find(line => !line.tag && line.name === asset.name && line.unit === unit);
    if (same) same.count++;
    else lines.push({ tag, name: asset.name, size: sizeOf(asset, object), count: 1, unit, ...(note ? { note } : {}) });
  }
  return { groups: [...groups].map(([id, lines]) => ({ id, lines })).filter(group => group.lines.length), total, real, pieces };
}
