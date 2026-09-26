/** Functional relations the physics checker cannot see: a dining chair belongs at its table, a TV stands
 * on a unit and faces the seating. Plan metres, rot CCW degrees, front is local -y. */
import { area, bbox, emptyRects, footprint, inPoly, isCurtain, openingRooms, openingSpans, rectText, roomWall, segDist, wallSpot, type Draft, type DraftItem, type Rect, type Scene } from './scene.ts';
import { onFloor, type FixtureLight } from './finishes.ts';

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
/** Dressed beds (frame, mattress, bedding in one model: bpy-beds-dressed) are made up already. */
const DRESSED = /\b(dressed|bedding)\b/i;
export const isBedFrame = (item: DraftItem) => item.kind === 'bed' && !MATTRESS_INCLUDED.test(item.name ?? '') && !DRESSED.test(item.name ?? '') && !/beds-dressed/.test(item.sku ?? '');
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

// ---------- function rules over the whole scene (lighting, bedrooms, living, wall decor, coverage, windows) ----------
/** Hard lines (fail the check) and soft lines (shown with the check, left to judgement). */
export interface Findings { hard: string[]; soft: string[] }

const f2 = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
const at = (p: V) => `(${f2(p[0])}, ${f2(p[1])})`;
/** Point in an item's frame: x along its width, y along its depth (front is -y). */
function toLocal(p: V, item: DraftItem): V {
  const r = (-item.rot * Math.PI) / 180, dx = p[0] - item.pos[0], dy = p[1] - item.pos[1];
  return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
}
function toWorld(item: DraftItem, l: V): V {
  const r = (item.rot * Math.PI) / 180;
  return [item.pos[0] + l[0] * Math.cos(r) - l[1] * Math.sin(r), item.pos[1] + l[0] * Math.sin(r) + l[1] * Math.cos(r)];
}
const inside = (p: V, item: DraftItem, grow = 0) => { const [x, y] = toLocal(p, item); return Math.abs(x) <= item.size[0] / 2 + grow && Math.abs(y) <= item.size[1] / 2 + grow; };
const label = (item: DraftItem) => `${item.id} ${item.name ?? ''}`;

/** kind lamp also holds misfiled lamp tables and side tables: a lamp's name says lamp or light (not "lamp table"). */
export const isLamp = (item: DraftItem) => item.kind === 'lamp'
  && (/\b(lamp|light|sconce|lantern|torchiere)\b(?!\s+table)/i.test(item.name ?? '') || !/\b(table|nightstand|stand|desk|shelf)\b/i.test(item.name ?? ''));
const isFloorLamp = (item: DraftItem) => isLamp(item) && onFloor(item) && item.size[2] >= 1.0;
const isTableLamp = (item: DraftItem) => isLamp(item) && item.size[2] < 1.0;
const isBed = (item: DraftItem) => item.kind === 'bed' && !/\b(crib|cot|bassinet|pet|dog|cat)\b/i.test(item.name ?? '');
const isDesk = (item: DraftItem) => item.kind === 'desk' || (item.kind === 'table' && /\bdesk\b/i.test(label(item)));
const isRug = (item: DraftItem) => item.kind === 'rug';
/** A seat people lounge or read in: sofas and armchairs, and chairs that are not pulled up to a table or desk. */
function isLoungeSeat(item: DraftItem, items: DraftItem[]): boolean {
  if (!onFloor(item)) return false;
  if (item.kind === 'sofa' || item.kind === 'armchair') return true;
  if (item.kind !== 'chair' || /\b(dining|desk|office|kitchen|bar|counter|high|kids?|child)\b/i.test(label(item))) return false;
  const hit = tableFor(item, items);
  return !(hit && hit.gap <= 0.3);
}
const outdoor = (room: Scene['rooms'][number]) => room.zone !== undefined || /balcon|loggia|terrace|patio|garden/i.test(`${room.id} ${room.name ?? ''}`);
const service = (room: Scene['rooms'][number]) => /\b(hall|corridor|entr|bath|wc|toilet|shower|kitchen|laundry|utility|storage|closet|pantry)/i.test(`${room.id} ${room.name ?? ''}`) && !/living|dining/i.test(room.name ?? '');
const isBedroom = (room: Scene['rooms'][number], items: DraftItem[]) =>
  /\b(bed|sleep|nursery|kid|child|guest)/i.test(`${room.id} ${room.name ?? ''}`) || items.some(item => item.room_id === room.id && isBed(item));

