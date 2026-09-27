import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

// A recorded designer run replays through the real adapter: paced, rebased onto the current revision, recorded times.
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-designer-replay-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', build: {
  ssr: join(root, 'src/ui/designer-replay.ts'), target: 'node22', outDir: output,
  minify: false, rolldownOptions: { output: { entryFileNames: 'replay.mjs' } },
} });
const { createReplayClock, recordedFetch, sessionBadge, validSession } = await import(pathToFileURL(join(output, 'replay.mjs')));

const proposal = { id: 'p', title: 'Design', description: 'd', command: { id: 'p', label: 'd', source: 'designer', baseRevision: 0, operations: [] } };
const turn = { request: 'Furnish it', seconds: 300, events: [
  { t: 1, record: { type: 'progress', message: 'Planning the flat' } },
  { t: 120, record: { type: 'partial', proposal, rooms: ['Living room'] } },
  { t: 300, record: { type: 'proposal', conversationId: 'c', proposal } }] };

test('a recorded turn streams its records in order, rebased onto the request revision, with recorded times on the clock', async () => {
  let real = 0; const clock = createReplayClock(() => real);
  const response = await recordedFetch(turn, 10, clock, 0)('http://x/designer/propose', { body: JSON.stringify({ revision: 7 }) });
  assert.equal(response.headers.get('Content-Type'), 'application/x-ndjson');
  const lines = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(lines.map(line => line.type), ['progress', 'partial', 'proposal']);
  assert.deepEqual(lines.slice(1).map(line => line.proposal.command.baseRevision), [7, 7]);
  assert.equal(clock.now(), 300_000);
  assert.equal(clock.scale, 1);
});

test('the badge says it is a recording, when and how fast', () => {
  assert.equal(sessionBadge({ recordedAt: '2026-09-27T05:10:00' }, 10), 'Recorded run · 27 Sep, 10× speed');
  assert.equal(validSession({ format: 'varpet.designer-session', version: 1, name: 'x', turns: [turn], conversationId: 'c' }), true);
  assert.equal(validSession({ format: 'other' }), false);
});

test('the replay clock never runs past the next recorded event, so it shows the recorded time', () => {
  let real = 0; const clock = createReplayClock(() => real);
  clock.scale = 10; clock.cap(5000);
  real = 2000; assert.equal(clock.now(), 5000);
  clock.reach(0, 3000); assert.equal(clock.now(), 5000);
  clock.cap(9000); real = 2100; assert.equal(clock.now(), 6000);
  clock.scale = 1; real = 10_000; assert.equal(clock.now(), 6000 + 7900);
});
