/** Checked placement for the designer: `./varpet place` (one piece by relations) and `./varpet place-group`
 * (standard groups built around an anchor), on top of the relation solver in ../src/place.ts and the spike check.
 * Every candidate comes back with the check lines that name its pieces, so the model picks a pose that passes
 * instead of editing coordinates until the check stops failing. */
import type { Scene } from '../../src/scene.js';
import type { PlaceRequest, PlacementRelation } from '../../src/place.js';
import { check } from './check.ts';
import { onFloor, plainItem, type Draft, type DraftItem, type FixtureLight } from './finishes.ts';
import { emptyRects, footprint, importSrc, innerFace, wallOutward, type Vec2 } from './scene.ts';

export interface Product { sku: string; kind: string; name: string; size: [number, number, number]; price: number; vendor: string }
export interface PlaceSpec {
  wall?: string; window?: string; corner?: boolean; beside?: string; side?: 'left' | 'right' | 'front' | 'back';
  facing?: string; centeredOn?: string; gap?: number; at?: Vec2; rot?: number; center?: boolean; notWall?: string[];
}
export interface Candidate { items: DraftItem[]; lighting: FixtureLight[]; problems: string[]; clearances?: Record<string, number | null> }
export interface CheckOptions { budget?: number; brief?: string; requirements?: unknown }

const RAD = Math.PI / 180;
const fwd = (rot: number): Vec2 => [Math.sin(rot * RAD), -Math.cos(rot * RAD)];
const rgt = (rot: number): Vec2 => [Math.cos(rot * RAD), Math.sin(rot * RAD)];
const at = (p: Vec2, ...moves: [Vec2, number][]): Vec2 => moves.reduce<Vec2>((q, [d, n]) => [q[0] + d[0] * n, q[1] + d[1] * n], [p[0], p[1]]);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const norm = (a: number) => ((a % 360) + 360) % 360;

