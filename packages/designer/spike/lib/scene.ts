/** Scene loading, a plain-language brief, and placement helpers for the designer spike.
 * Self-contained geometry (no runtime import of ../src) so it runs from a copied workspace.
 * Axes: metres, x right, y up, rot degrees CCW, item front is local -y (rot 0 faces -y). */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Item, Opening, Scene, Vec2, Wall } from '../../src/scene.ts';

import { describeSurfaces, onFloor, roomHeight, type Draft, type DraftItem } from './finishes.ts';

export type { Item, Scene, Vec2, Draft, DraftItem };

/** Designer src dir: $VARPET_DESIGNER_SRC, else ../../src next to this file (in-repo), else the worktree. */
export function designerSrc(): string {
  if (process.env.VARPET_DESIGNER_SRC) return process.env.VARPET_DESIGNER_SRC;
  const local = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
  if (existsSync(join(local, 'layout.ts'))) return local;
  return '/Users/snek/dev/varpet-designer-spike/packages/designer/src';
}
export function importSrc<T = any>(file: string): Promise<T> {
  return import(pathToFileURL(join(designerSrc(), file)).href) as Promise<T>;
}

export function loadScene(path = 'scene.json'): Scene {
  const scene = JSON.parse(readFileSync(path, 'utf8')) as Scene;
  scene.items ??= []; scene.fixed ??= []; scene.openings ??= [];
  return scene;
}
export function loadDraft(path = 'draft.json'): Draft {
  if (!existsSync(path)) return { items: [] };
  const draft = JSON.parse(readFileSync(path, 'utf8')) as Draft;
  return { items: Array.isArray(draft?.items) ? draft.items : [],
    ...(Array.isArray(draft?.finishes) ? { finishes: draft.finishes } : {}), ...(Array.isArray(draft?.lighting) ? { lighting: draft.lighting } : {}) };
}

// ---------- geometry ----------
const f = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
const pt = (p: Vec2) => `(${f(p[0])}, ${f(p[1])})`;
const len = (w: { a: Vec2; b: Vec2 }) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
const norm360 = (d: number) => Math.round(((d % 360) + 360) % 360 * 100) / 100;

