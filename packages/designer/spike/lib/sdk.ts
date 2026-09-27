/** bpy-style scene scripting for the designer: small TS scripts (`./varpet script file.ts`, `./varpet js '<code>'`) read
 * and edit the workspace's scene.json + draft.json in memory, look at the result whenever they like, and save.
 * Axes as everywhere in the spike: metres, x right, y up, rot degrees CCW, an item's front is its local -y.
 * Everything a script needs is on the Studio object (the CLI spreads it into the script's scope). Errors are one line. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { format } from 'node:util';
import { pathToFileURL } from 'node:url';
import type { Opening, Wall } from '../../src/scene.ts';
import {
  againstWall, area, atWindow, bbox as polyBox, centerOf, describe as describeScene, emptyRects, footprint, inPoly, innerFace, loadBudget,
  loadDraft, loadScene, loadSource, onWall, openingCentre, openingRooms, openingSpans, segDist, wallOutward,
  type Draft, type DraftItem, type Scene, type Vec2,
} from './scene.ts';
import { CEILING_STYLES, MATERIALS, onFloor, roomHeight, type CeilingStyle, type Finish, type FixtureLight, type Light } from './finishes.ts';

export interface Product { sku: string; kind: string; name: string; size: [number, number, number]; price: number; vendor: string; image?: string }
export type Box = { x0: number; x1: number; y0: number; y1: number; w: number; h: number };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const f2 = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
const norm = (d: number) => r3(((d % 360) + 360) % 360);
const box = (poly: Vec2[]): Box => { const b = polyBox(poly); return { ...b, w: r3(b.x1 - b.x0), h: r3(b.y1 - b.y0) }; };
const KINDS = 'sofa chair table bed cabinet lamp rug shelf plant decor wall_art mirror tv desk dresser wardrobe nightstand stool ottoman bench vase candle books '
  + 'cushion throw_blanket basket tray bowl lantern picture_frame planter clock wall_hanging monitor computer speaker coat_rack shoe_rack curtain blind '
  + 'crib changing_table pet_bed mattress kitchen_cabinet fridge washing_machine sink toilet bathtub shower towel_rack toy (dining table: table + text "dining"; sideboard/tv stand: cabinet + text)';
const HANGS = new Set(['wall_art', 'mirror', 'clock', 'wall_hanging', 'curtain', 'blind']);
/** Physics gates: what the editor or the body cannot live with. Everything else check() reports is a note. */
const GATE = /^(collision|containment|door_swing|walkway|operations|price|budget|surfaces|keep|fixed|support|catalog):/;

export class OpeningView {
  constructor(readonly id: string, readonly kind: Opening['kind'], readonly wall_id: string, readonly center: Vec2, readonly width: number,
    readonly from: number, readonly to: number, readonly sill: number, readonly height: number, readonly swing: string, readonly to_rooms: string[],
    /** Floor a door leaf sweeps or a passage needs clear: half disc of radius min(width, 1) on this room's side. */
    readonly clearZone: Vec2[]) {}
}

export class WallView {
  readonly a: Vec2; readonly b: Vec2; readonly length: number; readonly dir: Vec2; readonly side: string; readonly rot: number;
  readonly openings: OpeningView[];
  constructor(private readonly studio: Studio, readonly wall: Wall, readonly room_id: string) {
    const [a, b] = innerFace(studio.scene, wall);
    this.a = [r3(a[0]), r3(a[1])]; this.b = [r3(b[0]), r3(b[1])];
    this.length = r3(Math.hypot(b[0] - a[0], b[1] - a[1]));
    this.dir = [(b[0] - a[0]) / this.length, (b[1] - a[1]) / this.length];
    const [ox, oy] = wallOutward(studio.scene, wall);
    this.side = ox < -0.99 ? 'left' : ox > 0.99 ? 'right' : oy > 0.99 ? 'top' : oy < -0.99 ? 'bottom' : 'angled';
    this.rot = norm(Math.atan2(-ox, oy) * 180 / Math.PI);
    this.openings = openingSpans(studio.scene, wall).filter(s => s.to > 0.02 && s.from < this.length - 0.02)
      .map(s => studio.openingView(s.opening, room_id, s.from, s.to));
  }
  get id() { return this.wall.id; }
  /** Unit normal pointing INTO the room. */
  normal(): Vec2 { const [ox, oy] = wallOutward(this.studio.scene, this.wall); return [-ox, -oy]; }
  /** Point on the room-side face at fraction t (0 = end a, 1 = end b), pushed `off` metres into the room. */
  along(t: number, off = 0): Vec2 { return this.pointAt(t * this.length, off); }
  /** Point on the room-side face m metres from end a, pushed `off` metres into the room. */
  pointAt(m: number, off = 0): Vec2 {
    const n = this.normal();
    return [r3(this.a[0] + this.dir[0] * m + n[0] * off), r3(this.a[1] + this.dir[1] * m + n[1] * off)];
  }
  /** Metres along this face of a point's projection. */
  project(p: Vec2): number { return r3((p[0] - this.a[0]) * this.dir[0] + (p[1] - this.a[1]) * this.dir[1]); }
  /** Stretches of the face without doors or windows, [from, to] metres from a (margin kept clear of each opening). */
  freeSpans(margin = 0.1): [number, number][] {
    const cuts = this.openings.map(o => [o.from - margin, o.to + margin]).sort((x, y) => x[0]! - y[0]!);
    const out: [number, number][] = []; let at = 0;
    for (const [s, e] of cuts) { if (s! > at + 0.05) out.push([r3(at), r3(Math.min(s!, this.length))]); at = Math.max(at, e!); }
    if (this.length > at + 0.05) out.push([r3(at), this.length]);
    return out;
  }
  /** Pose for a floor piece with its back on this wall, centred `along` metres from a (default: middle), facing in. */
  place(size: [number, number, number] | [number, number], along?: number): { pos: Vec2; rot: number } {
    return againstWall(this.studio.scene, this.room_id, this.wall.id, size, along);
  }
  /** Pose for a hung piece (art, mirror, clock) on this wall: centre `along` metres from a, centre `height` m above the floor. */
  hang(size: [number, number, number], along?: number, height?: number) { return onWall(this.studio.scene, this.room_id, this.wall.id, size, along, height); }
  toString() {
    return `${this.side} wall ${this.id}: ${f2(this.length)} m, face (${f2(this.a[0])}, ${f2(this.a[1])}) -> (${f2(this.b[0])}, ${f2(this.b[1])}), `
      + `into room (${this.normal().map(f2).join(', ')}), backed rot ${this.rot}`
      + (this.openings.length ? `; ${this.openings.map(o => `${o.kind} ${o.id} ${f2(o.from)}..${f2(o.to)} m${o.kind === 'window' ? ` sill ${f2(o.sill)}` : ` to ${o.to_rooms.join('+') || 'outside'}`}`).join('; ')}` : '')
      + `; free ${this.freeSpans().map(([s, e]) => `${f2(s)}..${f2(e)}`).join(', ') || 'none'}`;
  }
}

