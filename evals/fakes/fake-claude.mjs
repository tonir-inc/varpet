#!/usr/bin/env node
// Stands in for `claude -p` in eval runs, so the runner's parallelism, renders and timings can be measured with no
// model calls (VARPET_CLAUDE_BIN=evals/fakes/fake-claude.mjs). Two shapes, by argv:
// - critic (`--json-schema`): reads the one user line, waits FAKE_CRITIC_MS (default 3000), answers every criterion 3.
// - designer (long-lived, one stdin line per turn): waits FAKE_TURN_MS (default 20000) in all, places six real catalog
//   products in the room the message names (else the largest room) of its bound scene, and renders FAKE_VIEWS
//   (default 2) views of it through POST /api/render, as the real designer's view_scene does.
// FAKE_RATE_LIMIT=once: the first designer turn of the run (marker file in FAKE_STATE_DIR) is rejected with a
// rate_limit_event and an error result, like a spent subscription window; later turns run normally.
import { appendFileSync, closeSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createSceneStore } from '@pascal-app/mcp/storage'

const args = process.argv.slice(2)
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const out = (line) => process.stdout.write(`${JSON.stringify(line)}\n`)
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 }
const sessionId = flag('--session-id') ?? flag('--resume') ?? 'fake-critic'

// ---------------------------------------------------------------------------------------------------------------
// Critic

if (args.includes('--json-schema')) {
  const schema = JSON.parse(flag('--json-schema'))
  createInterface({ input: process.stdin }).once('line', async () => {
    await sleep(Number(process.env.FAKE_CRITIC_MS ?? 3000))
    const answer = {}
    for (const key of schema.required) answer[key] = key === 'issues' ? ['fake critic: no real review'] : { score: 3, reason: 'fake critic' }
    out({ type: 'result', subtype: 'success', is_error: false, result: '', structured_output: answer, session_id: sessionId, usage })
    process.exit(0)
  })
} else {
  designer()
}

// ---------------------------------------------------------------------------------------------------------------
// Designer

