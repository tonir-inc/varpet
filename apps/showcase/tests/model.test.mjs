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
