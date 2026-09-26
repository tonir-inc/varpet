/** Functional relations the physics checker cannot see: a dining chair belongs at its table, a TV stands
 * on a unit and faces the seating. Plan metres, rot CCW degrees, front is local -y. */
import type { Draft, DraftItem } from './scene.ts';

type V = [number, number];
const front = (item: DraftItem): V => { const r = (item.rot * Math.PI) / 180; return [Math.sin(r), -Math.cos(r)]; };
/** Distance from a point to an item's rotated footprint (0 inside). */
function toFootprint(p: V, item: DraftItem): number {
  const r = (-item.rot * Math.PI) / 180, dx = p[0] - item.pos[0], dy = p[1] - item.pos[1];
  const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.hypot(Math.max(Math.abs(lx) - item.size[0] / 2, 0), Math.max(Math.abs(ly) - item.size[1] / 2, 0));
}
const isChair = (item: DraftItem) => /chair|stool|bench/.test(item.kind) && item.size[2] > 0.6 && !/\barm(chair)?s?\b|accent|lounge|rocking/i.test(item.name);
/** A table people sit at: desk or dining height. Coffee and side tables are lower. */
const isSeatTable = (item: DraftItem) => /table|desk/.test(item.kind) && item.size[2] >= 0.65;
const SEATING = /sofa|armchair|chair/;

/** The table a chair serves: the closest seat-height table in front of it within 1.6 m. */
function tableFor(chair: DraftItem, items: DraftItem[]): { table: DraftItem; gap: number } | undefined {
  const f = front(chair), edge: V = [chair.pos[0] + f[0] * chair.size[1] / 2, chair.pos[1] + f[1] * chair.size[1] / 2];
  let best: { table: DraftItem; gap: number } | undefined;
  for (const table of items.filter(isSeatTable)) {
    const to: V = [table.pos[0] - chair.pos[0], table.pos[1] - chair.pos[1]], d = Math.hypot(...to);
    if (d > 1.6 || (to[0] * f[0] + to[1] * f[1]) / (d || 1) < 0.5) continue;
    const gap = toFootprint(edge, table);
    if (!best || gap < best.gap) best = { table, gap };
  }
  return best;
}

/** A chair slid under its tabletop is how dining works; footprint overlap there is not a collision. */
export function tuckedPair(ids: readonly string[] | undefined, items: DraftItem[], depth: number | undefined): boolean {
  if (!ids || ids.length !== 2 || (depth ?? 0) > 0.35) return false;
  const [a, b] = ids.map(id => items.find(item => item.id === id));
  if (!a || !b) return false;
  const [chair, table] = isChair(a) ? [a, b] : [b, a];
  return isChair(chair) && isSeatTable(table) && tableFor(chair, [table]) !== undefined;
}

/** Chairs seated at a table (gap <= 0.2 m) and the tables they serve. Their backs stay reachable only if
 * nothing stands within 0.45 m behind the chair, which is checked here instead of front access. */
export function tuckedTargets(items: DraftItem[]): string[] {
  const ids: string[] = [];
  for (const chair of items.filter(isChair)) {
    const hit = tableFor(chair, items);
    if (!hit || hit.gap > 0.2) continue;
    const f = front(chair), back: V = [chair.pos[0] - f[0] * (chair.size[1] / 2 + 0.45), chair.pos[1] - f[1] * (chair.size[1] / 2 + 0.45)];
    if (items.some(other => other !== chair && other.kind !== 'rug' && toFootprint(back, other) === 0)) continue;
    ids.push(chair.id, hit.table.id);
  }
  return ids;
}

/** Catalog beds are frames (slats, platform, base): only a name that says a mattress comes with it counts as made up. */
const MATTRESS_INCLUDED = /\b(with|incl\w*|\+)\s+(an?\s+)?([\w-]+\s+){0,2}mattress(es)?\b|\bmattress\s+included\b/i;
export const isBedFrame = (item: DraftItem) => item.kind === 'bed' && !MATTRESS_INCLUDED.test(item.name ?? '');
export const isMattress = (item: DraftItem) => item.kind === 'mattress' || (item.kind !== 'bed' && /\bmattress\b/i.test(item.name ?? '') && !/\b(frame|foundation|protector|pad|topper)\b/i.test(item.name ?? ''));

/** A bed frame with no mattress on it renders as bare slats; a mattress much narrower or shorter than its frame looks lost. */
function bedRelations(items: DraftItem[]): string[] {
  const problems: string[] = [];
  for (const bed of items.filter(isBedFrame)) {
    const mattresses = items.filter(item => isMattress(item) && item.on === bed.id);
    const [w, d] = bed.size, fit = `--max-w ${w.toFixed(2)} --max-d ${d.toFixed(2)}`;
    if (!mattresses.length) {
      problems.push(`relation: ${bed.id} is a bare bed frame (slats, no mattress); add one: ./varpet search --kind mattress ${fit}, `
        + `then an item with on: "${bed.id}", the same rot and pos as the bed, centred on it`);
      continue;
    }
    for (const m of mattresses) {
      const [mw, md] = m.size, gapW = w - mw, gapD = d - md;
      if (gapW > 0.4 || gapD > 0.45) problems.push(`relation: ${m.id} (${mw.toFixed(2)}x${md.toFixed(2)} m) leaves ${gapW.toFixed(2)} m of `
        + `${bed.id}'s width and ${gapD.toFixed(2)} m of its length bare; pick the mattress size that fills the frame (./varpet search --kind mattress ${fit})`);
    }
  }
  return problems;
}

export function designRelations(draft: Draft): string[] {
  const items = draft.items ?? [], problems: string[] = bedRelations(draft.items ?? []);
  for (const chair of items.filter(isChair)) {
    const hit = tableFor(chair, items);
    if (hit && hit.gap > 0.2) problems.push(`relation: ${chair.id} faces ${hit.table.id} but its seat is ${hit.gap.toFixed(2)} m from the table edge; dining and desk chairs sit at the edge or slide under it (0-0.15 m)`);
    if (!hit && /dining|desk|kitchen/i.test(`${chair.id} ${chair.name}`)) problems.push(`relation: ${chair.id} is a dining/desk chair but no table is within reach in front of it`);
  }
  for (const tv of items.filter(item => item.kind === 'tv')) {
    const onUnit = Boolean((tv as DraftItem & { on?: string; wall_id?: string }).on || (tv as { wall_id?: string }).wall_id);
    if (!onUnit) problems.push(`relation: ${tv.id} stands on the floor; put it on a media unit or sideboard with on: <id>, or hang it with wall_id/height_m`);
    const f = front(tv), seats = items.filter(item => SEATING.test(item.kind) && item !== tv);
    const watched = seats.some(seat => {
      const to: V = [seat.pos[0] - tv.pos[0], seat.pos[1] - tv.pos[1]], d = Math.hypot(...to), sf = front(seat);
      return d >= 1.5 && d <= 4 && (to[0] * f[0] + to[1] * f[1]) / d > 0.7 && -(to[0] * sf[0] + to[1] * sf[1]) / d > 0.7;
    });
    if (!watched) problems.push(`relation: no sofa or chair faces ${tv.id} from 1.5-4 m; the main seat and the screen should face each other`);
  }
  return problems;
}