/** Room-side geometry for access strips: inside the polygon and clear of every wall body. */
function floorPoint(scene: Scene, roomId: string, p: V): boolean {
  const room = scene.rooms.find(r => r.id === roomId);
  if (!room || !inPoly(p, room.polygon)) return false;
  return scene.walls.every(w => w.open || w.room_id !== roomId || segDist(p, w.a, w.b) >= (w.thickness ?? 0) / 2 - 1e-6);
}
/** Clear depth (0..want, 0.05 steps) of a strip beside an item: local x from x0 outward by sign, local y y0..y1. */
function clearDepth(scene: Scene, item: DraftItem, obstacles: DraftItem[], sign: 1 | -1, y0: number, y1: number, want: number): { depth: number; by?: string } {
  const x0 = item.size[0] / 2;
  for (let d = 0.025; d <= want + 1e-6; d += 0.025) {
    for (let y = y0; y <= y1 + 1e-6; y += 0.1) {
      const p = toWorld(item, [sign * (x0 + d - 0.01), y]);
      if (!floorPoint(scene, item.room_id, p)) return { depth: d - 0.025, by: 'the wall' };
      const hit = obstacles.find(o => inside(p, o));
      if (hit) return { depth: d - 0.025, by: hit.id };
    }
  }
  return { depth: want };
}

interface Light { id: string; pos: V; lamp: boolean }
function lightsIn(draft: Draft, items: DraftItem[], roomId: string): Light[] {
  const fixtures = (draft.lighting ?? []).filter((l): l is FixtureLight => l.type === 'fixture' && l.room_id === roomId && (l.mount === 'wall' || l.mount === 'pendant'));
  return [...items.filter(item => item.room_id === roomId && isLamp(item)).map(item => ({ id: item.id, pos: item.pos as V, lamp: true })),
    ...fixtures.map(l => ({ id: l.id, pos: l.pos as V, lamp: false }))];
}
/** A lamp within 1 m of the target's footprint, or a sconce or pendant within 1.2 m. */
const lit = (lights: Light[], target: DraftItem) => lights.some(l => toFootprint(l.pos, target) <= (l.lamp ? 1.0 : 1.2));

