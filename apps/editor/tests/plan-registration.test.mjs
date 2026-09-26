import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-plan-registration-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: { ssr: `${root}/src/ui/plan-registration.ts`, target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'registration.mjs' } } } });
const { registerPlan } = await import(pathToFileURL(join(output, 'registration.mjs')));

// A 9 × 6 m flat: outer walls, one partition, off the origin like a real reconstruction.
const walls = [
  { start: [-4, -2], end: [5, -2], thickness: 0.25 }, { start: [5, -2], end: [5, 4], thickness: 0.25 },
  { start: [5, 4], end: [-4, 4], thickness: 0.25 }, { start: [-4, 4], end: [-4, -2], thickness: 0.25 },
  { start: [1, -2], end: [1, 4], thickness: 0.12 },
];

/** Rasterise walls onto a page at a known scale and offset, with margin clutter a real plan has. */
function page({ width = 420, height = 330, scale = 32, x = 55, y = 60, clutter = true } = {}) {
  const alpha = new Uint8ClampedArray(width * height);
  const ink = (u, v) => { if (u >= 0 && v >= 0 && u < width && v < height) alpha[v * width + u] = 255; };
  for (const w of walls) {
    const L = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]), half = Math.max(1, w.thickness * scale / 2);
    for (let t = 0; t <= L; t += 0.5 / scale) {
      const cx = x + (w.start[0] + (w.end[0] - w.start[0]) * t / L + 4) * scale, cy = y + (w.start[1] + (w.end[1] - w.start[1]) * t / L + 2) * scale;
      for (let a = -half; a <= half; a++) for (let b = -half; b <= half; b++) ink(Math.round(cx + a), Math.round(cy + b));
    }
  }
  if (clutter) {
    for (let u = x; u < x + 9 * scale; u++) ink(u, y - 25);                                   // dimension line above
    for (const [u0, v0] of [[20, 10], [300, 300], [x + 60, y + 90]]) for (let u = 0; u < 40; u++) for (let v = 0; v < 9; v++) if ((u + v) % 3) ink(u0 + u, v0 + v); // text blocks
  }
  return { alpha, width, height };
}

test('finds the scale and offset that put the walls on the plan ink', () => {
  const { alpha, width, height } = page();
  const r = registerPlan(alpha, width, height, walls);
  assert.ok(r, 'expected a registration');
  assert.ok(Math.abs(r.scale - 32) / 32 < 0.03, `scale ${r.scale}`);
  assert.ok(Math.abs(r.x - 55) < 4 && Math.abs(r.y - 60) < 4, `offset ${r.x}, ${r.y}`);
});

test('a flat drawn larger on the page gets a larger sheet', () => {
  const small = registerPlan(...Object.values(page({ scale: 22, x: 90, y: 90 })), walls);
  const large = registerPlan(...Object.values(page({ scale: 40, x: 20, y: 30 })), walls);
  assert.ok(small && large);
  assert.ok(Math.abs(small.scale - 22) / 22 < 0.04, `small ${small.scale}`);
  assert.ok(Math.abs(large.scale - 40) / 40 < 0.04, `large ${large.scale}`);
});

test('walls that do not match the plan are not forced onto it', () => {
  const width = 300, height = 240, alpha = new Uint8ClampedArray(width * height);
  let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < alpha.length; i++) alpha[i] = random() < 0.08 ? 255 : 0;
  assert.equal(registerPlan(alpha, width, height, walls), null);
});

test('no walls, no registration', () => {
  assert.equal(registerPlan(new Uint8ClampedArray(100), 10, 10, []), null);
});
