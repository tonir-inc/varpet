// Writes public/fixtures/inspiration-avani.json: a scripted stand-in for an inspiration-photo designer run
// on the Avani demo flat (no real run exists yet). Timing follows the 26 Sept measurements: propose at
// ~48 s with progress every 8-10 s before it, builds of ~110-130 s with the fix turn at 60-70 %.
// Run: node apps/buyer/scripts/make-inspiration-fixture.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Copied verbatim from localCatalog (apps/editor/src/core/demo.ts); the test checks they still match.
const sofa = { id: 'sofa-sage', name: 'Sage linen sofa', category: 'Living', kind: 'sofa', dimensions: [2.35, 0.82, 0.92], color: '#889987', price: 1280, source: { type: 'procedural' } };
const table = { id: 'table-coffee', name: 'Walnut coffee table', category: 'Living', kind: 'table', dimensions: [1.12, 0.38, 0.65], color: '#795840', price: 285, source: { type: 'procedural' } };
// Provisional slots: editor dimensions are [w, h, d], size_wdh_m is [w, d, h]. Prices are estimates in the
// same unlabelled demo units as localCatalog, so a quote never mixes currencies.
const slot = (slotId, name, kind, [w, d, h], price) =>
  ({ id: slotId, name, category: 'Made to measure', kind, dimensions: [w, h, d], color: '#CFCAC6', price, source: { type: 'procedural' }, slotId, size_wdh_m: [w, d, h] });
const sideboard = slot('slot-sideboard', 'Fluted oak sideboard', 'cabinet', [1.8, 0.45, 0.75], 950);
const bookshelf = slot('slot-bookshelf', 'Tall oak bookshelf', 'shelf', [0.8, 0.35, 2.0], 520);
const built = (asset, url) => ({ ...asset, source: { type: 'gltf', url } });

const proposal = {
  id: 'designer-inspiration-avani-1',
  title: 'Living room from your picture',
  description: 'Recolour the sofa in cream and bring the coffee table closer to it; move the oak console to the dining end of the west wall and put a made-to-measure fluted oak sideboard in its place; add a tall oak bookshelf on the wall between the kitchen and bedroom doors.',
  command: {
    id: 'designer-inspiration-avani-1', label: 'Apply the look from your picture', source: 'designer', baseRevision: 0,
    operations: [
      { type: 'update', id: 'sofa', patch: { position: [-3.0, 0, 2.8], color: '#E8DFCF' } },
      { type: 'update', id: 'coffee-table', patch: { position: [-3.0, 0, 1.62] } },
      { type: 'update', id: 'media-console', patch: { position: [-4.7, 0, -2.35] } },
      { type: 'add', object: { id: 'inspo-sideboard', name: 'Fluted oak sideboard', assetId: sideboard.id, position: [-4.69, 0, 0.3], rotation: Math.PI / 2, scale: [1, 1, 1] } },
      { type: 'add', object: { id: 'inspo-bookshelf', name: 'Tall oak bookshelf', assetId: bookshelf.id, position: [0.34, 0, 0], rotation: -Math.PI / 2, scale: [1, 1, 1] } },
    ],
  },
};

const lines = [];
const at = (t, line) => lines.push({ at: t, line });
const tool = (t, name, phase, summary, refs) => at(t, { type: 'tool', name, phase, summary, ...(refs ? { refs } : {}), scripted: true });
const say = (t, text, step = 0.35) => text.match(/\S+\s*/g).reduce((chunks, word, i) => {
  if (i % 4 === 0) chunks.push(''); chunks[chunks.length - 1] += word; return chunks;
}, []).forEach((delta, i) => at(+(t + i * step).toFixed(2), { type: 'message_delta', delta }));