const SURFACE = /table|nightstand|desk|cabinet|dresser|sideboard|console|chest|shelf|stand|credenza|buffet/;
function lighting(scene: Scene, draft: Draft, items: DraftItem[], out: Findings) {
  const floorLamps = items.filter(isFloorLamp);
  for (const lamp of items.filter(isTableLamp)) if (onFloor(lamp)) {
    const support = items.filter(o => o.room_id === lamp.room_id && onFloor(o) && SURFACE.test(o.kind) && !isLamp(o) && o.size[2] >= 0.35 && o.size[2] <= 1.1)
      .map(o => ({ o, d: toFootprint(lamp.pos, o) })).sort((a, b) => a.d - b.d)[0];
    out.hard.push(`lighting: ${lamp.id} is a table lamp (${f2(lamp.size[2])} m) standing on the floor; rest it on a side table, nightstand, desk or sideboard with on: "<id>"${support && support.d < 1.5 ? ` (e.g. on: "${support.o.id}", pos inside it)` : ''}`);
  }
  for (let i = 0; i < floorLamps.length; i++) for (let j = i + 1; j < floorLamps.length; j++) {
    const a = floorLamps[i]!, b = floorLamps[j]!, d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
    if (a.room_id === b.room_id && d < 1.5) out.hard.push(`lighting: floor lamps ${a.id} and ${b.id} stand ${f2(d)} m apart (keep >= 1.5 m); spread the light: keep one and move the other beside a different seat, bed or desk`);
  }
  const served = (lamp: DraftItem) => {
    const r = Math.max(lamp.size[0], lamp.size[1]) / 2;
    const targets = items.filter(o => o !== lamp && o.room_id === lamp.room_id && onFloor(o) && (/sofa|armchair|chair|bench|stool|ottoman|pouf/.test(o.kind) || isBed(o) || isDesk(o)));
    return targets.map(o => ({ o, d: Math.max(0, toFootprint(lamp.pos, o) - r) })).sort((a, b) => a.d - b.d)[0];
  };
  for (const lamp of floorLamps) {
    const near = served(lamp);
    if (!near || near.d > 0.8) out.hard.push(`lighting: floor lamp ${lamp.id} lights nothing: ${near ? `the nearest seat, bed or desk (${near.o.id}) is ${f2(near.d)} m away` : 'no seat, bed or desk in the room'}; stand it within 0.8 m of the seat, bed or desk it serves (beside an arm, behind a reading chair)`);
  }
  // Every seating group, desk and bed has its own light (the ceiling design alone leaves them dim).
  for (const room of scene.rooms.filter(r => !outdoor(r))) {
    const lights = lightsIn(draft, items, room.id), mine = items.filter(o => o.room_id === room.id);
    const seats = mine.filter(o => isLoungeSeat(o, items)), groups: DraftItem[][] = [];
    for (const seat of seats) {
      const joined = groups.filter(g => g.some(o => Math.hypot(o.pos[0] - seat.pos[0], o.pos[1] - seat.pos[1]) <= 3));
      const merged = [seat, ...joined.flat()];
      for (const g of joined) groups.splice(groups.indexOf(g), 1);
      groups.push(merged);
    }
    for (const g of groups) if (!g.some(seat => lit(lights, seat))) {
      const seat = g.find(o => o.kind === 'sofa') ?? g[0]!, spot = armSpot(scene, seat, items);
      out.hard.push(`lighting: seating ${g.map(o => o.id).join(', ')} has no lamp within 1 m; add a floor lamp or a side table with a table lamp beside ${seat.id}${spot ? ` at ${at(spot)}` : ''} (or a wall sconce)`);
    }
    for (const desk of mine.filter(o => isDesk(o) && onFloor(o))) if (!lit(lights, desk))
      out.hard.push(`lighting: desk ${desk.id} has no task light; put a desk lamp on it (on: "${desk.id}") or a floor lamp beside it`);
  }
}
/** A free floor spot 0.3 m past a seat's arm, left or right, for a lamp or side table. */
function armSpot(scene: Scene, seat: DraftItem, items: DraftItem[]): V | undefined {
  for (const sign of [1, -1]) {
    const p = toWorld(seat, [sign * (seat.size[0] / 2 + 0.3), 0]);
    if (floorPoint(scene, seat.room_id, p) && !items.some(o => o !== seat && onFloor(o) && !isRug(o) && inside(p, o, 0.1))) return p;
  }
  return undefined;
}

