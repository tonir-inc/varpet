/** Failed-turn-only live reruns. The independent Komitas grader is deliberately unchanged. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {grade} from './komitas-grade.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
type Json = Record<string, any>;
export interface RerunOptions {
  source: string;
  output: string;
  service: string;
  events: string;
  mode: 'sequential' | 'snapshots';
  turns?: string[];
  expectFastPath?: boolean;
}
const read = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));
const save = (directory: string, name: string, value: unknown) => {
  const path = join(directory, name);
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  renameSync(path + '.tmp', path);
};

export function selectFailedTurns(rows: Json[], requested?: string[]): Json[] {
  assert(rows.length > 0, 'Source has no turns');
  const kinds = requested ?? rows.filter(row => row.pass === false).map(row => row.kind);
  assert(kinds.length > 0 && new Set(kinds).size === kinds.length, 'Choose distinct failed turns');
  for (const kind of kinds) {
    const matches = rows.filter(row => row.kind === kind);
    assert(matches.length === 1 && matches[0]!.pass === false, `${kind} is not exactly one recorded failed turn`);
  }
  return rows.filter(row => kinds.includes(row.kind));
}

/** Restore saved editor history through its public command boundary, retaining the exact revision. */
function sourceStore(directory: string, run: Json, initial: Json, kind: string): EditorStore {
  const store = new EditorStore(initial.scene, initial.catalog);
  for (const row of run.rows) {
    const body = read(join(directory, `${row.kind}-request.json`));
    assert.deepEqual(body.catalog, initial.catalog, 'Source changed catalog within the conversation');
    assert.deepEqual(store.scene, body.scene, `Source scene history differs before ${row.kind}`);
    assert.equal(store.revision, body.revision, `Source revision differs before ${row.kind}`);
    if (row.kind === kind) return store;
    if (row.reply.type === 'proposal') {
      const result = store.execute(row.reply.proposal.command, true);
      assert.equal(result.ok, row.editor_accepted, `Saved proposal acceptance changed at ${row.kind}: ${result.errors.join('; ')}`);
    }
    assert.deepEqual(store.scene, read(join(directory, `${row.kind}-after.json`)).scene,
      `Saved editor result changed after ${row.kind}`);
  }
  throw new Error(`Missing source turn ${kind}`);
}

export function prepareRerun(options: RerunOptions) {
  const directory = resolve(ROOT, options.source), original = read(join(directory, 'run.json'));
  const initial = read(join(directory, 'initial.json'));
  const selected = selectFailedTurns(original.rows, options.turns);
  if (options.mode === 'sequential') {
    assert.deepEqual(selected.map(row => row.kind), original.rows.slice(0, selected.length).map((row: Json) => row.kind),
      'Sequential reruns require a failed prefix: skipping earlier turns would lose real conversation history. Use snapshots for isolated inputs.');
  }
  // Validate every saved snapshot before spending any model calls.
  for (const row of selected) sourceStore(directory, original, initial, row.kind);
  const fastSource = existsSync(join(directory, 'fast-source.json')) ? read(join(directory, 'fast-source.json')) : undefined;
  return {directory, original, initial, selected, fastSource,
    expectFastPath: options.expectFastPath ?? fastSource?.fast_path === true};
}

