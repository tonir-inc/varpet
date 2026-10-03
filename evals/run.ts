// Designer eval: runs each case's turns through the real agent runner (packages/agents runTurn, Felix's
// subscription), saves the event stream and the proposal graph, screenshots the proposal (the whole flat in the
// editor, WebGPU, headless Chrome via Playwright; per judged room an eye-level, top and 3/4 view through POST
// /api/render with view_scene's cameras), asks a critic `claude -p` to score it against real rooms (evals/critic.ts),
// writes report.md over both case sets. The dev server on --port runs through the agent and shots steps, so the
// designer's view_scene renders too.
//
//   node --experimental-strip-types --no-warnings evals/run.ts --run <name> [--set synthetic|real|all] [--cases a,b]
//        [--skills on|off] [--port 3028] [--steps agent,shots,critic,report] [--concurrency 4] [--budget 55]
//
// Cases run in parallel, --concurrency at a time; one case's steps (agent turns, shots, critic) stay in order. Log
// lines carry the case id. The dev server gets VARPET_RENDER_CONCURRENCY = concurrency/2 + 1 render pages and the
// agents VARPET_AGENT_MAX_LIVE = concurrency + 2 live processes (either can be set in the environment instead).
//
// Every agent turn and critic call (retries too) is logged to runs/<run>/calls.log before it starts. --budget (alias
// --max-calls) caps the calls: a case starts only while the calls it needs fit next to the ones in flight, and no call
// starts past the budget. A turn that fails on a transient error (overload, timeout, network) is retried once. A rate
// limit (a rejected rate_limit event, or an error saying so) pauses every new call until its reset (at most 15 min,
// 60 s when unknown), then the case is retried once from where it stopped.
//
// `--set real` (evals/real/cases.json): real projects; the scene starts as the shell traced from the project's plan
// (evals/real/shells) and the critic gets the project's photos (run evals/real/fetch.ts first). `--set all`: both.
//
// Resumable: every step writes its own file under evals/runs/<run>/<case>/ and is skipped when the file exists
// (delete a file to redo that step). One case: --cases <id>. Turns and critic calls spend the subscription.
// Timings: <case>/timing.json per case, runs/<run>/timing.json for the run (wall time, render queue waits).
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore, type SceneStore } from '@pascal-app/mcp/storage'
import type { AgentEvent } from '../packages/contracts/src/index.ts'
import { childEnv, closeAgentSessions, runTurn, userMessageLine } from '../packages/agents/src/index.ts'
import { CASE_FILES, EVALS_DIR, loadCases, selectCases, type CaseSet, type EvalCase } from './cases.ts'
import { CRITERIA, CRITIC_PROMPT, CRITIC_SCHEMA, criticInput, imageDataUrl as fileDataUrl, scoreOf } from './critic.ts'
import { ROOM_VIEWS, roomSlug, roomZones } from './eye.ts'
import { planView } from '../packages/scene-mcp/src/view-scene.ts'
import type { RenderResponse } from '../packages/contracts/src/index.ts'
import { loadShell } from './real/shell.ts'
import { roomFacts } from './room-facts.ts'
import { summarize, type CaseSummary } from './summary.ts'
import { RateLimited, Semaphore, budgetRoom, rateLimitReset, renderStats, runPool } from './parallel.ts'

const ROOT = resolve(EVALS_DIR, '..')
const STEPS = ['agent', 'shots', 'critic', 'report'] as const
type Step = (typeof STEPS)[number]

