#!/usr/bin/env node
// Stands in for `claude -p` in tests: records its argv, "places" one product in the bound scene, streams stream-json.
import { readFileSync, writeFileSync } from 'node:fs'
import { createSceneStore } from '@pascal-app/mcp/storage'

const args = process.argv.slice(2)
const flag = (name) => args[args.indexOf(name) + 1]
writeFileSync('argv.json', JSON.stringify(args))
const stdin = readFileSync(0, 'utf8')
writeFileSync('stdin.jsonl', stdin)
const sessionId = flag('--session-id') ?? flag('--resume')
const server = JSON.parse(flag('--mcp-config')).mcpServers.scene
const out = (line) => process.stdout.write(`${JSON.stringify(line)}\n`)

if (process.env.FAKE_CLAUDE_MODE === 'mcp-failed') {
  out({ type: 'system', subtype: 'init', session_id: sessionId, mcp_servers: [{ name: 'scene', status: 'failed' }] })
  setTimeout(() => {}, 60_000)
} else if (process.env.FAKE_CLAUDE_MODE === 'hang') {
  out({ type: 'system', subtype: 'init', session_id: sessionId, mcp_servers: [{ name: 'scene', status: 'connected' }] })
  setTimeout(() => {}, 60_000)
} else {
  out({ type: 'system', subtype: 'init', session_id: sessionId, mcp_servers: [{ name: 'scene', status: 'connected' }] })
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } })
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Placing' } } })
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Placing' }, { type: 'tool_use', id: 'toolu_1', name: 'mcp__scene__place_product', input: { product_id: 'abo:X' } }] } })
  const store = await createSceneStore({ PASCAL_DB_PATH: server.env.PASCAL_DB_PATH })
  const scene = await store.load(server.env.VARPET_SCENE_ID)
  const nodes = { ...scene.graph.nodes }
  for (const id of ['item_a', 'item_b']) {
    nodes[id] = { id, type: 'item', asset: { name: 'Bedside table' }, metadata: { productId: 'abo:X', priceAmd: 42000, shop: 'Movian' } }
  }
  await store.save({ id: scene.id, name: scene.name, graph: { ...scene.graph, nodes }, expectedVersion: scene.version })
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: '{"itemId":"item_a"}' }] }] } })
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1790000000 } })
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } } })
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: 'Two tables.' } } })
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 10, result: 'Two tables.\n\nMore detail.', session_id: sessionId })
}
