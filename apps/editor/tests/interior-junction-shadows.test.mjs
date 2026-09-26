import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-junction-shadows-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', ssr: { noExternal: ['three'] }, plugins: [{
  name: 'junction-shadows-entry', resolveId(id) { if (id.endsWith('junction-shadows-entry')) return '\0junction-shadows-entry'; },
  load(id) { if (id === '\0junction-shadows-entry') return `export * from '${root}/src/render/sun-occluders.ts'; export * from '${root}/src/core/wall-junctions.ts'; export * as THREE from 'three';`; },
}], build: { ssr: 'junction-shadows-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { SunOccluders, normalizeWallJunctions, THREE } = await import(pathToFileURL(join(output, 'test.mjs')));
const source = JSON.parse(await readFile(join(root, '../../apartments/m6-12-54/scene.json'), 'utf8'));
const scene = normalizeWallJunctions(source);

test('the M6 repaired outside corner also blocks light in the hidden physical shell', () => {
  const shell = new SunOccluders(); shell.setScene(scene);
  // Invisible occluders intentionally opt out of UI picking; inspect their actual triangles.
  shell.group.traverse(object => { if (object instanceof THREE.Mesh) object.raycast = THREE.Mesh.prototype.raycast; });
  const ray = new THREE.Raycaster(new THREE.Vector3(-4.38, 1.3, .9), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObject(shell.group, true);
  assert.ok(hits.some(hit => Math.abs(hit.point.z - (.721649 + .164948 / 2)) < 1e-6), 'the former missing quadrant is shadowed at its physical wall face');
  shell.dispose();
});

test('repeated opening previews dispose replaced wall prisms without disposing live shared frame boxes', () => {
  const shell = new SunOccluders(); shell.setScene(scene);
  const geometries = new Map();
  const track = () => shell.group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || geometries.has(object.geometry)) return;
    geometries.set(object.geometry, 0);
    object.geometry.addEventListener('dispose', () => geometries.set(object.geometry, geometries.get(object.geometry) + 1));
  });
  track();
  const originalCount = geometries.size;
  const door = scene.walls.flatMap(wall => wall.openings).find(opening => opening.id === 'door-bedroom-large');
  for (let i = 0; i < 4; i++) { shell.previewOpeningOffset(door.id, door.offset + (i + 1) * .001); track(); }
  assert.ok(geometries.size > originalCount);
  assert.ok([...geometries].some(([, count]) => count === 1), 'old prisms released on each preview');
  shell.group.traverse(object => { if (object instanceof THREE.Mesh) assert.equal(geometries.get(object.geometry), 0, 'live prisms and shared boxes remain valid'); });
  shell.dispose();
  assert.ok([...geometries.values()].every(count => count === 1), 'all owned geometry releases exactly once');
});
