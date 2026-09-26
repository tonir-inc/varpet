import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-wall-render-junctions-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', ssr: { noExternal: ['three'] }, plugins: [{
  name: 'wall-render-junctions-entry', resolveId(id) { if (id.endsWith('wall-render-junctions-entry')) return '\0wall-render-junctions-entry'; },
  load(id) { if (id === '\0wall-render-junctions-entry') return `export * from '${root}/src/render/wall-geometry.ts'; export * from '${root}/src/render/structure.ts'; export * from '${root}/src/render/assets.ts'; export * from '${root}/src/core/wall-junctions.ts'; export * as THREE from 'three';`; },
}], build: { ssr: 'wall-render-junctions-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { wallFootprint, wallPrismGeometry, makeStructure, disposeObject, normalizeWallJunctions, THREE } = await import(pathToFileURL(join(output, 'test.mjs')));
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) } });
const wall = (id, start, end, thickness = .2) => ({ id, start, end, height: 2.8, thickness, color: '#ffffff', openings: [] });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const world = (wall, [x, z]) => {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const ux = (wall.end[0] - wall.start[0]) / length, uz = (wall.end[1] - wall.start[1]) / length;
  return [wall.start[0] + ux * x - uz * z, wall.start[1] + uz * x + ux * z];
};
const matchingPoint = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
const sample = (projection, origin, direction) => {
  projection.updateWorldMatrix(true, true);
  const hit = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction)).intersectObject(projection, true)[0];
  assert.ok(hit?.face, `No surface at ${origin}`);
  return { hit, surface: hit.object.userData.finishSurfaces?.[hit.face.materialIndex] };
};

test('unequal walls meet at the outer miter for either orientation and arbitrary corner angle', () => {
  for (const angle of [Math.PI / 6, Math.PI / 2, Math.PI * .76]) for (const reversed of [false, true]) {
    const walls = [wall('a', [0, 0], [4, 0], .2), wall('b', [0, 0], [4 * Math.cos(angle), 4 * Math.sin(angle)], .32)];
    if (reversed) for (const item of walls) [item.start, item.end] = [item.end, item.start];
    const footprints = walls.map(item => wallFootprint(item, walls).map(point => world(item, point)));
    assert.ok(footprints[0].some(a => footprints[1].some(b => matchingPoint(a, b))), 'the two outer faces share their exact corner');
    for (let i = 0; i < walls.length; i++) {
      const footprint = wallFootprint(walls[i], walls);
      assert.ok(footprint[1][0] > footprint[0][0] && footprint[2][0] > footprint[3][0], 'positive face lengths');
    }
  }
});

test('disconnected, vertically separate and removed walls cannot pull a corner into a false join', () => {
  const a = wall('a', [0, 0], [4, 0]), b = wall('b', [0, 0], [0, 4]);
  const plain = wallFootprint(a, [a]);
  assert.deepEqual(wallFootprint(a, [a, { ...b, start: [.001, .001] }]), plain);
  assert.deepEqual(wallFootprint(a, [a, b], { b: { elevation: 3 } }), plain);
  assert.deepEqual(wallFootprint(a, [a, b], { b: { phase: 'remove' } }), plain);
  assert.deepEqual(wallFootprint(a, [a, { ...b, height: 1.2 }]), plain);
});

test('almost straight unequal-width and acute joins keep a bounded solid instead of remote miter spikes', () => {
  for (const degrees of [179.9, 179.99, .1, .01]) for (const reversed of [false, true]) {
    const angle = degrees * Math.PI / 180;
    const walls = [wall('a', [0, 0], [4, 0], .2), wall('b', [0, 0], [4 * Math.cos(angle), 4 * Math.sin(angle)], .3)];
    if (reversed) for (const item of walls) [item.start, item.end] = [item.end, item.start];
    const saved = JSON.stringify(walls);
    for (const item of walls) {
      const footprint = wallFootprint(item, walls);
      assert.deepEqual(footprint, wallFootprint(item, [item]), `${degrees}° uses its finite original butt endpoint`);
      for (const [x, z] of footprint) {
        assert.ok(Number.isFinite(x) && Number.isFinite(z));
        assert.ok(x >= -.6 && x <= 4.6, `${degrees}° stays within the miter limit`);
      }
    }
    assert.equal(JSON.stringify(walls), saved);
  }
});

