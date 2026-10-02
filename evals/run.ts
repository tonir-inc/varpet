// Designer eval: runs each case's turns through the real agent runner (packages/agents runTurn, Felix's
// subscription), saves the event stream and the proposal graph, screenshots the proposal in the editor (WebGPU,
// headless Chrome via Playwright, dev server on --port: top, 3/4 and one eye-level view per furnished room), asks a
// critic `claude -p` to score it against real rooms (evals/critic.ts), writes report.md.
//
//   node --experimental-strip-types --no-warnings evals/run.ts --run <name> [--set synthetic|real] [--cases a,b]
//        [--skills on|off] [--port 3028] [--steps agent,shots,critic,report]
//
// `--set real` (evals/real/cases.json): real projects; the scene starts as the shell traced from the project's plan
// (evals/real/shells) and the critic gets the project's photos (run evals/real/fetch.ts first).
//
// Resumable: every step writes its own file under evals/runs/<run>/<case>/ and is skipped when the file exists
// (delete a file to redo that step). One case: --cases <id>. Turns and critic calls spend the subscription.
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore, type SceneStore } from '@pascal-app/mcp/storage'
import type { AgentEvent } from '../packages/contracts/src/index.ts'
import { childEnv, closeAgentSessions, runTurn, userMessageLine } from '../packages/agents/src/index.ts'
import { CASE_FILES, EVALS_DIR, loadCases, selectCases, type CaseSet, type EvalCase } from './cases.ts'
import { CRITERIA, CRITIC_PROMPT, CRITIC_SCHEMA, criticInput, imageDataUrl as fileDataUrl, scoreOf } from './critic.ts'
import { eyeSpots, withSpawn } from './eye.ts'
import { loadShell } from './real/shell.ts'
import { roomFacts } from './room-facts.ts'
import { summarize, type CaseSummary } from './summary.ts'

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
  },
})
if (!flags.run || !/^[\w.-]+$/.test(flags.run)) throw new Error('--run <name> is required (letters, digits, . - _)')
if (flags.skills !== 'on' && flags.skills !== 'off') throw new Error('--skills is on or off')
const steps = new Set(flags.steps!.split(',') as Step[])
const port = Number(flags.port)
const origin = `http://localhost:${port}`
const runDir = join(EVALS_DIR, 'runs', flags.run)
if (!(flags.set! in CASE_FILES)) throw new Error('--set is synthetic or real')
const caseFile = join(EVALS_DIR, CASE_FILES[flags.set as CaseSet])
const cases = selectCases(loadCases(caseFile), flags.cases ? flags.cases.split(',') : null)
mkdirSync(runDir, { recursive: true })

// One run = one scene database and data dir, shared by the agents and the dev server that renders the proposals.
const config = join(runDir, 'run.json')
if (!existsSync(config)) writeFileSync(config, JSON.stringify({ skills: flags.skills, started: new Date().toISOString() }, null, 2))
const runConfig = JSON.parse(readFileSync(config, 'utf8')) as { skills: string }
if (runConfig.skills !== flags.skills) throw new Error(`run ${flags.run} was started with --skills ${runConfig.skills}`)
const env: NodeJS.ProcessEnv = {
  ...process.env,
  VARPET_DATA_DIR: join(runDir, 'data'),
  PASCAL_DB_PATH: join(runDir, 'data', 'pascal.db'),
  VARPET_PUBLIC_ORIGIN: origin,
  ...(flags.skills === 'off' ? { VARPET_AGENT_PLUGIN_DIR: 'off' } : {}),
}
const store = await createSceneStore(env)

const caseDir = (c: EvalCase) => join(runDir, c.id)
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T
const log = (...parts: unknown[]) => console.log(`[eval ${new Date().toISOString().slice(11, 19)}]`, ...parts)

interface CaseMeta {
  sceneId: string
  conversationId: string | null
  proposalSceneId: string | null
  turnsDone: number
}

// ---------------------------------------------------------------------------------------------------------------
// Agent turns

