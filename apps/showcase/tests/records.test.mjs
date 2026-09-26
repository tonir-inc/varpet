import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRecords, planFile } from '../server/data.mjs';

test('missing Komitas inputs returns no invented flats', async () => {
  assert.deepEqual(await loadRecords('/not/a/directory'), []);
});
test('loads real shell, ground truth and furnished result as separate states', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'showcase-'));
  try {
    await writeFile(join(dir, 'ground-truth.json'), JSON.stringify({ flats: [{ id: 'b31-t50', area_m2: 62.8, rooms: 2 }] }));
    await writeFile(join(dir, 'b31-t50.scene.json'), JSON.stringify({ format: 'varpet.editor', id: 'shell', objects: [] }));
    await writeFile(join(dir, 'b31-t50.furnished.scene.json'), JSON.stringify({ format: 'varpet.editor', id: 'shell', objects: [{ id: 'chair' }] }));
    await writeFile(join(dir, 'b31-t50.conversation.json'), JSON.stringify({ requests: ['Make a place to read'], catalogCurrency: 'AMD' }));
    await writeFile(join(dir, 'b31-t50.catalog.json'), '[]');
    const records = await loadRecords(dir);
    assert.equal(records.length, 1); assert.equal(records[0].id, 'b31-t50');
    assert.equal(records[0].facts.area_m2, 62.8); assert.equal(records[0].shell.objects.length, 0);
    assert.equal(records[0].furnished.objects.length, 1); assert.deepEqual(records[0].conversation.requests, ['Make a place to read']);
  } finally { await rm(dir, { recursive: true }); }
});
test('local plans allow only flat IDs and supported image extensions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'showcase-plans-'));
  try {
    await writeFile(join(dir, 'b31-t50.jpg'), 'private image');
    assert.equal(await planFile(dir, 'b31-t50'), join(dir, 'b31-t50.jpg'));
    assert.equal(await planFile(dir, '../secret'), null); assert.equal(await planFile(dir, 'missing'), null);
  } finally { await rm(dir, { recursive: true }); }
});

test('uses the latest completed BENCH run with its exact final catalog, ignoring in-progress runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'showcase-bench-')), dir = join(root, 'komitas'), runs = join(root, 'komitas-runs');
  try {
    await mkdir(dir); await mkdir(runs);
    await writeFile(join(dir, 'b31-t50.scene.json'), JSON.stringify({ objects: [] }));
    for (const [name, finished] of [['old', '2026-09-26T12:00:00Z'], ['new', '2026-09-26T12:01:00Z'], ['pending', null]]) {
      const runDir = join(runs, name); await mkdir(runDir);
      await writeFile(join(runDir, 'run.json'), JSON.stringify({ id: 'b31-t50', finished_at: finished, catalogCurrency: 'AMD', rows: [{ request: name }] }));
      await writeFile(join(runDir, 'final.json'), JSON.stringify({ scene: { objects: [{ id: name }] }, catalog: [{ id: name }] }));
    }
    const [flat] = await loadRecords(dir);
    assert.equal(flat.furnished.objects[0].id, 'new');
    assert.equal(flat.catalog[0].id, 'new');
    assert.deepEqual(flat.conversation.requests, ['new']);
    assert.equal(flat.conversation.catalogCurrency, 'AMD');
  } finally { await rm(root, { recursive: true }); }
});

test('plan availability is explicit and only true for a supplied local original', async () => {
  const root = await mkdtemp(join(tmpdir(), 'showcase-plan-availability-'));
  try {
    const dir = join(root, 'data'), plans = join(root, 'plans');
    await mkdir(dir); await mkdir(plans);
    await writeFile(join(dir, 'ground-truth.json'), JSON.stringify([{ id: 'present' }, { id: 'absent' }]));
    await writeFile(join(plans, 'present.png'), 'local original');
    const local = await loadRecords(dir, plans);
    assert.equal(local.find(flat => flat.id === 'present').planAvailable, true);
    assert.equal(local.find(flat => flat.id === 'absent').planAvailable, false);
    assert.ok((await loadRecords(dir)).every(flat => flat.planAvailable === false));
  } finally { await rm(root, { recursive: true }); }
});

test('loads drawn-only residences with their frozen catalog and a compact omissions audit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'showcase-drawn-'));
  try {
    await writeFile(join(dir, 'b1-t2.drawn.scene.json'), JSON.stringify({ objects: [{ id: 'drawn-chair' }] }));
    await writeFile(join(dir, 'b1-t2.drawn.catalog.json'), JSON.stringify({ currency: 'AMD', assets: [{ id: 'drawn-sku' }] }));
    await writeFile(join(dir, 'b1-t2.drawn.audit.json'), JSON.stringify({ drawn: 2, placed: 1, proposal: { private: 'large raw trace' }, items: [
      { status: 'placed', role: 'chair' }, { status: 'not_placed', role: 'wardrobe', name: 'Wardrobe', reason: 'No legal pose', attempts: ['large trace'] },
    ] }));
    const [flat] = await loadRecords(dir);
    assert.equal(flat.id, 'b1-t2'); assert.equal(flat.shell, null);
    assert.equal(flat.drawn.objects[0].id, 'drawn-chair');
    assert.equal(flat.drawnCatalog.assets[0].id, 'drawn-sku');
    assert.deepEqual(flat.drawnAudit, { drawn: 2, placed: 1, omitted: [{ role: 'wardrobe', name: 'Wardrobe', reason: 'No legal pose' }] });
    assert.deepEqual(flat.catalog, []);
  } finally { await rm(dir, { recursive: true }); }
});
