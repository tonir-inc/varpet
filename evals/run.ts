// Skills eval: runs each case's buyer turns through the real agent runner (packages/agents runTurn, Felix's
// subscription), saves the event stream and the proposal graph, screenshots the proposal in the editor (WebGPU,
// headless Chrome via Playwright, dev server on --port), asks a critic `claude -p` to score it, writes report.md.
//
//   node --experimental-strip-types --no-warnings evals/run.ts --run <name> [--cases a,b] [--skills on|off]
//        [--port 3028] [--steps agent,shots,critic,report]
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
import { EVALS_DIR, loadCases, selectCases, type EvalCase } from './cases.ts'
import { summarize, type CaseSummary } from './summary.ts'

const ROOT = resolve(EVALS_DIR, '..')
const STEPS = ['agent', 'shots', 'critic', 'report'] as const
type Step = (typeof STEPS)[number]

const { values: flags } = parseArgs({
  options: {
    run: { type: 'string' },
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
const cases = selectCases(loadCases(), flags.cases ? flags.cases.split(',') : null)
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
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
      try {
        log(`${c.id}: screenshot ${sceneId}`)
        await page.goto(`${origin}/editor/${sceneId}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
        await page.waitForSelector('canvas', { timeout: 120_000 })
        const gpu = await page.evaluate(async () => {
          const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }
          return nav.gpu ? Boolean(await nav.gpu.requestAdapter()) : false
        })
        await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
        await page.waitForTimeout(5000)
        await page.locator('canvas').first().screenshot({ path: join(dir, 'shot-3d.png') })
        await page.getByRole('button', { name: 'Top' }).click({ timeout: 10_000 })
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
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
  } finally {
    await browser.close()
    try {
      process.kill(-server.pid!, 'SIGTERM')
    } catch {}
    log('dev server stopped')
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Critic: a separate claude -p with no tools scores the case from the screenshots and the summary.

const CRITIC_PROMPT = `You review one job by varpet's AI interior designer (or its architect) in a buyer's new flat in Yerevan.
You get the buyer's asks, what a good answer does, the agent's final words, a data summary of what it changed in the
scene (products with sizes, positions and prices; wall and floor finishes; tool errors), and screenshots of the result
(3D and top view of the whole flat; the room in question is one part of it). Trust the data for sizes and positions.

Score each criterion 1-5 (5 = a professional designer would sign it), or null when it does not apply to this ask:
- fills: the room is filled sensibly for its use, a finished first pass, nothing essential missing
- sizes: real sizes and clearances: pieces inside the room, no overlaps, nothing through walls, walkways >= 0.75 m, door paths clear
- brief: follows the brief, including walls and floors when asked
- explains: explains itself in plain words with the numbers that matter (clearances, prices, total)
- honest: no invented products, sizes, prices or abilities; what it says matches the data
Then overall 1-5, and up to five short concrete issues. Be strict and specific.`

const CRITIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fills', 'sizes', 'brief', 'explains', 'honest', 'overall', 'issues'],
  properties: {
    ...Object.fromEntries(['fills', 'sizes', 'brief', 'explains', 'honest'].map((k) => [k, { type: ['integer', 'null'], minimum: 1, maximum: 5 }])),
    overall: { type: 'integer', minimum: 1, maximum: 5 },
    issues: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
}

function runCritic(c: EvalCase): Promise<Record<string, unknown>> {
  const dir = caseDir(c)
  const summary = readJson<CaseSummary>(join(dir, 'summary.json'))
  const images = ['shot-top.png', 'shot-3d.png']
    .filter((f) => existsSync(join(dir, f)))
    .map((f) => `data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}`)
  const { trace: _trace, ...forCritic } = summary
  const text = [
    `Room: ${c.room} (flat ${c.templateId ?? 'from the plan image'}). Role: ${c.role}.`,
    `Buyer asks, in order: ${c.turns.map((t, i) => `(${i + 1}) ${t}`).join(' ')}`,
    `A good answer: ${c.expect}`,
    images.length ? `Screenshots: ${images.length === 2 ? 'top view, then 3D view' : 'one view'}.` : 'No screenshots (rendering failed).',
    `Data summary:\n${JSON.stringify(forCritic)}`,
  ].join('\n\n')
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
  const score = (v: unknown) => (typeof v === 'number' ? String(v) : '-')
  for (const c of all) {
    const dir = caseDir(c)
    if (!existsSync(join(dir, 'summary.json'))) continue
    const s = readJson<CaseSummary>(join(dir, 'summary.json'))
    const critic = existsSync(join(dir, 'critic.json')) ? readJson<Record<string, unknown>>(join(dir, 'critic.json')) : {}
    const shots = existsSync(join(dir, 'shots.json')) ? readJson<{ webgpu: boolean }>(join(dir, 'shots.json')) : null
    rows.push(
      `| ${c.id} | ${c.skill} | ${s.skillsUsed.join(', ') || 'none'} | ${s.turnsDone}/${c.turns.length} | ${s.added.length} | ` +
        `${s.finishes.length} | ${s.totalAmd.toLocaleString('en-US')} | ${s.toolErrors} | ${shots ? (shots.webgpu ? 'yes' : 'no GPU') : '-'} | ` +
        ['fills', 'sizes', 'brief', 'explains', 'honest', 'overall'].map((k) => score(critic[k])).join(' | ') + ' |',
    )
    const issues = Array.isArray(critic.issues) ? (critic.issues as string[]) : []
    details.push(
      `### ${c.id}\n\n${c.turns.map((t, i) => `${i + 1}. "${t}"`).join('\n')}\n\n` +
        `Skills loaded: ${s.skillsLoaded.join(', ') || 'none'}. Used: ${s.skillsUsed.join(', ') || 'none'}. ` +
        `Tools: ${s.toolCount} calls, ${s.toolErrors} errors. Finishes: ${s.finishes.map((f) => `${f.target} ${f.ref}`).join('; ') || 'none'}.` +
        (s.errors.length ? `\n\nTurn errors: ${s.errors.join(' | ')}` : '') +
        `\n\nCritic issues:\n${issues.map((i) => `- ${i}`).join('\n') || '- none'}\n\nAgent's last answer:\n\n> ${s.answers.at(-1)?.replace(/\n+/g, '\n> ') ?? ''}\n`,
    )
  }
  const report = [
    `# Skills eval: ${flags.run} (skills ${runConfig.skills})`,
    '',
    '| case | skill expected | skills used | turns | items added | finishes | total AMD | tool errors | render | fills | sizes | brief | explains | honest | overall |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
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
    const todo = cases.filter((c) => existsSync(join(caseDir(c), 'meta.json')) && !existsSync(join(caseDir(c), 'shots.json')))
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
  if (steps.has('report')) writeReport(loadCases())
} finally {
  await closeAgentSessions(2000)
}
process.exit(0)