function room(scene: Scene, roomId: string) {
  const r = scene.rooms.find(r => r.id === roomId);
  if (!r) throw new Error(`Unknown room ${roomId}; rooms: ${scene.rooms.map(r => r.id).join(', ')}`);
  return r;
}
function inPoly(p: Vec2, poly: Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
function bbox(poly: Vec2[]) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function area(poly: Vec2[]) {
  return Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
}
/** Unit normal pointing out of the wall's room. */
export function wallOutward(scene: Scene, wall: Wall): Vec2 {
  const l = len(wall), n: Vec2 = [(wall.b[1] - wall.a[1]) / l, (wall.a[0] - wall.b[0]) / l];
  const mid: Vec2 = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
  const poly = room(scene, wall.room_id).polygon;
  return inPoly([mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05], poly) ? [-n[0], -n[1]] : n;
}
/** Plain side name from the outward normal, e.g. "left wall x=-5.00 (y -4.00..4.00)". */
function wallName(scene: Scene, wall: Wall): string {
  const [ox, oy] = wallOutward(scene, wall);
  const ys = `${f(Math.min(wall.a[1], wall.b[1]))}..${f(Math.max(wall.a[1], wall.b[1]))}`;
  const xs = `${f(Math.min(wall.a[0], wall.b[0]))}..${f(Math.max(wall.a[0], wall.b[0]))}`;
  if (ox < -0.99) return `left wall x=${f(wall.a[0])} (y ${ys})`;
  if (ox > 0.99) return `right wall x=${f(wall.a[0])} (y ${ys})`;
  if (oy > 0.99) return `top wall y=${f(wall.a[1])} (x ${xs})`;
  if (oy < -0.99) return `bottom wall y=${f(wall.a[1])} (x ${xs})`;
  return `wall ${pt(wall.a)}-${pt(wall.b)} facing out ${norm360(Math.atan2(ox, oy) * 180 / Math.PI)}deg`;
}
const physical = (w: Wall) => w.source_id ?? w.id;
function openingCentre(scene: Scene, o: Opening): Vec2 {
  const w = scene.walls.find(w => w.id === o.wall_id)!, t = (o.offset + o.width / 2) / len(w);
  return [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
}
/** Rooms an opening joins: explicit room_ids, else every room owning an alias of its physical wall. */
function openingRooms(scene: Scene, o: Opening): string[] {
  if (o.room_ids?.length) return o.room_ids;
  const owner = scene.walls.find(w => w.id === o.wall_id)!;
  return [...new Set(scene.walls.filter(w => physical(w) === physical(owner)).map(w => w.room_id))];
}
function openingsOn(scene: Scene, wall: Wall): Opening[] {
  return scene.openings.filter(o => {
    const owner = scene.walls.find(w => w.id === o.wall_id);
    return owner && physical(owner) === physical(wall);
  });
}
/** Inner face of the wall as seen from its room (centre line moved thickness/2 inward). */
function innerFace(scene: Scene, wall: Wall): [Vec2, Vec2] {
  const h = wall.open ? 0 : (wall.thickness ?? 0) / 2, [ox, oy] = wallOutward(scene, wall);
  return [[wall.a[0] - ox * h, wall.a[1] - oy * h], [wall.b[0] - ox * h, wall.b[1] - oy * h]];
}
export function footprint(item: Pick<Item, 'pos' | 'rot' | 'size'>): Vec2[] {
  const a = item.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Vec2[]).map(([x, y]) => [
    item.pos[0] + x * item.size[0] / 2 * c - y * item.size[1] / 2 * s,
    item.pos[1] + x * item.size[0] / 2 * s + y * item.size[1] / 2 * c,
  ]);
}
function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t);
}
function faceWord(rot: number): string {
  const r = norm360(rot);
  const words: Record<number, string> = { 0: 'faces -y (down)', 90: 'faces +x (right)', 180: 'faces +y (up)', 270: 'faces -x (left)' };
  if (words[r]) return words[r]!;
  const a = r * Math.PI / 180;
  return `faces (${f(Math.sin(a))}, ${f(-Math.cos(a))})`;
}

// ---------- helpers ----------
/** Rotation (deg CCW) that makes an item at pos face target. rot 0 faces -y. */
export function facing(pos: Vec2, target: Vec2): number {
  return norm360(Math.atan2(target[0] - pos[0], -(target[1] - pos[1])) * 180 / Math.PI);
}
/** Area centroid of a room polygon. */
export function centerOf(scene: Scene, roomId: string): Vec2 {
  const poly = room(scene, roomId).polygon;
  let a = 0, cx = 0, cy = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]!, k = p[0] * q[1] - q[0] * p[1]; a += k; cx += (p[0] + q[0]) * k; cy += (p[1] + q[1]) * k; });
  return [Math.round(cx / (3 * a) * 1000) / 1000, Math.round(cy / (3 * a) * 1000) / 1000];
}
/** The room's alias of wallId (any alias of the physical wall is accepted). */
export function roomWall(scene: Scene, roomId: string, wallId: string): Wall {
  room(scene, roomId);
  const wall = scene.walls.find(w => w.id === wallId);
  if (!wall) throw new Error(`Unknown wall ${wallId}`);
  if (wall.room_id === roomId) return wall;
  const alias = scene.walls.find(w => w.room_id === roomId && physical(w) === physical(wall));
  if (!alias) throw new Error(`Wall ${wallId} does not bound ${roomId}`);
  return alias;
}
function flush(scene: Scene, roomId: string, wallId: string, size: [number, number, number] | [number, number], along: number | undefined, gap: number): { pos: Vec2; rot: number; wall: Wall } {
  const wall = roomWall(scene, roomId, wallId);
  const [fa, fb] = innerFace(scene, wall), l = len(wall), [ox, oy] = wallOutward(scene, wall);
  const corner = Math.max(0, ...scene.walls.map(w => (w.thickness ?? 0) / 2)) + 0.01;
  const lo = size[0] / 2 + corner, hi = l - size[0] / 2 - corner;
  const t = lo > hi ? l / 2 : Math.min(hi, Math.max(lo, along ?? l / 2));
  const back = size[1] / 2 + gap;
  const pos: Vec2 = [fa[0] + (fb[0] - fa[0]) * t / l - ox * back, fa[1] + (fb[1] - fa[1]) * t / l - oy * back];
  return { pos: [Math.round(pos[0] * 1000) / 1000, Math.round(pos[1] * 1000) / 1000], rot: norm360(Math.atan2(-ox, oy) * 180 / Math.PI), wall };
}
/** Back of the item flush (1 cm gap) to the room-side face of wallId, front facing into the room.
 * along = metres from the wall's `a` end to the item centre (default: middle); clamped so the item
 * clears the corner walls. wallId may be any alias of the physical wall. */