test('T joins and short returns retain positive solid coverage without pushing a corner into an opening', () => {
  const host = wall('host', [-2, 0], [2, 0], .3), branch = wall('branch', [0, 0], [0, 3]);
  const branchFootprint = wallFootprint(branch, [host, branch]);
  near(branchFootprint[0][0], host.thickness / 2); near(branchFootprint[3][0], host.thickness / 2);
  const walls = [wall('short', [0, 0], [.05, 0]), wall('a', [0, 0], [0, 3], .3), wall('b', [.05, 0], [.05, 3], .3)];
  const footprint = wallFootprint(walls[0], walls);
  assert.ok(footprint[1][0] > footprint[0][0] && footprint[2][0] > footprint[3][0]);
  const geometry = wallPrismGeometry(footprint, 0, 2.8, .01, .04);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) assert.ok(positions.getX(i) >= .01 - 1e-6 && positions.getX(i) <= .04 + 1e-6);
  geometry.dispose();
});

test('a door beginning at a T junction cannot remove the neighbouring solid corner', () => {
  const left = wall('left', [-4, 0], [0, 0], .3), right = wall('right', [0, 0], [4, 0], .3), branch = wall('branch', [0, 0], [0, 3], .2);
  right.openings = [{ id: 'door', kind: 'door', offset: 0, width: 1, height: 2.1, sill: 0 }];
  const walls = [left, right, branch];
  const contains = (polygon, [x, z]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const solids = [left, branch].map(item => wallFootprint(item, walls).map(point => world(item, point)));
  assert.ok(solids.some(polygon => contains(polygon, [-.02, .10])), 'the corner beside the doorway remains solid below the lintel');
  assert.ok(solids.every(polygon => !contains(polygon, [.5, 0])), 'retained corner overlap does not fill the door passage');
  const shell = makeStructure({ format: 'varpet.editor', version: 1, id: 'junction-door', name: 'Junction door', units: 'm', upAxis: 'Y', rooms: [], walls, objects: [] });
  const fullWalls = walls.map(item => shell.entities.get(item.id).children[0]);
  shell.group.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster(new THREE.Vector3(.5, 1, -1), new THREE.Vector3(0, 0, 1));
  assert.equal(ray.intersectObjects(fullWalls, true).length, 0, 'the rendered opening remains clear at door height');
  disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
});

test('M6 bedroom entrance corner has continuous painted faces and skirting in full and cutaway projections', async () => {
  const source = JSON.parse(await readFile(join(root, '../../apartments/m6-12-54/scene.json'), 'utf8'));
  const scene = normalizeWallJunctions(source), saved = JSON.stringify(scene);
  const shell = makeStructure(scene);
  const cornerWall = scene.walls.find(item => matchingPoint(item.end, [-4.319588, .721649]) && item.start[0] === item.end[0]);
  assert.ok(cornerWall);
  for (const [index, y] of [[0, 1.3], [1, .2]]) {
    const vertical = shell.entities.get(cornerWall.id).children[index];
    const horizontal = shell.entities.get('wall-bedroom-large-entry').children[index];
    assert.equal(sample(vertical, [-4.8, y, .77], [1, 0, 0]).surface, 'wall-front');
    assert.equal(sample(horizontal, [-4.36, y, 1.1], [0, 0, -1]).surface, 'wall-front');
    const verticalTrim = sample(vertical, [-4.8, .03, .81], [1, 0, 0]);
    const horizontalTrim = sample(horizontal, [-4.41, .03, 1.1], [0, 0, -1]);
    assert.equal(verticalTrim.surface, undefined); assert.equal(horizontalTrim.surface, undefined);
    near(verticalTrim.hit.point.x, -4.319588 - .175258 / 2 - .0125);
    near(horizontalTrim.hit.point.z, .721649 + .164948 / 2 + .0125);
  }
  assert.equal(JSON.stringify(scene), saved, 'the renderer does not edit the measured scene');
  disposeObject(shell.group); disposeObject(shell.ceilings); disposeObject(shell.dimensions);
});
