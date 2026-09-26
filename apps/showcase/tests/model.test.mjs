import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = await mkdtemp(join(tmpdir(), 'showcase-model-')); after(() => rm(out, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: { ssr: join(root, 'src/model.ts'), outDir: out, rolldownOptions: { output: { entryFileNames: 'model.mjs' } } } });
const { buildFlats, makeFlat, exampleFlat, initialState, collectionDescription } = await import(pathToFileURL(join(out, 'model.mjs')));
test('Avani is an explicit example with unquoted currency, not a Komitas or model result', () => {
  const [flat] = buildFlats([]); assert.equal(flat.example, true); assert.equal(flat.id, 'avani');
  assert.equal(flat.shell.objects.length, 0); assert.equal(flat.total, null); assert.deepEqual(flat.requests, []);
});
test('prices require explicit AMD and count only added pieces; factual room counts do not include inferred service rooms', () => {
  const example = exampleFlat(), furnished = structuredClone(example.furnished); furnished.objects = furnished.objects.slice(0, 1);
  const data = { id: 'b1-t2', shell: example.shell, furnished, facts: { area_m2: 78.4, rooms: 2 }, catalog: example.catalog, conversation: { requests: ['Make it cozier'] } };
  assert.equal(makeFlat(data).total, null);
  const flat = makeFlat({ ...data, conversation: { ...data.conversation, catalogCurrency: 'AMD' } });
  assert.equal(flat.pieces.length, 1); assert.equal(flat.total, example.catalog.find(a => a.id === furnished.objects[0].assetId).price);
  assert.equal(flat.area, 78.4); assert.equal(flat.rooms, 2);
});
test('missing catalog does not pretend a furnished state is ready', () => {
  const example = exampleFlat();
  const flat = makeFlat({ id: 'b1-t2', shell: example.shell, furnished: example.furnished, facts: {}, catalog: [], conversation: null });
  assert.equal(flat.furnished, null); assert.equal(flat.total, null); assert.match(flat.issue, /furniture records/);
});

test('partial deliveries choose the available view and never advertise an absent example', () => {
  const example = exampleFlat();
  const furnishedOnly = { ...example, shell: null, example: false };
  assert.equal(initialState(furnishedOnly, 'shell'), 'furnished');
  assert.equal(initialState(example, 'furnished'), 'furnished');
  assert.equal(initialState({ ...example, furnished: null }, 'furnished'), 'shell');
  const [pending] = buildFlats([{ id: 'b1-t2', facts: { rooms: 2 }, shell: null, furnished: null, catalog: [], conversation: null }]);
  assert.equal(pending.shell, null);
  assert.doesNotMatch(collectionDescription([pending]), /Avani/);
  assert.match(collectionDescription([example]), /Avani/);
});

test('recorded request outcomes distinguish applied proposals, questions and declines', () => {
  const example = exampleFlat();
  const flat = makeFlat({ id: 'test', facts: {}, shell: example.shell, furnished: null, catalog: [], conversation: {
    steps: [{ request: 'Add a sofa', outcome: 'proposal', editor_accepted: true }, { request: 'Add a desk', outcome: 'question' }, { request: 'Remove a wall', outcome: 'decline' }],
  } });
  assert.deepEqual(flat.requestOutcomes, ['Applied to this view', 'Designer asked a question', 'Designer declined this request']);
});

test('facts-only real collection retains an explicitly labelled interactive example', () => {
  const flats = buildFlats([{ id: 'b1-t2', facts: { rooms: 2, area_m2: 70 }, shell: null, furnished: null, catalog: [], conversation: null }]);
  assert.equal(flats.filter(flat => !flat.example).length, 1);
  assert.equal(flats.filter(flat => flat.example && flat.furnished).length, 1);
  assert.match(collectionDescription(flats), /1 residence/);
  assert.match(collectionDescription(flats), /0 furnished/);
});

