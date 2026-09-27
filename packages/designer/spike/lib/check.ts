/** Hard-physics check of a draft: wraps checkLayout from src/layout.ts with one add op per item.
 * Async because src is imported at runtime from designerSrc() (works from a copied workspace). */
import { footprint, importSrc, isCurtain, loadBrief, openingSpans, roomSubtotals, wallSpot, type Draft, type DraftItem, type Scene, type Vec2 } from './scene.ts';
import { checkRestyle, checkSurfaces, describeRestylable, onFloor, plainItem, surfaceQuantities } from './finishes.ts';
import { designRelations, functionRules, kneeSpaceSofas, tuckedPair, tuckedTargets } from './relations.ts';
import { stylingLines } from './styling.ts';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { centerOf } from './scene.ts';
import { loadRequirements, requirementProblems, type Requirements } from './requirements.ts';
import type { CatalogAsset } from '../../../../apps/editor/src/contracts.js';
import { wallDecoration, wallShelf } from '../../../../apps/editor/src/core/decoration-placement.js';
import { canRestOnFurniture } from '../../../../apps/editor/src/core/furniture-support.js';

/** One live lookup per process: are mattress products searchable yet? A failed search counts as no. */
let mattressLookup: Promise<boolean> | undefined;
function mattressesAvailable(): Promise<boolean> {
  mattressLookup ??= import('./catalog.ts').then(c => c.search({ kind: 'mattress', limit: 1 })).then(r => r.length > 0, () => false);
  return mattressLookup;
}

const NO_PATH = /^door:(\S+) to (\S+): no accessible path/;
/** Doors the EMPTY flat cannot walk from (reconstructed shells sometimes put a door's approach outside every room):
 * the door shared by every door-to-door failure of the empty flat, and doors from which a small probe at a room's
 * centre is unreachable. A draft cannot fix these, so paths from or to them are noted, not failed. Cached per scene. */
async function unusableDoors(scene: Scene): Promise<string[]> {
  const key = createHash('sha1').update(JSON.stringify({ v: 2, rooms: scene.rooms, walls: scene.walls, openings: scene.openings, fixed: scene.fixed })).digest('hex').slice(0, 16);
  const cache = join(tmpdir(), `varpet-spike-doors-${key}.json`);
  if (existsSync(cache)) try { return JSON.parse(readFileSync(cache, 'utf8')); } catch { /* recompute */ }
  const { checkLayout } = await importSrc<typeof import('../../src/layout.ts')>('layout.ts');
  const out = new Set<string>();
  const pairs = checkLayout(scene, []).errors.flatMap(e => { const m = e.severity === 'hard' ? NO_PATH.exec(e.message) : null; return m ? [[m[1]!, m[2]!.replace(/^door:/, '')]] : []; });
  if (pairs.length) for (const door of pairs[0]!) if (pairs.every(pair => pair.includes(door))) out.add(door);
  for (const room of scene.rooms) {
    const probe = { id: '__probe', room_id: room.id, kind: 'chair', name: 'probe', pos: centerOf(scene, room.id), rot: 0, size: [0.3, 0.3, 0.4] as [number, number, number], keep: false, price: 0 };
    const errors = checkLayout(scene, [{ type: 'add', item: probe }]).errors.filter(e => e.severity === 'hard');
    if (errors.some(e => e.check !== 'walkway')) continue; // probe landed on a fixture; no evidence
    for (const e of errors) { const m = NO_PATH.exec(e.message); if (m && m[2] === 'item:__probe') out.add(m[1]!); }
  }
  const doors = [...out].sort();
  try { writeFileSync(cache, JSON.stringify(doors)); } catch { /* read-only tmp */ }
  return doors;
}

export interface CheckResult { ok: boolean; problems: string[]; summary: string; cost_dram: number | null; advice: string[] }

const m = (n: number | undefined) => (n === undefined ? '' : ` (${n.toFixed(2)} m)`);