function designer() {
  const server = JSON.parse(flag('--mcp-config')).mcpServers.scene
  const origin = (server.env.VARPET_PUBLIC_ORIGIN ?? 'http://localhost:3010').replace(/\/$/, '')
  const turnMs = Number(process.env.FAKE_TURN_MS ?? 20_000)
  const views = Number(process.env.FAKE_VIEWS ?? 2)
  let store = null
  let turns = 0

  // Real catalog products (sizes from the catalog) the fake places, with where they stand relative to the room centre.
  const model = (file) => `${origin}/api/catalog/models/${file}.glb`
  const PRODUCTS = [
    { id: 'abo:B07B4M2QSW', category: 'sofa', name: 'Stone & Beam Isabel sofa', dims: [2.131, 0.902, 0.791], file: 'B07B4M2QSW', price: 273000, at: [0, -0.3] },
    { id: 'abo:B07K7K9224', category: 'table', name: 'Alkove Hayes square coffee table', dims: [0.9, 0.45, 0.9], file: 'B07K7K9224', price: 98000, at: [0, 0] },
    { id: 'abo:B0732D26C3', category: 'rug', name: 'Stone & Beam contemporary rug', dims: [2.976, 0.018, 2.43], file: 'B0732D26C3', price: 120000, at: [0, -0.05] },
    { id: 'abo:B0719WQH8S', category: 'chair', name: 'Rivet Revolve armchair', dims: [0.855, 0.922, 0.82], file: 'B0719WQH8S', price: 150000, at: [0.3, 0.1] },
    { id: 'abo:B0828FBDV7', category: 'lamp', name: 'Ravenna swing-arm floor lamp', dims: [0.324, 1.6, 0.416], file: 'B0828FBDV7', price: 45000, at: [-0.3, -0.3] },
    { id: 'extra:home:plant-floor-potted-shrub-terracotta', category: 'plant', name: 'Potted shrub in terracotta urn', dims: [0.59, 1.35, 0.64], file: 'extra-home-plant-floor-potted-shrub-terracotta', price: 30000, at: [-0.3, 0.3] },
  ]

  const inside = ([x, z], polygon) => {
    let hit = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, zi] = polygon[i]
      const [xj, zj] = polygon[j]
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
    }
    return hit
  }
  const box = (polygon) => {
    const xs = polygon.map((p) => p[0])
    const zs = polygon.map((p) => p[1])
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
    return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }
  }
  const area = (polygon) => Math.abs(polygon.reduce((s, [x1, z1], i) => { const [x2, z2] = polygon[(i + 1) % polygon.length]; return s + x1 * z2 - x2 * z1 }, 0)) / 2

  /** The zone the message names, else the largest one. */
  function pickZone(graph, message) {
    const zones = Object.values(graph.nodes).filter((n) => n.type === 'zone' && Array.isArray(n.polygon) && n.polygon.length >= 3)
    const text = message.toLowerCase()
    const named = zones.filter((z) => z.name && text.includes(String(z.name).toLowerCase())).sort((a, b) => area(b.polygon) - area(a.polygon))
    return named[0] ?? zones.sort((a, b) => area(b.polygon) - area(a.polygon))[0] ?? null
  }

  async function place(message) {
    store ??= await createSceneStore({ PASCAL_DB_PATH: server.env.PASCAL_DB_PATH })
    const scene = await store.load(server.env.VARPET_SCENE_ID)
    const nodes = { ...scene.graph.nodes }
    const level = Object.values(nodes).find((n) => n.type === 'level')
    const zone = pickZone(scene.graph, message)
    const b = zone ? box(zone.polygon) : { cx: 0, cz: 0, w: 4, d: 4 }
    const placed = []
    for (const p of PRODUCTS) {
      const id = `item_fake${turns}_${p.category}`
      let at = [b.cx + p.at[0] * b.w, b.cz + p.at[1] * b.d]
      if (zone && !inside(at, zone.polygon)) at = [b.cx, b.cz]
      nodes[id] = {
        object: 'node', id, type: 'item', name: p.name, parentId: level?.id ?? null, visible: true,
        metadata: { productId: p.id, priceAmd: p.price, shop: 'Fake shop' },
        position: [at[0], 0, at[1]], rotation: [0, 0, 0], scale: [1, 1, 1], children: [],
        asset: { id: p.id, category: p.category, name: p.name, source: 'library', src: model(p.file), dimensions: p.dims, tags: [p.category], offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      }
      if (level) nodes[level.id] = { ...nodes[level.id], children: [...(nodes[level.id].children ?? []), id] }
      placed.push(id)
    }
    await store.save({ id: scene.id, name: scene.name, graph: { ...scene.graph, nodes }, expectedVersion: scene.version })
    return { graph: { ...scene.graph, nodes }, box: b, placed, zone: zone?.name ?? 'whole flat' }
  }

  async function render(graph, b, i) {
    const r = Math.max(b.w, b.d)
    const angle = (i * Math.PI) / 2 + Math.PI / 4
    const request = {
      graph,
      camera: { projection: 'perspective', position: [b.cx + Math.cos(angle) * r, 2.6 + r * 0.5, b.cz + Math.sin(angle) * r], target: [b.cx, 0.6, b.cz], fov: 50 },
      wallMode: 'cutaway',
      width: 1024,
      height: 768,
    }
    const started = Date.now()
    const response = await fetch(`${origin}/api/render`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(170_000) })
    const body = await response.json().catch(() => ({}))
    return response.ok ? `rendered in ${Date.now() - started} ms (queued ${body.queuedMs} ms, ${body.backend})` : `render failed: ${body.error ?? response.status}`
  }

  function rateLimitedOnce() {
    if (process.env.FAKE_RATE_LIMIT !== 'once') return false
    const dir = process.env.FAKE_STATE_DIR ?? '.'
    mkdirSync(dir, { recursive: true })
    try {
      closeSync(openSync(join(dir, 'rate-limited'), 'wx'))
      return true
    } catch {
      return false
    }
  }

  let toolN = 0
  const tool = (name, input, text) => {
    const id = `toolu_${sessionId.slice(0, 8)}_${++toolN}`
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__scene__${name}`, input }] } })
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } })
  }

  async function turn(message) {
    turns++
    const started = Date.now()
    out({ type: 'system', subtype: 'init', session_id: sessionId, mcp_servers: [{ name: 'scene', status: 'connected' }] })
    if (rateLimitedOnce()) {
      out({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: Math.round(Date.now() / 1000) + 5 } })
      out({ type: 'result', subtype: 'success', is_error: true, result: "You've hit your limit (rate limit)", session_id: sessionId, usage })
      return
    }
    out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } } })
    await sleep(turnMs * 0.4)
    const { graph, box: b, placed, zone } = await place(message)
    for (const id of placed) tool('place_product', { product_id: graph.nodes[id].metadata.productId }, JSON.stringify({ itemId: id }))
    for (let i = 0; i < views; i++) tool('view_scene', { view: '3d' }, await render(graph, b, i))
    out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: Math.round(Date.now() / 1000) + 3600 } })
    await sleep(Math.max(0, turnMs - (Date.now() - started)))
    const text = `Furnished the ${zone} with ${placed.length} pieces (fake designer).`
    out({ type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } } })
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } } })
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: Date.now() - started, result: text, session_id: sessionId, usage })
  }

  let queue = Promise.resolve()
  createInterface({ input: process.stdin, crlfDelay: Infinity })
    .on('line', (raw) => {
      const message = JSON.parse(raw)
      if (message.type === 'control_request') {
        out({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id } })
      } else if (message.type === 'user') {
        const text = (message.message.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join(' ')
        queue = queue.then(() => turn(text)).catch((error) => {
          if (process.env.FAKE_STATE_DIR) appendFileSync(join(process.env.FAKE_STATE_DIR, 'errors.log'), `${error.stack}\n`)
          out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: String(error), session_id: sessionId, usage })
        })
      }
    })
    .on('close', () => queue.then(() => process.exit(0)))
}
