import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = await mkdtemp(join(tmpdir(), 'buyer-quote-')); after(() => rm(out, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: { ssr: join(root, 'src/quote.ts'), outDir: out, rolldownOptions: { output: { entryFileNames: 'quote.mjs' } } } });
const { buildQuote, sizeOf } = await import(pathToFileURL(join(out, 'quote.mjs')));

const asset = (id, price, kind = 'cabinet') => ({ id, name: id, category: 'x', kind, dimensions: [1.8, 0.75, 0.45], color: '#ccc', price, source: { type: 'procedural' } });
const object = (id, assetId) => ({ id, name: id, assetId, position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] });
const catalog = [asset('sofa', 1000, 'sofa'), asset('chair', 100, 'chair'), asset('wardrobe', 0, 'wardrobe'), asset('slot-1', 950), asset('bought', 300)];
const scene = { objects: [object('sofa-1', 'sofa'), object('chair-1', 'chair'), object('chair-2', 'chair'), object('wardrobe-1', 'wardrobe'), object('slot-obj', 'slot-1'), object('new-1', 'bought')] };
const original = new Set(['sofa-1', 'chair-1', 'chair-2', 'wardrobe-1']);
const group = (quote, id) => quote.groups.find(g => g.id === id)?.lines ?? [];

test('owned pieces cost nothing, the developer\'s furniture is still to buy, custom pieces are estimates', () => {
  const quote = buildQuote({ scene, catalog, original, ownership: new Map([['sofa-1', 'owned']]), custom: new Set(['slot-1']), keys: new Map() });
  assert.deepEqual(group(quote, 'yours').map(l => [l.name, l.unit]), [['sofa', 0]]);
  assert.deepEqual(group(quote, 'developer').map(l => [l.name, l.count, l.unit, l.note]), [['chair', 2, 100, undefined], ['wardrobe', 1, null, 'not sold separately']]);
  assert.deepEqual(group(quote, 'workshop').map(l => [l.name, l.unit, l.note]), [['slot-1', 950, 'estimate, the workshop confirms']]);
  assert.deepEqual(group(quote, 'shop').map(l => [l.name, l.unit]), [['bought', 300]]);
  assert.equal(quote.total, 100 * 2 + 950 + 300);
  assert.equal(quote.real, 4, 'the owned sofa, two priced developer chairs and the shop piece; estimates and unpriced pieces are not');
  assert.equal(quote.pieces, 6);
});

test('a developer piece the designer picked counts as a shop purchase unless it is owned', () => {
  const keys = new Map([['sofa-1', 2], ['chair-1', 3]]);
  const quote = buildQuote({ scene, catalog, original, ownership: new Map([['chair-1', 'owned']]), custom: new Set(['slot-1']), keys });
  assert.deepEqual(group(quote, 'shop').map(l => [l.tag, l.name]), [['2', 'sofa'], ['', 'bought']]);
  assert.deepEqual(group(quote, 'yours').map(l => l.name), ['chair']);
});

test('sizes read width, depth, height in centimetres', () => {
  assert.equal(sizeOf(asset('a', 1)), '180 × 45 × 75 cm');
  assert.equal(sizeOf(asset('a', 1), { ...object('o', 'a'), scale: [0.5, 1, 2] }), '90 × 90 × 75 cm');
});