/** Zod errors arrive as a JSON issue list; keep them to one line each. */
function condense(message: string): string[] {
  try {
    const issues = JSON.parse(message) as { path: (string | number)[]; message: string; keys?: string[] }[];
    if (Array.isArray(issues)) return issues.map(i => `operations: items[${i.path[0]}]${i.path.slice(2).map(k => '.' + k).join('')}: ${i.message}`);
  } catch { /* plain message */ }
  return [`operations: ${message}`];
}

const addOp = (item: DraftItem) => ({ type: 'add' as const, item: { ...plainItem(item), keep: item.keep ?? false } });

/** Separating-axis overlap depth of two convex polygons (0 if apart). */
function overlapDepth(a: Vec2[], b: Vec2[]): number {
  let depth = Infinity;
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!, l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n: Vec2 = [(p[1] - q[1]) / l, (q[0] - p[0]) / l];
    const proj = (poly: Vec2[]) => poly.map(v => v[0] * n[0] + v[1] * n[1]);
    const pa = proj(a), pb = proj(b), d = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (d <= 0) return 0;
    depth = Math.min(depth, d);
  }
  return depth;
}
const WALL_KINDS = new Set(['wall_art', 'mirror', 'curtain', 'blind']);

/** The item as the editor's placement rules see it (kind by the bridge's mapping, name, size as w, h, d). */
function editorAsset(item: DraftItem, kindOf: (kind: string) => string): CatalogAsset {
  const [w, d, h] = item.size;
  return { id: item.sku ?? item.id, name: item.name, category: item.kind, kind: kindOf(item.kind) as CatalogAsset['kind'], dimensions: [w, h, d], color: '#888888', price: 0, source: { type: 'procedural' } };
}

/** Wall-hung and resting items: the designer checker only knows floor footprints, so these are checked here, with the
 * editor's own rules for what may hang (wallDecoration) and what may rest on furniture (canRestOnFurniture).
 * kindOf maps a designer kind to the editor's (editor-bridge editorKindOf); identity by default. */