const { values: flags } = parseArgs({
  options: {
    run: { type: 'string' },
    set: { type: 'string', default: 'synthetic' },
    cases: { type: 'string' },
    skills: { type: 'string', default: 'on' },
    port: { type: 'string', default: '3028' },
    steps: { type: 'string', default: STEPS.join(',') },
    concurrency: { type: 'string', default: '4' },
    budget: { type: 'string' },
    'max-calls': { type: 'string' },
  },
})
if (!flags.run || !/^[\w.-]+$/.test(flags.run)) throw new Error('--run <name> is required (letters, digits, . - _)')
if (flags.skills !== 'on' && flags.skills !== 'off') throw new Error('--skills is on or off')
const steps = new Set(flags.steps!.split(',') as Step[])
const port = Number(flags.port)
const origin = `http://localhost:${port}`
const runDir = join(EVALS_DIR, 'runs', flags.run)
const concurrency = Math.max(1, Math.floor(Number(flags.concurrency)) || 1)
const budget = Number(flags.budget ?? flags['max-calls'] ?? 55)
if (flags.set !== 'all' && !(flags.set! in CASE_FILES)) throw new Error('--set is synthetic, real or all')
// `all`: the real set first, its turns are the long ones.
const sets: CaseSet[] = flags.set === 'all' ? ['real', 'synthetic'] : [flags.set as CaseSet]
const cases = selectCases(sets.flatMap((set) => loadCases(join(EVALS_DIR, CASE_FILES[set]))), flags.cases ? flags.cases.split(',') : null)
mkdirSync(runDir, { recursive: true })

// One run = one scene database and data dir, shared by the agents and the dev server that renders the proposals.
const config = join(runDir, 'run.json')
if (!existsSync(config)) writeFileSync(config, JSON.stringify({ skills: flags.skills, started: new Date().toISOString() }, null, 2))
const runConfig = JSON.parse(readFileSync(config, 'utf8')) as { skills: string }
if (runConfig.skills !== flags.skills) throw new Error(`run ${flags.run} was started with --skills ${runConfig.skills}`)
const renderPages = Number(process.env.VARPET_RENDER_CONCURRENCY) || Math.floor(concurrency / 2) + 1
const env: NodeJS.ProcessEnv = {
  ...process.env,
  VARPET_DATA_DIR: join(runDir, 'data'),
  PASCAL_DB_PATH: join(runDir, 'data', 'pascal.db'),
  VARPET_PUBLIC_ORIGIN: origin,
  // N designers at once: the agents' live-process cap and the renderer's pages grow with the concurrency.
  VARPET_AGENT_MAX_LIVE: process.env.VARPET_AGENT_MAX_LIVE ?? String(concurrency + 2),
  VARPET_RENDER_CONCURRENCY: String(renderPages),
  ...(flags.skills === 'off' ? { VARPET_AGENT_PLUGIN_DIR: 'off' } : {}),
}
// Pascal's SQLite store keeps one connection per store and awaits inside its write transaction, so two saves at once
// on one store fail ("cannot start a transaction within a transaction"). The runner's saves and loads take turns, and
// so do turn starts (runTurn copies the base scene to a proposal on the agents' own store before its session event).
const sceneDb = new Semaphore(1)
const turnStarts = new Semaphore(1)
const rawStore = await createSceneStore(env)
const store: Pick<SceneStore, 'save' | 'load'> = {
  save: (opts) => sceneDb.run(() => rawStore.save(opts)),
  load: (id) => sceneDb.run(() => rawStore.load(id)),
}

type Log = (...parts: unknown[]) => void
const stamp = () => `[eval ${new Date().toISOString().slice(11, 19)}]`
const log: Log = (...parts) => console.log(stamp(), ...parts)
const caseLog = (c: EvalCase): Log => (...parts) => console.log(stamp(), `[${c.id}]`, ...parts)

// Subscription calls: one line per agent turn or critic call, written before it starts. A rate limit pauses them all.
const callsFile = join(runDir, 'calls.log')
const callsUsed = () => (existsSync(callsFile) ? readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).length : 0)
let pausedUntil = 0
async function rateGate() {
  while (Date.now() < pausedUntil) await new Promise((done) => setTimeout(done, Math.min(5000, pausedUntil - Date.now())))
}
async function spendCall(kind: 'turn' | 'critic', what: string, say: Log) {
  await rateGate()
  const used = callsUsed()
  if (used >= budget) throw new Error(`call budget spent: ${used}/${budget} (runs/${flags.run}/calls.log)`)
  appendFileSync(callsFile, `${new Date().toISOString()}\t${kind}\t${what}\n`)
  say(`call ${used + 1}/${budget}: ${kind} ${what}`)
}
// Rate limits are not retried on the spot: the case backs off and is retried once (runCase).
const RATE_LIMIT = /rate.?limit|usage limit|hit your limit|429/i
const TRANSIENT = /overload|\b5\d\d\b|time(d)? ?out|ECONN|EPIPE|socket|network|fetch failed|exited unexpectedly/i