export function uniqueId(draft: Draft, scene: Scene, base: string): string {
  const taken = new Set([...draft.items.map(i => i.id), ...scene.items.map(i => i.id), ...scene.fixed.map(i => i.id)]);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function makeItem(product: Product, id: string, roomId: string, pos: Vec2, rot: number): DraftItem {
  return { id, room_id: roomId, kind: product.kind, name: product.name, pos: [r3(pos[0]), r3(pos[1])], rot: r3(norm(rot)),
    size: product.size, keep: false, sku: product.sku, price: product.price, vendor: product.vendor };
}

/** The flat plus the draft's floor pieces, as the solver sees it. */
function solverScene(scene: Scene, draft: Draft): Scene {
  return { ...scene, items: [...scene.items, ...draft.items.filter(onFloor).map(plainItem)] } as Scene;
}

function relations(spec: PlaceSpec): PlacementRelation[] {
  const out: PlacementRelation[] = [];
  if (spec.wall) out.push({ type: 'against_wall', wall_id: spec.wall });
  if (spec.corner) out.push({ type: 'in_corner' });
  if (spec.beside) out.push({ type: 'beside', anchor_id: spec.beside, side: spec.side ?? 'right', ...(spec.gap !== undefined ? { gap_m: spec.gap } : {}) });
  if (spec.facing) out.push({ type: 'facing', anchor_id: spec.facing });
  if (spec.window) out.push({ type: 'near_window', window_id: spec.window, max_distance_m: 1.2 });
  if (spec.center) out.push({ type: 'centered' });
  return out;
}

/** Up to 3 solver poses for a new piece (or the explicit/centred-on pose). */
export async function poses(scene: Scene, draft: Draft, roomId: string, product: Product, id: string, spec: PlaceSpec):
  Promise<{ poses: { pos: Vec2; rot: number; clearances?: Record<string, number | null> }[]; reason?: string }> {
  if (spec.at) return { poses: [{ pos: spec.at, rot: spec.rot ?? 0 }] };
  if (spec.centeredOn) {
    const anchor = [...draft.items, ...scene.items].find(i => i.id === spec.centeredOn);
    if (!anchor) throw new Error(`no item ${spec.centeredOn}`);
    return { poses: [{ pos: anchor.pos, rot: spec.rot ?? anchor.rot }] };
  }
  const rel = relations(spec);
  if (!rel.length) throw new Error('say where: --wall <wall id>, --window <id>, --corner, --beside <id> [--side], --facing <id>, --centered-on <id>, --center or --at x,y [--rot r]');
  const { place } = await importSrc<typeof import('../../src/place.ts')>('place.ts');
  const request: PlaceRequest = { room_id: roomId, item: { id, kind: product.kind, name: product.name, size: product.size, sku: product.sku, price: product.price, vendor: product.vendor },
    relations: rel, ...(spec.notWall?.length ? { exclusions: { wall_ids: spec.notWall } } : {}) };
  const result = place(solverScene(scene, draft), request);
  return { poses: result.candidates.map(c => ({ pos: c.item.pos as Vec2, rot: c.item.rot, clearances: c.clearances as unknown as Record<string, number | null> })), reason: result.reason };
}

/** The spike check on draft + candidate; the lines that name one of the candidate's ids (or its room's requirements). */
const baselines = new WeakMap<Draft, Promise<Set<string>>>();
/** The check lines the candidate adds to the draft's own (it may break a walkway to a piece already there). */
export async function judge(scene: Scene, draft: Draft, cand: Omit<Candidate, 'problems'>, options: CheckOptions): Promise<string[]> {
  if (!baselines.has(draft)) baselines.set(draft, check(scene, draft, options as never).then(r => new Set(r.problems)));
  const before = await baselines.get(draft)!;
  const trial: Draft = { ...draft, items: [...draft.items, ...cand.items], lighting: [...(draft.lighting ?? []), ...cand.lighting] };
  const result = await check(scene, trial, options as never);
  return result.problems.filter(line => !before.has(line) && !/^(budget|requirements):/.test(line));
}

export async function placeOne(scene: Scene, draft: Draft, roomId: string, product: Product, id: string, spec: PlaceSpec, options: CheckOptions) {
  const found = await poses(scene, draft, roomId, product, id, spec);
  const out: Candidate[] = [];
  for (const p of found.poses) {
    const item = makeItem(product, id, roomId, p.pos, p.rot);
    out.push({ items: [item], lighting: [], clearances: p.clearances, problems: await judge(scene, draft, { items: [item], lighting: [] }, options) });
  }
  return { candidates: out.sort((a, b) => a.problems.length - b.problems.length), reason: found.reason };
}

/** The wall straight ahead of a piece: distance to it along the piece's front, or undefined. */
function wallAhead(scene: Scene, roomId: string, pos: Vec2, rot: number): number | undefined {
  const f = fwd(rot);
  let best: number | undefined;
  for (const wall of scene.walls.filter(w => w.room_id === roomId)) {
    const [a, b] = [wall.a as Vec2, wall.b as Vec2], e: Vec2 = [b[0] - a[0], b[1] - a[1]];
    const den = f[0] * -e[1] + f[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const w: Vec2 = [a[0] - pos[0], a[1] - pos[1]];
    const t = (w[0] * -e[1] + w[1] * e[0]) / den, s = (w[0] * f[1] - w[1] * f[0]) / -den;
    if (t > 0.2 && s >= -1e-6 && s <= 1 + 1e-6) best = best === undefined ? t - (wall.thickness ?? 0) / 2 : Math.min(best, t - (wall.thickness ?? 0) / 2);
  }
  return best;
}

export type GroupKind = 'lounge' | 'dining' | 'bed' | 'desk';
export interface GroupProducts {
  anchor: Product; table?: Product; rug?: Product; side?: Product; lamp?: Product; tv?: Product; media?: Product;
  chair?: Product; chairs?: number; nightstand?: Product; monitor?: Product; monitors?: number; pendant?: boolean;
}

/** One group laid out around an anchor pose. */
interface Variant { gap: number; shift: number; lampGap?: number; tv?: number }
function buildGroup(scene: Scene, draft: Draft, roomId: string, kind: GroupKind, p: GroupProducts, anchorPose: { pos: Vec2; rot: number },
  v: Variant = { gap: 0.42, shift: 0 }): Omit<Candidate, 'problems'> {
  const items: DraftItem[] = [], lighting: FixtureLight[] = [], work: Draft = { ...draft, items: [...draft.items] };
  const add = (product: Product, role: string, pos: Vec2, rot: number, extra: Partial<DraftItem> = {}) => {
    const item = { ...makeItem(product, uniqueId(work, scene, `${roomId}-${role}`), roomId, pos, rot), ...extra };
    items.push(item); work.items.push(item); return item;
  };
  let media: DraftItem | undefined;
  if (kind === 'lounge' && p.media) {
    // The pose is the media unit's, against its wall; the sofa faces it from about 2.8 m (screen to seat).
    const m = p.media, fm = fwd(anchorPose.rot), ahead = wallAhead(scene, roomId, anchorPose.pos, anchorPose.rot) ?? 9;
    const dist = Math.max(1.6, Math.min(v.tv ?? 2.8, ahead - m.size[1] / 2 - p.anchor.size[1] - 0.05));
    media = add(m, 'media', anchorPose.pos, anchorPose.rot);
    anchorPose = { pos: at(anchorPose.pos, [fm, m.size[1] / 2 + dist + p.anchor.size[1] / 2]), rot: anchorPose.rot + 180 };
  }
  const a = p.anchor, rot = anchorPose.rot, f = fwd(rot), r = rgt(rot), back: Vec2 = [-f[0], -f[1]];
  const anchor = add(a, kind === 'lounge' ? 'sofa' : kind === 'dining' ? 'table' : kind, anchorPose.pos, rot);
  const P = anchor.pos as Vec2, [W, D] = a.size;
  if (kind === 'lounge') {
    if (p.table) add(p.table, 'coffee-table', at(P, [f, D / 2 + v.gap + p.table.size[1] / 2], [r, v.shift * Math.max(0, (W - p.table.size[0]) / 2)]), rot);
    if (p.rug) add(p.rug, 'rug', at(P, [f, D / 2 - 0.3 + p.rug.size[1] / 2]), rot);
    let side: DraftItem | undefined;
    if (p.side) side = add(p.side, 'side-table', at(P, [r, -(W / 2 + 0.05 + p.side.size[0] / 2)], [back, -(D / 2 - p.side.size[1] / 2)]), rot);
    if (p.lamp) {
      if (p.lamp.size[2] < 1 && side) add(p.lamp, 'lamp', side.pos as Vec2, rot, { on: side.id });
      else add(p.lamp, 'lamp', at(P, [r, W / 2 + (v.lampGap ?? 0.08) + p.lamp.size[0] / 2], [back, -(D / 2 - p.lamp.size[1] / 2)]), rot);
    }
    if (media && p.tv) add(p.tv, 'tv', media.pos as Vec2, media.rot, { on: media.id });
  } else if (kind === 'dining') {
    const chair = p.chair, n = p.chairs ?? 0;
    if (chair && n) {
      const perSide = Math.max(1, Math.floor(W / 0.6)), long = Math.min(n, perSide * 2), ends = Math.min(2, n - long);
      const sides = [Math.ceil(long / 2), Math.floor(long / 2)];
      sides.forEach((count, s) => {
        const dir: Vec2 = s === 0 ? f : back;
        for (let k = 0; k < count; k++) {
          const along = (k - (count - 1) / 2) * (W / count);
          add(chair, 'chair', at(P, [r, along], [dir, D / 2 + chair.size[1] / 2 - 0.08]), s === 0 ? rot + 180 : rot);
        }
      });
      for (let e = 0; e < ends; e++) add(chair, 'chair', at(P, [r, (e === 0 ? 1 : -1) * (W / 2 + chair.size[1] / 2 - 0.08)]), rot + (e === 0 ? 270 : 90));
    }
    if (p.pendant) lighting.push({ room_id: roomId, type: 'fixture', id: uniqueId(work, scene, `${roomId}-pendant`), name: 'Pendant over the table', mount: 'pendant', pos: [r3(P[0]), r3(P[1])], brightness: 800, temperature_k: 2700 } as FixtureLight);
  } else if (kind === 'bed') {
    for (const s of [-1, 1]) {
      if (!p.nightstand) break;
      const ns = add(p.nightstand, 'nightstand', at(P, [r, s * (W / 2 + 0.05 + p.nightstand.size[0] / 2)], [back, D / 2 - p.nightstand.size[1] / 2]), rot);
      if (p.lamp) add(p.lamp, 'lamp', ns.pos as Vec2, rot, { on: ns.id });
    }
    if (p.rug) add(p.rug, 'rug', at(P, [f, 0.35]), rot);
  } else if (kind === 'desk') {
    if (p.chair) add(p.chair, 'desk-chair', at(P, [f, D / 2 + p.chair.size[1] / 2 - 0.12]), rot + 180);
    // Lamp at the right end; monitors share what is left, centred on it.
    const lampW = p.lamp ? p.lamp.size[0] : 0, lo = -W / 2 + 0.02, hi = W / 2 - (p.lamp ? lampW + 0.06 : 0.02);
    const monitors = p.monitor ? Math.max(1, p.monitors ?? 1) : 0, step = monitors ? Math.min(p.monitor!.size[0] + 0.04, (hi - lo) / monitors) : 0;
    for (let k = 0; k < monitors; k++) add(p.monitor!, 'monitor', at(P, [r, (lo + hi) / 2 + (k - (monitors - 1) / 2) * step], [back, D / 2 - p.monitor!.size[1] / 2 - 0.08]), rot, { on: anchor.id });
    if (p.lamp) add(p.lamp, 'lamp', at(P, [r, W / 2 - lampW / 2 - 0.02], [back, D / 2 - p.lamp.size[1] / 2 - 0.02]), rot, { on: anchor.id });
  }
  return { items, lighting };
}

/** Poses flush against each wall of the room, front into the room: the wall's middle and quarter points
 * (fast; the check judges them). */
function wallPoses(scene: Scene, roomId: string, product: Product, only?: string): { pos: Vec2; rot: number }[] {
  const out: { pos: Vec2; rot: number }[] = [], [w, d] = product.size;
  for (const wall of scene.walls.filter(x => x.room_id === roomId && !x.open && (!only || x.id === only))) {
    const [a, b] = innerFace(scene, wall), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < w + 0.1) continue;
    const u: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], o = wallOutward(scene, wall), inward: Vec2 = [-o[0], -o[1]];
    const rot = norm(Math.atan2(inward[0], -inward[1]) / RAD);
    const spots = [len / 2, ...(len > 2 * w ? [len / 4 + w / 4, len * 3 / 4 - w / 4] : [])];
    for (const t of spots) out.push({ pos: at(a, [u, Math.min(Math.max(t, w / 2 + 0.05), len - w / 2 - 0.05)], [inward, d / 2 + 0.01]), rot });
  }
  return out;
}

