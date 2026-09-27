import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-material-slots-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'material-slots-test-entry', resolveId(id) { if (id.endsWith('material-slots-test-entry')) return '\0material-slots-test-entry'; },
  load(id) { if (id === '\0material-slots-test-entry') return [
    `export * from '${root}/src/core/store.ts';`, `export * from '${root}/src/core/validation.ts';`,
    `export * from '${root}/src/core/material-slots.ts';`, `export * from '${root}/src/render/material-overrides.ts';`, `export * as THREE from 'three';`].join('\n'); },
}], ssr: { noExternal: ['three'] }, build: { ssr: 'material-slots-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
// One bundled three, shared with the test, so `instanceof` holds.
const { EditorStore, validateScene, materialSlotRole, applyMaterialOverrides, THREE } = await import(pathToFileURL(join(output, 'test.mjs')));

const slots = { fronts: ['paint:#3c5646'], handles: ['metal:#c29d5f'], worktop: ['terrazzo#f3eee6'] };
const kitchen = { id: 'kitchen', name: 'Kitchen run', category: 'Kitchen', kind: 'kitchen_counter', dimensions: [2, .9, .6], color: '#3c5646', price: 1, source: { type: 'gltf', url: '/models/k.glb' }, materialSlots: slots };
const plain = { id: 'chair', name: 'Chair', category: 'Seating', kind: 'chair', dimensions: [.5, .9, .5], color: '#888888', price: 1, source: { type: 'procedural' } };
const catalog = [kitchen, plain];
const scene = (objects = [{ id: 'k-run', name: 'Kitchen run', assetId: 'kitchen', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] }]) => ({
  format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', color: '#ffffff', polygon: [[-5, -5], [5, -5], [5, 5], [-5, 5]] }], walls: [], objects });
let serial = 0;
const run = (store, operations) => store.execute({ id: `m-${serial++}`, source: 'designer', label: 'Restyle', baseRevision: store.revision, operations }, true);
const update = (materials, id = 'k-run') => ({ type: 'update', id, patch: { materials } });
const run1 = store => store.scene.objects.find(object => object.id === 'k-run');

test('updates merge per role, null restores a role, and an empty map drops the field', () => {
  const store = new EditorStore(scene(), catalog);
  assert.equal(run(store, [update({ fronts: '#1f3a5f' })]).ok, true);
  assert.equal(run(store, [update({ worktop: '#ffffff' })]).ok, true);
  assert.deepEqual(run1(store).materials, { fronts: '#1f3a5f', worktop: '#ffffff' });
  assert.equal(run(store, [update({ fronts: null })]).ok, true);
  assert.deepEqual(run1(store).materials, { worktop: '#ffffff' });
  assert.equal(run(store, [update({ worktop: null })]).ok, true);
  assert.equal('materials' in run1(store), false);
  assert.deepEqual(run1(store).position, [0, 0, 0]);
});

test('undo and redo step through finishes', () => {
  const store = new EditorStore(scene(), catalog);
  run(store, [update({ fronts: '#1f3a5f' })]);
  run(store, [update({ fronts: '#aa0000', handles: '#000000' })]);
  assert.equal(store.undo().ok, true);
  assert.deepEqual(run1(store).materials, { fronts: '#1f3a5f' });
  assert.equal(store.undo().ok, true);
  assert.equal(run1(store).materials, undefined);
  assert.equal(store.redo().ok, true);
  assert.deepEqual(run1(store).materials, { fronts: '#1f3a5f' });
});

test('unknown roles, bad colours and malformed patches are rejected with a clear message', () => {
  const store = new EditorStore(scene([
    { id: 'k-run', name: 'Kitchen run', assetId: 'kitchen', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] },
    { id: 'c', name: 'Chair', assetId: 'chair', position: [2, 0, 2], rotation: 0, scale: [1, 1, 1] }]), catalog);
  let result = run(store, [update({ doors: '#1f3a5f' })]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /no material slot “doors”.*fronts, handles, worktop/);
  result = run(store, [update({ fronts: 'navy' })]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /"#rrggbb"/);
  result = run(store, [update({ fronts: '#123' })]);
  assert.equal(result.ok, false);
  result = run(store, [update('navy')]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Material patch must map roles/);
  result = run(store, [update({ fronts: '#1f3a5f' }, 'c')]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /no restylable slots/);
  assert.equal(store.revision, 0);
});

test('add accepts materials and the scene validator checks them against the asset', () => {
  const store = new EditorStore(scene([]), catalog);
  const object = { id: 'k2', name: 'Run', assetId: 'kitchen', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1], materials: { fronts: '#1f3a5f' } };
  assert.equal(run(store, [{ type: 'add', object }]).ok, true);
  assert.deepEqual(store.scene.objects[0].materials, { fronts: '#1f3a5f' });
  assert.equal(run(store, [{ type: 'add', object: { ...object, id: 'k3', materials: { plinth: '#000000' } } }]).ok, false);
  assert.equal(validateScene(scene([{ ...object, materials: { fronts: 'blue' } }]), catalog).ok, false);
  assert.equal(validateScene(scene([]), [{ ...kitchen, materialSlots: { fronts: [] } }]).ok, false);
  assert.equal(validateScene(scene([]), [{ ...kitchen, materialSlots: ['paint'] }]).ok, false);
});