const caseDir = (c: EvalCase) => join(runDir, c.id)
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T

interface CaseMeta {
  sceneId: string
  conversationId: string | null
  proposalSceneId: string | null
  turnsDone: number
}

// ---------------------------------------------------------------------------------------------------------------
// Agent turns

async function startScene(c: EvalCase, s: Pick<SceneStore, 'save'>) {
  if (c.shell) return (await s.save({ name: `eval ${c.id}`, graph: loadShell(join(EVALS_DIR, c.shell)).graph as never })).id
  if (c.templateId === null) {
    const bridge = new SceneBridge()
    bridge.loadDefault()
    return (await s.save({ name: `eval ${c.id}`, graph: bridge.exportJSON() })).id
  }
  const graph = readJson<never>(join(ROOT, 'apps/web/lib/flats/templates', `${c.templateId}.json`))
  return (await s.save({ name: `eval ${c.id}`, graph })).id
}

function imageDataUrl(path: string) {
  return `data:image/png;base64,${readFileSync(join(EVALS_DIR, path)).toString('base64')}`
}

async function runAgent(c: EvalCase, say: Log) {
  const dir = caseDir(c)
  mkdirSync(dir, { recursive: true })
  const metaFile = join(dir, 'meta.json')
  const meta: CaseMeta = existsSync(metaFile)
    ? readJson(metaFile)
    : { sceneId: await startScene(c, store), conversationId: null, proposalSceneId: null, turnsDone: 0 }
  writeFileSync(metaFile, JSON.stringify(meta, null, 2))
  for (let i = meta.turnsDone; i < c.turns.length; i++) {
    say(`turn ${i + 1}/${c.turns.length}: ${c.turns[i]}`)
    const eventsFile = join(dir, `turn-${i + 1}.events.ndjson`)
    const rawFile = join(dir, `turn-${i + 1}.raw.ndjson`)
    writeFileSync(eventsFile, '')
    writeFileSync(rawFile, '')
    const request = {
      sceneId: meta.sceneId,
      message: c.turns[i]!,
      ...(meta.conversationId ? { conversationId: meta.conversationId } : {}),
      ...(i === 0 && c.images?.length ? { images: c.images.map(imageDataUrl) } : {}),
    }
    let failed: string | null = null
    let limited: number | null | undefined // a rejected rate_limit event's reset (null: unknown); undefined: none
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) {
        say(`transient failure, retrying once: ${failed}`)
        appendFileSync(join(dir, `turn-${i + 1}.retried.txt`), `${failed}\n`)
        writeFileSync(eventsFile, '')
        writeFileSync(rawFile, '')
      }
      failed = null
      limited = undefined
      await spendCall('turn', `${c.id} ${i + 1}/${c.turns.length}${attempt ? ' retry' : ''}`, say)
      const started = await turnStarts.acquire()
      for await (const event of runTurn(c.role, { ...request, ...(meta.conversationId ? { conversationId: meta.conversationId } : {}) }, { root: ROOT, env, onRawLine: (l) => appendFileSync(rawFile, `${l}\n`) })) {
        started() // the first event comes after the proposal copy
        appendFileSync(eventsFile, `${JSON.stringify(event)}\n`)
        if (event.type === 'session') Object.assign(meta, { conversationId: event.conversationId, proposalSceneId: event.proposalSceneId })
        if (event.type === 'tool' && event.status === 'running') say(`  ${event.name}`)
        if (event.type === 'rate_limit') {
          const reset = rateLimitReset(event)
          if (reset !== undefined) limited = reset
        }
        if (event.type === 'error') failed = event.message
      }
      started()
      if (failed && (limited !== undefined || RATE_LIMIT.test(failed))) {
        writeFileSync(join(dir, `turn-${i + 1}.error.txt`), failed)
        throw new RateLimited(failed, limited ?? null)
      }
      if (!failed || !TRANSIENT.test(failed)) break
    }
    if (failed) {
      say(`turn failed: ${failed}`)
      writeFileSync(join(dir, `turn-${i + 1}.error.txt`), failed)
      break // a later turn would build on a broken one; rerun the case to retry it
    }
    meta.turnsDone = i + 1
    writeFileSync(metaFile, JSON.stringify(meta, null, 2))
    rmSync(join(dir, `turn-${i + 1}.error.txt`), { force: true }) // from a rate-limited attempt
  }
  const base = await store.load(meta.sceneId)
  const proposal = meta.proposalSceneId ? await store.load(meta.proposalSceneId) : null
  if (proposal) writeFileSync(join(dir, 'proposal.json'), JSON.stringify(proposal.graph))
  const turns = c.turns.slice(0, Math.max(meta.turnsDone, 1)).map((message, i) => ({
    message,
    events: readLines<AgentEvent>(join(dir, `turn-${i + 1}.events.ndjson`)),
    raw: readLines<Record<string, unknown>>(join(dir, `turn-${i + 1}.raw.ndjson`)),
  }))
  const summary = summarize(c, turns, base?.graph ?? null, proposal?.graph ?? base?.graph ?? null, meta.turnsDone)
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2))
}

