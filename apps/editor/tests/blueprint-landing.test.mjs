import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-blueprint-landing-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'blueprint-landing-test-entry',
  resolveId(id) { if (id.endsWith('blueprint-landing-test-entry')) return '\0blueprint-landing-test-entry'; },
  load(id) { if (id === '\0blueprint-landing-test-entry') return `export * from '${root}/src/portal/blueprint-evidence.ts'; export { migrateScene } from '${root}/src/core/renovation.ts'; export { parseScene, serializeScene } from '${root}/src/core/persistence.ts';`; },
}], build: { ssr: 'blueprint-landing-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const { retainBlueprintEvidence, blueprintTransportFiles, validateBlueprintFile, migrateScene, parseScene, serializeScene,
  BLUEPRINT_FILE_LIMIT, BLUEPRINT_TOTAL_LIMIT } = await import(pathToFileURL(join(output, 'test.mjs')));

const shell = () => ({ format: 'varpet.editor', version: 1, id: 'uploaded-home', name: 'Uploaded home', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', color: '#ffffff', polygon: [[0,0], [5,0], [5,4], [0,4]] }], walls: [], objects: [] });
const file = (name = 'plan.png', bytes = new Uint8Array([0, 255, 128, 10]), type = 'image/png') => new File([bytes], name, { type });
const dataUrl = async source => `data:${source.type};base64,${Buffer.from(await source.arrayBuffer()).toString('base64')}`;

// These exercise the upload-to-project boundary, including the existing authoritative parser.
test('uploaded plan and photos retain exact original bytes through editor save and reopen', async () => {
  const input = shell(), before = structuredClone(input);
  const plan = file('My floor plan.png'), photo = file('Kitchen <morning>.webp', new Uint8Array([15, 10, 0, 129, 253]), 'image/webp');
  const result = await retainBlueprintEvidence(input, plan, [photo]);
  assert.deepEqual(input, before, 'attaching evidence must not mutate the service response');
  assert.equal(result.version, 2);
  assert.deepEqual(result.rooms, input.rooms);
  const reopened = parseScene(serializeScene(result), []);
  assert.deepEqual(reopened.project.sources.map(({ name, kind, dataUrl }) => ({ name, kind, dataUrl })), [
    { name: plan.name, kind: 'plan', dataUrl: await dataUrl(plan) },
    { name: photo.name, kind: 'photo', dataUrl: await dataUrl(photo) },
  ]);
  assert.notEqual(reopened.project.sources[0].id, reopened.project.sources[1].id);
});

test('existing evidence and reviewed project metadata survive upload attachment independently', async () => {
  const input = migrateScene(shell());
  input.project.metadata.room = { phase: 'existing', zone: 'interior', review: 'confirmed' };
  input.project.sources.push({ id: 'measurement', name: 'Laser measure', kind: 'measurement', notes: 'Room width 5 m' });
  const before = structuredClone(input), result = await retainBlueprintEvidence(input, file(), []);
  assert.deepEqual(input, before);
  assert.deepEqual(result.project.metadata, input.project.metadata);
  assert.deepEqual(result.project.sources[0], input.project.sources[0]);
  result.project.metadata.room.phase = 'new';
  result.project.sources[0].notes = 'changed';
  assert.deepEqual(input, before, 'result must own an independent copy of all project data');
});

test('reattaching the same original does not duplicate existing plan evidence', async () => {
  const plan = file(), first = await retainBlueprintEvidence(shell(), plan, []);
  const second = await retainBlueprintEvidence(first, plan, []);
  assert.deepEqual(second, first);
  const asPhoto = await retainBlueprintEvidence(first, plan, [plan]);
  assert.deepEqual(asPhoto.project.sources.map(source => source.kind), ['plan', 'photo'], 'a photo role remains distinct');
});

test('unsupported, empty and oversized uploads fail before reading their bytes', async () => {
  assert.equal(BLUEPRINT_FILE_LIMIT, 2_000_000);
  assert.equal(BLUEPRINT_TOTAL_LIMIT, 12_000_000);
  for (const invalid of [file('bad.pdf', new Uint8Array([1]), 'application/pdf'), file('empty.png', new Uint8Array()), file('large.png', new Uint8Array(BLUEPRINT_FILE_LIMIT + 1))]) {
    let reads = 0;
    invalid.arrayBuffer = async () => { reads++; return new ArrayBuffer(0); };
    assert.throws(() => validateBlueprintFile(invalid));
    await assert.rejects(retainBlueprintEvidence(shell(), invalid, []));
    assert.equal(reads, 0);
  }
});

test('exact upload byte limits fit the existing encoded evidence and parser limits', async () => {
  const uploads = Array.from({ length: 6 }, (_, i) => file(`${i}.png`, new Uint8Array(BLUEPRINT_FILE_LIMIT).fill(i)));
  const result = await retainBlueprintEvidence(shell(), uploads[0], uploads.slice(1));
  assert.equal(result.project.sources.length, 6);
  assert.ok(result.project.sources.every(source => source.dataUrl.length < 3_000_000));
  assert.ok(result.project.sources.reduce((total, source) => total + source.dataUrl.length, 0) < 18_000_000);
  assert.equal(parseScene(serializeScene(result), []).project.sources.length, 6);
  await assert.rejects(retainBlueprintEvidence(shell(), uploads[0], [...uploads.slice(1), file('extra.png', new Uint8Array([1]))]), /12 MB/);
});

test('photo-count and combined existing evidence limits reject without changing service state', async () => {
  await assert.rejects(retainBlueprintEvidence(shell(), file(), Array.from({ length: 11 }, () => file('photo.jpg', new Uint8Array([1]), 'image/jpeg'))), /10 room photos/);
  const input = migrateScene(shell());
  input.project.sources = Array.from({ length: 32 }, (_, i) => ({ id: `measure-${i}`, kind: 'measurement', name: `Measure ${i}` }));
  const before = structuredClone(input);
  await assert.rejects(retainBlueprintEvidence(input, file(), []), /too much attached evidence/);
  assert.deepEqual(input, before);
  const large = migrateScene(shell());
  large.project.sources = Array.from({ length: 6 }, (_, i) => ({ id: `old-plan-${i}`, kind: 'plan', name: `Old plan ${i}`, dataUrl: `data:image/png;base64,${Buffer.alloc(2_200_000, i).toString('base64')}` }));
  const totalBefore = large.project.sources.reduce((sum, source) => sum + source.dataUrl.length, 0);
  await assert.rejects(retainBlueprintEvidence(large, file('new.png', new Uint8Array(500_000).fill(10)), []), /too much attached evidence/);
  assert.equal(large.project.sources.length, 6);
  assert.equal(large.project.sources.reduce((sum, source) => sum + source.dataUrl.length, 0), totalBefore);
});

test('long uploaded filenames become valid evidence names without changing original bytes', async () => {
  const source = file('a'.repeat(160) + '.png');
  const result = await retainBlueprintEvidence(shell(), source, []);
  assert.equal(result.project.sources[0].name.length, 120);
  assert.equal(result.project.sources[0].dataUrl, await dataUrl(source));
  assert.equal(parseScene(serializeScene(result), []).project.sources.length, 1);
});

test('transport names cannot overwrite the blueprint when originals collide after server sanitizing and truncation', async () => {
  const same = 'a'.repeat(160) + '.png';
  const originals = [file(same, new Uint8Array([1, 2])), file(same, new Uint8Array([3, 4])),
    file('kitchen?.png', new Uint8Array([5, 6]), 'image/jpeg'), file('kitchen*.png', new Uint8Array([7, 8]), 'image/webp')];
  const namesBefore = originals.map(source => source.name), bytesBefore = await Promise.all(originals.map(source => source.arrayBuffer()));
  const transport = blueprintTransportFiles(originals[0], originals.slice(1));
  const sent = [transport.plan, ...transport.photos];
  const storedNames = sent.map(source => source.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80));
  assert.equal(new Set(storedNames).size, originals.length);
  assert.deepEqual(storedNames, ['floor-plan.png', 'room-photo-1.png', 'room-photo-2.jpg', 'room-photo-3.webp']);
  for (let i = 0; i < originals.length; i++) {
    assert.notEqual(sent[i], originals[i]);
    assert.deepEqual(await sent[i].arrayBuffer(), bytesBefore[i]);
    assert.equal(sent[i].type, originals[i].type);
    assert.equal(sent[i].lastModified, originals[i].lastModified);
  }
  assert.deepEqual(originals.map(source => source.name), namesBefore);
  assert.deepEqual(await Promise.all(originals.map(source => source.arrayBuffer())), bytesBefore);
});