function bedrooms(scene: Scene, draft: Draft, items: DraftItem[], out: Findings) {
  for (const bed of items.filter(o => isBed(o) && onFloor(o))) {
    const [w, d] = bed.size, double = w >= 1.2, lights = lightsIn(draft, items, bed.room_id);
    const obstacles = [...items, ...(scene.fixed ?? [])].filter(o => o !== bed && o.room_id === bed.room_id && onFloor(o) && !isRug(o) && !(o.on === bed.id));
    const sides = ([1, -1] as const).map(sign => {
      const reach = clearDepth(scene, bed, obstacles, sign, -d / 2 + 0.05, d / 2 - 0.75, 0.6);
      const head = toWorld(bed, [sign * (w / 2 + 0.25), d / 2 - 0.25]);
      const stand = obstacles.some(o => !isLamp(o) && o.size[2] >= 0.3 && o.size[2] <= 0.95 && toFootprint(head, o) <= 0.3);
      const light = lights.some(l => Math.hypot(l.pos[0] - head[0], l.pos[1] - head[1]) <= (l.lamp ? 0.8 : 1.0));
      return { sign, reach, head, stand, light, open: reach.depth >= 0.5 - 1e-6 };
    });
    // Below 0.5 m nobody gets in; 0.5-0.6 m is tight but usable in a small room, so it is advice.
    if (double) for (const s of sides.filter(s => s.reach.depth < 0.6 - 1e-6))
      (s.open ? out.soft : out.hard).push(`bedroom: ${bed.id} (${f2(w)} m wide) has only ${f2(s.reach.depth)} m beside its side toward ${at(s.head)} (blocked by ${s.reach.by}); a double bed needs >= 0.6 m on both long sides to get in: centre it on its wall or move ${s.reach.by === 'the wall' ? 'the bed' : s.reach.by}`);
    const served = double ? sides.filter(s => s.open) : sides.filter(s => s.open).slice(0, 1);
    if (double) for (const s of served) {
      if (!s.stand) out.hard.push(`bedroom: ${bed.id} has no nightstand at its side toward ${at(s.head)}; stand one there (0.4-0.6 m high) with a lamp on it`);
      else if (!s.light) out.hard.push(`bedroom: the ${bed.id} side toward ${at(s.head)} has no reading light; put a table lamp on its nightstand or a wall sconce above it`);
    } else if (!sides.some(s => s.light)) out.hard.push(`bedroom: ${bed.id} has no bedside light; put a lamp on a nightstand at its head or a wall sconce above it`);
    headboard(scene, bed, out);
  }
}
/** The wall the headboard (local +y edge) is against, and a window centred behind it (soft). */
function headboard(scene: Scene, bed: DraftItem, out: Findings) {
  const [w, d] = bed.size, back = [toWorld(bed, [-w / 2, d / 2]), toWorld(bed, [w / 2, d / 2])] as const, mid = toWorld(bed, [0, d / 2]);
  const walls = scene.walls.filter(x => x.room_id === bed.room_id && !x.open);
  const wall = walls.map(x => ({ x, d: Math.max(segDist(back[0], x.a, x.b), segDist(back[1], x.a, x.b)) - (x.thickness ?? 0) / 2 })).sort((a, b) => a.d - b.d)[0];
  if (!wall || wall.d > 0.2) { out.soft.push(`bedroom: ${bed.id}'s headboard stands ${wall ? f2(wall.d) : '?'} m off the nearest wall; beds read and sleep better with the headboard against a solid wall`); return; }
  const l = Math.hypot(wall.x.b[0] - wall.x.a[0], wall.x.b[1] - wall.x.a[1]), ux = (wall.x.b[0] - wall.x.a[0]) / l, uy = (wall.x.b[1] - wall.x.a[1]) / l;
  const along = (mid[0] - wall.x.a[0]) * ux + (mid[1] - wall.x.a[1]) * uy;
  for (const s of openingSpans(scene, wall.x)) if (s.opening.kind === 'window' && Math.abs((s.from + s.to) / 2 - along) < w / 2 && s.opening.sill < bed.size[2] + 0.4)
    out.soft.push(`bedroom: ${bed.id}'s headboard is under window ${s.opening.id}; a window behind the head is draughty and bright: use a solid wall if the room allows`);
}