test('Avani never advertises a developer plan; real flats preserve explicit availability only', () => {
  assert.equal(exampleFlat().planAvailable, false);
  const input = { id: 'test', facts: {}, shell: null, furnished: null, catalog: [], conversation: null };
  assert.equal(makeFlat(input).planAvailable, false);
  assert.equal(makeFlat({ ...input, planAvailable: true }).planAvailable, true);
});

test('developer drawings use their own catalog and disclose omitted pieces without claiming designer purchases', () => {
  const example = exampleFlat();
  const input = { id: 'drawn-only', facts: {}, shell: null, furnished: null, catalog: [], conversation: null,
    drawn: example.furnished, drawnCatalog: { assets: example.catalog, currency: 'AMD' },
    drawnAudit: { drawn: 20, placed: 2, omitted: [{ role: 'kitchen_base', name: 'Kitchen base', reason: 'No corresponding kitchen product' }, { role: 'wardrobe', name: 'Wardrobe', reason: 'No legal pose' }] } };
  const flat = makeFlat(input);
  assert.equal(flat.drawn, example.furnished);
  assert.deepEqual(flat.drawnCatalog, example.catalog);
  assert.match(flat.drawnNote, /2 of 20 drawn pieces/);
  assert.match(flat.drawnNote, /18 not placed/);
  assert.match(flat.drawnNote, /kitchen base/);
  assert.match(flat.drawnNote, /wardrobe/);
  assert.equal(flat.total, null); assert.deepEqual(flat.pieces, []);
  assert.equal(buildFlats([input]).length, 1, 'A drawn-only residence needs no Avani fallback');
  assert.equal(initialState(flat, null), 'drawn');
  assert.equal(initialState({ ...flat, shell: example.shell, furnished: example.furnished }, 'drawn'), 'drawn');
  assert.equal(initialState({ ...flat, shell: example.shell }, null), 'shell');
  assert.equal(makeFlat({ ...input, drawnCatalog: [] }).drawn, null, 'Never hydrate a drawn snapshot from another catalog');
});

test('missing drawing audit cannot imply a complete developer layout', () => {
  const example = exampleFlat();
  const flat = makeFlat({ id: 'test', facts: {}, shell: example.shell, furnished: null, catalog: [], conversation: null, drawn: example.furnished, drawnCatalog: example.catalog });
  assert.match(flat.drawnNote, /Completeness has not been confirmed/);
});

test('standalone model transport resolves editor optimization paths to the exact frozen public model', async () => {
  const { publicModelResolver } = await import(pathToFileURL(join(out, 'model.mjs')));
  const original = 'https://example.test/original/ASIN.glb';
  const flat = { catalog: [{ source: { type: 'procedural' } }], drawnCatalog: [{ source: { type: 'gltf', url: `${original}#varpet-rotate-y=90` } }] };
  const resolve = publicModelResolver([flat], url => url.endsWith('/ASIN.glb') ? '/api/catalog/models/ASIN.glb' : undefined);
  assert.equal(resolve('/api/catalog/models/ASIN.glb'), original);
  assert.equal(resolve('/other.glb'), '/other.glb');
  assert.equal(resolve(original), original);
  assert.throws(() => publicModelResolver([flat, { catalog: [{ source: { type: 'gltf', url: 'https://other.test/ASIN.glb' } }], drawnCatalog: [] }], () => '/api/catalog/models/ASIN.glb'), /Conflicting model sources/);
});

test('an explicit model mirror preserves the exact SKU and leaves unrelated resources alone', async () => {
  const { publicModelResolver } = await import(pathToFileURL(join(out, 'model.mjs')));
  const flat = { catalog: [{ source: { type: 'gltf', url: 'https://original.test/S/ASIN.glb' } }], drawnCatalog: [] };
  const resolve = publicModelResolver([flat], () => '/api/catalog/models/ASIN.glb', 'http://127.0.0.1:54321/models/');
  assert.equal(resolve('/api/catalog/models/ASIN.glb'), 'http://127.0.0.1:54321/models/ASIN.glb');
  assert.equal(resolve('/textures/floor.jpg'), '/textures/floor.jpg');
});
