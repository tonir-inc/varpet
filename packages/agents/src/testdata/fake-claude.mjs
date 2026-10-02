#!/usr/bin/env node
// Stands in for `claude -p --input-format stream-json` in tests: a long-lived process that reads one user line per
// turn from stdin, "places" one product in the bound scene and streams stream-json. Records its argv (argv.json),
// one line per start (spawns.jsonl) and every stdin line (stdin.jsonl) in its cwd.
// FAKE_CLAUDE_MODE: normal (default) | mcp-failed | hang (waits for an interrupt) | deaf (ignores interrupts) |
// crash (dies in the middle of its second turn).
// Like CLI 2.1.283, an interrupt that arrives before a later turn's init is acknowledged and ignored.
import { appendFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { createSceneStore } from '@pascal-app/mcp/storage'

const args = process.argv.slice(2)
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
writeFileSync('argv.json', JSON.stringify(args))
appendFileSync('spawns.jsonl', `${JSON.stringify({ pid: process.pid, args })}\n`)
const sessionId = flag('--session-id') ?? flag('--resume')
const server = JSON.parse(flag('--mcp-config')).mcpServers.scene
const mode = process.env.FAKE_CLAUDE_MODE ?? 'normal'
const out = (line) => process.stdout.write(`${JSON.stringify(line)}\n`)
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const init = (status = 'connected') =>
  out({ type: 'system', subtype: 'init', session_id: sessionId, mcp_servers: [{ name: 'scene', status }] })
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 }

let turns = 0
let current = null // { n, inited, interrupted, wake }
let store = null

function interrupt() {
  if (!current || mode === 'deaf') return
  if (!current.inited && current.n >= 2) return // the CLI bug
  current.interrupted = true
  current.wake?.()
}

function interruptedResult() {
  out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: '', session_id: sessionId, usage })
}

async function turn() {
  const me = (current = { n: ++turns, inited: false, interrupted: false, wake: null })
  await sleep(50) // the window in which the real CLI drops an interrupt
  if (mode === 'mcp-failed') return init('failed')
  init()
  me.inited = true
  if (me.interrupted) return interruptedResult()
  if (mode === 'hang' || mode === 'deaf' || (mode === 'crash' && me.n === 2)) {
    out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } })
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Working' } } })
    if (mode === 'crash') process.exit(3)
    await new Promise((done) => (me.wake = done))
    return interruptedResult()
  }
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } })
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Placing' } } })
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Placing' }, { type: 'tool_use', id: `toolu_${me.n}`, name: 'mcp__scene__place_product', input: { product_id: 'abo:X' } }] } })
  store ??= await createSceneStore({ PASCAL_DB_PATH: server.env.PASCAL_DB_PATH })
  const scene = await store.load(server.env.VARPET_SCENE_ID)
  const nodes = { ...scene.graph.nodes }
  for (const id of ['item_a', 'item_b']) {
    nodes[id] = { id, type: 'item', asset: { name: 'Bedside table' }, metadata: { productId: 'abo:X', priceAmd: 42000, shop: 'Movian' } }
  }
  await store.save({ id: scene.id, name: scene.name, graph: { ...scene.graph, nodes }, expectedVersion: scene.version })
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${me.n}`, content: [{ type: 'text', text: '{"itemId":"item_a"}' }] }] } })
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1790000000 } })
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } } })
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Two tables.' } } })
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 10, result: 'Two tables.\n\nMore detail.', session_id: sessionId, usage })
}

let queue = Promise.resolve()
createInterface({ input: process.stdin, crlfDelay: Infinity })
  .on('line', (raw) => {
    appendFileSync('stdin.jsonl', `${raw}\n`)
    const message = JSON.parse(raw)
    if (message.type === 'control_request') {
      out({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id } })
      if (message.request?.subtype === 'interrupt') interrupt()
    } else if (message.type === 'user') {
      queue = queue.then(turn)
    }
  })
  .on('close', () => queue.then(() => process.exit(0)))
