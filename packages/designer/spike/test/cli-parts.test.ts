import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../cli.ts');
const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;

/** Two 4 x 4 m rooms side by side, no openings. */
function studio(): string {
  const dir = mkdtempSync(join(tmpdir(), 'varpet-parts-'));
  const wall = (id: string, room_id: string, a: number[], b: number[]) => ({ id, room_id, a, b, thickness: 0.1, height: 2.7 });
  writeFileSync(join(dir, 'scene.json'), JSON.stringify({
    rooms: [{ id: 'a', name: 'Room A', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }, { id: 'b', name: 'Room B', polygon: [[4, 0], [8, 0], [8, 4], [4, 4]] }],
    walls: [wall('as', 'a', [0, 0], [4, 0]), wall('ae', 'a', [4, 0], [4, 4]), wall('an', 'a', [4, 4], [0, 4]), wall('aw', 'a', [0, 4], [0, 0]),
      wall('bs', 'b', [4, 0], [8, 0]), wall('be', 'b', [8, 0], [8, 4]), wall('bn', 'b', [8, 4], [4, 4]), wall('bw', 'b', [4, 4], [4, 0])],
    openings: [], items: [], fixed: [],
  }));
  return dir;
}
const item = (id: string, room_id: string, pos: [number, number]) =>
  ({ id, room_id, kind: 'cabinet', name: 'Box', pos, rot: 0, size: [0.5, 0.4, 0.8], keep: false, sku: 'x', price: 1000, vendor: 'v' });
function varpet(dir: string, ...args: string[]): { code: number; out: string } {
  try { return { code: 0, out: execFileSync(process.execPath, ['--import', loader, cli, ...args], { cwd: dir, encoding: 'utf8' }) }; }
  catch (error) { const e = error as { status: number; stdout: string; stderr: string }; return { code: e.status, out: e.stdout + e.stderr }; }
}

describe('./varpet --part and merge', () => {
  test('a room file is seeded from draft.json, merged back and then removed', () => {
    const dir = studio();
    writeFileSync(join(dir, 'draft.json'), JSON.stringify({ items: [item('a-box', 'a', [2, 3.7]), item('b-box', 'b', [6, 3.7])] }));
    varpet(dir, 'check', '--part', 'a');
    const seeded = JSON.parse(readFileSync(join(dir, 'rooms/a.json'), 'utf8'));
    expect(seeded.items.map((i: { id: string }) => i.id)).toEqual(['a-box']);
    writeFileSync(join(dir, 'rooms/a.json'), JSON.stringify({ items: [item('a-box', 'a', [1, 3.7]), item('a-box2', 'a', [3, 3.7])] }));
    const merged = varpet(dir, 'merge');
    expect(merged.out).toContain('merged a into draft.json');
    const draft = JSON.parse(readFileSync(join(dir, 'draft.json'), 'utf8'));
    expect(draft.items.map((i: { id: string }) => i.id).sort()).toEqual(['a-box', 'a-box2', 'b-box']);
    expect(draft.items.find((i: { id: string }) => i.id === 'a-box').pos).toEqual([1, 3.7]);
    expect(existsSync(join(dir, 'rooms/a.json'))).toBe(false);
  }, 60_000);

  test('merge refuses an entry filed under the wrong room and a duplicate id', () => {
    const dir = studio();
    writeFileSync(join(dir, 'draft.json'), JSON.stringify({ items: [] }));
    varpet(dir, 'check', '--part', 'a');
    writeFileSync(join(dir, 'rooms/a.json'), JSON.stringify({ items: [item('box', 'b', [6, 3.7])] }));
    writeFileSync(join(dir, 'rooms/b.json'), JSON.stringify({ items: [item('box', 'b', [6, 3.7])] }));
    const refused = varpet(dir, 'merge');
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain('it belongs in rooms/b.json');
    expect(refused.out).toContain('ids must be unique');
    expect(existsSync(join(dir, 'rooms/a.json'))).toBe(true);
  }, 60_000);

  test('check --part keeps only lines about that room', () => {
    const dir = studio();
    writeFileSync(join(dir, 'draft.json'), JSON.stringify({ items: [] }));
    varpet(dir, 'check', '--part', 'a');
    writeFileSync(join(dir, 'rooms/a.json'), JSON.stringify({ items: [item('a-box', 'a', [2, 2]), item('a-box2', 'a', [2, 2])] }));
    const room = varpet(dir, 'check', '--part', 'a');
    expect(room.code).toBe(1);
    expect(room.out).toContain('a-box');
    expect(room.out).toContain('whole-flat rules and the budget are checked after merge');
  }, 60_000);
});