export function againstWall(scene: Scene, roomId: string, wallId: string, size: [number, number, number] | [number, number], along?: number): { pos: Vec2; rot: number } {
  const { pos, rot } = flush(scene, roomId, wallId, size, along, 0.01);
  return { pos, rot };
}
/** Default centre height of wall art: the editor's base max(0.9, 1.5 - h/2) plus h/2. */
export const defaultArtHeight = (h: number) => Math.round((Math.max(0.9, 1.5 - h / 2) + h / 2) * 1000) / 1000;
/** A wall-hung item (art, mirror, clock, wall shelf) flat on the room-side face of wallId, facing into the room.
 * along as in againstWall (from the room alias's `a` end); height = centre height above the floor (default ~1.5).
 * Returns every placement field the draft item needs: {pos, rot, wall_id, height_m}. */
export function onWall(scene: Scene, roomId: string, wallId: string, size: [number, number, number], along?: number, height?: number): { pos: Vec2; rot: number; wall_id: string; height_m: number } {
  const { pos, rot, wall } = flush(scene, roomId, wallId, size, along, 0);
  return { pos, rot, wall_id: wall.id, height_m: height ?? defaultArtHeight(size[2]) };
}
/** Where a wall-hung item sits on its wall: centre metres along the room alias from `a`, distance of pos from the
 * wall's room-side face, wall length, and bottom/top heights. undefined if the wall is unknown. */
export function wallSpot(scene: Scene, item: DraftItem): { wall: Wall; along: number; offFace: number; length: number; bottom: number; top: number; wallHeight: number } | undefined {
  let wall: Wall;
  try { wall = roomWall(scene, item.room_id, item.wall_id!); } catch { return undefined; }
  const [fa, fb] = innerFace(scene, wall), l = len(wall), ux = (fb[0] - fa[0]) / l, uy = (fb[1] - fa[1]) / l, [ox, oy] = wallOutward(scene, wall);
  const dx = item.pos[0] - fa[0], dy = item.pos[1] - fa[1];
  const h = item.height_m ?? defaultArtHeight(item.size[2]);
  return { wall, along: dx * ux + dy * uy, offFace: -(dx * ox + dy * oy), length: l, bottom: h - item.size[2] / 2, top: h + item.size[2] / 2, wallHeight: wall.height ?? roomHeight(scene, item.room_id) };
}
/** Openings on a wall as [from, to] metres along the given room alias (robust to reversed aliases). */
export function openingSpans(scene: Scene, wall: Wall): { opening: Opening; from: number; to: number }[] {
  const l = len(wall), ux = (wall.b[0] - wall.a[0]) / l, uy = (wall.b[1] - wall.a[1]) / l;
  return openingsOn(scene, wall).map(o => {
    const c = openingCentre(scene, o), t = (c[0] - wall.a[0]) * ux + (c[1] - wall.a[1]) * uy;
    return { opening: o, from: t - o.width / 2, to: t + o.width / 2 };
  });
}

