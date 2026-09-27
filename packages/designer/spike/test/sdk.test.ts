import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { Studio, scriptScope, type Product } from '../lib/sdk.js';

function studio(): Studio {
  const dir = mkdtempSync(join(tmpdir(), 'varpet-sdk-'));
  copyFileSync(new URL('../fixtures/avani-empty.json', import.meta.url).pathname, join(dir, 'scene.json'));
  writeFileSync(join(dir, 'draft.json'), '{"items": []}\n');
  return new Studio(dir);
}
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
});
