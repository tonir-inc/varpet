/** varpet designer CLI. Run from a workspace holding scene.json and draft.json:
 *   npx tsx cli.ts describe | check [--warnings] [--final] | render-plan [out.png] [--room id]
 *     | render-view [out.png] [--room id] [--camera overview|eye|eye2|top] [--time day|evening] [--width 768] [--height 512]   (no --room: whole flat, overview/top)
 *     | requirements [--room id] (the brief's counts per room, requirements.json) | review --part <room> (independent critic) | at-window <room> <window> <w> <d> <h> (curtain/blind placement JSON) | materials | swatches [out.png] | search --kind k [--text t] [--max-w n --max-d n --max-h n --max-price n --limit n]
 *     | sheet sku1 sku2 ... [out.png] | merge
 * Optional --scene path / --draft path override the cwd files. `--part <room>` works on one room's file rooms/<room>.json
 * (seeded from that room's part of draft.json when missing; --room defaults to it; check keeps only that room's lines);
 * `merge` folds rooms/*.json into draft.json (then removes them) and checks the whole flat. Every command appends start/end lines to .varpet-log.jsonl beside scene.json
 * (the service reads it for progress, including sub-agents' work). budget.json ({budget_dram}), brief.txt (the customer's words,
 * for brief-driven check rules) and source.json (the flat's
 * editor document, for 3D renders) are read from the scene file's directory when present.
 * The designer's src (checkLayout, zod) is loaded at runtime from $VARPET_DESIGNER_SRC, else ../src next to
 * this file when run in-repo, else /Users/snek/dev/varpet-designer-spike/packages/designer/src.
 * In a copied workspace run tsx from the repo (e.g. /Users/snek/dev/varpet-designer-spike/node_modules/.bin/tsx)
 * or set NODE_PATH so the lib modules can resolve their own dependencies. */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { loadBudget, loadDraft, loadScene, loadSource, describe } from './lib/scene.ts';

const KINDS = 'sofa chair table bed cabinet lamp rug shelf plant decor wall_art mirror tv desk dresser wardrobe nightstand stool ottoman bench '
  + 'vase candle books cushion throw_blanket basket tray bowl lantern picture_frame planter clock wall_hanging monitor computer speaker '
  + 'coat_rack shoe_rack curtain blind crib changing_table pet_bed mattress kitchen_cabinet fridge washing_machine sink toilet bathtub shower towel_rack '
  + '(dining table: table --text dining; sideboard/tv stand: cabinet --text)';
const argv = process.argv.slice(2);
const cmd = argv.shift();
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1]; argv.splice(i, 2); return v;
}
function bool(name: string): boolean {
  const i = argv.indexOf(`--${name}`); if (i < 0) return false; argv.splice(i, 1); return true;
}
const num = (name: string) => { const v = flag(name); return v === undefined ? undefined : Number(v); };
async function lib(file: string): Promise<any> {
  try { return await import(new URL(`./lib/${file}`, import.meta.url).href); }
  catch (error) { throw new Error(`module lib/${file} not available: ${error instanceof Error ? error.message.split('\n')[0] : error}`); }
}

const scenePath = flag('scene') ?? 'scene.json', part = flag('part');
const explicitDraft = flag('draft');
const draftPath = explicitDraft ?? (part ? join(dirname(scenePath), 'rooms', `${part}.json`) : 'draft.json');
if (part && !argv.includes('--room') && cmd !== 'at-window') argv.push('--room', part);
const logPath = join(dirname(scenePath), '.varpet-log.jsonl'), started = Date.now();
function log(entry: Record<string, unknown>): void {
  try { appendFileSync(logPath, JSON.stringify({ t: Date.now() / 1000, cmd, ...(part ? { part } : {}), ...entry }) + '\n'); } catch { /* logging never fails a command */ }
}
let printed = '';
const say = (line: string) => { printed += line + '\n'; console.log(line); };