function readLines<T>(file: string): T[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)
}

// ---------------------------------------------------------------------------------------------------------------
// Screenshots: the proposal in the real editor, rendered with WebGPU.

async function waitForServer(server: ChildProcess, timeoutMs = 240_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error(`dev server exited (${server.exitCode})`)
    try {
      if ((await fetch(`${origin}/api/scenes?limit=1`)).ok) return
    } catch {}
    await new Promise((done) => setTimeout(done, 2000))
  }
  throw new Error(`dev server not up on ${origin}`)
}

/** The rooms a case is judged on: its `rooms`, else the room the ask is about, then every other room with furniture. */
function judgedRooms(c: EvalCase, graph: { nodes: Record<string, unknown> }) {
  if (c.rooms) return c.rooms
  const furnished = roomFacts(graph).map((f) => f.room)
  const asked = furnished.find((r) => r.toLowerCase() === c.room.toLowerCase())
  return asked ? [asked, ...furnished.filter((r) => r !== asked)] : furnished
}

function resultGraph(c: EvalCase) {
  const file = join(caseDir(c), 'proposal.json')
  return existsSync(file) ? readJson<{ nodes: Record<string, unknown> }>(file) : null
}

/** Open a scene in the editor and wait for the canvas and for every model file to arrive (or 90 s). */
async function openScene(page: import('playwright-core').Page, sceneId: string) {
  let pending = 0
  let lastChange = Date.now()
  const isModel = (url: string) => /\.(glb|gltf)(\?|$)|\/api\/catalog\/models\//.test(url)
  page.on('request', (r) => { if (isModel(r.url())) { pending++; lastChange = Date.now() } })
  const done = (r: { url(): string }) => { if (isModel(r.url())) { pending--; lastChange = Date.now() } }
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  await page.goto(`${origin}/editor/${sceneId}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  const until = Date.now() + 90_000
  while (Date.now() < until && (pending > 0 || Date.now() - lastChange < 4000)) await page.waitForTimeout(500)
  await page.waitForTimeout(4000) // models decode and upload after their bytes arrive
}

/** The dev server for this run's database, up until stop(); its renderer warmed (GET /api/render) before it returns. */
async function startServer() {
  log(`starting the dev server on ${origin}`)
  const server = spawn('pnpm', ['--filter', '@varpet/web', 'exec', 'next', 'dev', '--port', String(port)], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const serverLog = join(runDir, 'dev-server.log')
  server.stdout!.on('data', (chunk) => appendFileSync(serverLog, chunk))
  server.stderr!.on('data', (chunk) => appendFileSync(serverLog, chunk))
  const stop = () => {
    try {
      process.kill(-server.pid!, 'SIGTERM')
    } catch {}
    log('dev server stopped')
  }
  try {
    await waitForServer(server)
    const warm = (await (await fetch(`${origin}/api/render`, { signal: AbortSignal.timeout(200_000) })).json()) as { ready?: boolean }
    if (!warm.ready) throw new Error(`renderer not ready: ${JSON.stringify(warm)}`)
    log('renderer ready')
  } catch (error) {
    stop()
    throw error
  }
  return { stop }
}

async function render(request: object): Promise<RenderResponse> {
  const response = await fetch(`${origin}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(200_000),
  })
  const body = (await response.json().catch(() => null)) as (RenderResponse & { error?: string }) | null
  if (!response.ok || !body?.image) throw new Error(body?.error ?? `render_failed: HTTP ${response.status}`)
  return body
}

