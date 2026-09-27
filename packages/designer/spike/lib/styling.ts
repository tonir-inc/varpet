/** Styling minimums per room type: the layer that makes a furnished room look designed (textiles, art, plants, objects
 * on surfaces, curtains, layered light). Each missing layer is one line naming what to add, how many and where
 * (`on: <id>`, a wall with onWall(), a floor spot). Kinds are the live catalog's (checked 27 Sept 2026 with
 * ./varpet search): cushion, throw_blanket, vase, tray, books, bowl, candle, sculpture, basket, toy, planter, plant,
 * wall_art (incl. kids' prints), rug (incl. bath mats), curtain, blind, lamp, mirror, coat_rack, towel_rack, and decor
 * table settings ("Dinner for four"). */
import { bbox, footprint, openingCentre, openingRooms, openingSpans, segDist, type Draft, type DraftItem, type Scene, type Vec2 } from './scene.ts';
import { onFloor } from './finishes.ts';
import { bareWindows, coffeeFor, floorPoint, inside, isBed, isDesk, isLamp, toFootprint, toLocal, toWorld } from './relations.ts';

type V = Vec2;
type Room = Scene['rooms'][number];
export type RoomType = 'living' | 'bedroom' | 'kids' | 'dining' | 'hall' | 'bathroom' | 'office';
export interface RoomStyling { room_id: string; types: RoomType[]; passed: number; total: number; missing: string[] }

const f2 = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
const at = (p: V) => `(${f2(p[0])}, ${f2(p[1])})`;
const text = (o: DraftItem) => `${o.id} ${o.name ?? ''}`;
const name = (r: Room) => `${r.id} ${r.name ?? ''}`;

const SURFACE = /sideboard|cabinet|console|dresser|chest|credenza|buffet|shelf|bookcase|media|tv_stand/;
const SOFT_SEAT = /cushion|pouf|ottoman|beanbag|bean bag|armchair|sofa/;
const isCushion = (o: DraftItem) => o.kind === 'cushion' || (o.kind === 'decor' && /\bcushions?|pillows?\b/i.test(o.name ?? ''));
const isThrow = (o: DraftItem) => o.kind === 'throw_blanket' || /\bthrow\b/i.test(o.name ?? '');
const isPlant = (o: DraftItem) => o.kind === 'plant' || o.kind === 'planter';
/** Wall decor: framed art, clocks and wall hangings (ledges, floating shelves, macrame, plate sets) hung with wall_id. */
const isArt = (o: DraftItem) => /^(wall_art|wall_hanging|clock)$/.test(o.kind) && o.wall_id !== undefined;
const isToy = (o: DraftItem) => o.kind === 'toy' || (o.kind === 'basket' && /\btoys?\b/i.test(o.name ?? ''));
/** A cushion product can be a pair or a set of three. */
const cushionCount = (o: DraftItem) => /set of (three|3)|\b3\b.*cushions/i.test(o.name ?? '') ? 3 : /\b(pair|two|set of 2)\b/i.test(o.name ?? '') ? 2 : 1;
const DRESSED = /\b(dressed|bedding)\b/i;

/** The room's types from its name and what stands in it (a "Bedroom" used as a studio is an office). */
export function roomTypes(room: Room, mine: DraftItem[]): RoomType[] {
  const n = name(room), out: RoomType[] = [];
  if (/\b(bath|wc|toilet|shower)/i.test(n)) return ['bathroom'];
  if (/\b(hall|entr|lobby|corridor|foyer)/i.test(n) && !mine.some(isBed)) return ['hall'];
  const beds = mine.filter(o => onFloor(o) && (isBed(o) || o.kind === 'crib'));
  const kids = /\b(kid|child|nursery|toddler|baby)/i.test(n) || mine.some(o => o.kind === 'crib' || isToy(o)) || beds.some(b => /\b(kids?|child|toddler|bunk)\b/i.test(b.name ?? ''));
  if (beds.length) out.push(kids ? 'kids' : 'bedroom');
  else if (kids && /\b(kid|child|nursery|play)/i.test(n)) out.push('kids');
  if (mine.some(o => o.kind === 'sofa' && onFloor(o)) && !beds.length) out.push('living');
  if (diningTable(mine)) out.push('dining');
  if (!beds.length && !out.includes('living') && mine.some(o => isDesk(o) && onFloor(o))) out.push('office');
  return out;
}
/** A table people eat at: seat height, not a desk, with at least three chairs pulled up to it. */
function diningTable(mine: DraftItem[]): DraftItem | undefined {
  return mine.filter(o => o.kind === 'table' && onFloor(o) && o.size[2] >= 0.65 && !isDesk(o) && !/\b(side|console|bedside|night)\b/i.test(text(o)))
    .find(t => mine.filter(c => /chair|stool|bench/.test(c.kind) && onFloor(c) && toFootprint(c.pos, t) <= c.size[1] / 2 + 0.35).length >= 3);
}

