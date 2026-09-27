/** The designer's scene MCP (stdio), after Pascal's design: query the scene, edit it in small undoable patches, measure
 * facts, look through a camera, and run a script for large changes. Every tool reads the workspace fresh and every edit
 * saves draft.json as one undo step (shared with ./varpet script), so the editor's draft watcher sees each change live.
 *   node --import tsx spike/mcp.ts --workspace <dir>      (default: cwd) */
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Studio, runScript, type AddOptions } from './lib/sdk.ts';

const at = process.argv.indexOf('--workspace'), dir = at > 0 ? process.argv[at + 1]! : process.cwd();
const server = new McpServer({ name: 'varpet-scene', version: '0.1.0' });
type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
const text = (value: unknown): { content: Content[] } => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }] });
const image = (path: string): Content => ({ type: 'image', data: readFileSync(path).toString('base64'), mimeType: 'image/png' });
/** One tool call: a fresh studio over the workspace; errors come back as one line the model can act on. */
function tool<T>(run: (s: Studio, a: T) => Promise<{ content: Content[] }> | { content: Content[] }) {
  return async (a: T) => {
    try { return await run(new Studio(dir), a); }
    catch (error) { return { ...text(error instanceof Error ? error.message : String(error)), isError: true }; }
  };
}
const room = z.string().describe('room id or name');
const vec = z.tuple([z.number(), z.number()]);
const placement = {
  pos: vec.optional().describe('floor position [x, y] m'), rot: z.number().optional().describe('degrees CCW; front faces local -y'),
  wall: z.string().optional().describe('wall id: floor pieces back onto it, art/mirrors hang on it'), along: z.number().optional().describe('metres from the wall end a'),
  height: z.number().optional().describe('hung pieces: centre height m'), on: z.string().optional().describe('support item id (lamp on a table)'),
  window: z.string().optional().describe('window id (curtains, blinds)'), room: room.optional(),
};
const opts = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as AddOptions;

server.registerTool('get_scene', { description: 'The flat: rooms, budget, what the design holds so far.', inputSchema: {} },
  tool(s => text(s.describe())));
server.registerTool('get_room', { description: 'One room: polygon, bbox, area, walls (room-side face ends, length, inward normal, openings with spans along the wall, free spans), doors with swing, windows, fittings, free floor.', inputSchema: { room } },
  tool((s, a: { room: string }) => { const r = s.room(a.room); return text([r.info(), ...r.walls.map(w => `${w}`)].join('\n')); }));
server.registerTool('find_items', { description: 'Items (the design and the flat) by kind, name/id substring and room.', inputSchema: { kind: z.string().optional(), name: z.string().optional(), room: room.optional() } },
  tool((s, a: { kind?: string; name?: string; room?: string }) => text(s.find(a).map(i => `${i.id} ${i.kind} "${i.name ?? ''}" room ${i.room_id} at (${i.pos.join(', ')}) rot ${i.rot} size ${i.size.join('x')}${i.on ? ` on ${i.on}` : ''}${i.wall_id ? ` on wall ${i.wall_id} @${i.height_m}` : ''}`).join('\n') || 'none')));
server.registerTool('describe_item', { description: 'One item: record, footprint bbox, what rests on it, what is within 0.6 m.', inputSchema: { id: z.string() } },
  tool((s, a: { id: string }) => { const i = s.get(a.id); return text({ ...i, bbox: s.bbox(i), resting: s.list().filter(x => x.on === i.id).map(x => x.id), near: s.clear(i.pos, Math.max(...i.size.slice(0, 2)) / 2 + 0.6) }); }));
server.registerTool('search_catalog', { description: 'Real catalog products {sku, kind, name, size [w,d,h] m, price AMD}.', inputSchema: { kind: z.string(), text: z.string().optional(), maxW: z.number().optional(), maxD: z.number().optional(), maxH: z.number().optional(), maxPrice: z.number().optional(), limit: z.number().optional() } },
  tool(async (s, a: Parameters<Studio['search']>[0]) => text((await s.search(a)).map(p => `${p.sku} | ${p.name} | ${p.size.join('x')} | ${p.price}`).join('\n') || 'no results')));
server.registerTool('product_sheet', { description: 'Photos of products side by side (look before choosing).', inputSchema: { skus: z.array(z.string()).min(1).max(12) } },
  tool(async (s, a: { skus: string[] }) => ({ content: [image(await s.sheet(a.skus))] })));
server.registerTool('fits', { description: 'Read-only: would this product fit at this placement? Collisions, gaps under 0.6 m, door clear zones, inside the room. Changes nothing.', inputSchema: { sku: z.string(), ...placement } },
  tool(async (s, { sku, ...o }: { sku: string } & Record<string, unknown>) => text(s.fits(await s.product(sku), opts(o)))));