// One Chrome for the editor screenshots, shared by the cases, opened on first use; at most `renderPages` editor pages
// at once (each loads the whole editor and every model).
let shotBrowser: Promise<import('playwright-core').Browser> | null = null
const editorPages = new Semaphore(renderPages)
function editorBrowser() {
  shotBrowser ??= import('playwright-core').then(({ chromium }) =>
    chromium.launch({
      executablePath: process.env.VARPET_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-webgpu'],
    }),
  )
  return shotBrowser
}

async function closeEditorBrowser() {
  const browser = shotBrowser
  shotBrowser = null
  await browser?.then((b) => b.close()).catch(() => {})
}

/** The case's screenshots: the whole flat in the editor (shot-3d/top.png), then per judged room its three views. */
async function takeShots(c: EvalCase, say: Log, timing: CaseTiming) {
  const dir = caseDir(c)
  const meta = readJson<CaseMeta>(join(dir, 'meta.json'))
  const sceneId = meta.proposalSceneId ?? meta.sceneId
  if (!existsSync(join(dir, 'shots.json'))) {
    await editorPages.run(async () => {
      const page = await (await editorBrowser()).newPage({ viewport: { width: 1600, height: 1000 } })
      try {
        say(`screenshot ${sceneId}`)
        await openScene(page, sceneId)
        const gpu = await page.evaluate(async () => {
          const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }
          return nav.gpu ? Boolean(await nav.gpu.requestAdapter()) : false
        })
        await page.locator('canvas').first().screenshot({ path: join(dir, 'shot-3d.png') })
        await page.getByRole('button', { name: 'Top' }).click({ timeout: 10_000 })
        await page.waitForTimeout(3000)
        await page.locator('canvas').first().screenshot({ path: join(dir, 'shot-top.png') })
        writeFileSync(join(dir, 'shots.json'), JSON.stringify({ sceneId, webgpu: gpu }, null, 2))
      } catch (error) {
        say(`screenshot failed: ${String(error)}`)
        writeFileSync(join(dir, 'shots.error.txt'), String(error))
      } finally {
        await page.context().close()
      }
    })
  }
  // Per judged room: eye level, top and 3/4, rendered like the designer's own view_scene (same cameras, same page);
  // a room's three views go to the render pool together.
  const graph = resultGraph(c) ?? ((await store.load(sceneId))?.graph as { nodes: Record<string, unknown> } | undefined)
  if (!graph || existsSync(join(dir, 'rooms.json'))) return
  const taken: Array<{ room: string; view: string; file: string; caption: string; backend: string; queuedMs: number; renderMs: number }> = []
  for (const { room, zoneId } of roomZones(graph, judgedRooms(c, graph)).slice(0, 5)) {
    const shots = await Promise.all(
      ROOM_VIEWS.map(async ({ view, prefix }) => {
        const file = `${prefix}-${roomSlug(room)}.jpg`
        try {
          const plan = planView(graph as never, { zoneId, view, width: 1024, height: 768 })
          const result = await render({ ...plan.request, graph })
          say(`${view} of ${room}: queued ${result.queuedMs} ms, drawn in ${result.renderMs} ms`)
          timing.renders.push({ queuedMs: result.queuedMs, renderMs: result.renderMs })
          writeFileSync(join(dir, file), Buffer.from(result.image, 'base64'))
          return [{ room, view, file, caption: plan.description, backend: result.backend, queuedMs: result.queuedMs, renderMs: result.renderMs }]
        } catch (error) {
          say(`${view} of ${room} failed: ${String(error)}`)
          return []
        }
      }),
    )
    taken.push(...shots.flat())
  }
  writeFileSync(join(dir, 'rooms.json'), JSON.stringify(taken, null, 2))
}