at(0, { type: 'progress', message: 'Looking at your picture' });
tool(0.6, 'set_intent', 'start', 'Reading the picture');
at(8.9, { type: 'progress', message: 'Picking out the furniture in your picture' });
tool(11.2, 'set_intent', 'end', 'Four pieces seen', {
  pieces: [
    { key: 1, name: 'Fluted oak sideboard', kind: 'cabinet', soft: false, box: [0.365, 0.487, 0.39, 0.233] },
    { key: 2, name: 'Cream sofa', kind: 'sofa', soft: true, box: [0.05, 0.64, 0.445, 0.26] },
    { key: 3, name: 'Round low coffee table', kind: 'table', soft: false, box: [0.525, 0.787, 0.24, 0.167] },
    { key: 4, name: 'Tall bookshelf', kind: 'shelf', soft: false, box: [0.785, 0.18, 0.165, 0.567] },
  ],
  palette: ['#A27F58', '#E8DFCF', '#CFC2AE', '#6F7A68'],
});
say(11.6, 'I see four pieces in your picture: a fluted oak sideboard, a cream sofa, a low round coffee table and a tall bookshelf. ');
for (const [t, key, what] of [[16.0, 2, 'a cream sofa'], [16.3, 3, 'a low coffee table'], [16.6, 1, 'a fluted oak sideboard'], [16.9, 4, 'a tall bookshelf']])
  tool(t, 'search_catalog', 'start', `Looking in the shop for ${what}`, { key });
at(19.8, { type: 'progress', message: 'Comparing shop pieces with your picture' });
tool(22.4, 'search_catalog', 'end', 'Found a sofa in the shop', { key: 2, chosen: sofa });
tool(23.1, 'search_catalog', 'end', 'Found a coffee table in the shop', { key: 3, chosen: table });
tool(24.0, 'search_catalog', 'end', 'No shop sideboard matches', { key: 1 });
tool(24.6, 'search_catalog', 'end', 'No shop bookshelf matches', { key: 4 });
say(25.0, 'The sofa and the coffee table are in the shop. Nothing there matches the sideboard or the bookshelf, so I will have those two made to measure. ');
tool(30.2, 'reserve_slot', 'start', 'Sizing the sideboard', { key: 1 });
tool(31.0, 'reserve_slot', 'end', 'Sideboard 1.80 × 0.45 × 0.75 m', { key: 1, slot: sideboard });
tool(31.4, 'reserve_slot', 'start', 'Sizing the bookshelf', { key: 4 });
tool(32.1, 'reserve_slot', 'end', 'Bookshelf 0.80 × 0.35 × 2.00 m', { key: 4, slot: bookshelf });
at(38.7, { type: 'progress', message: 'Placing the pieces in your living room' });
at(46.9, { type: 'progress', message: 'Checking the layout against walls, doors and windows' });
tool(48.3, 'propose', 'start', 'Checking the layout');
tool(49.6, 'propose', 'end', 'Layout checked', { proposal, assets: [sofa, table, sideboard, bookshelf] });
say(50.1, 'Here is your living room. The sofa and the coffee table can be ordered now; the sideboard and the bookshelf are drawn in blue while they are being built. ');

// Build timelines [state, seconds after queued]; the fix turn lands at 60-70 % of the build.
const builds = [
  [sideboard.id, 53.0, '/fixtures/sideboard.glb', [['queued', 0], ['writing', 0.8], ['checking', 72.4], ['fixing', 80.1], ['checking', 113.6], ['done', 124.0]]],
  [bookshelf.id, 53.2, '/fixtures/bookshelf.glb', [['queued', 0], ['writing', 1.1], ['checking', 64.9], ['fixing', 70.3], ['checking', 105.2], ['done', 113.8]]],
];
for (const [slotId, start, glb, states] of builds) for (const [state, dt] of states)
  at(+(start + dt).toFixed(1), { type: 'build', slotId, state, ...(state === 'done' ? { glb } : {}), scripted: true });
at(96.0, { type: 'progress', message: 'Making the sideboard and the bookshelf; each takes about two minutes' });
say(178.0, 'Both pieces are made. This is the full room from your picture, ready for a quote. ');
at(180.2, {
  type: 'proposal', conversationId: 'inspiration-avani-scripted', proposal,
  assets: [sofa, table, built(sideboard, '/fixtures/sideboard.glb'), built(bookshelf, '/fixtures/bookshelf.glb')],
  notes: 'Scripted stand-in: no real inspiration-photo run exists yet.',
});

lines.sort((a, b) => a.at - b.at);
const recording = { id: 'inspiration-avani', title: 'Living room from a picture', flatId: 'avani', request: 'Make my living room look like this picture', currency: null, lines };
const out = fileURLToPath(new URL('../public/fixtures/inspiration-avani.json', import.meta.url));
writeFileSync(out, JSON.stringify(recording, null, 1) + '\n');
console.log(`wrote ${lines.length} lines to ${out}`);
