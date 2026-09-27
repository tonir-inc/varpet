import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, test } from 'vitest';
import { Studio, runScript, scriptScope, type Product } from '../lib/sdk.js';

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'varpet-sdk-'));
  copyFileSync(new URL('../fixtures/avani-empty.json', import.meta.url).pathname, join(dir, 'scene.json'));
  writeFileSync(join(dir, 'draft.json'), '{"items": []}\n');
  return dir;
}
function studio(): Studio { return new Studio(workspace()); }
const onDisk = (s: Studio) => JSON.parse(readFileSync(join(s.dir, 'draft.json'), 'utf8'));
const steps = (dir: string) => existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith('.json')).length : 0;
const product = (sku: string, kind: string, size: [number, number, number], name = kind): Product => ({ sku, kind, name, size, price: 1000, vendor: 'v' });
const sofa = product('s', 'sofa', [2.1, 0.9, 0.85]), cabinet = product('c', 'cabinet', [1.2, 0.45, 0.8], 'Oak sideboard');
const art = product('a', 'wall_art', [0.9, 0.03, 0.6]), vase = product('v', 'vase', [0.15, 0.15, 0.3]);

describe('scene scripting sdk', () => {
  test('rooms and walls expose geometry with an inward normal and points along the face', () => {
    const s = studio(), living = s.room('Living & dining');
    expect(living.id).toBe('room-living');
    for (const wall of living.walls) {
      const inside = wall.pointAt(wall.length / 2, 0.3);
      expect(living.contains(inside)).toBe(true);
      expect(wall.along(0)).toEqual(wall.a);
    }
    expect(living.info()).toContain('room-living');
  });

  test('add against a wall, hang art on it, rest a vase on a piece; move carries what rests on it', () => {
    const s = studio(), wall = s.room('room-living').walls.sort((a, b) => b.length - a.length)[0]!;
    const side = s.add(cabinet, { wall, along: wall.length / 2 });
    expect(side.rot).toBe(wall.rot);
    expect(s.clear(side.pos, 0.05)[0]).toContain(side.id);
    const pic = s.add(art, { wall, along: wall.length / 2, height: 1.4 });
    expect(pic.wall_id).toBe(wall.id);
    const v = s.add(vase, { on: side.id });
    expect(v.on).toBe(side.id);
    s.move(side.id, { dx: 0.2 * wall.dir[0], dy: 0.2 * wall.dir[1] });
    expect(s.distance(v, side)).toBeLessThan(1e-6);
    expect(s.remove(side.id).sort()).toEqual([side.id, v.id].sort());
    expect(() => s.add('unknown-sku', { pos: [0, 0] })).toThrow(/unknown sku/);
  });

  test('gap is negative for overlaps and facing reads the front direction', () => {
    const s = studio(), c = s.room('room-living').center;
    const a = s.add(sofa, { pos: c, rot: 0 }), b = s.add(sofa, { pos: [c[0] + 1, c[1]], rot: 0 });
    expect(s.gap(a, b)).toBeLessThan(0);
    s.move(b.id, [c[0], c[1] - 2]);
    expect(s.gap(a, b)).toBeCloseTo(2 - 0.9, 2);
    expect(s.facing(a, b).faces).toBe(true);
    expect(s.facing(b, a).faces).toBe(false);
  });

  test('check --facts: overlaps are gates, rules of thumb are notes', async () => {
    const s = studio(), c = s.room('room-living').center;
    s.add(sofa, { pos: c, rot: 0 }); s.add(sofa, { pos: [c[0] + 0.5, c[1]], rot: 0 });
    const r = await s.check();
    expect(r.ok).toBe(false);
    expect(r.gates.some(g => g.startsWith('collision:'))).toBe(true);
    expect(r.notes.every(n => !n.startsWith('collision:'))).toBe(true);
  }, 60_000);

  test('finishes and lights replace per surface; save writes the draft; the script scope binds methods', () => {
    const s = studio();
    s.paint('room-living', '#A8B5A2'); s.paint('room-living', '#C0704F'); s.ceiling('room-living', 'soft-glow');
    expect(s.draft.finishes).toHaveLength(1);
    s.save();
    expect(JSON.parse(readFileSync(join(s.dir, 'draft.json'), 'utf8')).finishes[0].color).toBe('#C0704F');
    const scope = scriptScope(s) as { room: (q: string) => { id: string } };
    expect(scope.room('room-bedroom').id).toBe('room-bedroom');
  });

  test('save reports created / updated / removed / surfaces; undo and redo walk .history on disk and in memory; a new save clears redo', () => {
    const s = studio(), c = s.room('room-living').center, hist = join(s.dir, '.history');
    const a = s.add(sofa, { pos: c, rot: 0 });
    expect(s.save()).toContain(`created ${a.id}`);
    const placed = onDisk(s).items[0].pos;
    s.move(a.id, { dx: 0.1 });
    expect(s.save()).toContain(`updated ${a.id}`);
    const moved = onDisk(s).items[0].pos;
    s.paint('room-living', '#A8B5A2'); s.remove(a.id);
    const r = s.save();
    expect(r).toContain(`removed ${a.id}`); expect(r).toContain('surfaces changed');
    expect(steps(hist)).toBe(3);

    expect(s.undo()).toMatch(/^undid 1 step;/);
    expect(s.draft.items.map(i => i.id)).toEqual([a.id]); expect(s.draft.items[0]!.pos).toEqual(moved);
    expect(s.draft.finishes ?? []).toHaveLength(0);
    expect(onDisk(s).items[0].pos).toEqual(moved);
    expect(new Studio(s.dir).draft.items).toHaveLength(1);
    expect(steps(join(hist, 'redo'))).toBe(1);

    expect(s.redo()).toMatch(/^redid 1 step;/);
    expect(s.draft.items).toHaveLength(0); expect(onDisk(s).finishes).toHaveLength(1);

    expect(s.undo(2)).toMatch(/^undid 2 steps;/);
    expect(s.draft.items[0]!.pos).toEqual(placed);
    expect(steps(join(hist, 'redo'))).toBe(2);
    s.move(a.id, { dy: 0.1 }); s.save();
    expect(steps(join(hist, 'redo'))).toBe(0);
    expect(s.redo()).toMatch(/^redid 0 steps/);
    expect(s.dirty).toBe(false);
  });

  test('find filters by kind, name/id substring and room', () => {
    const s = studio(), living = s.room('room-living'), bed = s.room('room-bedroom');
    const a = s.add(sofa, { pos: living.center, rot: 0 }), b = s.add(cabinet, { pos: living.center, rot: 0 }), d = s.add(cabinet, { pos: bed.center, rot: 0 });
    const ids = (q: Parameters<Studio['find']>[0]) => s.find(q).map(i => i.id).filter(id => [a.id, b.id, d.id].includes(id)).sort();
    expect(ids({ kind: 'cabinet' })).toEqual([b.id, d.id].sort());
    expect(ids({ name: 'oak SIDE' })).toEqual([b.id, d.id].sort());
    expect(ids({ kind: 'cabinet', room: 'room-bedroom' })).toEqual([d.id]);
    expect(ids({ room: living })).toEqual([a.id, b.id].sort());
    expect(s.find({ kind: 'sofa', room: 'room-bedroom' })).toEqual([]);
  });

  test('fits reports collisions for an overlapping pose, none for a clear one, and leaves the draft and dirty flag alone', () => {
    const s = studio(), c = s.room('room-living').center;
    const a = s.add(sofa, { pos: c, rot: 0 }); s.save();
    const before = structuredClone(s.draft);
    const hit = s.fits(sofa, { pos: [c[0] + 0.5, c[1]], rot: 0 });
    expect(hit.collisions.some(x => x.startsWith(`${a.id} (overlap`))).toBe(true);
    const ok = s.fits(sofa, { pos: [c[0], c[1] - 2], rot: 0 });
    expect(ok.collisions).toEqual([]);
    expect(ok.inRoom).toBe(true);
    expect(s.draft).toEqual(before); expect(s.dirty).toBe(false);
    s.move(a.id, { dx: 0.01 }); s.fits(sofa, { pos: c, rot: 0 });
    expect(s.dirty).toBe(true); expect(s.draft.items).toHaveLength(1);
  });

  test('runScript captures console output and saves once; a thrown error saves nothing', async () => {
    const s = studio(), hist = join(s.dir, '.history'), log = console.log;
    const code = `const p = ${JSON.stringify(sofa)};\nconst c = room('room-living').center;\nadd(p, { pos: c, rot: 0 }); add(p, { pos: [c[0], c[1] - 2], rot: 0 });\nconsole.log('pieces', list().length);`;
    const r = await runScript(s, code, true);
    expect(r.output).toBe('pieces 2');
    expect(r.saved).toContain('created');
    expect(console.log).toBe(log);
    expect(steps(hist)).toBe(1); expect(onDisk(s).items).toHaveLength(2);
    const disk = readFileSync(join(s.dir, 'draft.json'), 'utf8');
    await expect(runScript(s, `console.log('before');\nremove(list()[0].id);\nthrow new Error('boom');`, true)).rejects.toThrow(/^before\nboom.*; nothing saved$/);
    expect(readFileSync(join(s.dir, 'draft.json'), 'utf8')).toBe(disk);
    expect(steps(hist)).toBe(1);
    expect(console.log).toBe(log);
    expect(readdirSync(s.dir).filter(n => n.startsWith('.varpet-script-'))).toEqual([]);
  }, 60_000);

  test('mcp server over stdio: lists tools, reads a room, applies a paint patch and undoes it', async () => {
    const dir = workspace(), loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;
    const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', loader, new URL('../mcp.ts', import.meta.url).pathname, '--workspace', dir], stderr: 'pipe' });
    const client = new Client({ name: 'sdk-test', version: '0' });
    await client.connect(transport);
    try {
      const names = (await client.listTools()).tools.map(t => t.name);
      for (const n of ['get_room', 'apply_patch', 'undo', 'run_script', 'fits', 'look']) expect(names).toContain(n);
      const text = (r: Awaited<ReturnType<typeof client.callTool>>) => (r.content as { type: string; text?: string }[]).map(x => x.text ?? '').join('\n');
      const room = await client.callTool({ name: 'get_room', arguments: { room: 'room-living' } });
      expect(room.isError).toBeFalsy(); expect(text(room)).toContain('room-living');
      const patch = await client.callTool({ name: 'apply_patch', arguments: { ops: [{ op: 'paint', room: 'room-living', color: '#A8B5A2' }] } });
      expect(patch.isError).toBeFalsy(); expect(text(patch)).toContain('surfaces changed');
      expect(JSON.parse(readFileSync(join(dir, 'draft.json'), 'utf8')).finishes).toHaveLength(1);
      const undo = await client.callTool({ name: 'undo', arguments: {} });
      expect(text(undo)).toMatch(/^undid 1 step;/);
      expect(JSON.parse(readFileSync(join(dir, 'draft.json'), 'utf8')).finishes ?? []).toHaveLength(0);
    } finally { await client.close(); }
  }, 90_000);
});