/** The main sofa of each room and the table in front of it; rug under its front legs; conversation seats close. */
function living(scene: Scene, items: DraftItem[], out: Findings) {
  const rooms = new Set(items.map(o => o.room_id));
  for (const roomId of rooms) {
    const mine = items.filter(o => o.room_id === roomId && onFloor(o));
    const sofa = mine.filter(o => o.kind === 'sofa').sort((a, b) => b.size[0] - a.size[0])[0];
    if (!sofa) continue;
    const [w, d] = sofa.size, fr = front(sofa);
    const tables = mine.filter(o => (o.kind === 'table' || o.kind === 'coffee_table') && o.size[2] < 0.55 && !/\b(side|end|night|bedside)\b/i.test(label(o))
      && (o.size[0] * o.size[1] >= 0.2 || /coffee/i.test(label(o))))
      .map(t => ({ t, c: footprint(t).map(p => toLocal(p as V, sofa)) }))
      .filter(({ c }) => Math.max(...c.map(p => p[1])) < -d / 2 + 0.05 && Math.max(...c.map(p => p[1])) > -d / 2 - 1.6 && Math.min(...c.map(p => p[0])) < w / 2 && Math.max(...c.map(p => p[0])) > -w / 2)
      .sort((a, b) => Math.max(...b.c.map(p => p[1])) - Math.max(...a.c.map(p => p[1])));
    const coffee = tables[0];
    if (coffee) {
      const gap = -d / 2 - Math.max(...coffee.c.map(p => p[1])), lx = coffee.c.map(p => p[0]);
      if (gap < 0.33 || gap > 0.52) {
        const move = gap - 0.42, to: V = [coffee.t.pos[0] - fr[0] * move, coffee.t.pos[1] - fr[1] * move];
        out.hard.push(`living: coffee table ${coffee.t.id} is ${f2(gap)} m from ${sofa.id}'s front (keep 0.35-0.5 m, in reach from the seat); move it to ${at(to)}`);
      }
      if (Math.min(...lx) < -w / 2 - 0.02 || Math.max(...lx) > w / 2 + 0.02) {
        const shift = (Math.min(...lx) + Math.max(...lx)) / 2, to = toWorld(sofa, [0, toLocal(coffee.t.pos, sofa)[1]]);
        out.hard.push(`living: coffee table ${coffee.t.id} reaches past ${sofa.id}'s ends (${f2(Math.abs(shift))} m off centre${Math.max(...lx) - Math.min(...lx) > w ? ', wider than the sofa' : ''}); centre it on the sofa at ${at(to)}${Math.max(...lx) - Math.min(...lx) > w ? ' and pick a narrower one' : ''}`);
      }
    }
    // A rug in front of the sofa (holding the coffee table or the floor just ahead) should run under its front legs.
    const ahead = toWorld(sofa, [0, -d / 2 - 0.6]);
    for (const rug of mine.filter(o => isRug(o) && (inside(ahead, o) || (coffee && inside(coffee.t.pos, o))))) {
      const legs = [toWorld(sofa, [-w / 2 + 0.15, -d / 2 + 0.1]), toWorld(sofa, [w / 2 - 0.15, -d / 2 + 0.1])];
      if (legs.every(p => inside(p, rug))) continue;
      const corners = footprint(rug).map(p => toLocal(p as V, sofa)), near = Math.min(...corners.map(p => -p[1])), need = near - (d / 2 - 0.15);
      const lx = corners.map(p => p[0]), side = (Math.min(...lx) + Math.max(...lx)) / 2;
      const to: V = need > 0.01 ? [rug.pos[0] - fr[0] * need, rug.pos[1] - fr[1] * need] : toWorld(sofa, [0, toLocal(rug.pos, sofa)[1]]);
      out.hard.push(need > 0.01
        ? `living: rug ${rug.id} stops ${f2(need - 0.05)} m short of ${sofa.id}'s front legs; move it to ${at(to)} (or pick a larger one) so at least the front legs stand on it`
        : Math.max(...lx) - Math.min(...lx) < w - 0.2
          ? `living: rug ${rug.id} is narrower than ${sofa.id} (${f2(Math.max(...lx) - Math.min(...lx))} vs ${f2(w)} m along it), so a front leg misses it; pick a rug at least as wide as the sofa`
          : `living: rug ${rug.id} sits ${f2(Math.abs(side))} m off ${sofa.id}'s centre, so a front leg misses it; centre it on the sofa at ${at(to)}`);
    }
    // Conversation seats face the sofa's group and sit within 3 m of it.
    const focus = coffee?.t.pos ?? ahead;
    for (const seat of mine.filter(o => o !== sofa && isLoungeSeat(o, items))) {
      const to: V = [focus[0] - seat.pos[0], focus[1] - seat.pos[1]], dist = Math.hypot(...to), sf = front(seat);
      const facing = dist > 0 && (to[0] * sf[0] + to[1] * sf[1]) / dist > 0.6, apart = Math.hypot(seat.pos[0] - sofa.pos[0], seat.pos[1] - sofa.pos[1]);
      if (facing && apart > 3 && apart < 5) out.soft.push(`living: ${seat.id} faces ${sofa.id}'s group but sits ${f2(apart)} m from the sofa; conversation seats sit within 3 m (move it closer to ${coffee ? coffee.t.id : 'the sofa'})`);
    }
  }
}

