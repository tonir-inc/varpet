import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'vite';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = await mkdtemp(join(tmpdir(), 'buyer-stream-')); after(() => rm(out, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: { ssr: join(root, 'tests/stream-entry.ts'), outDir: out, rolldownOptions: { output: { entryFileNames: 'stream.mjs' } } } });
const { readLines, play, initialDesigner, reduce, EditorStore, demoScene, localCatalog } = await import(pathToFileURL(join(out, 'stream.mjs')));
const recording = JSON.parse(await readFile(join(root, 'public/fixtures/inspiration-avani.json'), 'utf8'));
const run = (lines, state = initialDesigner()) => lines.reduce((s, [line, at]) => reduce(s, line, at ?? 0), state);
const slotsOf = rec => rec.lines.filter(({ line }) => line.type === 'tool' && line.name === 'reserve_slot' && line.phase === 'end').map(({ line }) => line.refs.slot);
const streamOf = text => new Blob([text]).stream();

test('progress and streamed text: deltas replace then append, progress waits while text streams', () => {
  let s = run([[{ type: 'progress', message: 'Looking at your picture' }, 1]]);
  assert.equal(s.phase, 'working'); assert.equal(s.says, 'Looking at your picture'); assert.equal(s.startedAt, 1);
  s = run([[{ type: 'message_delta', delta: 'I see ' }, 2], [{ type: 'message_delta', delta: 'four pieces' }, 3], [{ type: 'progress', message: 'ignored' }, 4]], s);
  assert.equal(s.says, 'I see four pieces'); assert.equal(s.lastAt, 4);
  s = run([[{ type: 'tool', name: 'other', phase: 'start' }, 5], [{ type: 'progress', message: 'Placing pieces' }, 6]], s);
  assert.equal(s.says, 'Placing pieces');
});

test('tool lines move pieces from seen to searching, found, reserved; scripted is sticky', () => {
  const sofa = localCatalog.find(a => a.id === 'sofa-sage');
  const slot = { ...localCatalog[0], id: 'slot-a', slotId: 'slot-a', size_wdh_m: [1.8, 0.45, 0.75] };
  const pieces = [{ key: 1, name: 'Sideboard', kind: 'cabinet', soft: false }, { key: 2, name: 'Sofa', kind: 'sofa', soft: true }];
  let s = run([[{ type: 'tool', name: 'set_intent', phase: 'end', refs: { pieces, palette: ['#ffffff'] }, scripted: true }]]);
  assert.deepEqual(s.pieces.map(p => [p.key, p.status, p.source]), [[1, 'seen', 'none'], [2, 'seen', 'none']]);
  assert.deepEqual(s.palette, ['#ffffff']); assert.equal(s.scripted, true);
  s = run([[{ type: 'tool', name: 'search_catalog', phase: 'start', refs: { key: 1 } }], [{ type: 'tool', name: 'search_catalog', phase: 'start', refs: { key: 2 } }]], s);
  assert.deepEqual(s.pieces.map(p => p.status), ['searching', 'searching']);
  s = run([[{ type: 'tool', name: 'search_catalog', phase: 'end', refs: { key: 2, chosen: sofa } }], [{ type: 'tool', name: 'search_catalog', phase: 'end', refs: { key: 1 } }]], s);
  assert.deepEqual(s.pieces.map(p => [p.status, p.source]), [['seen', 'none'], ['found', 'shop']]); assert.equal(s.pieces[1].asset, sofa);
  s = run([[{ type: 'tool', name: 'reserve_slot', phase: 'end', refs: { key: 1, slot } }]], s);
  assert.deepEqual([s.pieces[0].status, s.pieces[0].source, s.pieces[0].slotId, s.pieces[0].size], ['reserved', 'custom', 'slot-a', [1.8, 0.45, 0.75]]);
  assert.equal(s.scripted, true);
});

