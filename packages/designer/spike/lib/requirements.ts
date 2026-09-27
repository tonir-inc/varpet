/** The brief's countable needs per room, written by the lead designer to requirements.json beside scene.json and
 * enforced by ./varpet check as hard lines (each line names its room, so `check --part <room>` keeps its own).
 *
 * requirements.json: { "rooms": { "<room id>": {
 *   "for"?: "who uses it and for what",           // shown to room designers, not checked
 *   "seats_at_table"?: 6,                          // chairs/stools/bench places pulled up to one table
 *   "seats"?: 5,                                   // lounge seats: sofa places (~0.6 m each) + armchairs etc., not at a table or desk
 *   "sleepers"?: 2,                                // bed places: a bed >= 1.2 m wide or a bunk sleeps 2, others 1
 *   "desks"?: 1, "desk_chairs"?: 1,                // desks (kind desk, or a table named desk) and chairs at them
 *   "items"?: [{ "kind": "tv", "min": 1, "text"?: "armchair" }],   // at least min pieces of kind (name contains text)
 *   "pieces"?: 14,                                 // at least this many pieces in the room (a finished room, not a minimum)
 *   "exclude"?: ["rug"],                           // kinds that must not be in the room
 *   "budget_dram"?: 900000                         // the room's share; more than 10% over is a problem
 * } } } */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { footprint, segDist, type Draft, type DraftItem, type Scene, type Vec2 } from './scene.ts';

export interface ItemNeed { kind: string; min?: number; text?: string }
export interface RoomNeeds {
  for?: string; pieces?: number; seats_at_table?: number; seats?: number; sleepers?: number; desks?: number; desk_chairs?: number;
  items?: ItemNeed[]; exclude?: string[]; budget_dram?: number;
}
export interface Requirements { rooms: Record<string, RoomNeeds> }

export function loadRequirements(scenePath = 'scene.json'): Requirements | undefined {
  const path = join(dirname(scenePath), 'requirements.json');
  if (!existsSync(path)) return undefined;
  const data = JSON.parse(readFileSync(path, 'utf8')) as Requirements;
  if (!data || typeof data.rooms !== 'object') throw new Error('requirements.json must be {"rooms": {"<room id>": {...}}}');
  return data;
}

const SEAT_KINDS = new Set(['chair', 'stool', 'bench', 'ottoman']);
const isDesk = (item: DraftItem) => item.kind === 'desk' || (item.kind === 'table' && /\bdesk\b/i.test(item.name ?? ''));
const isTable = (item: DraftItem) => item.kind === 'table' && !isDesk(item) && !/\b(coffee|side|end|bedside|console|nightstand|accent)\b/i.test(item.name ?? '');
const benchPlaces = (item: DraftItem) => item.kind === 'bench' ? Math.max(1, Math.floor(item.size[0] / 0.5)) : 1;

/** Distance from a point to a footprint (0 inside). */
function gap(p: Vec2, item: DraftItem): number {
  const poly = footprint(item);
  const inside = poly.every((a, i) => { const b = poly[(i + 1) % 4]!; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0; })
    || poly.every((a, i) => { const b = poly[(i + 1) % 4]!; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) <= 0; });
  return inside ? 0 : Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % 4]!)));
}
/** Seats pulled up to a table or desk: the seat's centre within half its depth + 0.3 m of the top's edge. */
const atTop = (seat: DraftItem, top: DraftItem) => gap(seat.pos, top) <= seat.size[1] / 2 + 0.3;

export function sleeperPlaces(bed: DraftItem): number {
  return bed.size[0] >= 1.2 || /\b(bunk|loft.*trundle|trundle)\b/i.test(bed.name ?? '') ? 2 : 1;
}

/** What a room holds, in the terms of RoomNeeds. */
export function roomCounts(items: DraftItem[]) {
  const tables = items.filter(isTable), desks = items.filter(isDesk), seats = items.filter(i => SEAT_KINDS.has(i.kind));
  const perTable = tables.map(t => seats.filter(s => atTop(s, t)).reduce((n, s) => n + benchPlaces(s), 0));
  const deskChairs = seats.filter(s => desks.some(d => atTop(s, d))).length;
  const used = new Set(seats.filter(s => [...tables, ...desks].some(t => atTop(s, t))).map(s => s.id));
  const lounge = items.reduce((n, i) => n + (i.kind === 'sofa' ? Math.max(2, Math.floor(i.size[0] / 0.6))
    : (SEAT_KINDS.has(i.kind) && i.kind !== 'ottoman' && !used.has(i.id)) ? benchPlaces(i) : 0), 0);
  return {
    seats_at_table: Math.max(0, ...perTable), seats: lounge, desks: desks.length, desk_chairs: deskChairs,
    sleepers: items.filter(i => i.kind === 'bed').reduce((n, b) => n + sleeperPlaces(b), 0),
  };
}

const NUMBERS: [keyof ReturnType<typeof roomCounts>, string][] = [
  ['seats_at_table', 'seats at one table'], ['seats', 'lounge seats (sofa places, armchairs)'], ['sleepers', 'bed places'],
  ['desks', 'desks'], ['desk_chairs', 'chairs at desks'],
];

