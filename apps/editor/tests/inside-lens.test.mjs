import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-inside-lens-'));
after(() => rm(output, { recursive: true, force: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', ssr: { noExternal: ['three'] }, plugins: [{
  name: 'inside-lens-entry', resolveId(id) { if (id.endsWith('inside-lens-entry')) return '\0inside-lens-entry'; },
  load(id) { if (id === '\0inside-lens-entry') return `export * from '${root}/src/render/walkthrough-camera.ts'; export * as THREE from 'three';`; },
}], build: { ssr: 'inside-lens-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { configureInsideCamera, DEFAULT_INSIDE_LENS, isInsideLens, THREE } = await import(pathToFileURL(join(output, 'test.mjs')));

const limits = { standard: [65, 95], photo: [80, 95], wide: [85, 105] };
const aspects = [9 / 16, 1, 1.2, 4 / 3, 16 / 9, 21 / 9, 32 / 9];
const horizontalFov = camera => THREE.MathUtils.radToDeg(2 * Math.atan(camera.getViewSize(1, new THREE.Vector2()).x / 2));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);

test('lens choices accept only the supported names and the editor starts with photo framing', () => {
  assert.equal(DEFAULT_INSIDE_LENS, 'photo');
  for (const lens of Object.keys(limits)) assert.equal(isInsideLens(lens), true);
  for (const value of ['', 'Photo', 'ultrawide', '__proto__', 'constructor', 'toString', null, undefined, 0, {}, ['photo'], Symbol('photo')]) {
    assert.equal(isInsideLens(value), false, `rejects ${String(value)}`);
  }
});

test('photo reveals more of the room at the screenshot aspect, and wide reveals more again', () => {
  const cameras = Object.fromEntries(Object.keys(limits).map(lens => {
    const camera = new THREE.PerspectiveCamera(60, 1, .03, 250);
    camera.position.set(0, 1.65, 0); camera.lookAt(0, 1.65, -1);
    configureInsideCamera(camera, 1.2, lens); camera.updateMatrixWorld(true);
    return [lens, camera];
  }));
  // Fixed landmarks on a wall four metres ahead: framing changes, their physical positions do not.
  const wallEdge = new THREE.Vector3(3.6, 1.65, -4);
  const outerEdge = new THREE.Vector3(4.2, 1.65, -4);
  assert.ok(wallEdge.clone().project(cameras.standard).x > 1, 'standard crops the near wall edge');
  assert.ok(wallEdge.clone().project(cameras.photo).x < 1, 'photo reveals that same wall edge');
  assert.ok(outerEdge.clone().project(cameras.photo).x > 1, 'photo still crops the outer edge');
  assert.ok(outerEdge.clone().project(cameras.wide).x < 1, 'wide reveals the outer edge');
  assert.ok(horizontalFov(cameras.photo) > horizontalFov(cameras.standard));
  assert.ok(horizontalFov(cameras.wide) > horizontalFov(cameras.photo));
});

test('resizing each lens respects both field limits and preserves the standing pose and clipping distances', () => {
  const camera = new THREE.PerspectiveCamera(42, 1, .015, 137);
  camera.position.set(4, 2.05, 3); camera.lookAt(2, 1.8, -3);
  const position = camera.position.clone(), orientation = camera.quaternion.clone();
  for (const [lens, [maxVertical, maxHorizontal]] of Object.entries(limits)) {
    for (const aspect of aspects) {
      camera.zoom = 2;
      configureInsideCamera(camera, aspect, lens);
      const vertical = camera.getEffectiveFOV(), horizontal = horizontalFov(camera);
      assert.ok(vertical > 0 && vertical <= maxVertical + 1e-8, `${lens} vertical limit at ${aspect}`);
      assert.ok(horizontal > 0 && horizontal <= maxHorizontal + 1e-8, `${lens} horizontal limit at ${aspect}`);
      assert.ok(Math.abs(vertical - maxVertical) < 1e-8 || Math.abs(horizontal - maxHorizontal) < 1e-8,
        `${lens} fills the available view up to one lens limit at ${aspect}`);
      assert.equal(camera.aspect, aspect); assert.equal(camera.zoom, 1);
      assert.ok(camera.position.equals(position), 'lens changes preserve eye height and horizontal position');
      assert.ok(camera.quaternion.equals(orientation), 'lens changes preserve look direction');
      assert.equal(camera.near, .015); assert.equal(camera.far, 137);
      const projection = camera.projectionMatrix.clone();
      configureInsideCamera(camera, aspect, lens);
      assert.ok(camera.projectionMatrix.equals(projection), 'reapplying a lens is stable');
    }
  }
});

test('omitting the optional lens retains the existing standard framing across viewport shapes', () => {
  for (const aspect of aspects) {
    const implicit = new THREE.PerspectiveCamera(), standard = new THREE.PerspectiveCamera();
    configureInsideCamera(implicit, aspect); configureInsideCamera(standard, aspect, 'standard');
    assert.ok(implicit.projectionMatrix.equals(standard.projectionMatrix));
    if (aspect <= 4 / 3) near(implicit.getEffectiveFOV(), 65, 'standard vertical field');
    else near(horizontalFov(implicit), 95, 'standard horizontal field');
  }
});

test('invalid lens names and viewport aspects fall back without corrupting the projection', () => {
  for (const lens of ['unknown', '__proto__', 'constructor', '', null, undefined, {}, Symbol('photo')]) {
    const camera = new THREE.PerspectiveCamera(), standard = new THREE.PerspectiveCamera();
    configureInsideCamera(camera, 1.2, lens); configureInsideCamera(standard, 1.2, 'standard');
    assert.ok(camera.projectionMatrix.equals(standard.projectionMatrix), `safe lens fallback for ${String(lens)}`);
  }
  for (const lens of Object.keys(limits)) {
    const square = new THREE.PerspectiveCamera(); configureInsideCamera(square, 1, lens);
    for (const aspect of [0, -1, Infinity, -Infinity, NaN, undefined, null]) {
      const camera = new THREE.PerspectiveCamera(); configureInsideCamera(camera, aspect, lens);
      assert.equal(camera.aspect, 1);
      assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
      assert.ok(camera.projectionMatrix.equals(square.projectionMatrix), `${lens} uses safe square framing for ${aspect}`);
    }
  }
});