const op = z.object({
  op: z.enum(['add', 'move', 'rotate', 'remove', 'paint', 'floor', 'ceiling', 'fixture']),
  id: z.string().optional().describe('item id (move/rotate/remove; optional new id for add)'), sku: z.string().optional().describe('add'),
  ...placement, dx: z.number().optional(), dy: z.number().optional(),
  color: z.string().optional().describe('paint/floor #hex'), material: z.string().optional().describe('floor material id'),
  style: z.enum(['quiet', 'soft-glow', 'architectural']).optional().describe('ceiling'),
  mount: z.enum(['pendant', 'ceiling', 'wall']).optional().describe('fixture'), height_m: z.number().optional(),
});
server.registerTool('apply_patch', { description: 'Edit the scene: a batch of ops applied all-or-nothing as one undo step, saved to the live draft. add {sku, pos+rot | wall+along(+height) | on | window}; move {id, pos | dx,dy, rot?}; rotate {id, rot}; remove {id}; paint {room, color, wall?} (walls, or one accent wall); floor {room, material, color?}; ceiling {room, style}; fixture {room, mount, pos, height_m?}. Returns created/updated/removed ids.', inputSchema: { ops: z.array(op).min(1) } },
  tool(async (s, a: { ops: z.infer<typeof op>[] }) => {
    for (const o of a.ops) {
      if (o.op === 'add') s.add(await s.product(o.sku ?? ''), opts({ ...o, op: undefined, sku: undefined, dx: undefined, dy: undefined }));
      else if (o.op === 'move') s.move(o.id!, o.pos ?? { dx: o.dx, dy: o.dy }, o.rot);
      else if (o.op === 'rotate') s.rotate(o.id!, o.rot ?? 0);
      else if (o.op === 'remove') s.remove(o.id!);
      else if (o.op === 'paint') s.paint(o.room!, o.color!, opts({ wall: o.wall, material: o.material }));
      else if (o.op === 'floor') s.floor(o.room!, o.material!, o.color);
      else if (o.op === 'ceiling') s.ceiling(o.room!, o.style!);
      else s.fixture(o.room!, opts({ mount: o.mount, pos: o.pos, height_m: o.height_m, id: o.id }) as never);
    }
    const gates = (await s.check()).gates;
    return text(`${s.save()}${gates.length ? `\ngates failing now:\n${gates.map(g => `- ${g}`).join('\n')}` : '\ngates OK'}`);
  }));
server.registerTool('undo', { description: 'Undo the last edit steps (patches and scripts share one history).', inputSchema: { steps: z.number().int().positive().optional() } },
  tool((s, a: { steps?: number }) => text(s.undo(a.steps ?? 1))));
server.registerTool('redo', { description: 'Redo undone steps.', inputSchema: { steps: z.number().int().positive().optional() } },
  tool((s, a: { steps?: number }) => text(s.redo(a.steps ?? 1))));
server.registerTool('measure', { description: 'Facts, not rules. With a and b: centre distance, edge gap (negative = overlap), whether each faces the other. With room (or nothing): walkway widths, gaps, what each piece faces, what hangs over what, free floor.', inputSchema: { room: room.optional(), a: z.string().optional(), b: z.string().optional() } },
  tool(async (s, a: { room?: string; a?: string; b?: string }) => a.a && a.b
    ? text({ distance: s.distance(a.a, a.b), gap: s.gap(a.a, a.b), a_faces_b: s.facing(a.a, a.b), b_faces_a: s.facing(a.b, a.a) })
    : text((await s.measure(a.room)).join('\n'))));
server.registerTool('check', { description: 'Hard gates only (collisions, walls, door swings, walkways < 0.6 m, supports and mounts, budget, catalog validity); they must pass at the end. Everything else is your judgement.', inputSchema: {} },
  tool(async s => { const r = await s.check(); return text(`${r.ok ? 'GATES OK' : `GATES FAIL (${r.gates.length})`}\n${r.gates.map(g => `- ${g}`).join('\n')}\ntotal ${r.total} AMD${s.budget ? ` of ${s.budget}` : ''}`); }));
server.registerTool('look', { description: 'Render the current design and see it. view: plan (top-down), overview (cutaway), eye / eye2 (standing in a corner; needs room), camera (from + at, [x, y, height] m). time evening = lights on.', inputSchema: { view: z.enum(['plan', 'overview', 'eye', 'eye2', 'camera']), room: room.optional(), from: z.array(z.number()).min(2).max(3).optional(), at: z.array(z.number()).min(2).max(3).optional(), time: z.enum(['day', 'evening']).optional() } },
  tool(async (s, a: { view: string; room?: string; from?: number[]; at?: number[]; time?: 'day' | 'evening' }) => {
    const view = a.view === 'camera' ? { from: a.from as [number, number, number?], at: a.at as [number, number, number?] } : a.view === 'overview' ? (a.room ?? 'overview') : a.view;
    const path = await s.look(view, { room: a.room, time: a.time });
    return { content: [image(path), { type: 'text', text: path }] };
  }));
server.registerTool('run_script', { description: 'For large changes: a TypeScript body with every scene function in scope (room, rooms, find, add, move, rotate, remove, paint, floor, ceiling, fixture, search, product, fits, gap, distance, facing, clear, freeRects, measure, check, look); top-level await; console.log output returned; saved as one undo step only if it ends without an error.', inputSchema: { code: z.string() } },
  tool(async (s, a: { code: string }) => { const r = await runScript(s, a.code, true); return text([r.output, r.saved ?? 'nothing changed'].filter(Boolean).join('\n')); }));

await server.connect(new StdioServerTransport());
