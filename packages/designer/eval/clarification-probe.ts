/** Small live triage probe. Action attempts are reported separately from delivered proposals. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {EditorStore} from '../../../apps/editor/src/core/store.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
type Json = Record<string, any>;
export const CASES = [
  {id: 'living', request: 'Furnish the living room', expected: 'action'},
  {id: 'explicit-paint', request: 'Paint Bedroom 1 walls warm white', expected: 'proposal'},
  {id: 'ambiguous-paint', request: 'Paint the bedroom walls warm white', expected: 'question'},
  {id: 'answer-bedroom2', request: 'Bedroom 2', expected: 'proposal', follows: 'ambiguous-paint'},
  {id: 'vague', request: 'Make it nicer', expected: 'question'},
  {id: 'advice', request: 'What does warm white mean?', expected: 'message'},
  {id: 'desk', request: 'Add a desk by the window for working from home', expected: 'action'},
] as const;
type ProbeCase = typeof CASES[number];
export interface ProbeOptions {
  service: string;
  events: string;
  output: string;
  cases?: string[];
  initial?: string;
  label?: string;
}
const read = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));
const save = (directory: string, name: string, value: unknown) => {
  const path = join(directory, name);
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  renameSync(path + '.tmp', path);
};
const policies = ['harness/designer.py', 'harness/designer_prompt.md', 'harness/designer_profiles.py',
  'harness/designer_conversation.py', 'harness/prompts/interior-design-rules.md'];
function sourceEvidence() {
  return {scope: 'Runner checkout only. An isolated or remote service needs its own worker-source manifest.',
    measured_at: new Date().toISOString(), git_head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(),
    git_status: execFileSync('git', ['status', '--short'], {cwd: ROOT, encoding: 'utf8'}),
    policy_sha256: Object.fromEntries(policies.map(name => [name, createHash('sha256').update(readFileSync(join(ROOT, name))).digest('hex')]))};
}

export function selectCases(ids?: string[]): ProbeCase[] {
  const requested = ids ?? CASES.map(entry => entry.id);
  assert(requested.length && new Set(requested).size === requested.length, 'Choose distinct cases');
  for (const id of requested) assert(CASES.some(entry => entry.id === id), `Unknown case ${id}`);
  assert(!requested.includes('answer-bedroom2') || requested.includes('ambiguous-paint'),
    'answer-bedroom2 requires ambiguous-paint in the same run; no fabricated conversation history');
  return CASES.filter(entry => requested.includes(entry.id));
}

/** SDK started/completed events share IDs; count each actual call once, including rejected calls. */
export function toolTrace(events: Json[]): {calls: Json[]; summaries: Json[]} {
  const stdout = events.filter(event => event.kind === 'process_output' && event.stage === 'worker' && event.channel === 'stdout')
    .map(event => event.chunk).join('');
  const calls = new Map<string, Json>(), summaries: Json[] = [];
  for (const line of stdout.split('\n').filter(Boolean)) {
    let event: Json;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.kind === 'worker_summary') summaries.push(event);
    const item = event.payload?.item;
    if (!['item/started', 'item/completed'].includes(event.method) || item?.type !== 'mcpToolCall' || typeof item.id !== 'string') continue;
    const call = {...calls.get(item.id), id: item.id, server: item.server, tool: item.tool, arguments: item.arguments};
    if (event.method === 'item/completed') Object.assign(call, {status: item.status, error: item.error, result: item.result});
    calls.set(item.id, call);
  }
  return {calls: [...calls.values()], summaries};
}

function acceptedQuestion(call: Json): boolean {
  if (call.tool !== 'ask' || call.status !== 'completed' || call.error) return false;
  const payloads = [call.result?.structuredContent, ...(call.result?.content ?? []).flatMap((entry: Json) => {
    try { return entry.type === 'text' ? [JSON.parse(entry.text)] : []; } catch { return []; }
  })];
  return payloads.some(value => value?.type === 'question' && value.awaiting_answer === true);
}