export function checkDecor(scene: Scene, draft: Draft, kindOf: (kind: string) => string = kind => kind): string[] {
  const out: string[] = [], draftItems = draft.items ?? [], all: DraftItem[] = [...scene.items, ...draftItems];
  const byId = new Map(all.map(item => [item.id, item]));
  const floor = [...all.filter(onFloor), ...(scene.fixed ?? [])];
  const hung: { item: DraftItem; spot: NonNullable<ReturnType<typeof wallSpot>> }[] = [];
  for (const item of draftItems) {
    if (item.wall_id !== undefined && item.on !== undefined) { out.push(`decor: ${item.id} has both wall_id and on; pick one`); continue; }
    if (item.height_m !== undefined && item.wall_id === undefined) out.push(`decor: ${item.id} has height_m but no wall_id`);
    if (item.wall_id === undefined && item.on === undefined && WALL_KINDS.has(item.kind) && !(item.kind === 'mirror' && item.size[2] > 1.4))
      out.push(isCurtain(item) ? `decor: ${item.id} ${item.kind} must hang over a window: set wall_id and pos with atWindow(scene, room, window, size)`
        : `decor: ${item.id} ${item.kind} must hang on a wall: set wall_id and height_m (use onWall())`);
    if (item.wall_id !== undefined && !wallDecoration(editorAsset(item, kindOf))) {
      out.push(`decor: ${item.id} ${item.kind} cannot hang on a wall: the editor hangs only wall art, mirrors, curtains and clocks; drop wall_id and height_m and stand it on the floor (or pick a hanging kind)`);
      continue;
    }
    if (item.wall_id !== undefined) {
      const spot = wallSpot(scene, item);
      if (!spot) { out.push(`decor: ${item.id} wall ${item.wall_id} does not bound ${item.room_id}`); continue; }
      const [w, d] = item.size;
      if (Math.abs(spot.offFace - d / 2) > 0.05) out.push(`decor: ${item.id} is ${(spot.offFace - d / 2).toFixed(2)} m off the face of ${item.wall_id}; pos must be flush (use onWall())`);
      if (isCurtain(item)) {
        // The editor centres a curtain on the window whose span (grown by half the curtain) holds its centre, rod under the ceiling.
        const windows = openingSpans(scene, spot.wall).filter(o => o.opening.kind === 'window');
        const over = windows.find(o => spot.along >= o.from - w / 2 && spot.along <= o.to + w / 2);
        if (!over) out.push(`decor: ${item.id} ${item.kind} on ${item.wall_id} is not at a window${windows.length ? ` (windows there: ${windows.map(o => `${o.opening.id} ${((o.from + o.to) / 2).toFixed(2)} m along`).join(', ')}); centre it on one with atWindow()` : '; hang it on a wall with a window (atWindow())'}`);
        else if (w < over.opening.width - 0.05) out.push(`decor: ${item.id} (${w.toFixed(2)} m) is narrower than window ${over.opening.id} (${over.opening.width.toFixed(2)} m); pick one at least as wide`);
        if (w > spot.length) out.push(`decor: ${item.id} (${w.toFixed(2)} m) is wider than ${item.wall_id} (${spot.length.toFixed(2)} m); the editor cannot hang it there`);
        hung.push({ item, spot });
        continue;
      }
      const margin = Math.max(0, ...scene.walls.map(x => (x.thickness ?? 0) / 2));
      if (spot.along - w / 2 < margin - 0.01 || spot.along + w / 2 > spot.length - margin + 0.01)
        out.push(`decor: ${item.id} runs past the end of ${item.wall_id} (spans ${(spot.along - w / 2).toFixed(2)}..${(spot.along + w / 2).toFixed(2)} m of ${spot.length.toFixed(2)} m)`);
      // The editor clamps a requested height to a bottom >= 0.3 m and a top <= ceiling - 0.1 m: say so instead of moving it silently.
      if (item.height_m !== undefined && !(item.kind === 'mirror' && item.size[2] > 1.4)) {
        const asked = item.height_m - item.size[2] / 2;
        if (Math.abs(asked - spot.bottom) > 0.01) out.push(`decor: ${item.id} height_m ${item.height_m.toFixed(2)} puts it ${asked < spot.bottom ? 'below 0.3 m off the floor' : 'within 0.1 m of the ceiling'}; the editor would hang it at centre ${((spot.bottom + spot.top) / 2).toFixed(2)} m: set height_m ${((spot.bottom + spot.top) / 2).toFixed(2)}`);
      }
      if (spot.top > spot.wallHeight + 0.001) out.push(`decor: ${item.id} top ${spot.top.toFixed(2)} m is above the ${spot.wallHeight.toFixed(2)} m wall`);
      for (const o of openingSpans(scene, spot.wall)) {
        const across = Math.min(spot.along + w / 2, o.to) - Math.max(spot.along - w / 2, o.from);
        const up = Math.min(spot.top, o.opening.sill + o.opening.height) - Math.max(spot.bottom, o.opening.sill);
        if (across > 0.01 && up > 0.01) out.push(`decor: ${item.id} covers ${o.opening.kind} ${o.opening.id} on ${item.wall_id} (${across.toFixed(2)} m); move it along the wall clear of it (the editor refuses it there)`);
      }
      // Tall floor pieces in front of the art hide it (art above a sofa or sideboard is fine).
      const strip = footprint({ pos: item.pos, rot: item.rot, size: [w, d + 0.3, 1] });
      for (const other of floor) {
        if (other.room_id !== item.room_id || other.kind === 'rug' || other.size[2] <= spot.bottom + 0.05) continue;
        if (overlapDepth(strip, footprint(other)) > 0.01) out.push(`decor: ${item.id} (bottom ${spot.bottom.toFixed(2)} m) is behind ${other.id} (${other.size[2].toFixed(2)} m tall); set height_m >= ${(other.size[2] + 0.15 + item.size[2] / 2).toFixed(2)} or move it along the wall`);
      }
      hung.push({ item, spot });
    }
    if (item.on !== undefined) {
      const support = byId.get(item.on);
      if (!support) { out.push(`decor: ${item.id} rests on missing item ${item.on}`); continue; }
      if (support.wall_id !== undefined && !wallShelf(editorAsset(support, kindOf))) { out.push(`decor: ${item.id} cannot rest on wall-hung ${support.id}; only wall shelves and picture ledges hold objects`); continue; }
      if (!canRestOnFurniture(editorAsset(item, kindOf))) { out.push(`decor: ${item.id} ${item.kind} (${item.size.map(v => v.toFixed(2)).join('x')} m) cannot rest on ${support.id}: the editor stacks only decor, plants, lamps, TVs up to 2 m wide and small electronics; drop \`on\` and stand it on the floor`); continue; }
      if (kindOf(support.kind) === 'rug') { out.push(`decor: ${item.id} cannot rest on rug ${support.id}; the editor puts it on the floor, so drop \`on\``); continue; }
      const seen = new Set([item.id]);
      let cur: DraftItem | undefined = support;
      while (cur?.on !== undefined && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.on); }
      if (cur && seen.has(cur.id) && cur.on !== undefined) { out.push(`decor: ${item.id} support chain loops`); continue; }
      const area = footprint(support), mine = footprint(item);
      const inside = (p: Vec2) => { const a = -support.rot * Math.PI / 180, dx = p[0] - support.pos[0], dy = p[1] - support.pos[1];
        return Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) <= support.size[0] / 2 + 0.02 && Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) <= support.size[1] / 2 + 0.02; };
      if (!mine.every(inside)) out.push(`decor: ${item.id} (${item.size[0].toFixed(2)}x${item.size[1].toFixed(2)} m) does not fit on ${support.id}${overlapDepth(area, mine) ? '' : ' (not above it at all)'}`);
    }
  }
  for (let i = 0; i < hung.length; i++) for (let j = i + 1; j < hung.length; j++) {
    const a = hung[i]!, b = hung[j]!;
    if (a.item.room_id !== b.item.room_id || (a.spot.wall.source_id ?? a.spot.wall.id) !== (b.spot.wall.source_id ?? b.spot.wall.id)) continue;
    const across = Math.min(a.spot.along + a.item.size[0] / 2, b.spot.along + b.item.size[0] / 2) - Math.max(a.spot.along - a.item.size[0] / 2, b.spot.along - b.item.size[0] / 2);
    const up = Math.min(a.spot.top, b.spot.top) - Math.max(a.spot.bottom, b.spot.bottom);
    if (across > 0.01 && up > 0.01) out.push(`decor: ${a.item.id} overlaps ${b.item.id} on the wall (${across.toFixed(2)} m)`);
  }
  const resting = draftItems.filter(item => item.on !== undefined);
  for (let i = 0; i < resting.length; i++) for (let j = i + 1; j < resting.length; j++) {
    const a = resting[i]!, b = resting[j]!, d = a.on === b.on ? overlapDepth(footprint(a), footprint(b)) : 0;
    if (d > 0.01) out.push(`decor: ${a.id} overlaps ${b.id} on ${a.on} (${d.toFixed(2)} m)`);
  }
  return out;
}