function workerEvents(events: Json[]): Json[] {
  // Recorder chunks can split JSON in the middle; concatenate stdout before decoding.
  const output = events.filter(event => event.kind === 'process_output' && event.stage === 'worker' && event.channel === 'stdout')
    .map(event => event.chunk).join('');
  return output.split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export async function runFailedTurns(options: RerunOptions) {
  const prepared = prepareRerun(options), {directory, original, initial, selected, expectFastPath} = prepared;
  const output = resolve(ROOT, options.output), eventsDirectory = resolve(ROOT, options.events);
  assert(!existsSync(output), 'Refusing to overwrite a rerun directory');
  const endpoint = new URL('/designer/propose', options.service).href;
  assert(['http:', 'https:'].includes(new URL(endpoint).protocol), 'Service must use HTTP(S)');
  mkdirSync(output, {recursive: true});
  save(output, 'initial.json', initial);
  const run: Json = {
    id: `${original.id}-reliability`, source: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(),
    baseline_source: original.source, baseline_directory: directory, mode: options.mode,
    input_policy: options.mode === 'sequential'
      ? 'Saved initial scene/catalog; original failed-prefix requests; one fresh real conversation; apply each accepted proposal before the next turn.'
      : 'Exact saved request scene/catalog/revision; reconstruct editor history without model calls; each failed turn starts a fresh conversation (original SDK history is not reproduced).',
    expected_fast_path: expectFastPath, service: options.service, roles: original.roles,
    profile: original.profile, started_at: new Date().toISOString(), rows: [],
  };
  if (prepared.fastSource) save(output, 'baseline-fast-source.json', prepared.fastSource);
  save(output, 'run.json', run);
  let store = new EditorStore(initial.scene, initial.catalog), conversationId: string | undefined;
  for (const originalRow of selected) {
    const kind = originalRow.kind, savedBody = read(join(directory, `${kind}-request.json`));
    if (options.mode === 'snapshots') {
      store = sourceStore(directory, original, initial, kind);
      conversationId = undefined;
    }
    const runId = `reliability-${kind}-${Date.now()}`;
    const {conversationId: _oldConversation, _evalRunId: _oldRun, ...originalFields} = savedBody;
    const body = {...originalFields, scene: store.scene, revision: store.revision,
      ...(conversationId ? {conversationId} : {}), _evalRunId: runId};
    if (options.mode === 'snapshots') {
      assert.deepEqual(body.scene, savedBody.scene);
      assert.equal(body.revision, savedBody.revision);
    }
    assert.equal(body.request, originalRow.request);
    assert.deepEqual(body.catalog, savedBody.catalog);
    save(output, `${kind}-source-request.json`, savedBody);
    save(output, `${kind}-request.json`, body);
    const before = structuredClone(store.scene), start = performance.now();
    let reply: Json, result: Json | undefined, accepted: boolean | null = null, raw = '';
    console.log(JSON.stringify({kind, stage: 'start', revision: store.revision, mode: options.mode}));
    try {
      const response = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body), signal: AbortSignal.timeout(600_000)});
      if (!response.body) throw new Error(`HTTP ${response.status}: no response stream`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let lastProgress = start;
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        raw += value;
        if (performance.now() - lastProgress >= 30_000) {
          console.log(JSON.stringify({kind, stage: 'http_progress', seconds: (performance.now() - start) / 1000}));
          lastProgress = performance.now();
        }
      }
      const lines = raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
      reply = lines.filter(line => !['progress', 'message_delta'].includes(line.type)).at(-1)
        ?? {type: 'error', message: `HTTP ${response.status}: no final response`};
      if (reply.conversationId) conversationId = reply.conversationId;
      if (reply.type === 'proposal') {
        result = store.execute(reply.proposal.command, true);
        accepted = result.ok;
      }
    } catch (error) {
      reply = {type: 'error', message: String(error)};
    }
    const seconds = (performance.now() - start) / 1000;
    writeFileSync(join(output, `${kind}-http.ndjson`), raw);
    const eventPath = join(eventsDirectory, `${runId}.events.jsonl`);
    const eventText = existsSync(eventPath) ? readFileSync(eventPath, 'utf8') : '';
    writeFileSync(join(output, `${kind}-sdk.events.jsonl`), eventText);
    const events: Json[] = eventText.split('\n').filter(Boolean).map(line => JSON.parse(line));
    const telemetry = [...events].reverse().find(event => event.kind === 'turn_telemetry');
    if (telemetry?.conversation_id) conversationId = telemetry.conversation_id;
    const worker = workerEvents(events), summaries = worker.filter(event => event.kind === 'worker_summary');
    const fastPath = summaries.length ? summaries.some(event => event.fast_path === true) : null;
    const usage = telemetry?.usage ?? null;
    const tokens = usage?.totalTokens ?? (usage?.input_tokens !== undefined ? usage.input_tokens + usage.output_tokens : null);
    let grading: Json;
    try { grading = grade(kind, before, store.scene, body.catalog, reply, accepted, original.roles); }
    catch (error) { grading = {pass: false, request_match: false, reasons: ['grader_error'], error: String(error), editor_accepted: accepted}; }
    const actualProfile = telemetry ? {model: telemetry.model, effort: telemetry.effort, ...telemetry.profile} : null;
    const expectedProfile = originalRow.actual_profile ?? {model: 'gpt-6-astra', ...original.profile};
    if (!actualProfile || Object.entries(expectedProfile).some(([key, value]) => actualProfile[key] !== value)) {
      grading.pass = false; grading.reasons.push('profile_unverified');
    }
    if (fastPath === null || fastPath !== expectFastPath) {
      grading.pass = false; grading.reasons.push('fast_path_unverified');
    }
    const baseline = Object.fromEntries(['pass', 'request_match', 'reasons', 'outcome', 'seconds', 'tokens', 'new_failures', 'editor_accepted']
      .map(key => [key, originalRow[key]]));
    const row: Json = {kind, request: body.request, baseline, outcome: reply.type, seconds, tokens, usage, conversationId,
      actual_profile: actualProfile, fast_path: fastPath, reply, result, ...grading};
    run.rows.push(row);
    save(output, `${kind}-after.json`, {scene: store.scene, catalog: body.catalog});
    save(output, 'final.json', {scene: store.scene, catalog: body.catalog});
    save(output, 'run.json', run);
    console.log(JSON.stringify({kind, before: baseline.pass, after: row.pass, outcome: row.outcome,
      seconds: Math.round(seconds * 1000) / 1000, tokens, reasons: row.reasons}));
    const stderr = events.filter(event => event.kind === 'process_output' && event.channel === 'stderr').map(event => event.chunk).join('');
    if (telemetry?.usage_limited || /usage limit/i.test(stderr + (reply.message ?? ''))) throw new Error('USAGE LIMIT: stop the rerun');
    if (options.mode === 'sequential' && !conversationId) throw new Error('No real conversation ID; cannot preserve sequential history');
  }
  run.finished_at = new Date().toISOString();
  save(output, 'run.json', run);
  return run;
}