export class RoomView {
  readonly id: string; readonly name: string; readonly polygon: Vec2[]; readonly bbox: Box; readonly area: number; readonly center: Vec2; readonly height: number;
  constructor(private readonly studio: Studio, roomId: string) {
    const room = studio.scene.rooms.find(r => r.id === roomId)!;
    this.id = room.id; this.name = room.name ?? room.id; this.polygon = room.polygon;
    this.bbox = box(room.polygon); this.area = r3(area(room.polygon)); this.center = centerOf(studio.scene, room.id);
    this.height = roomHeight(studio.scene, room.id);
  }
  get walls(): WallView[] { return this.studio.scene.walls.filter(w => w.room_id === this.id).map(w => new WallView(this.studio, w, this.id)); }
  get doors(): OpeningView[] { return this.walls.flatMap(w => w.openings).filter(o => o.kind !== 'window'); }
  get windows(): OpeningView[] { return this.walls.flatMap(w => w.openings).filter(o => o.kind === 'window'); }
  /** The wall on a side ('left'|'right'|'top'|'bottom') or by id; the longest when a side has several. */
  wall(q: string): WallView {
    const walls = this.walls, hit = walls.find(w => w.id === q) ?? walls.filter(w => w.side === q).sort((x, y) => y.length - x.length)[0];
    if (!hit) throw new Error(`no wall ${q} in ${this.id}; walls: ${walls.map(w => `${w.id} (${w.side})`).join(', ')}`);
    return hit;
  }
  items(): DraftItem[] { return this.studio.list(this.id); }
  contains(p: Vec2): boolean { return inPoly(p, this.polygon); }
  /** Largest empty floor rectangles (items and door zones removed), each side >= minSide. */
  free(minSide = 0.8, max = 3) { return this.studio.freeRects(this.id, minSide, max); }
  info(): string {
    return [`${this.name} [${this.id}]: ${f2(this.bbox.w)} x ${f2(this.bbox.h)} m, x ${f2(this.bbox.x0)}..${f2(this.bbox.x1)}, y ${f2(this.bbox.y0)}..${f2(this.bbox.y1)}, ${f2(this.area)} m2, centre (${this.center.map(f2).join(', ')}), ceiling ${f2(this.height)} m`,
      ...this.walls.map(w => '  ' + w.toString()),
      ...this.studio.scene.fixed.filter(x => x.room_id === this.id && !/^structure:(wall|pier)/.test(x.id)).map(x => `  fixed ${x.kind} ${x.id} at (${x.pos.map(f2).join(', ')}) size ${x.size.map(f2).join('x')} rot ${x.rot}`),
      `  items: ${this.items().length}; free floor: ${this.free().map(r => `x ${f2(r.x0)}..${f2(r.x1)} y ${f2(r.y0)}..${f2(r.y1)}`).join('; ') || 'none'}`].join('\n');
  }
  toString() { return this.info(); }
}

export interface AddOptions {
  id?: string; room?: string | RoomView; pos?: Vec2; rot?: number; color?: string;
  /** Back against (floor pieces) or hung on (art, mirrors, clocks) this wall, `along` metres from its end a. */
  wall?: string | WallView; along?: number;
  /** Hung pieces: centre height above the floor. */
  height?: number;
  /** Resting on another item (vase on a sideboard, cushion on a sofa); pos defaults to the support's centre. */
  on?: string;
  /** Curtains and blinds: the window they hang over. */
  window?: string;
}
export type LookView = 'plan' | 'overview' | 'eye' | 'eye2' | 'top' | string | RoomView | { from: [number, number, number?]; at: [number, number, number?] };

export class Studio {
  readonly scene: Scene; draft: Draft; readonly budget?: number; readonly brief?: string; dirty = false;
  private products = new Map<string, Product>();
  private looks = 0;
  constructor(readonly dir = '.') {
    this.scene = loadScene(join(dir, 'scene.json'));
    this.draft = loadDraft(join(dir, 'draft.json'));
    this.budget = loadBudget(join(dir, 'scene.json'));
    const brief = join(dir, 'brief.txt');
    this.brief = existsSync(brief) ? readFileSync(brief, 'utf8') : undefined;
    const cache = join(dir, 'catalog', 'cache');
    if (existsSync(cache)) for (const name of readdirSync(cache).filter(n => n.endsWith('.json'))) {
      try { for (const p of JSON.parse(readFileSync(join(cache, name), 'utf8')).rows as Product[]) this.products.set(p.sku, p); } catch { /* partial file */ }
    }
    for (const item of this.draft.items) if (item.sku && item.price !== undefined && !this.products.has(item.sku))
      this.products.set(item.sku, { sku: item.sku, kind: item.kind, name: item.name, size: item.size, price: item.price, vendor: item.vendor ?? 'unknown' });
  }

