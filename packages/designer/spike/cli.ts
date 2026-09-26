/** varpet designer CLI. Run from a workspace holding scene.json and draft.json:
 *   npx tsx cli.ts describe | check [--warnings] | render-plan [out.png] [--room id]
 *     | render-view [out.png] --room id [--camera overview|eye|eye2|top] [--time day|evening]
 *     | materials | swatches [out.png] | search --kind k [--text t] [--max-w n --max-d n --max-h n --max-price n --limit n]
 *     | sheet sku1 sku2 ... [out.png]
 * Optional --scene path / --draft path override the cwd files.
 * The designer's src (checkLayout, zod) is loaded at runtime from $VARPET_DESIGNER_SRC, else ../src next to
 * this file when run in-repo, else /Users/snek/dev/varpet-designer-spike/packages/designer/src.
 * In a copied workspace run tsx from the repo (e.g. /Users/snek/dev/varpet-designer-spike/node_modules/.bin/tsx)
 * or set NODE_PATH so the lib modules can resolve their own dependencies. */
import { loadDraft, loadScene, describe } from './lib/scene.ts';

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
  const scene = loadScene(scenePath), draft = loadDraft(draftPath);
  switch (cmd) {
    case 'describe': console.log(describe(scene, draft)); return 0;
    case 'check': {
      const verbose = bool('warnings');
      const { check, warnings } = await import('./lib/check.ts');
      const r = await check(scene, draft);
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
      if (!roomId) throw new Error('render-view needs --room <id>');
      const out = argv[0] ?? `view-${roomId}.png`;
      const camera = flag('camera') ?? 'overview', time = flag('time') ?? 'day';
      if (!['overview', 'eye', 'eye2', 'top'].includes(camera)) throw new Error('--camera is overview, eye, eye2 or top');
      if (!['day', 'evening'].includes(time)) throw new Error('--time is day or evening');
      const { renderView } = await lib('render-view.ts');
      console.log(await renderView(scene, draft, out, { roomId, camera, time })); return 0;
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
      if (!rows.length) console.log('no results');
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
      console.log('usage: varpet describe | check [--warnings] | render-plan [out.png] [--room id] | render-view [out.png] --room id [--camera overview|eye|eye2|top] [--time day|evening] | materials | swatches [out.png] | search --kind k [--text t] [--max-w n] [--max-d n] [--max-h n] [--max-price n] [--limit n] | sheet sku... [out.png]');
      return cmd ? 2 : 0;
  }
}

main().then(code => process.exit(code), error => { console.error(`error: ${error instanceof Error ? error.message : error}`); process.exit(1); });