const HUNG_OVER = /sofa|bed|cabinet|dresser|sideboard|desk|table|console|bench|chest|media|credenza|buffet|shelf/;
/** Art over furniture: centred on it and 55-80% of its width; mirrors keep 0.2 m of wall at each side. */
function wallDecor(scene: Scene, items: DraftItem[], out: Findings) {
  const hung = items.filter(o => o.wall_id !== undefined).map(o => ({ o, spot: wallSpot(scene, o) })).filter((h): h is { o: DraftItem; spot: NonNullable<ReturnType<typeof wallSpot>> } => h.spot !== undefined);
  const groups = new Map<string, { over: DraftItem; span: [number, number]; spot: (typeof hung)[number]['spot']; art: DraftItem[]; bottom: number; fromTo: [number, number] }>();
  // Pass 0 hangs each piece over the furniture it mostly covers; pass 1 lets a gallery piece that only grazes it join.
  const art = hung.filter(h => h.o.kind === 'wall_art'), left: typeof art = [];
  for (const pass of [0, 1]) for (const h of pass ? left : art) {
    const { o, spot } = h;
    const { wall } = spot, l = spot.length, [fa] = [wall.a], ux = (wall.b[0] - wall.a[0]) / l, uy = (wall.b[1] - wall.a[1]) / l;
    const along0 = (p: V) => (p[0] - fa[0]) * ux + (p[1] - fa[1]) * uy;
    // along measured the same way as spot.along (from the inner face start, parallel to the centre line)
    const shift = spot.along - along0(o.pos);
    const artFrom = spot.along - o.size[0] / 2, artTo = spot.along + o.size[0] / 2;
    let best: { over: DraftItem; from: number; to: number; overlap: number } | undefined;
    for (const x of items) {
      if (x.room_id !== o.room_id || !onFloor(x) || !HUNG_OVER.test(x.kind) || isLamp(x) || x.size[2] > 1.3 || x.size[2] > spot.bottom + 0.05) continue;
      const corners = footprint(x) as V[], offs = corners.map(p => segDist(p, wall.a, wall.b) - (wall.thickness ?? 0) / 2);
      if (Math.min(...offs) > 0.6) continue;
      const al = corners.map(p => along0(p) + shift), from = Math.min(...al), to = Math.max(...al), overlap = Math.min(to, artTo) - Math.max(from, artFrom);
      if (overlap > o.size[0] * 0.5 && (!best || overlap > best.overlap)) best = { over: x, from, to, overlap };
    }
    if (!best && !pass) { left.push(h); continue; }
    if (!best) best = [...groups.values()].filter(g => (g.spot.wall.source_id ?? g.spot.wall.id) === (wall.source_id ?? wall.id) && g.over.room_id === o.room_id
      && Math.min(g.fromTo[1], artTo) - Math.max(g.fromTo[0], artFrom) > 0.05).map(g => ({ over: g.over, from: g.fromTo[0], to: g.fromTo[1], overlap: 0 }))[0];
    if (!best) continue;
    const key = `${best.over.id}|${wall.source_id ?? wall.id}`, g = groups.get(key);
    if (g) { g.art.push(o); g.span = [Math.min(g.span[0], artFrom), Math.max(g.span[1], artTo)]; g.bottom = Math.min(g.bottom, spot.bottom); }
    else groups.set(key, { over: best.over, span: [artFrom, artTo], spot, art: [o], bottom: spot.bottom, fromTo: [best.from, best.to] });
  }
  for (const g of groups.values()) {
    const fw = g.fromTo[1] - g.fromTo[0], aw = g.span[1] - g.span[0], off = (g.span[0] + g.span[1]) / 2 - (g.fromTo[0] + g.fromTo[1]) / 2;
    const names = g.art.map(a => a.id).join(' + '), top = g.over.size[2];
    if (Math.abs(off) > 0.1) {
      const l = g.spot.length, u: V = [(g.spot.wall.b[0] - g.spot.wall.a[0]) / l, (g.spot.wall.b[1] - g.spot.wall.a[1]) / l];
      const moves = g.art.map(a => `${g.art.length > 1 ? `${a.id} ` : ''}pos ${at([a.pos[0] - u[0] * off, a.pos[1] - u[1] * off])}`).join(', ');
      out.hard.push(`decor: ${names} hangs ${f2(Math.abs(off))} m off the centre of ${g.over.id} below it; centre it on ${g.over.id}: ${moves}`);
    }
    const ratio = aw / fw;
    if (ratio < 0.5 || ratio > 0.85) out.soft.push(`decor: ${names} spans ${Math.round(ratio * 100)}% of ${g.over.id}'s ${f2(fw)} m width (aim for 55-80%: ${f2(fw * 0.55)}-${f2(fw * 0.8)} m${g.art.length === 1 && ratio < 0.5 ? ', or two or three pieces side by side' : ''})`);
    const gap = g.bottom - top;
    if (gap > 0.45) out.soft.push(`decor: ${names} floats ${f2(gap)} m above ${g.over.id} (the editor hangs art at a standard centre of 1.5 m); a taller piece (h >= ${f2(2 * (1.2 - top))} m) brings the gap to about 0.3 m`);
  }
  // Hung mirrors keep at least 0.2 m of plain wall at each side (wall ends, doors and windows).
  for (const { o, spot } of hung.filter(h => h.o.kind === 'mirror' && h.o.size[2] <= 1.4)) {
    // Bathroom mirrors go over the basin wherever it is: tight walls there are advice, not failure.
    const room = scene.rooms.find(r => r.id === o.room_id), sink = room !== undefined && service(room) && !/\b(hall|corridor|entr)/i.test(`${room.id} ${room.name ?? ''}`);
    const margin = Math.max(0, ...scene.walls.map(x => (x.thickness ?? 0) / 2));
    let lo = margin, hi = spot.length - margin, loBy = 'the wall end', hiBy = 'the wall end';
    for (const s of openingSpans(scene, spot.wall)) {
      if (s.to <= spot.along && s.to > lo) { lo = s.to; loBy = `${s.opening.kind} ${s.opening.id}`; }
      else if (s.from >= spot.along && s.from < hi) { hi = s.from; hiBy = `${s.opening.kind} ${s.opening.id}`; }
    }
    const left = spot.along - o.size[0] / 2 - lo, right = hi - spot.along - o.size[0] / 2;
    if (left < 0.2 - 0.01 || right < 0.2 - 0.01) {
      const stretch = hi - lo, fits = stretch - 0.4;
      (sink ? out.soft : out.hard).push(`decor: mirror ${o.id} (${f2(o.size[0])} m wide) leaves ${f2(Math.max(0, Math.min(left, right)))} m to ${left < right ? loBy : hiBy} on its ${f2(stretch)} m stretch of ${o.wall_id}; keep >= 0.2 m each side: ${fits >= o.size[0] ? `move it to pos ${at(slide(o, spot, left < 0.2 ? 0.2 - left : right - 0.2))}` : `pick a mirror <= ${f2(Math.max(0, fits))} m wide or another wall`}`);
    }
  }
}

