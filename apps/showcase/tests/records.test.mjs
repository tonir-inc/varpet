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