test('propose, build, proposal, question, message, decline and error lines set their phases', () => {
  const slot = { ...localCatalog[0], id: 'slot-a', slotId: 'slot-a', size_wdh_m: [1, 1, 1] };
  const proposal = { id: 'p', title: 't', description: 'd', command: { id: 'c', label: 'l', source: 'designer', baseRevision: 0, operations: [] } };
  let s = run([[{ type: 'tool', name: 'set_intent', phase: 'end', refs: { pieces: [{ key: 1, name: 'x', kind: 'cabinet', soft: false }] } }],
    [{ type: 'tool', name: 'reserve_slot', phase: 'end', refs: { key: 1, slot } }],
    [{ type: 'tool', name: 'propose', phase: 'end', refs: { proposal, assets: [slot] } }]]);
  assert.equal(s.phase, 'proposed'); assert.equal(s.proposal, proposal); assert.deepEqual(s.assets.map(a => a.id), ['slot-a']);
  s = run([[{ type: 'build', slotId: 'slot-a', state: 'writing' }], [{ type: 'progress', message: 'still building' }]], s);
  assert.equal(s.pieces[0].status, 'writing'); assert.equal(s.phase, 'proposed');
  const failed = run([[{ type: 'build', slotId: 'slot-a', state: 'failed', reason: 'loose shelf' }]], s);
  assert.deepEqual([failed.pieces[0].status, failed.pieces[0].reason], ['failed', 'loose shelf']);
  s = run([[{ type: 'build', slotId: 'slot-a', state: 'done', glb: '/fixtures/a.glb' }]], s);
  assert.deepEqual(s.pieces[0].asset.source, { type: 'gltf', url: '/fixtures/a.glb' }); assert.deepEqual(s.assets[0].source, { type: 'gltf', url: '/fixtures/a.glb' });
  const extra = { ...localCatalog[1] };
  s = run([[{ type: 'proposal', conversationId: 'conv', proposal, assets: [extra] }]], initialDesigner());
  assert.deepEqual([s.phase, s.conversationId, s.assets.length], ['proposed', 'conv', 1]);
  s = run([[{ type: 'question', conversationId: 'conv', question: 'Which wall?', options: ['North', 'West'] }]]);
  assert.deepEqual([s.phase, s.says, s.question], ['question', 'Which wall?', { text: 'Which wall?', options: ['North', 'West'] }]);
  assert.deepEqual([run([[{ type: 'message', conversationId: 'c', message: 'Hi' }]]).phase, run([[{ type: 'decline', conversationId: 'c', message: 'No' }]]).phase,
    run([[{ type: 'error', message: 'Boom' }]]).phase], ['message', 'declined', 'error']);
  const same = initialDesigner();
  assert.equal(reduce(same, { type: 'telemetry', x: 1 }, 3), same);
});

test('readLines skips blank, malformed, oversized and unknown lines and handles split chunks', async () => {
  const text = ['{"type":"progress","message":"a"}', '', 'not json', '{"type":"telemetry","x":1}', '{"type":"progress"}',
    `{"type":"progress","message":"${'x'.repeat(1.1 * 2 ** 20)}"}`, '{"type":"error","message":"b"}\r', '{"type":"message_delta","delta":"c"}'].join('\n');
  const bytes = new TextEncoder().encode(text), chunks = [];
  for (let i = 0; i < bytes.length; i += 7777) chunks.push(bytes.slice(i, i + 7777));
  const body = new ReadableStream({ pull(c) { const next = chunks.shift(); if (next) c.enqueue(next); else c.close(); } });
  const got = []; await readLines(body, line => got.push(line));
  assert.deepEqual(got, [{ type: 'progress', message: 'a' }, { type: 'error', message: 'b' }, { type: 'message_delta', delta: 'c' }]);
  const controller = new AbortController(), seen = [];
  await readLines(streamOf('{"type":"error","message":"x"}\n'), line => { seen.push(line); }, (controller.abort(), controller.signal));
  assert.deepEqual(seen, []);
});