/** budget: furniture budget in AMD (workspace budget.json); going over it is a hard problem. */
/** brief: the customer request (default: the workspace AGENTS.md in cwd); it decides whether curtains are required. */
/** requirements: the brief's counts per room (default: requirements.json in cwd; lib/requirements.ts). */
/** styling: 'hard' (the lead's final check: pass it, or set VARPET_STYLING=hard) makes each missing styling layer a
 * problem; the default 'advice' lists them without failing (room designers mid-work). Scores print either way. */
export async function check(scene: Scene, draft: Draft, options: { budget?: number; brief?: string; requirements?: Requirements; styling?: 'hard' | 'advice' } = {}): Promise<CheckResult> {
  const { checkLayout, layoutPrice } = await importSrc<typeof import('../../src/layout.ts')>('layout.ts');
  const { opsSchema } = await importSrc<typeof import('../../src/adapter.ts')>('adapter.ts');
  const items = draft.items ?? [];
  // Only floor items go to the designer checker; wall-hung and resting items get the same schema check and checkDecor.
  const ops = items.filter(onFloor).map(addOp), decorOps = items.filter(item => !onFloor(item)).map(addOp);
  const result = checkLayout(scene, ops);
  const tucked = (e: (typeof result.errors)[number]) => tuckedPair((e as { item_ids?: string[] }).item_ids, items, e.overlap_depth_m ?? e.deficit_m);
  const broken = new Set(await unusableDoors(scene)), flatNotes = new Set<string>();
  const unusable = (e: (typeof result.errors)[number]) => {
    const m = e.check === 'walkway' ? /^(\S+) to (\S+): no accessible path/.exec(e.message) : null;
    const hit = m ? [m[1]!, m[2]!].map(id => id.replace(/^door:/, '')).find(id => broken.has(id)) : undefined;
    if (hit) flatNotes.add(hit);
    return hit !== undefined;
  };
  const hard = result.errors.filter(e => e.severity === 'hard' && !tucked(e) && !unusable(e));
  const soft = result.errors.filter(e => e.severity === 'soft');
  const problems: string[] = [], blocked = new Map<string, { from: Set<string>; to: Set<string> }>();
  for (const e of hard) {
    const path = e.check === 'walkway' && /^(\S+) to (\S+): (no accessible path.*)$/.exec(e.message);
    if (path) {
      // One line per reason instead of doors x items.
      const g = blocked.get(path[3]!) ?? { from: new Set(), to: new Set() };
      g.from.add(path[1]!.replace(/^\w+:/, '')); g.to.add(path[2]!.replace(/^\w+:/, '')); blocked.set(path[3]!, g);
    } else problems.push(...(e.check === 'operations' ? condense(e.message) : [`${e.check}: ${e.message}${m(e.overlap_depth_m ?? e.deficit_m)}`]));
  }
  // A tucked chair is reached from behind and its table through the chairs; the front-access rule does not apply.
  const tuckedIds = new Set(tuckedTargets(items));
  for (const g of blocked.values()) for (const id of [...g.to]) if (tuckedIds.has(id)) g.to.delete(id);
  for (const [reason, g] of [...blocked].filter(([, g]) => g.to.size)) problems.push(`walkway: ${reason} to ${[...g.to].join(', ')} from ${[...g.from].join(', ')}`);
  if (decorOps.length) {
    const parsed = opsSchema.safeParse(decorOps);
    if (!parsed.success) problems.push(...parsed.error.issues.map(i => `operations: ${decorOps[i.path[0] as number]?.item.id ?? i.path[0]}${i.path.slice(2).map(k => '.' + k).join('')}: ${i.message}`));
  }
  const { editorKindOf } = await importSrc<typeof import('../../src/editor-bridge.ts')>('editor-bridge.ts');
  problems.push(...checkDecor(scene, draft, kind => editorKindOf[kind] ?? kind));
  const relations = designRelations(draft), bare = relations.filter(p => /bare bed frame/.test(p));
  // Mattress models ship with a catalog deploy; while the live catalog has none, a frame cannot be dressed.
  const noMattresses = bare.length > 0 && !(await mattressesAvailable());
  problems.push(...(noMattresses ? relations.filter(p => !bare.includes(p)) : relations));
  const requirements = options.requirements ?? loadRequirements();
  const rules = functionRules(scene, draft, options.brief ?? loadBrief(), requirements);
  // A rule about kept flat furniture alone (a kept id and no draft id in the line) cannot be fixed by the draft: advice.
  const draftIds = new Set(items.map(item => item.id)), keptIds = new Set(scene.items.map(item => item.id));
  const fixable = (line: string) => { const words = line.split(/[\s,:;()"+]+/); return words.some(w => draftIds.has(w)) || !words.some(w => keptIds.has(w)); };
  problems.push(...rules.hard.filter(fixable));
  const advice = [...rules.hard.filter(line => !fixable(line)), ...rules.soft];
  const style = stylingLines(scene, draft, requirements), styleHard = (options.styling ?? (process.env.VARPET_STYLING === 'hard' ? 'hard' : 'advice')) === 'hard';
  (styleHard ? problems : advice).push(...style.problems);
  problems.push(...requirementProblems(scene, draft, requirements));
  // The knee space between a sofa and its coffee table (0.35-0.5 m, the living rule) is how people reach the sofa, not a
  // walkway: a path of at least 0.3 m to such a sofa passes. A sofa shut in on every side still fails (no path).
  const knee = kneeSpaceSofas(items);
  for (let i = problems.length - 1; i >= 0; i--) {
    const w = /^walkway: \S+ to item:(\S+): ([\d.]+) m path/.exec(problems[i]!);
    if (w && knee.has(w[1]!) && Number(w[2]) >= 0.3 - 1e-6) problems.splice(i, 1);
  }
  problems.push(...checkSurfaces(scene, draft).map(p => `surfaces: ${p}`));
  problems.push(...checkRestyle(scene, draft));
  const restyled = new Set((draft.restyle ?? []).map(entry => entry.id));
  const fitted = describeRestylable(scene, draft).filter(line => restyled.has(line.split(' ')[0]!));
  // Editor finish presets and fixtures carry no supplier price: list the work, never add it to the total.
  const work = surfaceQuantities(scene, draft);
  const bySoft = new Map<string, number>();
  for (const e of soft) bySoft.set(e.check, (bySoft.get(e.check) ?? 0) + 1);
  const cost = decorOps.length ? layoutPrice([...ops, ...decorOps]).cost_dram : result.price.cost_dram;
  const subtotals = roomSubtotals(draft), total = cost ?? subtotals.reduce((sum, [, v]) => sum + v, 0);
  if (options.budget !== undefined && total > options.budget) problems.push(`budget: furniture total ${total} AMD is ${total - options.budget} AMD over the ${options.budget} AMD budget`);
  const notes = (flatNotes.size ? `\nflat (not your draft, ignored): no walkable path through door ${[...flatNotes].join(', ')} even in the empty flat` : '')
    + (noMattresses ? `\ncatalog (not blocking): ${bare.length} bed frame(s) without a mattress; the live catalog has no mattresses yet` : '');
  const rooms = subtotals.length > 1 ? `\nby room: ${subtotals.map(([r, v]) => `${r} ${v}`).join(', ')}` : '';
  const budgetLine = options.budget !== undefined ? `\nbudget: ${total} of ${options.budget} AMD` : '';
  const adviceText = advice.length ? `\nadvice (soft, not blocking; fix what you agree with):\n${advice.map(line => `~ ${line}`).join('\n')}` : '';
  const summary = `${items.length} items, ${problems.length} hard, ${soft.length} soft warnings${soft.length ? ` (${[...bySoft].map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}${cost !== null ? `, furniture total ${cost} AMD` : ''}${work.length ? `\nunquoted finish and lighting work (price on request): ${work.join('; ')}` : ''}${fitted.length ? `\nrestyled made-to-measure: ${fitted.join('; ')}` : ''}${notes}${rooms}${budgetLine}${style.scores.length ? `\nstyling score: ${style.scores.join(', ')}` : ''}${adviceText}`;
  // Every hard error is either listed in problems or deliberately exempted (tucked chairs), so problems decide.
  return { ok: problems.length === 0, problems, summary, cost_dram: cost, advice };
}

/** Soft guidance lines (function clearance, walkway width), for when the model asks. */
export async function warnings(scene: Scene, draft: Draft): Promise<string[]> {
  const { checkLayout } = await importSrc<typeof import('../../src/layout.ts')>('layout.ts');
  const ops = (draft.items ?? []).filter(onFloor).map(addOp);
  return checkLayout(scene, ops).errors.filter(e => e.severity === 'soft').map(e => `${e.check}: ${e.message}`);
}