/** The item's pos moved by t metres along its wall (towards the wall's b end). */
function slide(item: DraftItem, spot: NonNullable<ReturnType<typeof wallSpot>>, t: number): V {
  const l = Math.hypot(spot.wall.b[0] - spot.wall.a[0], spot.wall.b[1] - spot.wall.a[1]);
  return [item.pos[0] + (spot.wall.b[0] - spot.wall.a[0]) / l * t, item.pos[1] + (spot.wall.b[1] - spot.wall.a[1]) / l * t];
}

/** Functions a room's name promises, with the piece that makes each one real. */
const FUNCTIONS: [string, RegExp, (o: DraftItem) => boolean, string][] = [
  ['living', /\b(living|lounge|sitting)\b/i, o => o.kind === 'sofa', 'sofa'],
  ['dining', /\bdining\b/i, o => isSeatTable(o) && !isDesk(o), 'dining table'],
  ['work', /\b(study|office|work)/i, isDesk, 'desk'],
  ['sleep', /\b(bed|sleep)/i, isBed, 'bed'],
];
/** Rooms in use (with draft furniture): a function the room's name promises with no piece for it; a large dead zone;
 * everything crowded into one half of a large multi-use room. Soft: the model judges, with coordinates to use. */
function coverage(scene: Scene, draft: Draft, all: DraftItem[], out: Findings) {
  const used = new Set((draft.items ?? []).filter(onFloor).map(o => o.room_id));
  for (const room of scene.rooms.filter(r => used.has(r.id) && !outdoor(r) && !service(r))) {
    const a = area(room.polygon), mine = all.filter(o => o.room_id === room.id && onFloor(o)), solid = mine.filter(o => !isRug(o));
    const named = FUNCTIONS.filter(([, re]) => re.test(room.name ?? ''));
    const free = (): Rect | undefined => emptyRects(scene, room.id, all, 1, 0.45)[0];
    if (named.length >= 2 && a > 18) for (const [fn, , has, piece] of named) if (!mine.some(has)) {
      const z = free();
      out.soft.push(`coverage: ${room.id} is "${room.name}" but has no ${fn} zone (no ${piece})${z ? `; the largest free area is ${rectText(z)}` : ''}`);
    }
    if (solid.length >= 3 && a >= 12) {
      const z = emptyRects(scene, room.id, all, 1, 0.45, DEAD_ZONE.side)[0];
      if (z && z.area >= DEAD_ZONE.area && z.area >= DEAD_ZONE.share * a) out.soft.push(`coverage: ${room.id} has a dead zone of ${f2(z.area)} m2 (${Math.round(z.area / a * 100)}% of the room): ${rectText(z)}; give it a use (a zone, storage, a reading corner) or pull the layout together`);
    }
    if (named.length >= 2 && a > 18 && solid.length >= 3) {
      const b = bbox(room.polygon);
      for (const wide of [true, false]) {
      const mid = wide ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2;
      const coords = solid.flatMap(o => footprint(o).map(p => (wide ? p[0] : p[1])));
      const low = Math.max(...coords) <= mid + 0.1, high = Math.min(...coords) >= mid - 0.1;
      if (low || high) { out.soft.push(`coverage: all furniture in ${room.id} ("${room.name}") sits in its ${wide ? (low ? 'left' : 'right') : (low ? 'bottom' : 'top')} half; the ${wide ? (low ? `right half x ${f2(mid)}..${f2(b.x1)}` : `left half x ${f2(b.x0)}..${f2(mid)}`) : (low ? `top half y ${f2(mid)}..${f2(b.y1)}` : `bottom half y ${f2(b.y0)}..${f2(mid)}`)} is empty`); break; }
      }
    }
  }
}
/** A dead zone: an empty rectangle at least 1.5 m on each side (a walkway is narrower) with items grown by a 0.45 m use
 * zone and door clear zones kept, of >= 4 m2 and >= 10% of the room. Measured 27 Sept 2026 on the saved spike runs: the
 * half-empty Japandi living room has 5.4 m2 (12%); furnished living rooms and bedrooms have none. */
