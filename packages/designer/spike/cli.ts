/** varpet designer CLI. Run from a workspace holding scene.json and draft.json:
 *   npx tsx cli.ts describe | check [--warnings] | render-plan [out.png] [--room id]
 *     | render-view [out.png] [--room id] [--camera overview|eye|eye2|top] [--time day|evening] [--width 768] [--height 512]   (no --room: whole flat, overview/top)
 *     | at-window <room> <window> <w> <d> <h> (curtain/blind placement JSON) | materials | swatches [out.png] | search --kind k [--text t] [--max-w n --max-d n --max-h n --max-price n --limit n]
 *     | sheet sku1 sku2 ... [out.png]
 * Optional --scene path / --draft path override the cwd files. budget.json ({budget_dram}), brief.txt (the customer's words,
 * for brief-driven check rules) and source.json (the flat's
 * editor document, for 3D renders) are read from the scene file's directory when present.
 * The designer's src (checkLayout, zod) is loaded at runtime from $VARPET_DESIGNER_SRC, else ../src next to
 * this file when run in-repo, else /Users/snek/dev/varpet-designer-spike/packages/designer/src.
 * In a copied workspace run tsx from the repo (e.g. /Users/snek/dev/varpet-designer-spike/node_modules/.bin/tsx)
 * or set NODE_PATH so the lib modules can resolve their own dependencies. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

async function main(): Promise<number> {
  const scenePath = flag('scene') ?? 'scene.json', draftPath = flag('draft') ?? 'draft.json';
  const scene = loadScene(scenePath), draft = loadDraft(draftPath), budget = loadBudget(scenePath);
  switch (cmd) {
    case 'describe': console.log(describe(scene, draft, budget)); return 0;
    case 'check': {
      const verbose = bool('warnings');
      const { check, warnings } = await import('./lib/check.ts');
      // brief.txt beside scene.json (the request plus any answers) decides brief-driven rules; else check reads AGENTS.md.
      const briefPath = join(dirname(scenePath), 'brief.txt');
      const r = await check(scene, draft, { budget, brief: existsSync(briefPath) ? readFileSync(briefPath, 'utf8') : undefined });
      console.log(r.ok ? 'OK' : `FAIL (${r.problems.length} hard)`);
      for (const p of r.problems) console.log(`- ${p}`);
      console.log(r.summary);
      if (verbose) for (const w of await warnings(scene, draft)) console.log(`~ ${w}`);
      return r.ok ? 0 : 1;
    }
    case 'render-plan': {
      const roomId = flag('room'), out = argv[0] ?? `plan${roomId ? '-' + roomId : ''}.png`;
      const { renderPlan } = await lib('render-plan.ts');
      console.log(await renderPlan(scene, draft, out, { roomId })); return 0;
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
      console.log(await renderView(scene, draft, out, { roomId, camera, time, width, height, source: loadSource(scenePath) })); return 0;
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
      const q = { kind, text: flag('text'), maxW: num('max-w'), maxD: num('max-d'), maxH: num('max-h'), maxPrice: num('max-price'), limit: num('limit') };
      const { search } = await lib('catalog.ts');
      const rows: { sku: string; kind: string; name: string; size: number[]; price: number; vendor: string; image?: string }[] = await search(q);
      if (!rows.length) console.log(`no results for kind ${kind}; kinds: ${KINDS}`);
      for (const p of rows) console.log(`${p.sku} | ${p.name} | ${p.size.map(n => n.toFixed(2)).join('x')} m | ${p.price} AMD | ${p.vendor}`);
      return 0;
    }
    case 'sheet': {
      const out = argv.length && argv[argv.length - 1]!.endsWith('.png') ? argv.pop()! : 'sheet.png';
      if (!argv.length) throw new Error('sheet needs sku ids');
      const { productSheet } = await lib('catalog.ts');
      console.log(await productSheet(argv, out)); return 0;
    }
    default:
      console.log('usage: varpet describe | check [--warnings] | render-plan [out.png] [--room id] | render-view [out.png] [--room id] [--camera overview|eye|eye2|top] [--time day|evening] [--width n] [--height n] | at-window room window w d h | materials | swatches [out.png] | search --kind k [--text t] [--max-w n] [--max-d n] [--max-h n] [--max-price n] [--limit n] | sheet sku... [out.png]');
      return cmd ? 2 : 0;
  }
}

main().then(code => process.exit(code), error => { console.error(`error: ${error instanceof Error ? error.message : error}`); process.exit(1); });