/** The wall a floor item's back (local +y edge) is against, with the metres along it for onWall(). */
function backWall(scene: Scene, item: DraftItem): { id: string; along: number } | undefined {
  const back = toWorld(item, [0, item.size[1] / 2]);
  const wall = scene.walls.filter(w => w.room_id === item.room_id && !w.open).map(w => ({ w, d: segDist(back, w.a, w.b) - (w.thickness ?? 0) / 2 })).sort((a, b) => a.d - b.d)[0];
  if (!wall || wall.d > 1.1) return undefined;
  const { w } = wall, l = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  return { id: w.id, along: ((item.pos[0] - w.a[0]) * (w.b[0] - w.a[0]) + (item.pos[1] - w.a[1]) * (w.b[1] - w.a[1])) / l };
}
/** A free floor corner for a large plant: room bbox corners pulled 0.45 m in, clear of furniture and doors. */
function corner(scene: Scene, room: Room, items: DraftItem[]): V | undefined {
  const b = bbox(room.polygon), doors = scene.openings.filter(o => o.kind !== 'window' && openingRooms(scene, o).includes(room.id)).map(o => openingCentre(scene, o));
  const spots: V[] = [[b.x0 + 0.45, b.y0 + 0.45], [b.x1 - 0.45, b.y0 + 0.45], [b.x1 - 0.45, b.y1 - 0.45], [b.x0 + 0.45, b.y1 - 0.45]];
  return spots.find(p => floorPoint(scene, room.id, p) && !items.some(o => o.room_id === room.id && onFloor(o) && o.kind !== 'rug' && toFootprint(p, o) < 0.35)
    && doors.every(d => Math.hypot(d[0] - p[0], d[1] - p[1]) > 1.3));
}
/** The longest stretch of plain wall at picture height (no door, window, hung piece or tall furniture in front). */
function emptyWall(scene: Scene, room: Room, items: DraftItem[]): { id: string; from: number; to: number } | undefined {
  let best: { id: string; from: number; to: number } | undefined;
  for (const wall of scene.walls.filter(w => w.room_id === room.id && !w.open)) {
    const l = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]), u: V = [(wall.b[0] - wall.a[0]) / l, (wall.b[1] - wall.a[1]) / l];
    const along = (p: V) => (p[0] - wall.a[0]) * u[0] + (p[1] - wall.a[1]) * u[1];
    const blocked: [number, number][] = openingSpans(scene, wall).map(o => [o.from - 0.15, o.to + 0.15]);
    for (const o of items.filter(o => o.room_id === room.id)) {
      const hung = o.wall_id !== undefined && roomWallId(scene, o) === (wall.source_id ?? wall.id);
      const tall = onFloor(o) && o.kind !== 'rug' && o.size[2] > 1.2 && footprint(o).some(p => segDist(p as V, wall.a, wall.b) - (wall.thickness ?? 0) / 2 < 0.6);
      if (!hung && !tall) continue;
      const al = footprint(o).map(p => along(p as V));
      blocked.push([Math.min(...al) - 0.2, Math.max(...al) + 0.2]);
    }
    blocked.sort((a, b) => a[0] - b[0]);
    let cur = 0.15;
    for (const [from, to] of [...blocked, [l - 0.15, l] as [number, number]]) {
      if (from - cur > (best ? best.to - best.from : 0)) best = { id: wall.id, from: cur, to: from };
      cur = Math.max(cur, to);
    }
  }
  return best;
}
const roomWallId = (scene: Scene, o: DraftItem) => { const w = scene.walls.find(x => x.id === o.wall_id); return w ? w.source_id ?? w.id : undefined; };
const on = (items: DraftItem[], support: DraftItem) => items.filter(o => o.on === support.id);
const hangHint = (scene: Scene, over: DraftItem, what: string, w: number, h: number) => {
  const wall = backWall(scene, over);
  return wall ? `${what} (about ${f2(w)} m wide) on ${wall.id}: onWall(scene, "${over.room_id}", "${wall.id}", size, ${f2(wall.along)})` : `${what} (about ${f2(w)} m wide) on the wall behind ${over.id}`;
};