test('player emits every line in order, honours speed changes and skipToEnd', async () => {
  const rec = { id: 'r', title: 't', flatId: 'f', request: 'q', lines: [2, 0, 1].map(at => ({ at: at / 1000, line: { type: 'progress', message: String(at) } })) };
  const seen = []; const p = play(rec, { speed: 1, onLine: (line, at) => seen.push([line.message, at]) });
  p.setSpeed(4); await p.done;
  assert.deepEqual(seen.map(s => s[0]), ['0', '1', '2']);
  const timed = { ...rec, lines: [{ at: 0.4, line: { type: 'progress', message: 'late' } }] }, t0 = performance.now();
  const fast = play(timed, { speed: 1, onLine() {} }); fast.setSpeed(100); await fast.done;
  assert.ok(performance.now() - t0 < 200, 'a speed change reschedules the remaining lines');
  const slow = { ...rec, lines: rec.lines.map(l => ({ ...l, at: l.at * 1e5 })) }, early = [];
  const q = play(slow, { speed: 1, onLine: line => early.push(line.message) });
  await new Promise(r => setTimeout(r, 5)); q.skipToEnd(); await q.done;
  assert.deepEqual(early, ['0', '1', '2']);
  const controller = new AbortController(), none = [];
  const stopped = play(slow, { speed: 1, onLine: line => none.push(line), signal: controller.signal });
  controller.abort(); await stopped.done; assert.deepEqual(none, []);
});

test('fixture: sorted, scripted, real catalog assets, and plays through the reducer to done', async () => {
  const ats = recording.lines.map(l => l.at);
  assert.deepEqual(ats, [...ats].sort((a, b) => a - b));
  assert.equal(recording.id, 'inspiration-avani'); assert.equal(recording.flatId, 'avani');
  for (const { line } of recording.lines) if (line.type === 'tool' || line.type === 'build') assert.equal(line.scripted, true, JSON.stringify(line));
  const shop = recording.lines.flatMap(({ line }) => [line.refs?.chosen, ...(line.refs?.assets ?? []), ...(line.assets ?? [])]).filter(a => a && !a.id.startsWith('slot-'));
  for (const asset of shop) assert.deepEqual(asset, localCatalog.find(a => a.id === asset.id));
  const final = recording.lines.reduce((s, { line, at }) => reduce(s, line, at), initialDesigner());
  assert.equal(final.phase, 'proposed'); assert.equal(final.scripted, true);
  assert.deepEqual(final.pieces.map(p => [p.key, p.status, p.source]), [[1, 'done', 'custom'], [2, 'found', 'shop'], [3, 'found', 'shop'], [4, 'done', 'custom']]);
  for (const slot of slotsOf(recording)) {
    const states = recording.lines.filter(({ line }) => line.type === 'build' && line.slotId === slot.slotId).map(({ line }) => line.state);
    assert.deepEqual(states, ['queued', 'writing', 'checking', 'fixing', 'checking', 'done']);
    assert.deepEqual(slot.dimensions, [slot.size_wdh_m[0], slot.size_wdh_m[2], slot.size_wdh_m[1]]);
    assert.equal(final.assets.find(a => a.id === slot.id).source.type, 'gltf');
    const url = final.assets.find(a => a.id === slot.id).source.url;
    assert.equal((await readFile(join(root, 'public', url))).subarray(0, 4).toString(), 'glTF', url);
  }
});

test('fixture: the proposal command executes on the Avani demo flat with the slot assets', () => {
  const propose = recording.lines.find(({ line }) => line.type === 'tool' && line.name === 'propose' && line.phase === 'end').line.refs;
  const store = new EditorStore(structuredClone(demoScene), [...localCatalog, ...slotsOf(recording)]);
  const result = store.execute(propose.proposal.command, true);
  assert.deepEqual(result.errors, []); assert.deepEqual(result.warnings, []); assert.equal(result.ok, true);
  const finalLine = recording.lines.at(-1).line;
  assert.equal(finalLine.type, 'proposal');
  const built = finalLine.assets.filter(a => !localCatalog.some(c => c.id === a.id));
  const again = new EditorStore(structuredClone(demoScene), [...localCatalog, ...built]).execute(finalLine.proposal.command, true);
  assert.deepEqual(again.errors, []); assert.equal(again.ok, true);
});