test('slot names match exactly and with a Blender copy suffix only', () => {
  assert.equal(materialSlotRole(slots, 'metal:#c29d5f'), 'handles');
  assert.equal(materialSlotRole(slots, 'metal:#c29d5f.001'), 'handles');
  assert.equal(materialSlotRole(slots, 'metal:#c29d5f.1'), undefined);
  assert.equal(materialSlotRole(slots, 'metal:#9a9a9a'), undefined);
});

test('viewport overrides tint only slot materials, keep textures and restore the model colour', () => {
  const texture = new THREE.Texture();
  const fronts = new THREE.MeshStandardMaterial({ name: 'paint:#3c5646', color: '#3c5646' });
  const worktop = new THREE.MeshStandardMaterial({ name: 'terrazzo#f3eee6', color: '#f3eee6', map: texture });
  const handle = new THREE.MeshStandardMaterial({ name: 'metal:#c29d5f.001', color: '#c29d5f' });
  const steel = new THREE.MeshStandardMaterial({ name: 'brushed-steel', color: '#7a7a7a' });
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(), [fronts, worktop]), new THREE.Mesh(new THREE.BoxGeometry(), handle), new THREE.Mesh(new THREE.BoxGeometry(), steel));
  const versions = [fronts, worktop, handle, steel].map(material => material.version);
  assert.equal(applyMaterialOverrides(model, kitchen, { fronts: '#1f3a5f', worktop: '#ffffff', handles: '#000000' }), true);
  assert.equal(fronts.color.getHexString(), '1f3a5f');
  assert.equal(worktop.color.getHexString(), 'ffffff');
  assert.equal(worktop.map, texture);
  assert.equal(handle.color.getHexString(), '000000');
  assert.equal(steel.color.getHexString(), '7a7a7a');
  assert.deepEqual([fronts, worktop, handle, steel].map(material => material.version), versions, 'colour only, no program update');
  applyMaterialOverrides(model, kitchen, { worktop: '#ffffff' });
  assert.equal(fronts.color.getHexString(), '3c5646');
  assert.equal(handle.color.getHexString(), 'c29d5f');
  assert.equal(worktop.color.getHexString(), 'ffffff');
  applyMaterialOverrides(model, kitchen, undefined);
  assert.equal(worktop.color.getHexString(), 'f3eee6');
  assert.equal(applyMaterialOverrides(model, plain, { fronts: '#000000' }), false);
});

test('a grouped piece restyles alone; its group members keep their finishes', () => {
  const store = new EditorStore(scene([
    { id: 'k-run', name: 'Kitchen run', assetId: 'kitchen', position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] },
    { id: 'k-2', name: 'Kitchen run 2', assetId: 'kitchen', position: [3, 0, 0], rotation: 0, scale: [1, 1, 1] }]), catalog);
  assert.equal(run(store, [{ type: 'group', id: 'kitchen-group', objectIds: ['k-run', 'k-2'] }]).ok, true);
  assert.equal(run(store, [{ type: 'update', id: 'k-run', patch: { materials: { fronts: '#1f3a5f' }, position: [1, 0, 0] } }]).ok, true);
  assert.deepEqual(run1(store).materials, { fronts: '#1f3a5f' });
  const member = store.scene.objects.find(object => object.id === 'k-2');
  assert.equal(member.materials, undefined);
  assert.deepEqual(member.position, [4, 0, 0]);
});