/** Default anchor poses when the caller gives no relation: per kind, what a designer would try first. */
async function anchorPoses(scene: Scene, draft: Draft, roomId: string, kind: GroupKind, p: GroupProducts, id: string, spec: PlaceSpec) {
  const given = spec.wall || spec.window || spec.corner || spec.beside || spec.facing || spec.centeredOn || spec.at || spec.center;
  const anchorProduct = kind === 'lounge' && p.media ? p.media : p.anchor;
  if (spec.wall && !spec.window && !spec.beside && !spec.corner) return wallPoses(scene, roomId, anchorProduct, spec.wall);
  if (given) return (await poses(scene, draft, roomId, anchorProduct, id, spec)).poses;
  const walls = scene.walls.filter(w => w.room_id === roomId && !w.open).map(w => w.id);
  const perWall = async () => wallPoses(scene, roomId, p.anchor);
  if (kind === 'lounge' && p.media) {
    // The media unit against a wall with 3-5 m of floor ahead (the sofa goes there).
    const all = wallPoses(scene, roomId, p.media);
    const score = (q: { pos: Vec2; rot: number }) => { const d = wallAhead(scene, roomId, q.pos, q.rot) ?? 0; return d < 3 ? 9 - d : Math.abs(d - 4.2); };
    return all.sort((a, b) => score(a) - score(b)).slice(0, 6);
  }
  if (kind === 'lounge') {
    // A sofa against a wall, facing open floor, the wall ahead 2-4 m away (TV distance).
    const all = await perWall();
    const score = (q: { pos: Vec2; rot: number }) => { const d = wallAhead(scene, roomId, q.pos, q.rot) ?? 9; return Math.abs(d - 3.2); };
    return all.sort((a, b) => score(a) - score(b)).slice(0, 4);
  }
  if (kind === 'dining') {
    // Grid search for the most open spot for table + chairs + 0.45 m behind each chair (the check has the last word).
    const [W, D] = p.anchor.size, around = p.chair ? p.chair.size[1] - 0.08 + 0.65 : 0.6; // 0.6 m walkway behind each chair
    const ends = !!p.chair && (p.chairs ?? 0) > 2 * Math.max(1, Math.floor(W / 0.6));
    const room = scene.rooms.find(r => r.id === roomId)!, xs = room.polygon.map(q => q[0]), ys = room.polygon.map(q => q[1]);
    const boxes = [...draft.items, ...scene.items, ...scene.fixed].filter(i => i.room_id === roomId && onFloor(i as DraftItem) && i.kind !== 'rug')
      .map(i => { const c = footprint(i); return [Math.min(...c.map(q => q[0])), Math.max(...c.map(q => q[0])), Math.min(...c.map(q => q[1])), Math.max(...c.map(q => q[1]))]; });
    for (const o of scene.openings.filter(o => o.kind !== 'window')) {
      const wall = scene.walls.find(w => w.id === o.wall_id);
      if (!wall || wall.room_id !== roomId && !scene.walls.some(w => w.room_id === roomId && (w.source_id ?? w.id) === (wall.source_id ?? wall.id))) continue;
      const [a, b] = [wall.a, wall.b], len = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const c = [a[0] + u[0] * (o.offset + o.width / 2), a[1] + u[1] * (o.offset + o.width / 2)], r = o.width / 2 + 0.35;
      boxes.push([c[0] - r, c[0] + r, c[1] - r, c[1] + r]);
    }
    const found: { pos: Vec2; rot: number; score: number }[] = [];
    for (const rot of [0, 90]) {
      const hx = (rot === 0 ? W / 2 + (ends ? around : 0.3) : D / 2 + around), hy = (rot === 0 ? D / 2 + around : W / 2 + (ends ? around : 0.3));
      for (let x = Math.min(...xs) + hx + 0.2; x <= Math.max(...xs) - hx - 0.2; x += 0.1)
        for (let y = Math.min(...ys) + hy + 0.2; y <= Math.max(...ys) - hy - 0.2; y += 0.1) {
          const gaps = boxes.map(([x0, x1, y0, y1]) => Math.max(x0 - (x + hx), (x - hx) - x1, y0 - (y + hy), (y - hy) - y1));
          const walls = [x - hx - Math.min(...xs), Math.max(...xs) - x - hx, y - hy - Math.min(...ys), Math.max(...ys) - y - hy];
          const score = Math.min(9, ...gaps, ...walls.map(g => g + 0.1));
          if (score > 0) found.push({ pos: [r3(x), r3(y)], rot, score });
        }
    }
    const picked: { pos: Vec2; rot: number }[] = [];
    for (const c of found.sort((a, b) => b.score - a.score))
      if (picked.every(q => Math.hypot(q.pos[0] - c.pos[0], q.pos[1] - c.pos[1]) > 0.6 || q.rot !== c.rot) && picked.length < 4) picked.push({ pos: c.pos, rot: c.rot });
    return picked;
  }
  if (kind === 'desk') {
    // Beside a window, not facing it (no glare): walls other than the window's, nearest the window first.
    const windows = scene.openings.filter(o => o.kind === 'window' && walls.includes(o.wall_id)).map(o => {
      const wall = scene.walls.find(w => w.id === o.wall_id)!, len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
      const t = (o.offset + o.width / 2) / len;
      return { wall: o.wall_id, c: [wall.a[0] + (wall.b[0] - wall.a[0]) * t, wall.a[1] + (wall.b[1] - wall.a[1]) * t] as Vec2 };
    });
    const dist = (q: { pos: Vec2 }) => Math.min(9, ...windows.map(w => Math.hypot(q.pos[0] - w.c[0], q.pos[1] - w.c[1])));
    const all = wallPoses(scene, roomId, p.anchor).filter(q => !windows.some(w => wallPoses(scene, roomId, p.anchor, w.wall).some(x => x.pos === q.pos)));
    const side = scene.walls.filter(w => w.room_id === roomId && !w.open && !windows.some(x => x.wall === w.id)).flatMap(w => wallPoses(scene, roomId, p.anchor, w.id));
    void all;
    return side.sort((x, y) => dist(x) - dist(y)).slice(0, 4);
  }
  return (await perWall()).slice(0, 4);
}

