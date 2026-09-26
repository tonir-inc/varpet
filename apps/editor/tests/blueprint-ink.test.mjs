import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-blueprint-ink-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: { ssr: `${root}/src/portal/blueprint-ink.ts`, target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'ink.mjs' } } } });
const { traceInk, inkTones } = await import(pathToFileURL(join(output, 'ink.mjs')));

/** A 40×30 sheet with an L-shaped wall and one separate mark. */
function sheet(paper, ink) {
  const w = 40, h = 30, px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([...paper, 255], i * 4);
  const draw = (x, y) => px.set([...ink, 255], (y * w + x) * 4);
  for (let x = 2; x < 36; x++) draw(x, 3);   // top wall, left to right
  for (let y = 3; y < 26; y++) draw(35, y);  // right wall, top to bottom
  draw(10, 20); draw(11, 20);                // a detached mark
  return { px, w, h };
}

test('paper is the common tone and ink the far side of it', () => {
  assert.deepEqual(inkTones([...Array(90).fill(240), ...Array(10).fill(20)]), { paper: 240, ink: 20, dark: true });
  assert.deepEqual(inkTones([...Array(90).fill(70), ...Array(10).fill(235)]), { paper: 70, ink: 235, dark: false });
});

test('a light room fill is faint shading, a wall is full ink', () => {
  const w = 20, h = 10, px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([250, 250, 250, 255], i * 4);
  for (let x = 0; x < w; x++) px.set([20, 20, 20, 255], x * 4);                       // wall along the top
  for (let y = 4; y < 8; y++) for (let x = 4; x < 12; x++) px.set([215, 215, 215, 255], (y * w + x) * 4); // grey fill
  const { alpha } = traceInk(px, w, h);
  assert.equal(alpha[5], 255);
  assert.ok(alpha[5 * w + 6] < 40, `fill alpha ${alpha[5 * w + 6]}`);
});

for (const [name, paper, ink] of [['dark ink on paper', [245, 243, 236], [30, 30, 30]], ['light ink on a blueprint', [20, 95, 110], [235, 245, 245]]]) {
  test(`${name}: only the strokes are ink, drawn along the line`, () => {
    const { px, w, h } = sheet(paper, ink);
    const result = traceInk(px, w, h);
    const at = (x, y) => y * w + x;
    assert.equal(result.alpha[at(20, 3)], 255);
    assert.equal(result.alpha[at(20, 15)], 0, 'paper stays clear');
    assert.equal(result.order[at(20, 15)], -1);
    assert.equal(result.sequence.length, 34 + 22 + 2);
    // The pen walks the connected wall from its top-left end.
    assert.ok(result.order[at(2, 3)] < result.order[at(20, 3)]);
    assert.ok(result.order[at(20, 3)] < result.order[at(35, 20)]);
    assert.ok(Math.max(...result.order) <= 1 && Math.min(...[...result.order].filter(v => v >= 0)) >= 0);
    for (let i = 1; i < result.sequence.length; i++) assert.ok(result.order[result.sequence[i - 1]] <= result.order[result.sequence[i]] + 1 / 2048);
  });
}

test('an empty sheet has no ink and no pen order', () => {
  const px = new Uint8ClampedArray(8 * 8 * 4).fill(255);
  assert.equal(traceInk(px, 8, 8).sequence.length, 0);
});