// ---------------------------------------------------------------------------------------------------------------
// Critic: a separate claude -p with no tools scores the case against real rooms (rubric and input: critic.ts).

/** Builds the critic's input (no call spent when that fails, e.g. a real case without cached photos), then asks it. */
async function runCritic(c: EvalCase, say: Log): Promise<Record<string, unknown>> {
  const dir = caseDir(c)
  const summary = readJson<CaseSummary>(join(dir, 'summary.json'))
  const graph = resultGraph(c)
  const facts = graph ? roomFacts(graph, judgedRooms(c, graph)) : []
  writeFileSync(join(dir, 'facts.json'), JSON.stringify(facts, null, 2))
  const input = criticInput(c, summary, facts, dir)
  const images = input.images.map((im) => fileDataUrl(im.path))
  const text = input.text
  writeFileSync(join(dir, 'critic-input.txt'), `${input.images.map((im) => `[image] ${im.label}: ${im.path}`).join('\n')}\n\n${text}`)
  const args = [
    '-p', '--model', 'claude-opus-5-5', '--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json',
    '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--disable-slash-commands', '--no-session-persistence', '--permission-mode', 'dontAsk',
    '--system-prompt', CRITIC_PROMPT, '--json-schema', JSON.stringify(CRITIC_SCHEMA),
  ]
  await spendCall('critic', c.id, say)
  return new Promise((done, fail) => {
    const child = spawn(process.env.VARPET_CLAUDE_BIN ?? 'claude', args, { cwd: dir, env: childEnv(process.env), stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', fail)
    child.on('close', (code) => {
      try {
        // stream-json input needs stream-json output: the answer is the last `result` line.
        type Result = { type?: string; structured_output?: Record<string, unknown>; result?: string; is_error?: boolean }
        const parsed = out.split('\n').flatMap((l) => { try { return [JSON.parse(l) as Result] } catch { return [] } })
        const result = parsed.filter((e) => e.type === 'result').at(-1)
        if (!result) throw new Error('no result line')
        if (result.is_error) throw new Error(String(result.result))
        done(result.structured_output ?? (JSON.parse(String(result.result)) as Record<string, unknown>))
      } catch (error) {
        fail(new Error(`critic failed (${code}): ${String(error)} ${err.slice(-400)} ${out.slice(-400)}`))
      }
    })
    child.stdin.on('error', () => {}) // a CLI that refuses to start closes stdin; the close handler reports why
    child.stdin.end(userMessageLine(text, images))
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Report

/** report.md over every case of both sets that has run in this run dir: averages per set, one row per case, details. */
function writeReport() {
  const keys = [...CRITERIA, 'overall']
  const score = (critic: Record<string, unknown>, key: string) => String(scoreOf(critic, key) ?? '-')
  const tables: string[] = []
  const averages: string[] = []
  const details: string[] = []
  for (const set of Object.keys(CASE_FILES) as CaseSet[]) {
    const rows: string[] = []
    const scores: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]))
    let judged = 0
    for (const c of loadCases(join(EVALS_DIR, CASE_FILES[set]))) {
      const dir = caseDir(c)
      if (!existsSync(join(dir, 'summary.json'))) continue
      const s = readJson<CaseSummary>(join(dir, 'summary.json'))
      const critic = existsSync(join(dir, 'critic.json')) ? readJson<Record<string, unknown>>(join(dir, 'critic.json')) : {}
      if (Object.keys(critic).length) judged++
      for (const k of keys) {
        const v = scoreOf(critic, k)
        if (v !== null) scores[k]!.push(v)
      }
      const views = s.trace.flat().filter((t) => /view_scene$/.test(t.name)).length
      rows.push(
        `| ${c.id} | ${s.turnsDone}/${c.turns.length} | ${keys.map((k) => score(critic, k)).join(' | ')} | ${s.added.length} | ` +
          `${s.totalAmd.toLocaleString('en-US')} | ${s.toolErrors} | ${views} | ${s.skillsUsed.join(', ') || 'none'} |`,
      )
      const issues = Array.isArray(critic.issues) ? (critic.issues as string[]) : []
      const reasons = keys
        .map((k) => [k, (critic[k] as { reason?: string } | undefined)?.reason] as const)
        .filter(([, reason]) => reason)
        .map(([k, reason]) => `- ${k} ${score(critic, k)}: ${reason}`)
      details.push(
        `### ${c.id}\n\n${c.turns.map((t, i) => `${i + 1}. "${t}"`).join('\n')}\n\n` +
          `Skills loaded: ${s.skillsLoaded.length}. Used: ${s.skillsUsed.join(', ') || 'none'}. ` +
          `Tools: ${s.toolCount} calls, ${s.toolErrors} errors, ${views} view_scene. Finishes: ${s.finishes.map((f) => `${f.target} ${f.ref}`).join('; ') || 'none'}.` +
          (s.errors.length ? `\n\nTurn errors: ${s.errors.join(' | ')}` : '') +
          (reasons.length ? `\n\nCritic scores:\n${reasons.join('\n')}` : '') +
          `\n\nCritic issues:\n${issues.map((i) => `- ${i}`).join('\n') || '- none'}\n\nAgent's last answer:\n\n> ${s.answers.at(-1)?.replace(/\n+/g, '\n> ') ?? ''}\n`,
      )
    }
    if (!rows.length) continue
    const mean = (k: string) => (scores[k]!.length ? (scores[k]!.reduce((a, b) => a + b, 0) / scores[k]!.length).toFixed(1) : '-')
    averages.push(`| ${set} (${judged} judged) | ${keys.map(mean).join(' | ')} |`)
    tables.push(
      `## ${set}\n\n| case | turns | ${keys.join(' | ')} | pieces | total AMD | tool errors | view_scene | skills used |\n` +
        `|${'---|'.repeat(keys.length + 7)}\n${rows.join('\n')}\n`,
    )
  }
  const report = [
    `# Designer eval: ${flags.run} (skills ${runConfig.skills})`,
    '',
    'Averages of the critic scores (1-5; n/a criteria left out):',
    '',
    `| set | ${keys.join(' | ')} |`,
    `|${'---|'.repeat(keys.length + 1)}`,
    ...averages,
    '',
    ...tables,
    // Hand-written findings (runs/<run>/findings.md) survive report rewrites.
    ...(existsSync(join(runDir, 'findings.md')) ? [readFileSync(join(runDir, 'findings.md'), 'utf8'), ''] : []),
    '## Details',
    '',
    ...details,
  ].join('\n')
  writeFileSync(join(runDir, 'report.md'), report)
  log(`report: ${join(runDir, 'report.md')}`)
}

// ---------------------------------------------------------------------------------------------------------------

interface CaseTiming {
  agentMs?: number
  shotsMs?: number
  criticMs?: number
  /** The eval's own room renders (the designer's view_scene renders are in dev-server.log). */
  renders: Array<{ queuedMs: number; renderMs: number }>
}

const turnsLeft = (c: EvalCase) => {
  const metaFile = join(caseDir(c), 'meta.json')
  return !existsSync(metaFile) || readJson<CaseMeta>(metaFile).turnsDone < c.turns.length
}
const agentDone = (c: EvalCase) => !turnsLeft(c) && existsSync(join(caseDir(c), 'summary.json'))
/** Subscription calls the case still needs: its open turns and its critic. */
function callsNeeded(c: EvalCase) {
  const metaFile = join(caseDir(c), 'meta.json')
  const turns = steps.has('agent') && !agentDone(c) ? c.turns.length - (existsSync(metaFile) ? readJson<CaseMeta>(metaFile).turnsDone : 0) : 0
  const critic = steps.has('critic') && !existsSync(join(caseDir(c), 'critic.json')) ? 1 : 0
  return turns + critic
}

/** One case, its steps in order. Throws RateLimited when the subscription said no. */
async function runSteps(c: EvalCase, say: Log, timing: CaseTiming) {
  const timed = async (key: 'agentMs' | 'shotsMs' | 'criticMs', step: () => Promise<void>) => {
    const started = Date.now()
    await step()
    timing[key] = (timing[key] ?? 0) + Date.now() - started
  }
  if (steps.has('agent')) {
    if (agentDone(c)) say('turns done, skipped')
    else await timed('agentMs', () => runAgent(c, say))
  }
  const dir = caseDir(c)
  if (steps.has('shots') && existsSync(join(dir, 'meta.json')) && !(existsSync(join(dir, 'shots.json')) && existsSync(join(dir, 'rooms.json')))) {
    await timed('shotsMs', () => takeShots(c, say, timing))
  }
  const file = join(dir, 'critic.json')
  if (steps.has('critic') && !existsSync(file) && existsSync(join(dir, 'summary.json'))) {
    await timed('criticMs', async () => {
      say('critic')
      try {
        writeFileSync(file, JSON.stringify(await runCritic(c, say), null, 2))
      } catch (error) {
        if (RATE_LIMIT.test(String(error))) throw new RateLimited(String(error), null)
        say(String(error))
      }
    })
  }
}

const MAX_BACKOFF_MS = 15 * 60_000
async function runCase(c: EvalCase) {
  const say = caseLog(c)
  const timing: CaseTiming = { renders: [] }
  const started = Date.now()
  for (let attempt = 0; ; attempt++) {
    try {
      await runSteps(c, say, timing)
      break
    } catch (error) {
      if (!(error instanceof RateLimited) || attempt > 0) {
        say(`case stopped: ${String(error instanceof Error ? error.message : error)}`)
        break
      }
      const until = Math.min(error.resetsAt ?? Date.now() + 60_000, Date.now() + MAX_BACKOFF_MS) + 2000
      pausedUntil = Math.max(pausedUntil, until)
      say(`rate limited (${error.message.slice(0, 120)}); every new call waits ${Math.round((until - Date.now()) / 1000)} s, then this case retries once`)
      await rateGate()
    }
  }
  const wallMs = Date.now() - started
  if (timing.agentMs || timing.shotsMs || timing.criticMs) writeFileSync(join(caseDir(c), 'timing.json'), JSON.stringify({ wallMs, ...timing }, null, 2))
  say(`case done in ${Math.round(wallMs / 1000)} s`)
}

// The server is needed for turns (view_scene) and shots; re-summarizing finished cases needs none.
const serverLog = join(runDir, 'dev-server.log')
const serverLogFrom = existsSync(serverLog) ? readFileSync(serverLog).length : 0
const server = (steps.has('agent') && cases.some(turnsLeft)) || steps.has('shots') ? await startServer() : null
const runStarted = Date.now()
try {
  log(`${cases.length} cases, ${concurrency} at a time, ${renderPages} render pages, budget ${budget} calls (${callsUsed()} used)`)
  const usedAtStart = callsUsed()
  let promised = 0
  await runPool(cases, concurrency, async (c) => {
    const needed = callsNeeded(c)
    const room = budgetRoom({ budget, used: callsUsed(), promised, spentSinceStart: callsUsed() - usedAtStart })
    if (needed > room) {
      caseLog(c)(`not started: needs ${needed} calls, ${room} left in the budget`)
      return
    }
    promised += needed
    await runCase(c)
  })
  if (steps.has('report')) writeReport()
} finally {
  await closeAgentSessions(2000)
  await closeEditorBrowser()
  server?.stop()
}
const serverRenders = existsSync(serverLog) ? renderStats(readFileSync(serverLog).subarray(serverLogFrom).toString('utf8')) : null
const runTiming = { wallMs: Date.now() - runStarted, concurrency, renderPages, cases: cases.length, renders: serverRenders }
writeFileSync(join(runDir, 'timing.json'), JSON.stringify(runTiming, null, 2))
log(`wall ${Math.round(runTiming.wallMs / 1000)} s; renders ${JSON.stringify(serverRenders)}`)
process.exit(0)