/** Standard groups: anchor poses (the caller's relations, or per-kind defaults), the rest laid out around it and
 * a few variants tried (coffee table gap and shift); every candidate checked, best first. */
export async function placeGroup(scene: Scene, draft: Draft, roomId: string, kind: GroupKind, products: GroupProducts, spec: PlaceSpec, options: CheckOptions) {
  const anchorId = uniqueId(draft, scene, `${roomId}-${kind}`);
  const anchors = await anchorPoses(scene, draft, roomId, kind, products, anchorId, spec);
  const variants: Variant[] = kind === 'lounge'
    ? [{ gap: 0.45, shift: 0 }, { gap: 0.45, shift: 0, lampGap: 0.25 }, { gap: 0.45, shift: 0, lampGap: 0.25, tv: 2.4 }, { gap: 0.45, shift: 0.6, lampGap: 0.25, tv: 3.2 }]
    : [{ gap: 0.42, shift: 0 }];
  const out: Candidate[] = [];
  for (const pose of anchors) {
    for (const v of variants) {
      const cand = buildGroup(scene, draft, roomId, kind, products, pose, v);
      const problems = await judge(scene, draft, cand, options);
      out.push({ ...cand, problems });
      if (!problems.length) break;
    }
    if (out.filter(c => !c.problems.length).length >= 2) break;
  }
  const seen = new Set<string>();
  const best = out.sort((a, b) => a.problems.length - b.problems.length).filter(c => {
    const key = c.items.map(i => `${i.pos}|${i.rot}`).join(';'); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
  return { candidates: best, reason: anchors.length ? undefined : 'no anchor pose: give --wall, --window, --at x,y or free some floor' };
}

export function describeCandidate(c: Candidate, label: string): string {
  const pieces = c.items.map(i => `${i.id} ${i.kind} (${i.pos.map(n => n.toFixed(2)).join(', ')}) rot ${i.rot}${i.on ? ` on ${i.on}` : ''}`);
  const clear = c.clearances ? ` | clear: front ${c.clearances.front_m ?? '?'} m, sides ${c.clearances.left_m ?? '?'}/${c.clearances.right_m ?? '?'} m` : '';
  return `${label}: ${c.problems.length ? `${c.problems.length} problem(s)` : 'passes'}${clear}\n  ${pieces.join('\n  ')}${c.lighting.length ? `\n  ${c.lighting.map(l => `${l.id} pendant`).join(', ')}` : ''}`
    + (c.problems.length ? `\n  ${c.problems.map(p => `- ${p}`).join('\n  ')}` : '');
}

export { footprint };