export async function runProbe(options: ProbeOptions) {
  const selected = selectCases(options.cases), output = resolve(ROOT, options.output);
  assert(!existsSync(output), 'Refusing to overwrite probe evidence');
  const initialPath = resolve(ROOT, options.initial ?? 'packages/designer/eval/komitas-runs/b31-t46-recovered1/initial.json');
  const initial = read(initialPath);
  new EditorStore(initial.scene, initial.catalog); // Validate before any live request.
  assert(initial.scene.rooms.some((room: Json) => room.name === 'Bedroom 1') && initial.scene.rooms.some((room: Json) => room.name === 'Bedroom 2'),
    'Fixed probe requires Bedroom 1 and Bedroom 2 in the supplied snapshot');
  const endpoint = new URL('/designer/propose', options.service).href;
  assert(['http:', 'https:'].includes(new URL(endpoint).protocol), 'Service must use HTTP(S)');
  mkdirSync(output, {recursive: true});
  save(output, 'initial.json', initial);
  const beforeSource = sourceEvidence(); save(output, 'source-before.json', beforeSource);
  const run: Json = {label: options.label ?? 'probe', started_at: new Date().toISOString(), initial_path: initialPath,
    purpose: 'Triage only. An action attempt or question is not evidence of a completed furnishing goal.',
    expected_profile: {model: 'gpt-6-astra', effort: 'low', placement: 'without-place', context: 'compact-base', fast_path: false},
    service: options.service, cases: selected, rows: []};
  save(output, 'run.json', run);
  const continuations = new Map<string, {store: EditorStore; conversationId: string; outcome: string}>();
  for (const entry of selected) {
    const prior = 'follows' in entry ? continuations.get(entry.follows) : undefined;
    if ('follows' in entry) {
      assert(prior, `No real conversation exists for ${entry.follows}`);
      if (prior.outcome !== 'question') {
        run.rows.push({id: entry.id, request: entry.request, expected: entry.expected,
          outcome: 'not_run', reason: 'Preceding turn did not ask a question; answer would not be a faithful continuation.'});
        save(output, 'run.json', run);
        continue;
      }
    }
    const store = prior?.store ?? new EditorStore(initial.scene, initial.catalog);
    const runId = `clarification-${entry.id}-${Date.now()}`;
    const body: Json = {scene: store.scene, revision: store.revision, catalog: initial.catalog, catalogCurrency: 'AMD', northDeg: 0,
      request: entry.request, ...(prior ? {conversationId: prior.conversationId} : {}), _evalRunId: runId};
    save(output, `${entry.id}-request.json`, body);
    console.log(JSON.stringify({id: entry.id, stage: 'start', revision: store.revision, continuation: !!prior}));
    const started = performance.now(); let reply: Json, raw = '', editorAccepted: boolean | null = null, editorResult: Json | undefined;
    try {
      const response = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body), signal: AbortSignal.timeout(600_000)});
      if (!response.body) throw new Error(`HTTP ${response.status} has no response stream`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader(); let lastProgress = started;
      for (;;) {
        const {done, value} = await reader.read(); if (done) break; raw += value;
        if (performance.now() - lastProgress >= 30_000) {
          console.log(JSON.stringify({id: entry.id, stage: 'http_progress', seconds: (performance.now() - started) / 1000})); lastProgress = performance.now();
        }
      }
      reply = raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
        .filter(value => !['progress', 'message_delta'].includes(value.type)).at(-1) ?? {type: 'error', message: 'No terminal response'};
      if (reply.type === 'proposal') { editorResult = store.execute(reply.proposal.command, true); editorAccepted = editorResult.ok; }
    } catch (error) { reply = {type: 'error', message: String(error)}; }
    const seconds = (performance.now() - started) / 1000;
    writeFileSync(join(output, `${entry.id}-http.ndjson`), raw);
    const eventPath = join(resolve(ROOT, options.events), `${runId}.events.jsonl`);
    const eventText = existsSync(eventPath) ? readFileSync(eventPath, 'utf8') : '';
    writeFileSync(join(output, `${entry.id}-sdk.events.jsonl`), eventText);
    const events: Json[] = eventText.split('\n').filter(Boolean).map(line => JSON.parse(line));
    const telemetry = [...events].reverse().find(event => event.kind === 'turn_telemetry');
    const trace = toolTrace(events), asks = trace.calls.filter(call => call.tool === 'ask');
    const actionTools = trace.calls.filter(call => ['set_intent', 'search_catalog', 'place', 'check_layout', 'score_layout', 'propose'].includes(call.tool)).map(call => call.tool);
    const actualProfile = telemetry ? {model: telemetry.model, effort: telemetry.effort, ...telemetry.profile} : null;
    const fastPath = trace.summaries.length ? trace.summaries.some(summary => summary.fast_path === true) : null;
    const usage = telemetry?.usage ?? null, tokens = usage?.totalTokens ?? (usage?.input_tokens !== undefined ? usage.input_tokens + usage.output_tokens : null);
    const profileVerified = actualProfile?.model === 'gpt-6-astra' && actualProfile.effort === 'low'
      && actualProfile.placement === 'without-place' && actualProfile.context === 'compact-base' && fastPath === false;
    const triageMatched = profileVerified && (entry.expected === 'action' ? actionTools.length > 0 && asks.length === 0
      : entry.expected === 'proposal' ? reply.type === 'proposal' && editorAccepted === true && asks.length === 0
      : entry.expected === 'question' ? reply.type === 'question' && asks.length === 1 && asks.filter(acceptedQuestion).length === 1
      : reply.type === 'message' && trace.calls.length === 0);
    const conversationId = reply.conversationId ?? telemetry?.conversation_id;
    if (conversationId) continuations.set(entry.id, {store, conversationId, outcome: reply.type});
    const row: Json = {id: entry.id, request: entry.request, expected: entry.expected, outcome: reply.type,
      seconds, tokens, usage, actual_profile: actualProfile, fast_path: fastPath, profile_verified: profileVerified,
      conversationId, ask_count: asks.length, accepted_ask_count: asks.filter(acceptedQuestion).length,
      action_tools: actionTools, tool_names: trace.calls.map(call => call.tool), tool_call_ids: trace.calls.map(call => call.id),
      asks, triage_matched: triageMatched, proposal_delivered: reply.type === 'proposal' && editorAccepted === true,
      action_attempt_without_proposal: actionTools.length > 0 && editorAccepted !== true, editor_accepted: editorAccepted, editor_result: editorResult, reply};
    run.rows.push(row); save(output, `${entry.id}-after.json`, {scene: store.scene, catalog: initial.catalog}); save(output, 'run.json', run);
    console.log(JSON.stringify({id: entry.id, outcome: row.outcome, seconds: Math.round(seconds * 1000) / 1000,
      tokens, ask_count: row.ask_count, action_tools: actionTools, triage_matched: triageMatched, proposal_delivered: row.proposal_delivered}));
    const stderr = events.filter(event => event.kind === 'process_output' && event.channel === 'stderr').map(event => event.chunk).join('');
    if (telemetry?.usage_limited || /usage limit/i.test(stderr + (reply.message ?? ''))) throw new Error('USAGE LIMIT: stop probe');
  }
  const afterSource = sourceEvidence(); save(output, 'source-after.json', afterSource);
  run.policy_changed_during_run = policies.filter(name => beforeSource.policy_sha256[name] !== afterSource.policy_sha256[name]);
  run.finished_at = new Date().toISOString(); save(output, 'run.json', run);
  return run;
}

async function cli() {
  const args = process.argv.slice(2);
  const arg = (name: string, fallback?: string) => {
    const index = args.indexOf(name); if (index < 0) return fallback;
    assert(args[index + 1] && !args[index + 1]!.startsWith('--'), `${name} needs a value`); return args[index + 1]!;
  };
  if (args.includes('--help')) {
    console.log(`clarification-probe.ts --service URL --events DIRECTORY --output NEW_DIRECTORY --cases ${CASES.map(entry => entry.id).join(',')} [--label before|after] [--initial SAVED_INITIAL_JSON] [--dry-run]`);
    return;
  }
  const selected = selectCases(arg('--cases')?.split(','));
  if (args.includes('--dry-run')) { console.log(JSON.stringify({cases: selected, model_calls: 0}, null, 2)); return; }
  const output = arg('--output'); assert(output, '--output is required');
  await runProbe({service: arg('--service', 'http://127.0.0.1:8816')!, events: arg('--events', '/tmp/varpet-clarification-events')!,
    output, cases: selected.map(entry => entry.id), initial: arg('--initial'), label: arg('--label')});
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch(error => { console.error(error); process.exitCode = 1; });
}
