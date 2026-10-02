// One real architect turn per flat: an empty scene, the developer's plan image, "Build this flat from the
// developer's plan". Saves the transcript, the built graph, the agent's own view_scene captures, a top view of the
// result next to the plan and the template, and the score against the template (score.ts).
//
//   node --experimental-strip-types --no-warnings evals/architect/run.ts --run <name> --flat <id>
//        [--port 3033] [--steps agent,shots,score] [--timeout-min 45] [--model claude-opus-5-5]
//   node --experimental-strip-types --no-warnings evals/architect/run.ts --summary    (every scored run, one table)
//
// Needs the web app on --port for view_scene and the shots (it renders through POST /api/render), started with the
// same PASCAL_DB_PATH so /editor/<sceneId> shows the result:
//   PASCAL_DB_PATH=.data/architect/pascal.db VARPET_DATA_DIR=.data/architect/data VARPET_PUBLIC_ORIGIN=http://localhost:3033 \
//     pnpm --filter @varpet/web exec next dev --port 3033
// Plans: .data/architect/plans/<id>/source.png (git -C <v1 repo> show origin/main:apartments/<id>/source.png).
// Every step writes its own file under .data/architect/runs/<run>/<flat>/ and is skipped when it exists. The agent
// step spends Felix's subscription.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'
import type { AgentEvent } from '../../packages/contracts/src/index.ts'
import { closeAgentSessions, runTurn } from '../../packages/agents/src/index.ts'
import { httpRenderer, planView } from '../../packages/scene-mcp/src/view-scene.ts'
import { formatScore, loadTemplate, scoreShell, summaryRow, summaryTable, type Graph, type ShellScore } from './score.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const DATA = join(ROOT, '.data/architect')
const MESSAGE = "Build this flat from the developer's plan"

const { values: flags } = parseArgs({
  options: {
    run: { type: 'string' },
    flat: { type: 'string' },
    port: { type: 'string', default: '3033' },
    steps: { type: 'string', default: 'agent,shots,score' },
    'timeout-min': { type: 'string', default: '45' },
    model: { type: 'string' },
    message: { type: 'string', default: MESSAGE },
    summary: { type: 'boolean', default: false },
  },
})
if (flags.summary) {
  const rows: string[][] = []
  const runs = join(DATA, 'runs')
  for (const run of existsSync(runs) ? readdirSync(runs).sort() : []) {
    for (const flat of readdirSync(join(runs, run)).sort()) {
      const scored = join(runs, run, flat, 'score.json')
      if (existsSync(scored)) rows.push(summaryRow(`${run}/${flat}`, JSON.parse(readFileSync(scored, 'utf8')) as ShellScore))
    }
  }
  console.log(summaryTable(rows))
  process.exit(0)
}
if (!flags.run || !/^[\w.-]+$/.test(flags.run)) throw new Error('--run <name> is required')
if (!flags.flat || !/^[\w.-]+$/.test(flags.flat)) throw new Error('--flat <template id> is required')
const steps = new Set(flags.steps!.split(','))
const origin = `http://localhost:${flags.port}`
const renderUrl = `http://127.0.0.1:${flags.port}/api/render`
const dir = join(DATA, 'runs', flags.run, flags.flat)
mkdirSync(dir, { recursive: true })
const env: NodeJS.ProcessEnv = {
  ...process.env,
  VARPET_DATA_DIR: join(DATA, 'data'),
  PASCAL_DB_PATH: join(DATA, 'pascal.db'),
  VARPET_PUBLIC_ORIGIN: origin,
  VARPET_RENDER_URL: renderUrl,
}
const store = await createSceneStore(env)
const log = (...parts: unknown[]) => console.log(`[architect ${new Date().toISOString().slice(11, 19)}]`, ...parts)
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T
const file = (name: string) => join(dir, name)

/** The plan as the model sees it: long edge at most 1568 px (the API downsamples past that anyway). */
function planImage() {
  const source = join(DATA, 'plans', flags.flat!, 'source.png')
  if (!existsSync(source)) throw new Error(`no plan at ${source}`)
  const out = file('plan.png')
  if (!existsSync(out)) execFileSync('sips', ['-Z', '1568', source, '--out', out], { stdio: 'ignore' })
  return out
}

interface Meta { sceneId: string; conversationId: string | null; durationMs: number | null; error: string | null }