/** One room's missing layers. */
function styleRoom(scene: Scene, draft: Draft, room: Room, all: DraftItem[]): RoomStyling {
  const mine = all.filter(o => o.room_id === room.id), types = roomTypes(room, mine), missing: string[] = [], seen = new Set<string>();
  let total = 0;
  const need = (key: string, ok: boolean, line: () => string) => { if (seen.has(key)) return; seen.add(key); total++; if (!ok) missing.push(line()); };
  const floorItems = mine.filter(o => onFloor(o) && o.kind !== 'rug'), rugs = mine.filter(o => o.kind === 'rug');
  const lights = mine.filter(isLamp).length + (draft.lighting ?? []).filter(l => l.room_id === room.id).length;
  const plants = mine.filter(isPlant), art = mine.filter(isArt);
  const curtains = () => { const bare = bareWindows(scene, room.id, all);
    need('curtains', !bare.length, () => `curtains or blinds on ${bare.map(b => b.o.id).join(', ')} (${bare.map(b => `${f2(b.o.width)} m`).join(', ')} wide): ./varpet search --kind curtain (or blind), then wall_id and pos from atWindow(scene, "${room.id}", "<window id>", size)`); };
  const cornerPlant = (key = 'large-plant') => { const spot = corner(scene, room, all);
    need(key, plants.some(p => onFloor(p) && p.size[2] >= 1.0), () => `a large floor plant (1.2-1.8 m tall, ./varpet search --kind plant --text tall) ${spot ? `in the corner at ${at(spot)}` : 'in a free corner'}`); };

  // A big plain wall in a room people spend time in reads unfinished: a gallery, ledge or floating shelves.
  if (types.some(t => t === 'living' || t === 'bedroom' || t === 'kids' || t === 'dining' || t === 'office')) {
    // Plain walls are fine once the room carries three or more wall pieces; below that a >= 3 m plain stretch asks for one.
    const wall = emptyWall(scene, room, all), len = wall ? wall.to - wall.from : 0;
    const hung = mine.filter(o => (isArt(o) || o.kind === 'mirror') && o.wall_id !== undefined).reduce((n, o) => n + (/\b(set of|trio|gallery)\b/i.test(o.name ?? '') ? 3 : 1), 0);
    need('empty-wall', len < 3 || hung >= 3, () => `wall decor on the plain ${f2(len)} m stretch of ${wall!.id} (${f2(wall!.from)}..${f2(wall!.to)} m along): a gallery wall of 3-5 frames (./varpet search --kind wall_art --text gallery), a picture ledge or floating shelves (--kind wall_hanging), centred with onWall(scene, "${room.id}", "${wall!.id}", size, ${f2((wall!.from + wall!.to) / 2)})`);
  }
  for (const type of types) {
    if (type === 'living') {
      const sofa = mine.filter(o => o.kind === 'sofa' && onFloor(o)).sort((a, b) => b.size[0] - a.size[0])[0]!;
      const [w, d] = sofa.size, ahead = toWorld(sofa, [0, -d / 2 - 0.6]);
      need('rug', rugs.some(r => inside(ahead, r)), () => `a rug under the seating group, about ${f2(w + 0.6)} x ${f2(Math.max(1.6, d + 1.2))} m, centred at ${at(toWorld(sofa, [0, -d / 2 - 0.45]))} rot ${Math.round(sofa.rot)} so the front legs of ${sofa.id} stand on it`);
      const seats = mine.filter(o => /sofa|armchair/.test(o.kind) && onFloor(o));
      const cushions = mine.filter(o => isCushion(o) && seats.some(s => s.id === o.on)).reduce((n, o) => n + cushionCount(o), 0);
      need('cushions', cushions >= 3, () => `${3 - cushions} more cushion${3 - cushions > 1 ? 's' : ''} on: "${sofa.id}" (./varpet search --kind cushion; 3-5 in total, pos along its back)`);
      need('throw', mine.some(isThrow), () => `a throw on: "${sofa.id}" over one arm (./varpet search --kind throw_blanket), pos ${at(toWorld(sofa, [w / 2 - 0.3, 0]))}`);
      need('sofa-art', art.some(a => toFootprint(a.pos, sofa) <= 1.3) || art.length >= 3, () => `art over ${sofa.id}: ${hangHint(scene, sofa, 'one piece 55-80% of its width or a 3-5 piece gallery', w * 0.65, 0.8)}`);
      need('plants', plants.length >= 2, () => `${2 - plants.length} more plant${plants.length ? '' : 's'}: a large floor plant in a corner and a small one on a sideboard or shelf (on: <id>)`);
      cornerPlant();
      const coffee = coffeeFor(sofa, mine)?.t;
      if (coffee) { const n = on(mine, coffee).length;
        need('coffee-styled', n >= 1 && n <= 3, () => n ? `only 1-3 objects on ${coffee.id} (it has ${n}); take some off` : `1-3 objects on: "${coffee.id}" (a tray, stacked books, a vase or bowl), pos inside it`); }
      curtains();
      need('light-layers', lights >= 3, () => `${3 - lights} more light source${3 - lights > 1 ? 's' : ''} (floor or table lamps beside seats, a sconce or pendant) for three layers`);
    }
    if (type === 'bedroom' || type === 'kids') {
      const bed = mine.filter(o => onFloor(o) && (isBed(o) || o.kind === 'crib')).sort((a, b) => b.size[0] - a.size[0])[0]!;
      const [w, d] = bed.size, onBed = on(mine, bed);
      need('made-bed', DRESSED.test(bed.name ?? '') || /beds-dressed/.test(bed.sku ?? '') || bed.kind === 'crib' || (onBed.some(isCushion) && onBed.some(isThrow)),
        () => `make ${bed.id} up: ${onBed.some(isCushion) ? '' : '2 cushions'}${onBed.some(isCushion) || onBed.some(isThrow) ? '' : ' and '}${onBed.some(isThrow) ? '' : 'a throw or bed runner across the foot'} on: "${bed.id}" (or pick a dressed bed: ./varpet search --kind bed --text dressed)`);
      if (type === 'bedroom') need('bed-art', art.some(a => { const [x, y] = toLocal(a.pos, bed); return Math.abs(x) <= w / 2 + 0.2 && y > d / 2 - 0.3 && y < d / 2 + 0.8; }),
        () => `art above the headboard of ${bed.id}: ${hangHint(scene, bed, 'one piece or a pair', w * 0.65, 0.6)}`);
      const stands = floorItems.filter(o => /nightstand|table|cabinet|dresser|chest/.test(o.kind) && o.size[2] <= 0.9 && toFootprint(toWorld(bed, [0, d / 2 - 0.25]), o) <= w / 2 + 0.5);
      const wanted = type === 'bedroom' && w >= 1.2 ? 2 : 1, lamps = stands.filter(s => mine.some(l => isLamp(l) && l.on === s.id)).length;
      need('bedside-lamps', lamps >= Math.min(wanted, Math.max(1, stands.length)), () => stands.length
        ? `a table lamp on: "${stands.find(s => !mine.some(l => isLamp(l) && l.on === s.id))!.id}" (./varpet search --kind lamp --text bedside)`
        : `a nightstand at ${at(toWorld(bed, [w / 2 + 0.3, d / 2 - 0.25]))} with a table lamp on it`);
      need('bed-rug', rugs.some(r => toFootprint(r.pos, bed) <= 0.6 || inside(toWorld(bed, [0, -d / 4]), r)),
        () => `a rug under the lower two thirds of ${bed.id}, about ${f2(w + 0.9)} x ${f2(Math.min(2.4, d))} m, centred at ${at(toWorld(bed, [0, -d / 2 + 0.7]))} rot ${Math.round(bed.rot)}`);
      if (type === 'bedroom') need('plant', plants.length >= 1, () => `a plant (on a dresser with on: <id>, or a floor plant in a corner)`);
      if (type === 'bedroom') curtains();
      if (type === 'kids') {
        need('kids-art', art.length >= 1, () => `playful wall art (./varpet search --kind wall_art --text kids): ${hangHint(scene, bed, 'a set of prints', Math.min(1.2, w * 0.8), 0.5)}`);
        const toys = mine.filter(isToy).length;
        need('toys', toys >= 2, () => `${2 - toys} more toy${toys ? '' : 's'} (./varpet search --kind toy: a teepee, a play kitchen, a toy basket) on the floor or on a low shelf (on: <id>)`);
        need('kids-rug', rugs.length >= 1, () => `a play rug (about 1.6 x 2.3 m) in the free floor at ${at(corner(scene, room, all) ?? toWorld(bed, [0, -d / 2 - 1.0]))}`);
        need('soft-seat', mine.some(o => SOFT_SEAT.test(`${o.kind} ${o.name}`) && onFloor(o)), () => `soft seating: a floor cushion or pouf (./varpet search --kind cushion --text floor) on the rug`);
        curtains();
      }
    }
    if (type === 'dining') {
      const table = diningTable(mine)!;
      need('centrepiece', on(mine, table).length >= 1, () => `a centrepiece on: "${table.id}" (a table setting ./varpet search --kind decor --text "dinner for", or a vase, bowl or candles), pos ${at(table.pos)}`);
      need('pendant', (draft.lighting ?? []).some(l => l.type === 'fixture' && l.mount === 'pendant' && inside(l.pos, table, 0.2)),
        () => `a pendant over ${table.id}: {room_id: "${room.id}", type: "fixture", id: "dining-pendant", mount: "pendant", pos: [${f2(table.pos[0])}, ${f2(table.pos[1])}]}`);
      need('dining-wall', mine.some(o => (isArt(o) || (o.kind === 'mirror' && o.wall_id !== undefined)) && toFootprint(o.pos, table) <= 2.2),
        () => `art or a mirror on the wall nearest ${table.id} (within 2 m of it, onWall())`);
    }
    if (type === 'office') {
      const desk = mine.filter(o => isDesk(o) && onFloor(o))[0]!, onDesk = on(mine, desk);
      need('task-lamp', mine.some(l => isLamp(l) && (l.on === desk.id || toFootprint(l.pos, desk) <= 0.8)), () => `a task lamp on: "${desk.id}" (./varpet search --kind lamp --text desk)`);
      need('desk-objects', onDesk.some(o => !isLamp(o) && !/monitor|computer|laptop|tv/.test(o.kind)), () => `1-2 objects on: "${desk.id}" (books, a tray, a small plant or vase)`);
      need('plant', plants.length >= 1, () => `a plant (on: "${desk.id}" or a floor plant in a corner)`);
      need('office-art', art.length >= 1, () => `art on the wall facing or behind ${desk.id} (onWall())`);
    }
    if (type === 'hall') {
      need('hall-mirror', mine.some(o => o.kind === 'mirror'), () => `a mirror near the door (./varpet search --kind mirror; hung with onWall(), or a floor mirror over 1.4 m against a wall)`);
      const drop = floorItems.filter(o => /bench|console|cabinet|dresser|chest|shoe|table/.test(o.kind) && o.size[2] <= 1.0);
      need('hall-drop', drop.some(o => on(mine, o).length >= 1) , () => drop.length ? `1-2 objects on: "${drop[0]!.id}" (a tray for keys, a vase or basket)` : `a bench or console by the door with a tray or basket on it`);
      need('hall-coats', mine.some(o => /coat|wardrobe|hook/.test(`${o.kind} ${o.name}`)), () => `a coat rack or stand by the door (./varpet search --kind coat_rack)`);
    }
    if (type === 'bathroom') {
      need('towels', mine.some(o => o.kind === 'towel_rack' || /\btowels?\b/i.test(o.name ?? '')), () => `towels: a towel ladder or stand (./varpet search --kind towel_rack) or a basket of rolled towels`);
      need('bath-mat', rugs.length >= 1, () => `a bath mat in front of the basin or shower (./varpet search --kind rug --text "bath mat")`);
      need('bath-green', plants.length >= 1 || mine.some(o => o.kind === 'mirror'), () => `a mirror over the basin or a small plant`);
    }
  }
  return { room_id: room.id, types, passed: total - missing.length, total, missing };
}

/** Rooms the draft furnishes (any draft item in them), outdoor spaces and kitchens aside. */
export function styling(scene: Scene, draft: Draft): RoomStyling[] {
  const all = [...scene.items, ...(draft.items ?? [])], used = new Set((draft.items ?? []).map(o => o.room_id));
  return scene.rooms.filter(r => used.has(r.id) && r.zone === undefined && !/balcon|loggia|terrace|closet|storage|pantry|laundry/i.test(name(r))
      && !(/kitchen/i.test(name(r)) && !/living|dining|lounge/i.test(name(r))))
    .map(r => styleRoom(scene, draft, r, all)).filter(r => r.total > 0);
}
/** One "styling:" line per missing layer, and a score line per room. */
export function stylingLines(scene: Scene, draft: Draft): { problems: string[]; scores: string[] } {
  const rooms = styling(scene, draft);
  return {
    problems: rooms.flatMap(r => r.missing.map(m => `styling: ${r.room_id} (${r.types.join('+')}) needs ${m}`)),
    scores: rooms.map(r => `${r.room_id} ${r.passed}/${r.total}`),
  };
}
