import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

// QA 20260926T193058Z: the M6 south balcony rendered as stepped, overlapping blocks because the
// pier tail, the Bedroom 1 doorway wall and the south return ran on parallel lines 9 cm apart.
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-m6-balcony-walls-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', ssr: { noExternal: ['three'] }, plugins: [{
  name: 'm6-balcony-walls-entry', resolveId(id) { if (id.endsWith('m6-balcony-walls-entry')) return '\0m6-balcony-walls-entry'; },
  load(id) { if (id === '\0m6-balcony-walls-entry') return `export * from '${root}/src/render/wall-geometry.ts'; export * from '${root}/src/core/wall-junctions.ts';`; },
}], build: { ssr: 'm6-balcony-walls-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { wallFootprint, normalizeWallJunctions } = await import(pathToFileURL(join(output, 'test.mjs')));

const load = async name => JSON.parse(await readFile(join(root, '../../apartments/m6-12-54', name), 'utf8'));
// trace.mjs maps source pixels to metres with 97 px/m about origin [635,575].
const pixel = (x, y) => [(x - 635) / 97, (y - 575) / 97];
const world = (wall, [x, z]) => {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const ux = (wall.end[0] - wall.start[0]) / length, uz = (wall.end[1] - wall.start[1]) / length;
  return [wall.start[0] + ux * x - uz * z, wall.start[1] + uz * x + ux * z];
};
const inside = ([x, z], polygon) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
};
const centrelineDistance = (point, wall) => {
  const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
  const t = Math.max(0, Math.min(length, ((point[0] - wall.start[0]) * dx + (point[1] - wall.start[1]) * dz) / length));
  return Math.hypot(point[0] - wall.start[0] - dx / length * t, point[1] - wall.start[1] - dz / length * t);
};

for (const name of ['scene.json', 'scene.furnished.json']) {
  test(`M6 ${name}: no wall endpoint stops just short of another wall`, async () => {
    const { walls } = await load(name);
    for (const wall of walls) for (const end of [wall.start, wall.end]) {
      const nearest = Math.min(...walls.filter(other => other !== wall).map(other => centrelineDistance(end, other)));
      assert.ok(nearest < 1e-6 || nearest > .3, `${wall.id} ends ${(nearest * 100).toFixed(1)} cm from another wall's centreline`);
    }
  });
}

test('a host split at a T junction stays solid under the branch instead of opening a V-shaped notch', () => {
  const wall = (id, start, end, thickness) => ({ id, start, end, height: 2.8, thickness, color: '#ffffff', openings: [] });
  const walls = [wall('left', [-2, 0], [0, 0], .3), wall('right', [0, 0], [2, 0], .3), wall('branch', [0, 0], [0, 2], .2)];
  const solids = walls.map(item => wallFootprint(item, walls).map(point => world(item, point)));
  for (let x = -.14; x <= .14; x += .02) for (let z = -.14; z <= .14; z += .02) {
    assert.ok(solids.slice(0, 2).some(polygon => inside([x, z], polygon)), `host notch at [${x.toFixed(2)},${z.toFixed(2)}]`);
  }
  for (const [x, z] of solids[2]) assert.ok(z >= .15 - 1e-9, 'the branch stops at the host face');
});

test('M6 south pier stays solid where the Bedroom 2 / living partition meets it', async () => {
  const scene = normalizeWallJunctions(await load('scene.json'));
  const solids = scene.walls.map(wall => wallFootprint(wall, scene.walls, scene.project?.metadata ?? {}).map(point => world(wall, point)));
  for (let x = 668; x <= 684; x += 2) for (let y = 896; y <= 934; y += 2) {
    assert.ok(solids.some(polygon => inside(pixel(x, y), polygon)), `notch in the south pier at source pixel [${x},${y}]`);
  }
});

test('M6 south balcony facade renders as one continuous band from the pier to the south return', async () => {
  const scene = normalizeWallJunctions(await load('scene.json'));
  const metadata = scene.project?.metadata ?? {};
  const solids = scene.walls.map(wall => ({ wall, polygon: wallFootprint(wall, scene.walls, metadata).map(point => world(wall, point)) }));
  // Both faces of the balcony-side band, from the pier's north face to the south return's outer face.
  for (let y = 877; y <= 1087; y++) for (const x of [388, 416]) {
    assert.ok(solids.some(solid => inside(pixel(x, y), solid.polygon)), `gap in the balcony facade at source pixel [${x},${y}]`);
  }
  // Nothing on that line pokes past the balcony floor edge (x=417 px) into Bedroom 2's balcony door or the balcony.
  const facade = new Set(['wall-divider-tail', 'wall-bedroom-large-balcony', 'wall-bedroom-large-south-return', 'wall-divider-pier']);
  for (const { wall, polygon } of solids) {
    if (![...facade].some(id => wall.id === id || wall.id.startsWith(`${id}:`))) continue;
    for (const point of polygon) assert.ok(point[0] <= pixel(417, 0)[0] + 1e-6, `${wall.id} crosses the balcony floor edge at x=${point[0]}`);
  }
});