// ---------- free zones ----------
const CELL = 0.1;
/** Largest empty axis-aligned rectangles (>= 0.8 m each side) after items and door clear zones. */
function freeZones(scene: Scene, roomId: string, items: DraftItem[], max = 2): string[] {
  const r = room(scene, roomId), b = bbox(r.polygon), inset = 0.08;
  const nx = Math.round((b.x1 - b.x0) / CELL), ny = Math.round((b.y1 - b.y0) / CELL);
  const blocked: Vec2[][] = items.filter(i => i.room_id === roomId && onFloor(i)).map(footprint);
  for (const o of scene.openings) {
    if (o.kind === 'window' || !openingRooms(scene, o).includes(roomId)) continue;
    const owner = scene.walls.find(w => w.id === o.wall_id)!;
    const wall = scene.walls.find(w => w.room_id === roomId && physical(w) === physical(owner)) ?? owner;
    const c = openingCentre(scene, o), [ox, oy] = wallOutward(scene, wall), d = Math.min(1, o.width);
    blocked.push(footprint({ pos: [c[0] - ox * d / 2, c[1] - oy * d / 2], rot: norm360(Math.atan2(-ox, oy) * 180 / Math.PI), size: [o.width, d, 1] }));
  }
  const grid: boolean[][] = [];
  for (let j = 0; j < ny; j++) {
    grid.push([]);
    for (let i = 0; i < nx; i++) {
      const p: Vec2 = [b.x0 + (i + 0.5) * CELL, b.y0 + (j + 0.5) * CELL];
      const edge = p[0] < b.x0 + inset || p[0] > b.x1 - inset || p[1] < b.y0 + inset || p[1] > b.y1 - inset;
      grid[j]!.push(!edge && inPoly(p, r.polygon) && !blocked.some(poly => inPoly(p, poly)));
    }
  }
  const out: string[] = [];
  for (let k = 0; k < max; k++) {
    let best = { a: 0, i0: 0, i1: 0, j0: 0, j1: 0 };
    const h = new Array(nx).fill(0);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) h[i] = grid[j]![i] ? h[i] + 1 : 0;
      for (let i = 0; i < nx; i++) {
        let mh = Infinity;
        for (let e = i; e < nx && h[e] > 0; e++) {
          mh = Math.min(mh, h[e]); const a = mh * (e - i + 1);
          if (a > best.a && mh * CELL >= 0.8 && (e - i + 1) * CELL >= 0.8) best = { a, i0: i, i1: e, j0: j - mh + 1, j1: j };
        }
      }
    }
    if (!best.a) break;
    for (let j = best.j0; j <= best.j1; j++) for (let i = best.i0; i <= best.i1; i++) grid[j]![i] = false;
    const x0 = b.x0 + best.i0 * CELL, x1 = b.x0 + (best.i1 + 1) * CELL, y0 = b.y0 + best.j0 * CELL, y1 = b.y0 + (best.j1 + 1) * CELL;
    out.push(`x ${f(x0)}..${f(x1)}, y ${f(y0)}..${f(y1)} (${f(x1 - x0)} x ${f(y1 - y0)} m)`);
  }
  return out;
}

// ---------- brief ----------
function touching(scene: Scene, item: Item): string[] {
  const corners = footprint(item), hits: string[] = [];
  for (const w of scene.walls.filter(w => w.room_id === item.room_id)) {
    const [a, b] = innerFace(scene, w);
    if (corners.filter(c => segDist(c, a, b) < 0.03).length >= 1) hits.push(`${wallName(scene, w).split(' (')[0]} [${w.id}]`);
  }
  return hits;
}