/** Lines about one room: they name the room or one of its item ids. */
function about(line: string, roomId: string, ids: Set<string>): boolean {
  return line.split(/[\s,:;()"'+=]+/).some(word => word === roomId || ids.has(word));
}

/** rooms/*.json into draft.json: each file holds only its own room's items, finishes and lights; ids unique. */
function merge(): string[] {
  const dir = join(dirname(scenePath), 'rooms');
  const files = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.json')).sort() : [];
  if (!files.length) throw new Error('merge: no rooms/<room>.json files');
  const errors: string[] = [], parts = files.map(name => ({ room: basename(name, '.json'), draft: loadDraft(join(dir, name)) }));
  const rooms = new Set(parts.map(p => p.room)), known = new Set(scene.rooms.map(r => r.id));
  const base = loadDraft('draft.json'), keep = <T extends { room_id?: string }>(list: T[] | undefined) => (list ?? []).filter(e => !rooms.has(e.room_id ?? ''));
  const out = { items: keep(base.items), finishes: keep(base.finishes), lighting: keep(base.lighting) };
  const seen = new Map(out.items.map(item => [item.id, 'draft.json']));
  for (const { room, draft } of parts) {
    if (!known.has(room)) errors.push(`rooms/${room}.json: no room ${room} in the flat`);
    for (const [key, list] of [['items', draft.items], ['finishes', draft.finishes ?? []], ['lighting', draft.lighting ?? []]] as const)
      for (const entry of list as { room_id?: string; id?: string }[]) {
        if (entry.room_id !== room) errors.push(`rooms/${room}.json: ${key} entry ${entry.id ?? ''} has room_id ${entry.room_id}; it belongs in rooms/${entry.room_id}.json`);
        if (entry.id !== undefined && key !== 'finishes') {
          if (seen.has(entry.id)) errors.push(`id ${entry.id} is in both ${seen.get(entry.id)} and rooms/${room}.json; ids must be unique`);
          seen.set(entry.id, `rooms/${room}.json`);
        }
      }
    out.items.push(...draft.items); out.finishes.push(...(draft.finishes ?? [])); out.lighting.push(...(draft.lighting ?? []));
  }
  if (errors.length) throw new Error('merge refused:\n' + errors.join('\n'));
  writeFileSync('draft.json', JSON.stringify(out, null, 1) + '\n');
  // draft.json is the design again; a later --part starts from it, so no stale room file can overwrite newer edits.
  for (const name of files) unlinkSync(join(dir, name));
  return [...rooms];
}

type Product = { sku: string; kind: string; name: string; size: [number, number, number]; price: number; vendor: string; image?: string };
const productLine = (p: Product) => `${p.sku} | ${p.name} | ${p.size.map(n => n.toFixed(2)).join('x')} m | ${p.price} AMD | ${p.vendor}`;
const cacheDir = join(dirname(scenePath), 'catalog', 'cache');
/** Same query, same answer, for every designer in this workspace (one file per query, written atomically). */
async function searchCached(q: Record<string, unknown>): Promise<Product[]> {
  const key = createHash('sha1').update(JSON.stringify(Object.entries(q).filter(([, v]) => v !== undefined).sort())).digest('hex').slice(0, 16);
  const path = join(cacheDir, `${key}.json`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')).rows as Product[];
  const { search } = await lib('catalog.ts');
  const rows = await search(q) as Product[];
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(`${path}.${process.pid}`, JSON.stringify({ q, rows }));
  renameSync(`${path}.${process.pid}`, path);
  return rows;
}
/** A product seen by any search in this workspace (sku exact), else one search by the sku text. */
async function productBySku(sku: string): Promise<Product> {
  if (existsSync(cacheDir)) for (const name of readdirSync(cacheDir).filter(n => n.endsWith('.json'))) {
    try { const hit = (JSON.parse(readFileSync(join(cacheDir, name), 'utf8')).rows as Product[]).find(p => p.sku === sku); if (hit) return hit; } catch { /* partial file */ }
  }
  const used = draft.items.find(i => i.sku === sku);
  if (used?.price !== undefined) return { sku, kind: used.kind, name: used.name, size: used.size, price: used.price, vendor: used.vendor ?? 'unknown' };
  const { catalogItems } = await import('../src/catalog.ts');
  const r = (await catalogItems([sku]))[0] as Record<string, unknown> | undefined;
  const size = r?.size_m as [number, number, number] | undefined;
  if (!r || !Array.isArray(size) || typeof r.price !== 'number') throw new Error(`sku ${sku} not found in the catalog`);
  return { sku, kind: String(r.kind), name: String(r.name).slice(0, 70), size, price: Math.round(r.price), vendor: String(r.brand ?? r.source ?? 'unknown') };
}

const scene = loadScene(scenePath), budget = loadBudget(scenePath);
if (part && !explicitDraft && !existsSync(draftPath)) {
  // A room file starts as that room's part of draft.json (empty on a first design).
  const whole = loadDraft('draft.json'), mine = <T extends { room_id?: string }>(list?: T[]) => (list ?? []).filter(e => e.room_id === part);
  mkdirSync(dirname(draftPath), { recursive: true });
  writeFileSync(draftPath, JSON.stringify({ items: mine(whole.items), finishes: mine(whole.finishes), lighting: mine(whole.lighting) }, null, 1) + '\n');
}
let draft = loadDraft(draftPath);

async function main(): Promise<number> {
  switch (cmd) {
    case 'describe': console.log(describe(scene, draft, budget)); return 0;
    case 'merge':
    case 'check': {
      if (cmd === 'merge') { say(`merged ${merge().join(', ')} into draft.json`); draft = loadDraft('draft.json'); }
      // --final (and merge): the finished design must be styled, so missing styling layers are hard; else advice.
      const verbose = bool('warnings'), final = bool('final') || cmd === 'merge', roomId = part ? flag('room') : undefined;
      const { check, warnings } = await import('./lib/check.ts');
      // brief.txt beside scene.json (the request plus any answers) decides brief-driven rules; else check reads AGENTS.md.
      const briefPath = join(dirname(scenePath), 'brief.txt');
      const { loadRequirements } = await import('./lib/requirements.ts');
      const r = await check(scene, draft, { budget, brief: existsSync(briefPath) ? readFileSync(briefPath, 'utf8') : undefined,
        requirements: loadRequirements(scenePath), ...(final ? { styling: 'hard' as const } : {}) });
      const ids = new Set(draft.items.map(item => item.id));
      const problems = roomId ? r.problems.filter(line => about(line, roomId, ids)) : r.problems;
      say(!problems.length ? 'OK' : `FAIL (${problems.length} hard)`);
      for (const p of problems) say(`- ${p}`);
      say(roomId ? `${draft.items.length} items in ${roomId} (rooms/${roomId}.json); whole-flat rules and the budget are checked after merge` : r.summary);
      const { requirementAdvice } = await import('./lib/requirements.ts');
      for (const line of requirementAdvice(draft)) if (!roomId || about(line, roomId, ids)) say(`~ ${line}`);
      if (verbose) for (const w of await warnings(scene, draft)) if (!roomId || about(w, roomId, ids)) say(`~ ${w}`);
      return problems.length ? 1 : 0;
    }
    case 'render-plan': {
      const roomId = flag('room'), out = argv[0] ?? `plan${roomId ? '-' + roomId : ''}.png`;
      const { renderPlan } = await lib('render-plan.ts');
      say(await renderPlan(scene, draft, out, { roomId })); return 0;
    }
    case 'render-view': {
      const roomId = flag('room');
      // 768x512 by default: the model sees as much at a third of the pixels, and the render returns sooner.
      const width = num('width') ?? 768, height = num('height') ?? Math.round(width * 2 / 3);
      const camera = flag('camera') ?? 'overview', time = flag('time') ?? 'day';
      const out = argv[0] ?? `view-${roomId ?? 'flat'}.png`;
      if (!['overview', 'eye', 'eye2', 'top'].includes(camera)) throw new Error('--camera is overview, eye, eye2 or top');
      if (!roomId && (camera === 'eye' || camera === 'eye2')) throw new Error('eye cameras need --room <id>');
      if (!['day', 'evening'].includes(time)) throw new Error('--time is day or evening');
      const { renderView } = await lib('render-view.ts');
      say(await renderView(scene, draft, out, { roomId, camera, time, width, height, source: loadSource(scenePath) })); return 0;
    }
    case 'requirements': {
      const { describeNeeds, loadRequirements, roomCounts } = await import('./lib/requirements.ts');
      const req = loadRequirements(scenePath), roomId = flag('room');
      if (!req) { say('no requirements.json yet'); return 0; }
      for (const id of roomId ? [roomId] : Object.keys(req.rooms)) {
        say(describeNeeds(req, id));
        const items = draft.items.filter(item => item.room_id === id);
        if (items.length) say(`  now: ${Object.entries(roomCounts(items)).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      }
      return 0;
    }
    case 'review': {
      // An independent reviewer (run/critic.py Reviewer, outside the sandbox) renders rooms/<room>.json and answers here.
      if (!part) throw new Error('review needs --part <room id>');
      const dir = join(dirname(scenePath), 'reviews'), answer = join(dir, `${part}.json`);
      if (!existsSync(join(dir, '.on'))) { say('no reviewer in this session; rely on your own render review'); return 0; }
      const again = existsSync(answer);
      const deadline = Date.now() + 300_000;
      while (!existsSync(answer) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1000));
      if (!existsSync(answer)) { say('the reviewer did not answer in time; rely on your own render review'); return 0; }
      const { issues = [], error } = JSON.parse(readFileSync(answer, 'utf8')) as { issues?: { severity: string; issue: string; evidence: string; fix: string }[]; error?: string };
      if (again) say('(each room is reviewed once; this is its review again)');
      if (error) say(`reviewer failed: ${error}; rely on your own render review`);
      const serious = issues.filter(i => i.severity === 'blocker' || i.severity === 'major');
      say(serious.length ? `${serious.length} to fix (fix each, or say in your answer why it is right; then check --part again):` : 'no blocker or major issues');
      for (const i of issues) say(`- [${i.severity}] ${i.issue} (seen: ${i.evidence}) fix: ${i.fix}`);
      return 0;
    }
    case 'at-window': {
      const [roomId, windowId, ...dims] = argv;
      const size = dims.map(Number);
      if (!roomId || !windowId || size.length !== 3 || size.some(n => !Number.isFinite(n))) throw new Error('at-window <room> <window> <w> <d> <h>');
      const { atWindow } = await import('./lib/scene.ts');
      console.log(JSON.stringify(atWindow(scene, roomId, windowId, size as [number, number, number]))); return 0;
    }
    case 'materials': {
      const { MATERIALS } = await lib('finishes.ts');
      for (const m of MATERIALS) console.log(`${m.id} | ${m.category} | ${m.family} | ${m.color} | ${m.look}`);
      console.log('Any #RRGGBB colour is also allowed (walls, ceiling, or to tint a material).');
      return 0;
    }
    case 'swatches': {
      const { swatchSheet } = await lib('swatches.ts');
      console.log(await swatchSheet(argv[0] ?? 'swatches.png')); return 0;
    }
    case 'search': {
      const kind = flag('kind');
      if (!kind) throw new Error('search needs --kind <kind>');
      const q = { kind, text: flag('text'), maxW: num('max-w'), maxD: num('max-d'), maxH: num('max-h'), maxPrice: num('max-price'), limit: num('limit') ?? 6 };
      const rows = await searchCached(q);
      if (!rows.length) console.log(`no results for kind ${kind}; kinds: ${KINDS}`);
      for (const p of rows) console.log(productLine(p));
      return 0;
    }
    case 'prefetch': {
      // The lead's one round of searches for every room: catalog/wishlist.json [{room, kind, text?, max_w?, max_d?,
      // max_h?, max_price?, limit?}] -> catalog/<room>.md, read by each room designer instead of searching again.
      const list = JSON.parse(readFileSync(argv[0] ?? join(dirname(scenePath), 'catalog', 'wishlist.json'), 'utf8')) as Record<string, string | number | undefined>[];
      const rooms = new Map<string, string[]>();
      let next = 0;
      const worker = async () => {
        while (next < list.length) {
          const w = list[next++]!, q = { kind: String(w.kind), text: w.text as string | undefined, maxW: w.max_w as number | undefined,
            maxD: w.max_d as number | undefined, maxH: w.max_h as number | undefined, maxPrice: w.max_price as number | undefined, limit: (w.limit as number | undefined) ?? 6 };
          let rows: Product[] = [];
          try { rows = await searchCached(q); } catch (error) { rows = []; }
          const head = `## ${q.kind}${q.text ? ` "${q.text}"` : ''}${q.maxW ? ` max-w ${q.maxW}` : ''}${q.maxD ? ` max-d ${q.maxD}` : ''}${q.maxPrice ? ` max-price ${q.maxPrice}` : ''}`;
          const lines = rooms.get(String(w.room)) ?? []; rooms.set(String(w.room), lines);
          lines.push(head, ...(rows.length ? rows.map(productLine) : ['(no results)']), '');
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      mkdirSync(join(dirname(scenePath), 'catalog'), { recursive: true });
      for (const [room, lines] of rooms) writeFileSync(join(dirname(scenePath), 'catalog', `${room}.md`), `# Catalog picks for ${room} (sku | name | w x d x h | price | vendor)\n\n${lines.join('\n')}`);
      say(`prefetched ${list.length} searches into ${[...rooms.keys()].map(r => `catalog/${r}.md`).join(', ')}`);
      return 0;
    }
    case 'place':
    case 'place-group': {
      const roomId = flag('room');
      if (!roomId) throw new Error(`${cmd} needs --part <room id> (or --room)`);
      const P = await import('./lib/place.ts'), { loadRequirements } = await import('./lib/requirements.ts');
      const briefPath = join(dirname(scenePath), 'brief.txt');
      const options = { budget: undefined, brief: existsSync(briefPath) ? readFileSync(briefPath, 'utf8') : undefined, requirements: loadRequirements(scenePath) };
      const atXY = flag('at'), side = flag('side');
      const spec = { wall: flag('wall'), window: flag('window'), corner: bool('corner'), beside: flag('beside'), side: side as 'left' | 'right' | 'front' | 'back' | undefined,
        facing: flag('facing'), centeredOn: flag('centered-on'), gap: num('gap'), rot: num('rot'), center: bool('center'),
        at: atXY ? atXY.split(',').map(Number) as [number, number] : undefined, notWall: flag('not-wall')?.split(',') };
      const add = bool('add'); // --force adds A even with problems
      let result: { candidates: import('./lib/place.ts').Candidate[]; reason?: string };
      if (cmd === 'place') {
        const sku = flag('sku');
        if (!sku) throw new Error('place needs --sku <sku>');
        const product = await productBySku(sku);
        const id = flag('id') ?? P.uniqueId(draft, scene, `${roomId}-${product.kind}`);
        result = await P.placeOne(scene, draft, roomId, product, id, spec, options);
      } else {
        const kind = argv[0] as import('./lib/place.ts').GroupKind;
        if (!['lounge', 'dining', 'bed', 'desk', 'twin', 'small-bed'].includes(kind)) throw new Error('place-group lounge|dining|bed|desk|twin|small-bed --part <room> --anchor <sku> ...');
        const get = async (name: string) => { const v = flag(name); return v ? productBySku(v) : undefined; };
        const anchor = await get('anchor');
        if (!anchor) throw new Error('place-group needs --anchor <sku> (sofa, dining table, bed or desk)');
        const products = { anchor, table: await get('table'), rug: await get('rug'), side: await get('side-table'), lamp: await get('lamp'), tv: await get('tv'),
          media: await get('media'), chair: await get('chair'), chairs: num('chairs'), nightstand: await get('nightstand'), monitor: await get('monitor'),
          monitors: num('monitors'), pendant: bool('pendant') };
        result = await P.placeGroup(scene, draft, roomId, kind, products, spec, options);
      }
      if (!result.candidates.length) { say(`no pose found: ${result.reason ?? 'no candidate'}`); return 1; }
      result.candidates.forEach((c, n) => say(P.describeCandidate(c, String.fromCharCode(65 + n))));
      if (add && result.candidates[0]!.problems.length && !bool('force')) {
        say('not added: no option passes. Free the space it needs, try another --wall/--at/--beside, a smaller piece, or --force to add A anyway and fix by hand');
        return 1;
      }
      if (add) {
        const best = result.candidates[0]!;
        const file = loadDraft(draftPath);
        file.items.push(...best.items);
        if (best.lighting.length) file.lighting = [...(file.lighting ?? []), ...best.lighting];
        writeFileSync(draftPath, JSON.stringify(file, null, 1) + '\n');
        say(`added A to ${draftPath}: ${best.items.map(i => i.id).join(', ')}${best.lighting.length ? ', ' + best.lighting.map(l => l.id).join(', ') : ''}`);
      }
      return result.candidates[0]!.problems.length ? 1 : 0;
    }
    case 'sheet': {
      const out = argv.length && argv[argv.length - 1]!.endsWith('.png') ? argv.pop()! : 'sheet.png';
      if (!argv.length) throw new Error('sheet needs sku ids');
      const { productSheet } = await lib('catalog.ts');
      console.log(await productSheet(argv, out)); return 0;
    }
    default:
      console.log('usage: varpet describe | check [--warnings] [--final] | render-plan [out.png] [--room id] | render-view [out.png] [--room id] [--camera overview|eye|eye2|top] [--time day|evening] [--width n] [--height n] | requirements [--room id] | review --part id | place --part id --sku s (--wall w | --window w | --corner | --beside id [--side s] [--gap m] | --facing id | --centered-on id | --center | --at x,y [--rot r]) [--add] | place-group lounge|dining|bed|desk --part id --anchor sku [...] [--add] | prefetch [wishlist.json] | at-window room window w d h | materials | swatches [out.png] | search --kind k [--text t] [--max-w n] [--max-d n] [--max-h n] [--max-price n] [--limit n] | sheet sku... [out.png] | merge   (any command: --part <room> works on rooms/<room>.json)');
      return cmd ? 2 : 0;
  }
}

log({ event: 'start', args: process.argv.slice(3) });
main().then(code => { log({ event: 'end', exit: code, seconds: (Date.now() - started) / 1000, out: printed.slice(0, 2000) }); process.exit(code); },
  error => { const message = error instanceof Error ? error.message : String(error); log({ event: 'end', exit: 1, error: message.slice(0, 500) }); console.error(`error: ${message}`); process.exit(1); });