export const DEAD_ZONE = { side: 1.5, area: 4, share: 0.1 };

const DARK = /\b(sleep\w*|dark\w*|blackout|privacy|private|nap\w*|insomnia|light sleeper|shift work\w*)\b/i;
/** Bedrooms (and any room when the brief asks for dark or privacy) want a curtain or blind on every window. */
function windows(scene: Scene, items: DraftItem[], brief: string | undefined, out: Findings) {
  const asks = brief !== undefined && DARK.test(brief), used = new Set(items.filter(o => !o.keep).map(o => o.room_id));
  for (const room of scene.rooms.filter(r => used.has(r.id) && !outdoor(r) && isBedroom(r, items))) {
    const curtains = items.filter(o => o.room_id === room.id && isCurtain(o) && o.wall_id !== undefined).map(o => ({ o, spot: wallSpot(scene, o) }));
    for (const o of scene.openings.filter(o => o.kind === 'window' && o.width >= 0.4 && openingRooms(scene, o).includes(room.id))) {
      let wall; try { wall = roomWall(scene, room.id, o.wall_id); } catch { continue; }
      // A shared outer wall is split per room: only windows within this room's stretch of it are its windows.
      const span = openingSpans(scene, wall).find(s => s.opening.id === o.id)!, length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
      if ((span.from + span.to) / 2 < 0 || (span.from + span.to) / 2 > length) continue;
      const covered = curtains.some(({ o: c, spot }) => spot && (spot.wall.source_id ?? spot.wall.id) === (wall.source_id ?? wall.id)
        && spot.along >= span.from - c.size[0] / 2 && spot.along <= span.to + c.size[0] / 2 && c.size[0] >= o.width * 0.9);
      if (covered) continue;
      const line = `window ${o.id} in ${room.id} (${f2(o.width)} m wide on ${wall.id}) has no curtain or blind${asks ? ' and the brief asks for dark/privacy' : ''}; hang one at least ${f2(o.width)} m wide: ./varpet search --kind curtain (or blind) --max-w ${f2(Math.min(span.to - span.from + 1.2, Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])))}, then wall_id "${wall.id}" and pos from atWindow(scene, "${room.id}", "${o.id}", size)`;
      (asks ? out.hard : out.soft).push(`windows: ${line}`);
    }
  }
}

/** The function rules over the whole scene. brief = the customer request (dark/privacy wishes make curtains hard). */
export function functionRules(scene: Scene, draft: Draft, brief?: string): Findings {
  const out: Findings = { hard: [], soft: [] }, all: DraftItem[] = [...scene.items, ...(draft.items ?? [])];
  lighting(scene, draft, all, out);
  bedrooms(scene, draft, all, out);
  living(scene, all, out);
  wallDecor(scene, all, out);
  coverage(scene, draft, all, out);
  windows(scene, all, brief, out);
  return out;
}
