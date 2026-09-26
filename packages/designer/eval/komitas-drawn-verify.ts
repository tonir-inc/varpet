/** Recheck the published developer-drawn artifacts through the real proposal and editor gates. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { proposalToEditor } from '../src/editor-bridge.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
const directory = fileURLToPath(new URL('./komitas/', import.meta.url));
const json = (path: string) => JSON.parse(readFileSync(resolve(directory, path), 'utf8'));
const ids = ['b20-t11', 'b21-t13', 'b25-t72', 'b28-t31', 'b30-t35', 'b31-t46'];
const inventory = json('../komitas-drawn.inventory.json');
let drawn = 0, placed = 0;
for (const id of ids) {
 const shell = json(`../komitas-drawn-inputs/${id}.scene.json`), scene = json(`${id}.drawn.scene.json`);
 const catalog = json(`${id}.drawn.catalog.json`).assets, audit = json(`${id}.drawn.audit.json`);
 assert.deepEqual(new EditorStore(scene, catalog).scene, scene);
 const proposal = proposalToEditor(audit.proposal, shell, 0, { catalog, catalogCurrency: 'AMD', doorSwings: audit.door_swings });
 const store = new EditorStore(shell, catalog), result = store.execute(proposal.command, true);
 assert.equal(result.ok, true, JSON.stringify(result.errors));
 assert.deepEqual(scene.objects, store.scene.objects);
 assert.deepEqual(scene.rooms, shell.rooms);
 assert.deepEqual(scene.walls, shell.walls);
 assert.deepEqual(scene.project, store.scene.project);
 assert.equal(audit.drawn, audit.items.length);
 assert.deepEqual(audit.items.map((item: {id: string}) => item.id).sort(), inventory.flats.find((flat: {id: string}) => flat.id === id).items.map((item: {id: string}) => item.id).sort());
 assert.equal(audit.placed, scene.objects.length);
 const added = audit.items.filter((item: {status: string}) => item.status === 'placed');
 assert.equal(added.length, scene.objects.length);
 assert.equal(audit.cost_amd, added.reduce((sum: number, item: {price_amd: number}) => sum + item.price_amd, 0));
 for (const object of scene.objects) {
  assert.deepEqual(object.scale, [1, 1, 1]);
  const item = added.find((item: {id: string}) => `drawn-${item.id}` === object.id);
  assert.ok(item);
  assert.ok(item.nudge_m <= .60000001);
  assert.deepEqual(object.position, [item.placed_position[0], 0, -item.placed_position[1]]);
  assert.ok(Math.abs(object.rotation - item.placed_rotation * Math.PI / 180) < 1e-9);
  assert.ok(Math.abs(item.nudge_m - Math.hypot(item.placed_position[0] - item.drawn_position[0], item.placed_position[1] - item.drawn_position[1])) < 1e-9);
  const asset = catalog.find((asset: {id: string}) => asset.id === object.assetId);
  assert.equal(asset.source.type, 'gltf');
  assert.equal(item.sku, asset.id);
  assert.equal(item.price_amd, asset.price);
 }
 if (!process.argv.includes('--without-captures')) {
  const capture = json(`${id}-drawn-capture.json`);
  assert.equal(capture.complete, true);
  assert.deepEqual(capture.page_errors, []);
  assert.deepEqual(capture.failed_requests, []);
  assert.deepEqual([...new Set(capture.loaded_assets)].sort(), [...new Set(scene.objects.map((o: {assetId: string}) => o.assetId))].sort());
  for (const view of ['top', '3d']) assert.equal(readFileSync(resolve(directory, `${id}-drawn-${view}.png`)).subarray(0,8).toString('hex'), '89504e470d0a1a0a');
 }
 drawn += audit.drawn; placed += audit.placed;
 console.log(`${id}: ${audit.placed}/${audit.drawn} placed; ${audit.cost_amd} AMD; EditorStore accepted; shell unchanged`);
}
console.log(`PASS: ${ids.length} flats; ${placed}/${drawn} placed; checked proposals and EditorStore${process.argv.includes('--without-captures') ? '' : '; 12 rendered screenshots'}`);