async function cli() {
  const args = process.argv.slice(2);
  const arg = (name: string, fallback?: string) => {
    const index = args.indexOf(name);
    if (index < 0) return fallback;
    assert(args[index + 1] && !args[index + 1]!.startsWith('--'), `${name} needs a value`);
    return args[index + 1]!;
  };
  if (args.includes('--help')) {
    console.log('reliability-rerun.ts --source CAPTURE_DIR --output NEW_DIR --mode sequential|snapshots --turns living,bedroom,sofa,desk --service http://127.0.0.1:8794 --events RECORDER_DIR [--expect-fast-path true|false] [--dry-run]');
    return;
  }
  const source = arg('--source'); assert(source, '--source is required');
  const mode = arg('--mode', 'sequential'); assert(mode === 'sequential' || mode === 'snapshots', 'Invalid --mode');
  const fast = arg('--expect-fast-path'); assert(fast === undefined || ['true', 'false'].includes(fast), 'Invalid --expect-fast-path');
  const options: RerunOptions = {source, output: arg('--output', `/tmp/varpet-reliability-${Date.now()}`)!, mode,
    service: arg('--service', 'http://127.0.0.1:8794')!, events: arg('--events', '/tmp/varpet-komitas-events')!,
    turns: arg('--turns')?.split(','), ...(fast === undefined ? {} : {expectFastPath: fast === 'true'})};
  if (args.includes('--dry-run')) {
    const prepared = prepareRerun(options);
    console.log(JSON.stringify({source: prepared.directory, mode, turns: prepared.selected.map(row => row.kind),
      expect_fast_path: prepared.expectFastPath, catalog_assets: prepared.initial.catalog.length, model_calls: 0}, null, 2));
    return;
  }
  await runFailedTurns(options);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch(error => { console.error(error); process.exitCode = 1; });
}