  // ---------- the flat ----------
  rooms(): RoomView[] { return this.scene.rooms.map(r => new RoomView(this, r.id)); }
  room(q: string | RoomView): RoomView {
    if (q instanceof RoomView) return q;
    const s = q.toLowerCase(), r = this.scene.rooms.find(r => r.id === q) ?? this.scene.rooms.find(r => (r.name ?? '').toLowerCase() === s)
      ?? this.scene.rooms.find(r => (r.name ?? '').toLowerCase().includes(s) || r.id.includes(s));
    if (!r) throw new Error(`no room ${q}; rooms: ${this.scene.rooms.map(r => `${r.id} (${r.name ?? ''})`).join(', ')}`);
    return new RoomView(this, r.id);
  }
  wall(id: string, room?: string | RoomView): WallView {
    const w = this.scene.walls.find(w => w.id === id && (!room || w.room_id === this.room(room).id)) ?? this.scene.walls.find(w => w.id === id);
    if (!w) throw new Error(`no wall ${id}`);
    const roomId = room ? this.room(room).id : w.room_id;
    return this.room(roomId).wall(this.scene.walls.find(x => x.room_id === roomId && (x.source_id ?? x.id) === (w.source_id ?? w.id))?.id ?? id);
  }
  openingView(o: Opening, roomId: string, from: number, to: number): OpeningView {
    const c = openingCentre(this.scene, o), owner = this.scene.walls.find(w => w.room_id === roomId && (w.source_id ?? w.id) === (this.scene.walls.find(x => x.id === o.wall_id)?.source_id ?? o.wall_id))
      ?? this.scene.walls.find(w => w.id === o.wall_id)!;
    const [ox, oy] = wallOutward(this.scene, owner), r = Math.min(1, o.width), a0 = Math.atan2(-oy, -ox);
    const zone: Vec2[] = o.kind === 'window' ? [] : Array.from({ length: 9 }, (_, i) => {
      const a = a0 - Math.PI / 2 + Math.PI * i / 8; return [r3(c[0] + Math.cos(a) * r), r3(c[1] + Math.sin(a) * r)] as Vec2;
    });
    const probe = (owner.thickness ?? 0.2) / 2 + 0.25, beyond = this.roomAt([c[0] + ox * probe, c[1] + oy * probe]);
    const rooms = beyond && beyond !== roomId ? [beyond] : openingRooms(this.scene, o).filter(id => id !== roomId);
    return new OpeningView(o.id, o.kind, o.wall_id, [r3(c[0]), r3(c[1])], o.width, r3(from), r3(to), o.sill, o.height, o.swing ?? 'none', rooms, zone);
  }
  /** The room whose polygon holds p (undefined outside every room). */
  roomAt(p: Vec2): string | undefined { return this.scene.rooms.find(r => inPoly(p, r.polygon))?.id; }
  describe(): string { return describeScene(this.scene, this.draft, this.budget); }