/** Hard lines for every room the requirements name. */
export function requirementProblems(scene: Scene, draft: Draft, req: Requirements | undefined): string[] {
  if (!req) return [];
  const out: string[] = [], known = new Set(scene.rooms.map(r => r.id));
  for (const [roomId, needs] of Object.entries(req.rooms)) {
    if (!known.has(roomId)) { out.push(`requirements: ${roomId} is not a room of this flat (requirements.json)`); continue; }
    const items = (draft.items ?? []).filter(i => i.room_id === roomId);
    if (!items.length) continue; // not designed yet
    const counts = roomCounts(items);
    for (const [key, label] of NUMBERS) {
      const want = needs[key];
      if (typeof want === 'number' && counts[key] < want) out.push(`requirements: ${roomId} has ${counts[key]} ${label}; the brief needs ${want}`);
    }
    if (typeof needs.pieces === 'number' && items.length < needs.pieces)
      out.push(`requirements: ${roomId} has ${items.length} pieces; plan.md asks for a finished room of at least ${needs.pieces}`);
    for (const need of needs.items ?? []) {
      const text = need.text?.toLowerCase(), min = need.min ?? 1;
      const have = items.filter(i => i.kind === need.kind && (!text || (i.name ?? '').toLowerCase().includes(text))).length;
      if (have < min) out.push(`requirements: ${roomId} has ${have} ${need.kind}${text ? ` "${need.text}"` : ''}; the brief needs ${min}`);
    }
    for (const kind of needs.exclude ?? []) {
      const found = items.filter(i => i.kind === kind);
      if (found.length) out.push(`requirements: ${roomId} must have no ${kind} (brief); remove ${found.map(i => i.id).join(', ')}`);
    }
    if (typeof needs.budget_dram === 'number') {
      const total = items.reduce((n, i) => n + (typeof i.price === 'number' ? i.price : 0), 0);
      if (total > needs.budget_dram * 1.1) out.push(`requirements: ${roomId} costs ${total} AMD, over its ${needs.budget_dram} AMD share by more than 10%`);
    }
  }
  return out;
}

/** One room's needs as text for a room designer. */
export function describeNeeds(req: Requirements | undefined, roomId: string): string {
  const needs = req?.rooms[roomId];
  if (!needs) return `no requirements for ${roomId} (requirements.json)`;
  const parts = [needs.for ? `for: ${needs.for}` : '', typeof needs.pieces === 'number' ? `pieces: at least ${needs.pieces}` : '', ...NUMBERS.filter(([k]) => typeof needs[k] === 'number').map(([k, label]) => `${label}: at least ${needs[k]}`),
    ...(needs.items ?? []).map(n => `${n.kind}${n.text ? ` "${n.text}"` : ''}: at least ${n.min ?? 1}`),
    needs.exclude?.length ? `no ${needs.exclude.join(', ')}` : '', typeof needs.budget_dram === 'number' ? `budget: ${needs.budget_dram} AMD` : ''];
  return `${roomId} needs (checked by ./varpet check):\n${parts.filter(Boolean).map(p => `- ${p}`).join('\n')}`;
}

/** Soft advice from the design itself: a seating group (a sofa) wants a rug under its front legs. */
export function requirementAdvice(draft: Draft): string[] {
  const out: string[] = [], items = draft.items ?? [];
  const rooms = [...new Set(items.filter(i => i.kind === 'sofa').map(i => i.room_id))];
  for (const room of rooms) if (!items.some(i => i.room_id === room && i.kind === 'rug'))
    out.push(`rug: ${room} has a seating group but no rug; a rug under the sofa's front legs ties it together (./varpet place --centered-on <coffee table> --sku <rug>, or place-group lounge --rug)`);
  return out;
}

/** A sofa is reached through the 0.35-0.5 m knee space in front of it when a coffee table stands there (the
 * relation rule asks for exactly that gap), so the 0.6 m front-approach walkway line for that sofa is not a
 * problem. Returns true for a walkway line that this exempts. */
export function sofaKneeSpace(line: string, items: DraftItem[]): boolean {
  const m = /^walkway: \S+ to item:(\S+): ([\d.]+) m path/.exec(line);
  if (!m || Number(m[2]) < 0.3) return false;
  const sofa = items.find(i => i.id === m[1] && i.kind === 'sofa');
  if (!sofa) return false;
  const a = sofa.rot * Math.PI / 180, f: Vec2 = [Math.sin(a), -Math.cos(a)], r: Vec2 = [Math.cos(a), Math.sin(a)];
  return items.some(t => t.room_id === sofa.room_id && t.kind === 'table' && t.size[2] < 0.55 && t.id !== sofa.id && (() => {
    const d: Vec2 = [t.pos[0] - sofa.pos[0], t.pos[1] - sofa.pos[1]];
    const ahead = d[0] * f[0] + d[1] * f[1], side = Math.abs(d[0] * r[0] + d[1] * r[1]);
    const depth = Math.min(t.size[0], t.size[1]), gap = ahead - sofa.size[1] / 2 - depth / 2;
    return gap > 0.2 && gap < 0.65 && side < sofa.size[0] / 2;
  })());
}