async function agent() {
  const plan = planImage()
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const sceneId = (await store.save({ name: `architect ${flags.run} ${flags.flat}`, graph: bridge.exportJSON() })).id
  const meta: Meta = { sceneId, conversationId: null, durationMs: null, error: null }
  writeFileSync(file('events.ndjson'), '')
  writeFileSync(file('raw.ndjson'), '')
  log(`${flags.flat}: scene ${sceneId}, ${origin}/editor/${sceneId}`)
  const request = { sceneId, message: flags.message!, images: [`data:image/png;base64,${readFileSync(plan).toString('base64')}`] }
  for await (const event of runTurn('architect', request, {
    root: ROOT,
    env,
    edits: 'direct',
    timeoutMs: Number(flags['timeout-min']) * 60_000,
    ...(flags.model ? { model: flags.model } : {}),
    onRawLine: (line) => appendFileSync(file('raw.ndjson'), `${line}\n`),
  })) {
    appendFileSync(file('events.ndjson'), `${JSON.stringify(event)}\n`)
    if (event.type === 'session') meta.conversationId = event.conversationId
    if (event.type === 'tool' && event.status === 'running') log(`  ${event.name}`)
    if (event.type === 'tool' && event.status === 'error') log(`  ${event.name} failed: ${event.summary}`)
    if (event.type === 'done') meta.durationMs = event.durationMs
    if (event.type === 'error') meta.error = event.message
  }
  await closeAgentSessions()
  const scene = await store.load(sceneId)
  writeFileSync(file('built.json'), JSON.stringify(scene?.graph ?? null))
  writeFileSync(file('meta.json'), JSON.stringify(meta, null, 2))
  log(meta.error ? `  turn failed: ${meta.error}` : `  done in ${Math.round((meta.durationMs ?? 0) / 1000)} s`)
}

/** The agent's own view_scene pictures, from the transcript, in order. */
function extractCaptures() {
  const toolNames = new Map<string, { name: string; input: unknown }>()
  const index: Array<{ file: string; input: unknown; caption: string }> = []
  for (const raw of readFileSync(file('raw.ndjson'), 'utf8').split('\n')) {
    if (!raw.trim()) continue
    const line = JSON.parse(raw) as Record<string, any>
    for (const block of line.message?.content ?? []) {
      if (line.type === 'assistant' && block.type === 'tool_use') toolNames.set(block.id, { name: block.name, input: block.input })
      if (line.type !== 'user' || block.type !== 'tool_result' || !Array.isArray(block.content)) continue
      const tool = toolNames.get(block.tool_use_id)
      if (!tool?.name.endsWith('view_scene')) continue
      const image = block.content.find((c: any) => c.type === 'image')
      if (!image) continue
      const name = `capture-${String(index.length + 1).padStart(2, '0')}.jpg`
      writeFileSync(file(name), Buffer.from(image.source?.data ?? image.data, 'base64'))
      index.push({ file: name, input: tool.input, caption: block.content.find((c: any) => c.type === 'text')?.text ?? '' })
    }
  }
  writeFileSync(file('captures.json'), JSON.stringify(index, null, 2))
  return index
}

async function topView(graph: Graph, out: string) {
  const plan = planView(graph as never, { view: 'top', width: 1200, height: 900 })
  const result = await httpRenderer(renderUrl)({ ...plan.request, graph })
  writeFileSync(out, Buffer.from(result.image, 'base64'))
}

async function shots() {
  const captures = extractCaptures()
  log(`${flags.flat}: ${captures.length} view_scene captures`)
  const built = readJson<Graph | null>(file('built.json'))
  if (!built || !Object.values(built.nodes).some((n) => (n as { type?: string }).type === 'wall')) {
    log('  nothing built: no shots')
    return
  }
  await topView(built, file('built-top.jpg'))
  await topView(loadTemplate(flags.flat!), file('template-top.jpg'))
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({
    executablePath: process.env.VARPET_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  })
  try {
    const page = await browser.newPage({ viewport: { width: 2400, height: 900 } })
    const img = (name: string, label: string) =>
      `<figure><img src="data:image/${name.endsWith('png') ? 'png' : 'jpeg'};base64,${readFileSync(file(name)).toString('base64')}"><figcaption>${label}</figcaption></figure>`
    await page.setContent(
      `<style>body{margin:0;display:flex;gap:8px;background:#fff;font:16px sans-serif}figure{margin:0;flex:1}img{width:100%;height:850px;object-fit:contain}</style>` +
        img('plan.png', 'developer plan') + img('built-top.jpg', `architect (${flags.run})`) + img('template-top.jpg', 'template (ground truth)'),
    )
    await page.screenshot({ path: file('compare.png'), fullPage: true })
  } finally {
    await browser.close()
  }
  log(`  ${file('compare.png')}`)
}

function score() {
  const built = readJson<Graph>(file('built.json'))
  const result = scoreShell(built, loadTemplate(flags.flat!))
  const meta = existsSync(file('meta.json')) ? readJson<Meta>(file('meta.json')) : null
  const text = `${formatScore(result, `${flags.run} / ${flags.flat}`)}\n\nturn: ${meta?.error ?? 'ok'}, ${Math.round((meta?.durationMs ?? 0) / 1000)} s`
  writeFileSync(file('score.json'), JSON.stringify(result, null, 2))
  writeFileSync(file('score.txt'), text)
  console.log(text)
  console.log(`\n${summaryTable([summaryRow(`${flags.run}/${flags.flat}`, result)])}`)
}

if (steps.has('agent') && !existsSync(file('built.json'))) await agent()
if (steps.has('shots') && !existsSync(file('compare.png'))) await shots()
if (steps.has('score')) score()