  // ---------- items ----------
  list(room?: string | RoomView): DraftItem[] { const id = room === undefined ? undefined : this.room(room).id; return this.draft.items.filter(i => id === undefined || i.room_id === id); }
  get(id: string): DraftItem {
    const item = this.draft.items.find(i => i.id === id) ?? this.scene.items.find(i => i.id === id) ?? this.scene.fixed.find(i => i.id === id);
    if (!item) throw new Error(`no item ${id}`);
    return item as DraftItem;
  }
  private own(id: string): DraftItem {
    const item = this.draft.items.find(i => i.id === id);
    if (!item) throw new Error(this.scene.items.some(i => i.id === id) || this.scene.fixed.some(i => i.id === id) ? `${id} belongs to the flat and stays` : `no item ${id}`);
    return item;
  }
  private uniqueId(base: string): string {
    const taken = new Set([...this.draft.items, ...this.scene.items, ...this.scene.fixed].map(i => i.id));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  productOf(p: Product | string): Product {
    if (typeof p !== 'string') { this.products.set(p.sku, p); return p; }
    const hit = this.products.get(p);
    if (!hit) throw new Error(`unknown sku ${p}: find it with await search({...}) or await product('${p}') first`);
    return hit;
  }
  /** Add a catalog piece. Give pos (+rot), or wall (+along, +height for hung kinds), or on (a support id), or window (curtains). */
  add(p: Product | string, o: AddOptions = {}): DraftItem {
    const product = this.productOf(p);
    let pos = o.pos, rot = o.rot, roomId = o.room ? this.room(o.room).id : undefined, extra: Partial<DraftItem> = {};
    if (o.window) {
      const win = this.scene.openings.find(x => x.id === o.window);
      if (!win) throw new Error(`no window ${o.window}`);
      roomId ??= this.scene.walls.find(w => w.id === win.wall_id)?.room_id;
      const at = atWindow(this.scene, roomId!, o.window, product.size);
      pos = at.pos; rot = at.rot; extra = { wall_id: at.wall_id, height_m: at.height_m };
    } else if (o.wall) {
      const wall = typeof o.wall === 'string' ? this.wall(o.wall, roomId) : o.wall;
      roomId ??= wall.room_id;
      if (HANGS.has(product.kind) && !(product.kind === 'mirror' && product.size[2] > 1.4)) {
        const at = wall.hang(product.size, o.along, o.height); pos = at.pos; rot = at.rot; extra = { wall_id: at.wall_id, height_m: at.height_m };
      } else ({ pos, rot } = wall.place(product.size, o.along));
    } else if (o.on) {
      const support = this.get(o.on);
      pos ??= support.pos; rot ??= support.rot; roomId ??= support.room_id; extra = { on: o.on };
    }
    if (!pos) throw new Error(`add ${product.sku}: give pos, wall, on or window`);
    roomId ??= this.roomAt(pos);
    if (!roomId) throw new Error(`add ${product.sku}: (${pos.map(f2).join(', ')}) is in no room; pass room`);
    const item: DraftItem = { id: o.id ?? this.uniqueId(`${roomId}-${product.kind}`), room_id: roomId, kind: product.kind, name: product.name,
      pos: [r3(pos[0]), r3(pos[1])], rot: norm(rot ?? 0), size: product.size, keep: false, sku: product.sku, price: product.price, vendor: product.vendor,
      ...(o.color ? { color: o.color } : {}), ...extra };
    if (this.draft.items.some(i => i.id === item.id)) throw new Error(`id ${item.id} already used`);
    this.draft.items.push(item); this.dirty = true;
    return item;
  }
  /** Move to pos (or by {dx, dy}); rot too when given. Items resting on it move with it. */
  move(id: string, to: Vec2 | { dx?: number; dy?: number }, rot?: number): DraftItem {
    const item = this.own(id), from = item.pos;
    item.pos = Array.isArray(to) ? [r3(to[0]), r3(to[1])] : [r3(from[0] + (to.dx ?? 0)), r3(from[1] + (to.dy ?? 0))];
    for (const child of this.draft.items.filter(i => i.on === id)) child.pos = [r3(child.pos[0] + item.pos[0] - from[0]), r3(child.pos[1] + item.pos[1] - from[1])];
    if (rot !== undefined) item.rot = norm(rot);
    if (!item.wall_id && !item.on) item.room_id = this.roomAt(item.pos) ?? item.room_id;
    this.dirty = true; return item;
  }
  rotate(id: string, rot: number): DraftItem { const item = this.own(id); item.rot = norm(rot); this.dirty = true; return item; }
  /** Remove an item and everything resting on it; returns the removed ids. */
  remove(id: string): string[] {
    this.own(id);
    const gone = new Set([id]);
    for (let grew = true; grew;) { grew = false; for (const i of this.draft.items) if (i.on && gone.has(i.on) && !gone.has(i.id)) { gone.add(i.id); grew = true; } }
    this.draft.items = this.draft.items.filter(i => !gone.has(i.id)); this.dirty = true;
    return [...gone];
  }

  // ---------- geometry ----------
  private item(x: string | DraftItem): DraftItem { return typeof x === 'string' ? this.get(x) : x; }
  bbox(x: string | DraftItem): Box { return box(footprint(this.item(x))); }
  footprint(x: string | DraftItem): Vec2[] { return footprint(this.item(x)).map(p => [r3(p[0]), r3(p[1])] as Vec2); }
  /** Centre-to-centre distance. */
  distance(a: string | DraftItem | Vec2, b: string | DraftItem | Vec2): number {
    const p = (x: string | DraftItem | Vec2) => Array.isArray(x) ? x as Vec2 : this.item(x as string | DraftItem).pos;
    const [pa, pb] = [p(a), p(b)]; return r3(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]));
  }
  /** Edge-to-edge floor gap between two footprints; negative = they overlap by that depth. */
  gap(a: string | DraftItem, b: string | DraftItem): number {
    const A = footprint(this.item(a)), B = footprint(this.item(b)), depth = overlapDepth(A, B);
    if (depth > 0) return r3(-depth);
    let d = Infinity;
    for (const [P, Q] of [[A, B], [B, A]] as const) for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p, Q[i]!, Q[(i + 1) % Q.length]!));
    return r3(d);
  }
  /** How a's front points at b: angle in degrees between a's front and the direction to b (0 = straight at it). */
  facing(a: string | DraftItem, b: string | DraftItem | Vec2): { angle: number; faces: boolean } {
    const A = this.item(a), p = Array.isArray(b) ? b as Vec2 : this.item(b as string | DraftItem).pos;
    const fr = A.rot * Math.PI / 180, front: Vec2 = [Math.sin(fr), -Math.cos(fr)], v: Vec2 = [p[0] - A.pos[0], p[1] - A.pos[1]], l = Math.hypot(...v) || 1;
    const angle = r3(Math.acos(Math.max(-1, Math.min(1, (front[0] * v[0] + front[1] * v[1]) / l))) * 180 / Math.PI);
    return { angle, faces: angle <= 30 };
  }
  /** What is within radius of pos: floor items, fixed fittings, door zones, walls (edge distances). */
  clear(pos: Vec2, radius = 0.5): string[] {
    const out: [number, string][] = [];
    for (const i of [...this.scene.items, ...this.scene.fixed, ...this.draft.items.filter(onFloor)]) {
      const fp = footprint(i), d = inPoly(pos, fp) ? 0 : Math.min(...fp.map((p, k) => segDist(pos, p, fp[(k + 1) % fp.length]!)));
      if (d <= radius) out.push([d, `${i.id} (${i.kind}) ${f2(d)} m`]);
    }
    const roomId = this.roomAt(pos);
    if (roomId) for (const w of this.room(roomId).walls) {
      const d = segDist(pos, w.a, w.b); if (d <= radius) out.push([d, `wall ${w.id} (${w.side}) ${f2(d)} m`]);
      for (const o of w.openings) if (o.clearZone.length && inPoly(pos, o.clearZone)) out.push([0, `inside ${o.kind} ${o.id} clear zone`]);
    }
    return out.sort((x, y) => x[0] - y[0]).map(x => x[1]);
  }
  /** Items (the design's and the flat's own) matching every given field: kind exact, name/id substring, room id or name. */
  find(q: { kind?: string; name?: string; room?: string | RoomView } = {}): DraftItem[] {
    const roomId = q.room === undefined ? undefined : this.room(q.room).id, s = q.name?.toLowerCase();
    return [...this.draft.items, ...this.scene.items, ...this.scene.fixed as DraftItem[]].filter(i => (!q.kind || i.kind === q.kind)
      && (!s || i.id.toLowerCase().includes(s) || (i.name ?? '').toLowerCase().includes(s)) && (!roomId || i.room_id === roomId)) as DraftItem[];
  }
  /** Would this piece fit here? Read-only: tries the add, reports collisions, near gaps, door zones and walls, then undoes it. */
  fits(p: Product | string, o: AddOptions = {}): { pos: Vec2; rot: number; room?: string; collisions: string[]; near: string[]; doorZones: string[]; inRoom: boolean } {
    const saved = structuredClone(this.draft), dirty = this.dirty;
    try {
      const item = this.add(p, o), fp = footprint(item), room = item.room_id;
      const others = [...this.scene.items, ...this.scene.fixed, ...this.draft.items.filter(onFloor)].filter(b => b.id !== item.id && b.kind !== 'rug' && b.room_id === room);
      const floor = onFloor(item) && item.kind !== 'rug';
      const gaps = floor ? others.map(b => [b.id, this.gap(item, b as DraftItem)] as const) : [];
      const zones = floor ? this.room(room).walls.flatMap(w => w.openings).filter(z => z.clearZone.length && fp.some(pt => inPoly(pt, z.clearZone))).map(z => `${z.kind} ${z.id}`) : [];
      return { pos: item.pos, rot: item.rot, room, collisions: gaps.filter(([, g]) => g < -0.01).map(([id, g]) => `${id} (overlap ${f2(-g)} m)`),
        near: gaps.filter(([, g]) => g >= -0.01 && g < 0.6).map(([id, g]) => `${id} ${f2(g)} m`), doorZones: [...new Set(zones)],
        inRoom: fp.every(pt => this.room(room).contains(pt) || this.room(room).walls.some(w => segDist(pt, w.a, w.b) < 0.02)) };
    } finally { this.draft = saved; this.dirty = dirty; }
  }
  freeRects(room: string | RoomView, minSide = 0.8, max = 3) {
    const id = this.room(room).id;
    return emptyRects(this.scene, id, [...this.scene.items, ...this.draft.items], max, 0, minSide).map(r => ({ x0: r3(r.x0), x1: r3(r.x1), y0: r3(r.y0), y1: r3(r.y1), w: r3(r.x1 - r.x0), h: r3(r.y1 - r.y0) }));
  }

  // ---------- surfaces and light ----------
  private finish(f: Finish) {
    this.draft.finishes = [...(this.draft.finishes ?? []).filter(x => !(x.room_id === f.room_id && x.surface === f.surface && x.wall_id === f.wall_id)), f];
    this.dirty = true;
  }
  /** Paint the room's walls, or one wall (accent) with {wall}. material optional (a paint preset). */
  paint(room: string | RoomView, color: string, o: { wall?: string | WallView; material?: string } = {}) {
    const id = this.room(room).id, wall = o.wall === undefined ? undefined : typeof o.wall === 'string' ? this.wall(o.wall, id) : o.wall;
    this.finish({ room_id: id, surface: wall ? 'wall' : 'walls', ...(wall ? { wall_id: wall.id } : {}), ...(o.material ? { material: o.material } : {}), color });
  }
  floor(room: string | RoomView, material: string, color?: string) { this.finish({ room_id: this.room(room).id, surface: 'floor', material, ...(color ? { color } : {}) }); }
  ceilingColor(room: string | RoomView, color: string) { this.finish({ room_id: this.room(room).id, surface: 'ceiling', color }); }
  materials() { return MATERIALS.map(m => `${m.id} | ${m.category} | ${m.color} | ${m.look}`); }
  /** The room's ceiling light design (one per room). */
  ceiling(room: string | RoomView, style: CeilingStyle, o: { brightness?: number; temperature_k?: number } = {}) {
    if (!CEILING_STYLES.includes(style)) throw new Error(`style is ${CEILING_STYLES.join(', ')}`);
    const id = this.room(room).id;
    this.draft.lighting = [...(this.draft.lighting ?? []).filter(l => !(l.type === 'ceiling' && l.room_id === id)), { room_id: id, type: 'ceiling', style, ...o }];
    this.dirty = true;
  }
  /** A pendant, ceiling or wall fixture (not a catalog item; lamps are catalog items). */
  fixture(room: string | RoomView, o: Omit<FixtureLight, 'room_id' | 'type' | 'id'> & { id?: string }): FixtureLight {
    const roomId = this.room(room).id, taken = new Set((this.draft.lighting ?? []).map(l => (l as FixtureLight).id));
    let id = o.id ?? `${roomId}-${o.mount}`; for (let n = 2; !o.id && taken.has(id); n++) id = `${roomId}-${o.mount}-${n}`;
    const light: FixtureLight = { ...o, room_id: roomId, type: 'fixture', id, brightness: o.brightness ?? 800, temperature_k: o.temperature_k ?? 2700 };
    this.draft.lighting = [...(this.draft.lighting ?? []).filter(l => (l as FixtureLight).id !== id), light as Light];
    this.dirty = true; return light;
  }

  // ---------- catalog ----------
  /** Catalog search, cached per workspace like ./varpet search. */
  async search(q: { kind: string; text?: string; maxW?: number; maxD?: number; maxH?: number; maxPrice?: number; limit?: number }): Promise<Product[]> {
    const query = { kind: q.kind, text: q.text, maxW: q.maxW, maxD: q.maxD, maxH: q.maxH, maxPrice: q.maxPrice, limit: q.limit ?? 6 };
    const key = createHash('sha1').update(JSON.stringify(Object.entries(query).filter(([, v]) => v !== undefined).sort())).digest('hex').slice(0, 16);
    const dir = join(this.dir, 'catalog', 'cache'), path = join(dir, `${key}.json`);
    let rows: Product[];
    if (existsSync(path)) rows = JSON.parse(readFileSync(path, 'utf8')).rows;
    else {
      const { search } = await import('./catalog.ts');
      try { rows = await search(query) as Product[]; }
      catch (error) {
        // An unknown kind makes the catalog tool fail: say which kinds exist and let the script go on.
        console.error(`search ${JSON.stringify(query.kind)}: ${error instanceof Error ? error.message.split('\n')[0] : error}; kinds: ${KINDS}`);
        return [];
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${path}.${process.pid}`, JSON.stringify({ q: query, rows })); renameSync(`${path}.${process.pid}`, path);
    }
    for (const p of rows) this.products.set(p.sku, p);
    if (!rows.length) console.error(`search ${JSON.stringify(query)}: no results; kinds: ${KINDS}`);
    return rows.map(({ image: _image, ...p }) => p);
  }
  /** One product by exact sku (seen before, or looked up in the catalog). */
  async product(sku: string): Promise<Product> {
    const hit = this.products.get(sku); if (hit) return hit;
    const { catalogItems } = await import('../../src/catalog.ts');
    const r = (await catalogItems([sku]))[0] as Record<string, unknown> | undefined, size = r?.size_m as [number, number, number] | undefined;
    if (!r || !Array.isArray(size) || typeof r.price !== 'number') throw new Error(`sku ${sku} not found in the catalog`);
    const p: Product = { sku, kind: String(r.kind), name: String(r.name).slice(0, 70), size, price: Math.round(r.price), vendor: String(r.brand ?? r.source ?? 'unknown') };
    this.products.set(sku, p); return p;
  }
  /** A contact sheet PNG of product photos; returns its path (view it). */
  async sheet(skus: (string | Product)[], out?: string): Promise<string> {
    const { productSheet } = await import('./catalog.ts');
    return productSheet(skus.map(s => typeof s === 'string' ? s : s.sku), this.lookPath(out, 'sheet'));
  }

  // ---------- facts ----------
  /** Hard gates (physics, editor validity, budget) and notes (rules of thumb you may overrule with a reason). */
  async check(): Promise<{ ok: boolean; gates: string[]; notes: string[]; total: number }> {
    const { check, checkDecor } = await import('./check.ts');
    const { loadRequirements } = await import('./requirements.ts');
    const { importSrc } = await import('./scene.ts');
    const { editorKindOf } = await importSrc<typeof import('../../src/editor-bridge.ts')>('editor-bridge.ts');
    const r = await check(this.scene, this.draft, { budget: this.budget, brief: this.brief ?? '', requirements: loadRequirements(join(this.dir, 'scene.json')), styling: 'advice' });
    const physical = new Set(checkDecor(this.scene, this.draft, kind => editorKindOf[kind] ?? kind));
    const gates = r.problems.filter(line => GATE.test(line) || physical.has(line));
    for (const item of this.draft.items) if (!item.sku || typeof item.price !== 'number') gates.push(`catalog: ${item.id} has no sku or price`);
    const notes = [...r.problems.filter(line => !gates.includes(line)), ...r.advice];
    const total = this.draft.items.reduce((s, i) => s + (i.price ?? 0), 0);
    return { ok: gates.length === 0, gates, notes, total };
  }
  /** Measured facts about a room (or every furnished room): walkways, gaps, what faces what, wall pieces, free floor. */
  async measure(room?: string | RoomView): Promise<string[]> {
    const ids = room ? [this.room(room).id] : [...new Set(this.draft.items.map(i => i.room_id))];
    const { importSrc } = await import('./scene.ts');
    const { checkLayout } = await importSrc<typeof import('../../src/layout.ts')>('layout.ts');
    const { plainItem } = await import('./finishes.ts');
    const layout = checkLayout(this.scene, this.draft.items.filter(onFloor).map(i => ({ type: 'add' as const, item: plainItem(i) })));
    const out: string[] = [];
    for (const id of ids) {
      const r = this.room(id), mine = this.list(id), floor = mine.filter(onFloor), others = [...floor, ...this.scene.items.filter(i => i.room_id === id), ...this.scene.fixed.filter(i => i.room_id === id)];
      out.push(`${r.name} [${id}]: ${mine.length} pieces (${floor.length} on the floor), ${mine.reduce((s, i) => s + (i.price ?? 0), 0)} AMD, floor used ${Math.round(100 * floor.filter(i => i.kind !== 'rug').reduce((s, i) => s + i.size[0] * i.size[1], 0) / r.area)}%`);
      for (const e of layout.errors) if ((e.item_ids ?? []).some(x => mine.some(i => i.id === x)) || (e.check === 'walkway' && e.message.includes(id)))
        out.push(`  ${e.severity === 'hard' ? 'GATE' : 'fact'} ${e.check}: ${e.message}`);
      for (const a of floor) {
        if (a.kind === 'rug') continue;
        const near = others.filter(b => b.id !== a.id && b.kind !== 'rug').map(b => [b, this.gap(a, b as DraftItem)] as const).filter(([, g]) => g < 0.6).sort((x, y) => x[1] - y[1]);
        const front = others.filter(b => b.id !== a.id && b.kind !== 'rug' && this.distance(a, b as DraftItem) < 4 && this.facing(a, b as DraftItem).faces).sort((x, y) => this.distance(a, x as DraftItem) - this.distance(a, y as DraftItem))[0];
        const wallGap = Math.min(...r.walls.map(w => Math.min(...footprint(a).map(p => segDist(p, w.a, w.b)))));
        out.push(`  ${a.id} ${a.kind} at (${a.pos.map(f2).join(', ')}) rot ${a.rot}: ${f2(wallGap)} m to nearest wall${front ? `; faces ${front.id} (${f2(this.distance(a, front as DraftItem))} m)` : ''}${near.length ? `; gaps ${near.map(([b, g]) => `${b.id} ${f2(g)}`).join(', ')}` : ''}`);
      }
      for (const h of mine.filter(i => i.wall_id)) {
        const below = floor.filter(b => b.kind !== 'rug' && this.gap(h, b) < 0.35 && Math.abs(new WallView(this, this.scene.walls.find(w => w.id === h.wall_id)!, id).project(b.pos) - new WallView(this, this.scene.walls.find(w => w.id === h.wall_id)!, id).project(h.pos)) < b.size[0] / 2);
        out.push(`  hung ${h.id} ${h.kind} on ${h.wall_id} centre ${f2(h.height_m ?? 0)} m${below.length ? ` over ${below.map(b => `${b.id} (top ${f2(b.size[2])} m)`).join(', ')}` : ''}`);
      }
      const onTop = mine.filter(i => i.on);
      if (onTop.length) out.push(`  resting: ${onTop.map(i => `${i.id} on ${i.on}`).join(', ')}`);
      out.push(`  free floor: ${this.freeRects(id).map(z => `${f2(z.w)}x${f2(z.h)} at x ${f2(z.x0)}..${f2(z.x1)} y ${f2(z.y0)}..${f2(z.y1)}`).join('; ') || 'none >= 0.8 m'}`);
    }
    return out;
  }

  // ---------- looking ----------
  private lookPath(out: string | undefined, label: string): string {
    if (out) return resolve(this.dir, out);
    mkdirSync(join(this.dir, 'looks'), { recursive: true });
    let n = this.looks; while (existsSync(join(this.dir, 'looks', `${String(n + 1).padStart(3, '0')}-${label}.png`))) n++;
    this.looks = n + 1;
    return resolve(this.dir, 'looks', `${String(this.looks).padStart(3, '0')}-${label}.png`);
  }
  /** Render the current (unsaved too) design and return the PNG path; view it with your image tool.
   *  look('plan') top-down plan of the flat; look('plan', {room}) of one room;
   *  look(room) cutaway overview of a room; look('eye' | 'eye2', {room}) standing in a corner; look('top');
   *  look({from: [x, y, h?], at: [x, y, h?]}) a camera anywhere (h defaults 1.4 m eye, 0.9 m target);
   *  {time: 'evening'} turns the designed lights on; {width, height} default 768x512. */
  async look(view: LookView = 'plan', o: { room?: string | RoomView; time?: 'day' | 'evening'; width?: number; height?: number; out?: string } = {}): Promise<string> {
    const roomId = o.room ? this.room(o.room).id : typeof view === 'string' && !['plan', 'overview', 'eye', 'eye2', 'top'].includes(view) ? this.room(view).id : view instanceof RoomView ? view.id : undefined;
    if (view === 'plan') {
      const { renderPlan } = await import('./render-plan.ts');
      return resolve(await renderPlan(this.scene, this.draft, this.lookPath(o.out, `plan${roomId ? '-' + roomId : ''}`), { roomId }));
    }
    const camera = typeof view === 'object' && !(view instanceof RoomView) ? { eye: view.from, target: view.at } : view === 'eye' || view === 'eye2' || view === 'top' ? view : 'overview';
    if ((camera === 'eye' || camera === 'eye2') && !roomId) throw new Error(`look('${camera}') needs {room}`);
    const { renderView } = await import('./render-view.ts');
    const width = o.width ?? 768, height = o.height ?? Math.round(width * 2 / 3);
    const label = typeof camera === 'object' ? 'camera' : `${camera}${roomId ? '-' + roomId : ''}`;
    return renderView(this.scene, this.draft, this.lookPath(o.out, `${label}${o.time === 'evening' ? '-evening' : ''}`),
      { roomId, camera: camera as never, time: o.time ?? 'day', width, height, source: loadSource(join(this.dir, 'scene.json')) });
  }

  /** Save draft.json as one undo step and say what changed (created / updated / removed ids, surfaces, lights). */
  save(): string {
    const path = join(this.dir, 'draft.json'), before = existsSync(path) ? readFileSync(path, 'utf8') : '{"items": []}\n';
    const after = JSON.stringify(this.draft, null, 1) + '\n';
    if (before !== after) {
      const history = join(this.dir, '.history');
      mkdirSync(join(history, 'redo'), { recursive: true });
      writeFileSync(join(history, `${String(historySteps(history).length + 1).padStart(4, '0')}.json`), before);
      for (const name of readdirSync(join(history, 'redo'))) unlinkSync(join(history, 'redo', name));
    }
    writeFileSync(path, after);
    this.dirty = false;
    return `saved draft.json: ${this.draft.items.length} items, ${this.draft.items.reduce((s, i) => s + (i.price ?? 0), 0)} AMD; ${changes(JSON.parse(before), this.draft)}`;
  }
  /** Step back through saved drafts (every script run or save is one step); the draft in memory follows. */
  undo(steps = 1): string { return this.travel(steps, 'undo'); }
  redo(steps = 1): string { return this.travel(steps, 'redo'); }
  private travel(steps: number, way: 'undo' | 'redo'): string {
    const history = join(this.dir, '.history'), path = join(this.dir, 'draft.json');
    mkdirSync(join(history, 'redo'), { recursive: true });
    let done = 0;
    for (; done < steps; done++) {
      const from = way === 'undo' ? historySteps(history).map(n => join(history, n)).pop() : historySteps(join(history, 'redo')).map(n => join(history, 'redo', n)).pop();
      if (!from) break;
      const into = way === 'undo' ? join(history, 'redo') : history;
      writeFileSync(join(into, `${String(historySteps(into).length + 1).padStart(4, '0')}.json`), readFileSync(path, 'utf8'));
      writeFileSync(path, readFileSync(from, 'utf8')); unlinkSync(from);
    }
    const before = this.draft;
    this.draft = loadDraft(path); this.dirty = false;
    return `${way === 'undo' ? 'undid' : 'redid'} ${done} step${done === 1 ? '' : 's'}; ${changes(before, this.draft)}`;
  }
}

function historySteps(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter(n => /^\d+\.json$/.test(n)).sort() : [];
}

/** What changed between two drafts, in ids: the model learns what a script actually did. */
function changes(a: Partial<Draft>, b: Partial<Draft>): string {
  const ids = (d: Partial<Draft>) => new Map((d.items ?? []).map(i => [i.id, JSON.stringify(i)]));
  const A = ids(a), B = ids(b);
  const created = [...B.keys()].filter(k => !A.has(k)), removed = [...A.keys()].filter(k => !B.has(k));
  const updated = [...B.keys()].filter(k => A.has(k) && A.get(k) !== B.get(k));
  const same = (k: 'finishes' | 'lighting') => JSON.stringify(a[k] ?? []) === JSON.stringify(b[k] ?? []);
  const parts = [created.length && `created ${created.join(', ')}`, updated.length && `updated ${updated.join(', ')}`,
    removed.length && `removed ${removed.join(', ')}`, !same('finishes') && 'surfaces changed', !same('lighting') && 'lights changed'].filter(Boolean);
  return parts.join('; ') || 'no change';
}

/** Separating-axis overlap depth of two convex polygons (0 if apart). */
function overlapDepth(a: Vec2[], b: Vec2[]): number {
  let depth = Infinity;
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!, l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n: Vec2 = [(p[1] - q[1]) / l, (q[0] - p[0]) / l];
    const proj = (s: Vec2[]) => s.map(v => v[0] * n[0] + v[1] * n[1]);
    const pa = proj(a), pb = proj(b), d = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (d <= 0) return 0;
    depth = Math.min(depth, d);
  }
  return depth;
}

/** The names a script sees: every Studio method bound, plus the studio itself. */
export function scriptScope(studio: Studio): Record<string, unknown> {
  const names = Object.getOwnPropertyNames(Studio.prototype).filter(n => n !== 'constructor' && typeof (studio as unknown as Record<string, unknown>)[n] === 'function' && !['item', 'own', 'uniqueId', 'finish', 'lookPath', 'openingView', 'productOf', 'travel'].includes(n));
  return { studio, scene: studio.scene, ...Object.fromEntries(names.map(n => [n, ((studio as unknown as Record<string, (...a: unknown[]) => unknown>)[n]!).bind(studio)])) };
}

/** Run a script body against the studio: every Studio name in scope, top-level await, saved (one undo step) only when it
 * ends without an error. capture collects console output instead of printing it (the MCP server's stdout is the protocol). */
export async function runScript(studio: Studio, code: string, capture = false): Promise<{ output: string; saved?: string }> {
  if (/^\s*import\s/m.test(code)) throw new Error('scripts need no imports: every Studio function (room, add, look, ...) is already in scope');
  const scope = scriptScope(studio), lines: string[] = [], original = { log: console.log, error: console.error };
  (globalThis as Record<string, unknown>).__varpet = scope;
  const file = join(studio.dir, `.varpet-script-${process.pid}-${Date.now()}.mts`);
  writeFileSync(file, `const { ${Object.keys(scope).join(', ')} } = (globalThis as any).__varpet; {\n${code}\n}\nexport {};\n`);
  if (capture) console.log = console.error = (...a: unknown[]) => { lines.push(format(...a)); };
  try { await import(pathToFileURL(file).href); }
  catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    // esbuild syntax errors: "<file>:<line>:<col>: ERROR: <what>"; the body starts on line 2 of the module file.
    const syntax = /:(\d+):(\d+): ERROR: (.*)/.exec(text);
    const at = syntax ? undefined : error instanceof Error ? /\.varpet-script-[\d-]+\.m?ts:(\d+)/.exec(error.stack ?? '')?.[1] : undefined;
    const message = syntax ? `syntax error: ${syntax[3]} (script line ${Number(syntax[1]) - 1}, column ${syntax[2]})` : text.split('\n')[0];
    throw new Error(`${lines.length ? lines.join('\n') + '\n' : ''}${message}${at ? ` (script line ${Number(at) - 1})` : ''}; nothing saved`);
  } finally { Object.assign(console, original); unlinkSync(file); }
  return { output: lines.join('\n'), ...(studio.dirty ? { saved: studio.save() } : {}) };
}