async function startScene(c: EvalCase, s: SceneStore) {
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

async function runAgent(c: EvalCase) {
  const dir = caseDir(c)
  mkdirSync(dir, { recursive: true })
  const metaFile = join(dir, 'meta.json')
  const meta: CaseMeta = existsSync(metaFile)
    ? readJson(metaFile)
    : { sceneId: await startScene(c, store), conversationId: null, proposalSceneId: null, turnsDone: 0 }
  writeFileSync(metaFile, JSON.stringify(meta, null, 2))
  for (let i = meta.turnsDone; i < c.turns.length; i++) {
    log(`${c.id} turn ${i + 1}/${c.turns.length}: ${c.turns[i]}`)
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
    for await (const event of runTurn(c.role, request, { root: ROOT, env, onRawLine: (l) => appendFileSync(rawFile, `${l}\n`) })) {
      appendFileSync(eventsFile, `${JSON.stringify(event)}\n`)
      if (event.type === 'session') Object.assign(meta, { conversationId: event.conversationId, proposalSceneId: event.proposalSceneId })
      if (event.type === 'tool' && event.status === 'running') log(`  ${event.name}`)
      if (event.type === 'error') failed = event.message
    }
    if (failed) {
      log(`  turn failed: ${failed}`)
      writeFileSync(join(dir, `turn-${i + 1}.error.txt`), failed)
      break // a later turn would build on a broken one; rerun the case to retry it
    }
    meta.turnsDone = i + 1
    writeFileSync(metaFile, JSON.stringify(meta, null, 2))
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

/** The rooms a case is judged on: its `rooms`, else every room the result put furniture in. */
function judgedRooms(c: EvalCase, graph: { nodes: Record<string, unknown> }) {
  return c.rooms ?? roomFacts(graph).map((f) => f.room)
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

async function takeShots(todo: EvalCase[]) {
  const { chromium } = await import('playwright-core')
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
  const browser = await chromium.launch({
    executablePath: process.env.VARPET_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-webgpu'],
  })
  try {
    await waitForServer(server)
    for (const c of todo) {
      const dir = caseDir(c)
      const meta = readJson<CaseMeta>(join(dir, 'meta.json'))
      const sceneId = meta.proposalSceneId ?? meta.sceneId
      if (!existsSync(join(dir, 'shots.json'))) {
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
        try {
          log(`${c.id}: screenshot ${sceneId}`)
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
          log(`  screenshot failed: ${String(error)}`)
          writeFileSync(join(dir, 'shots.error.txt'), String(error))
        } finally {
          await page.close()
        }
      }
      // Eye level, one per judged room: a temporary copy of the result with a spawn node there, in the Inside view.
      const graph = resultGraph(c) ?? ((await store.load(sceneId))?.graph as { nodes: Record<string, unknown> } | undefined)
      if (!graph || existsSync(join(dir, 'eye.json'))) continue
      const spots = eyeSpots(graph, judgedRooms(c, graph)).slice(0, 5)
      const taken: Array<{ room: string; file: string; position: number[]; yaw: number }> = []
      for (const spot of spots) {
        const temp = await store.save({ name: `eval eye ${c.id} ${spot.room}`, graph: withSpawn(graph as never, spot) as never })
        const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
        const file = `shot-eye-${spot.room.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.jpg`
        try {
          log(`${c.id}: eye level in ${spot.room}`)
          await openScene(page, temp.id)
          await page.getByRole('button', { name: 'Inside' }).click({ timeout: 10_000 })
          await page.waitForTimeout(5000)
          await page.locator('canvas').first().screenshot({ path: join(dir, file), type: 'jpeg', quality: 85 })
          taken.push({ room: spot.room, file, position: spot.position, yaw: spot.yaw })
        } catch (error) {
          log(`  eye-level shot failed: ${String(error)}`)
        } finally {
          await page.close()
          await store.delete(temp.id).catch(() => false)
        }
      }
      writeFileSync(join(dir, 'eye.json'), JSON.stringify(taken, null, 2))
    }
  } finally {
    await browser.close()
    try {
      process.kill(-server.pid!, 'SIGTERM')
    } catch {}
    log('dev server stopped')
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Critic: a separate claude -p with no tools scores the case against real rooms (rubric and input: critic.ts).

function runCritic(c: EvalCase): Promise<Record<string, unknown>> {
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

function writeReport(all: EvalCase[]) {
  const rows: string[] = []
  const details: string[] = []
  const score = (critic: Record<string, unknown>, key: string) => String(scoreOf(critic, key) ?? '-')
  for (const c of all) {
    const dir = caseDir(c)
    if (!existsSync(join(dir, 'summary.json'))) continue
    const s = readJson<CaseSummary>(join(dir, 'summary.json'))
    const critic = existsSync(join(dir, 'critic.json')) ? readJson<Record<string, unknown>>(join(dir, 'critic.json')) : {}
    const shots = existsSync(join(dir, 'shots.json')) ? readJson<{ webgpu: boolean }>(join(dir, 'shots.json')) : null
    rows.push(
      `| ${c.id} | ${c.skill} | ${s.skillsUsed.join(', ') || 'none'} | ${s.turnsDone}/${c.turns.length} | ${s.added.length} | ` +
        `${s.finishes.length} | ${s.totalAmd.toLocaleString('en-US')} | ${s.toolErrors} | ${shots ? (shots.webgpu ? 'yes' : 'no GPU') : '-'} | ` +
        [...CRITERIA, 'overall'].map((k) => score(critic, k)).join(' | ') + ' |',
    )
    const issues = Array.isArray(critic.issues) ? (critic.issues as string[]) : []
    const reasons = [...CRITERIA, 'overall']
      .map((k) => [k, (critic[k] as { reason?: string } | undefined)?.reason] as const)
      .filter(([, reason]) => reason)
      .map(([k, reason]) => `- ${k} ${score(critic, k)}: ${reason}`)
    details.push(
      `### ${c.id}\n\n${c.turns.map((t, i) => `${i + 1}. "${t}"`).join('\n')}\n\n` +
        `Skills loaded: ${s.skillsLoaded.join(', ') || 'none'}. Used: ${s.skillsUsed.join(', ') || 'none'}. ` +
        `Tools: ${s.toolCount} calls, ${s.toolErrors} errors. Finishes: ${s.finishes.map((f) => `${f.target} ${f.ref}`).join('; ') || 'none'}.` +
        (s.errors.length ? `\n\nTurn errors: ${s.errors.join(' | ')}` : '') +
        (reasons.length ? `\n\nCritic scores:\n${reasons.join('\n')}` : '') +
        `\n\nCritic issues:\n${issues.map((i) => `- ${i}`).join('\n') || '- none'}\n\nAgent's last answer:\n\n> ${s.answers.at(-1)?.replace(/\n+/g, '\n> ') ?? ''}\n`,
    )
  }
  const report = [
    `# Designer eval: ${flags.run} (${flags.set} set, skills ${runConfig.skills})`,
    '',
    `| case | skill expected | skills used | turns | items added | finishes | total AMD | tool errors | render | ${[...CRITERIA, 'overall'].join(' | ')} |`,
    `|${'---|'.repeat(9 + CRITERIA.length + 1)}`,
    ...rows,
    '',
    ...details,
  ].join('\n')
  writeFileSync(join(runDir, 'report.md'), report)
  log(`report: ${join(runDir, 'report.md')}`)
}

// ---------------------------------------------------------------------------------------------------------------

try {
  if (steps.has('agent')) {
    for (const c of cases) {
      const metaFile = join(caseDir(c), 'meta.json')
      const done = existsSync(metaFile) && readJson<CaseMeta>(metaFile).turnsDone >= c.turns.length && existsSync(join(caseDir(c), 'summary.json'))
      if (done) log(`${c.id}: turns done, skipped`)
      else await runAgent(c)
    }
    await closeAgentSessions(2000)
  }
  if (steps.has('shots')) {
    const todo = cases.filter((c) => existsSync(join(caseDir(c), 'meta.json')) && !(existsSync(join(caseDir(c), 'shots.json')) && existsSync(join(caseDir(c), 'eye.json'))))
    if (todo.length) await takeShots(todo)
  }
  if (steps.has('critic')) {
    for (const c of cases) {
      const file = join(caseDir(c), 'critic.json')
      if (existsSync(file) || !existsSync(join(caseDir(c), 'summary.json'))) continue
      log(`${c.id}: critic`)
      try {
        writeFileSync(file, JSON.stringify(await runCritic(c), null, 2))
      } catch (error) {
        log(`  ${String(error)}`)
      }
    }
  }
  if (steps.has('report')) writeReport(loadCases(caseFile))
} finally {
  await closeAgentSessions(2000)
}
process.exit(0)