/** Compact plain-language brief a designer model can reason from. */
export function describe(scene: Scene, draft?: Draft): string {
  const items = [...(scene.items ?? []), ...(draft?.items ?? [])];
  const thick = [...new Set(scene.walls.map(w => w.thickness ?? 0))];
  const L: string[] = [
    'AXES: metres, x right, y up (plan view). rot = degrees CCW. Item front is local -y: rot 0 faces -y (down), 90 faces +x, 180 faces +y, 270 faces -x.',
    'Wall ids containing north/south/east/west are legacy labels and do NOT match the y direction; trust the coordinates and the left/right/top/bottom names here.',
    `Wall lines are centre lines, thickness ${thick.map(f).join('/')} m: usable floor starts ${f(Math.max(...thick) / 2)} m inside each line. Use againstWall() for flush placement, onWall() for art/mirrors (wall_id + height_m), "on" for decor resting on an item. Door "clear" = keep that floor free.`,
  ];
  for (const r of scene.rooms) {
    const b = bbox(r.polygon), rect = r.polygon.length === 4;
    L.push('', `${r.name ?? r.id} [${r.id}]: ${f(b.x1 - b.x0)} x ${f(b.y1 - b.y0)} m, x ${f(b.x0)}..${f(b.x1)}, y ${f(b.y0)}..${f(b.y1)}, ${area(r.polygon).toFixed(1)} m2${rect ? '' : `, polygon ${r.polygon.map(pt).join(' ')}`}; centre ${pt(centerOf(scene, r.id))}`);
    for (const w of scene.walls.filter(w => w.room_id === r.id)) {
      const ops = openingsOn(scene, w).map(o => {
        const to = openingRooms(scene, o).filter(id => id !== r.id);
        const dest = o.kind === 'window' ? `sill ${f(o.sill)} h ${f(o.height)}` : `to ${to.length ? to.join('+') : 'outside'}, clear ${f(Math.min(1, o.width))} m${o.swing && o.swing !== 'none' ? `, swing ${o.swing}` : ''}`;
        return `${o.kind} ${o.id} ${f(o.width)} m wide at ${pt(openingCentre(scene, o))} ${dest}`;
      });
      L.push(`  ${wallName(scene, w)} [${w.id}]${ops.length ? ': ' + ops.join('; ') : ''}`);
    }
    for (const x of scene.fixed.filter(x => x.room_id === r.id)) L.push(`  fixed ${x.kind} ${x.id} at ${pt(x.pos)} size ${x.size.map(f).join('x')}`);
    const zones = freeZones(scene, r.id, items);
    L.push(`  free floor: ${zones.length ? zones.join('; ') : 'none >= 0.8 m'}`);
  }
  const added = draft?.items ?? [];
  L.push('', `DRAFT ITEMS (${added.length})${added.length ? ':' : ': none yet'}`);
  for (const it of added) {
    const walls = onFloor(it) ? touching(scene, it) : [], spot = it.wall_id !== undefined ? wallSpot(scene, it) : undefined;
    const where = it.wall_id !== undefined ? `, hung on ${spot ? wallName(scene, spot.wall).split(' (')[0] : 'unknown wall'} [${it.wall_id}] ${spot ? `${f(spot.along)} m along, ` : ''}centre ${f(it.height_m ?? defaultArtHeight(it.size[2]))} m high`
      : it.on !== undefined ? `, resting on ${it.on}` : walls.length ? `, against ${walls.join(', ')}` : '';
    L.push(`  ${it.id} ${it.kind} "${it.name}" [${it.room_id}] at ${pt(it.pos)} rot ${norm360(it.rot)} ${faceWord(it.rot)}, size ${it.size.map(f).join('x')}${where}${it.sku ? `, sku ${it.sku}` : ''}${it.price !== undefined ? ` ${it.price} AMD` : ''}`);
  }
  const surfaces = draft ? describeSurfaces(scene, draft) : [];
  L.push('', `FINISHES & LIGHTING (${surfaces.length})${surfaces.length ? ':' : ': none yet (editor defaults: warm white walls, pale plank floor, no designed lights)'}`, ...surfaces);
  return L.join('\n');
}
