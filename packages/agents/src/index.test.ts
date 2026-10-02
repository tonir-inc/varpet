import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'
import type { AgentEvent } from '../../contracts/src/index.ts'
import { StreamMapper, proposalProducts, runTurn, toolFlags, userMessageLine } from './index.ts'

const root = resolve(import.meta.dirname, '../../..')
const fakeClaude = join(import.meta.dirname, 'testdata/fake-claude.mjs')

async function fixture() {
  const dataDir = mkdtempSync(join(tmpdir(), 'agents-'))
  const dbPath = join(dataDir, 'pascal.db')
  const store = await createSceneStore({ PASCAL_DB_PATH: dbPath })
  const bridge = new SceneBridge()
  bridge.loadDefault()
  const meta = await store.save({ name: 'Flat', graph: bridge.exportJSON() })
  const env = { ...process.env, VARPET_DATA_DIR: dataDir, PASCAL_DB_PATH: dbPath, VARPET_CLAUDE_BIN: fakeClaude }
  return { store, env, dataDir, sceneId: meta.id }
}

async function collect(iterable: AsyncIterable<AgentEvent>) {
  const events: AgentEvent[] = []
  for await (const event of iterable) events.push(event)
  return events
}

test('a designer turn streams session, deltas, tools, proposal and done in order', async () => {
  const { store, env, dataDir, sceneId } = await fixture()
  const events = await collect(runTurn('designer', { sceneId, message: 'two bedside tables' }, { root, env }))
  const types = events.map((e) => e.type)
  assert.equal(types[0], 'session')
  assert.equal(types.at(-1), 'done', JSON.stringify(events.at(-1)))
  assert.equal(types.at(-2), 'proposal')

  const session = events[0] as Extract<AgentEvent, { type: 'session' }>
  assert.equal(session.role, 'designer')
  assert.match(session.proposalSceneId ?? '', /^proposal-/)
  assert.deepEqual(
    events.filter((e) => e.type === 'message_delta').map((e) => (e as { text: string }).text),
    ['Placing', '\n\n', 'Two tables.'],
  )
  const tools = events.filter((e) => e.type === 'tool') as Array<Extract<AgentEvent, { type: 'tool' }>>
  assert.deepEqual(tools.map((t) => [t.name, t.status]), [['place_product', 'running'], ['place_product', 'done']])
  assert.deepEqual(events.find((e) => e.type === 'rate_limit'), { type: 'rate_limit', status: 'allowed', resetsAt: 1790000000000 })

  const proposal = events.at(-2) as Extract<AgentEvent, { type: 'proposal' }>
  assert.equal(proposal.baseSceneId, sceneId)
  assert.equal(proposal.proposalSceneId, session.proposalSceneId)
  assert.equal(proposal.summary, 'Two tables.')
  assert.deepEqual(proposal.products, [{ productId: 'abo:X', name: 'Bedside table', priceAmd: 42000, shop: 'Movian', count: 2 }])
  // The base scene is untouched; the agent edited the copy.
  assert.ok(!(await store.load(sceneId))!.graph.nodes['item_a' as never])

  const done = events.at(-1) as Extract<AgentEvent, { type: 'done' }>
  assert.equal(done.conversationId, session.conversationId)
  const cwd = join(dataDir, 'agents', session.conversationId)
  const argv = JSON.parse(readFileSync(join(cwd, 'argv.json'), 'utf8')) as string[]
  const at = (flag: string) => argv[argv.indexOf(flag) + 1]
  assert.equal(at('--model'), 'claude-opus-5-5')
  assert.equal(at('--effort'), 'medium')
  assert.equal(at('--tools'), '')
  assert.equal(at('--setting-sources'), '')
  assert.equal(at('--permission-mode'), 'dontAsk')
  assert.equal(at('--session-id'), session.conversationId)
  for (const f of ['--strict-mcp-config', '--disable-slash-commands', '--verbose', '--include-partial-messages']) {
    assert.ok(argv.includes(f), f)
  }
  assert.match(at('--allowedTools'), /mcp__scene__place_product/)
  assert.match(at('--disallowedTools'), /mcp__scene__place_item/)
  const mcp = JSON.parse(at('--mcp-config')).mcpServers.scene
  assert.equal(mcp.env.VARPET_SCENE_ID, session.proposalSceneId)

  // The next turn resumes the same session and keeps editing the same proposal.
  const next = await collect(
    runTurn('designer', { sceneId, conversationId: session.conversationId, message: 'thanks' }, { root, env }),
  )
  assert.deepEqual(next[0], { ...session })
  const argv2 = JSON.parse(readFileSync(join(cwd, 'argv.json'), 'utf8')) as string[]
  assert.equal(argv2[argv2.indexOf('--resume') + 1], session.conversationId)
  assert.ok(!argv2.includes('--session-id'))
})

test('direct mode edits the scene itself and emits no proposal', async () => {
  const { store, env, sceneId } = await fixture()
  const events = await collect(runTurn('designer', { sceneId, message: 'go' }, { root, env, edits: 'direct' }))
  assert.deepEqual(events[0], { ...events[0], proposalSceneId: null })
  assert.ok(!events.some((e) => e.type === 'proposal'))
  assert.equal(events.at(-1)!.type, 'done')
  assert.ok((await store.load(sceneId))!.graph.nodes['item_a' as never])
})

test('images go in as base64 image blocks before the text', () => {
  const line = JSON.parse(userMessageLine('plan', ['data:image/png;base64,AAAA']))
  assert.deepEqual(line.message.content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    { type: 'text', text: 'plan' },
  ])
  assert.throws(() => userMessageLine('x', ['https://example.com/a.png']))
})

test('the architect uses high effort and cannot place products', async () => {
  const { env, dataDir, sceneId } = await fixture()
  const events = await collect(runTurn('architect', { sceneId, message: 'walls' }, { root, env }))
  const session = events[0] as Extract<AgentEvent, { type: 'session' }>
  const argv = JSON.parse(readFileSync(join(dataDir, 'agents', session.conversationId, 'argv.json'), 'utf8')) as string[]
  assert.equal(argv[argv.indexOf('--effort') + 1], 'high')
  const flags = toolFlags('architect')
  assert.ok(flags.allowed.includes('mcp__scene__create_room'))
  assert.ok(!flags.allowed.includes('place_product'))
  assert.ok(flags.disallowed.includes('mcp__scene__place_product'))
})

test('a scene MCP server that fails to start ends the turn with an error', async () => {
  const { env, sceneId } = await fixture()
  const events = await collect(
    runTurn('designer', { sceneId, message: 'x' }, { root, env: { ...env, FAKE_CLAUDE_MODE: 'mcp-failed' } }),
  )
  assert.deepEqual(events.at(-1), { type: 'error', message: 'scene MCP server did not start (failed)' })
})

test('the wall-clock timeout kills the process and reports an error', async () => {
  const { env, sceneId } = await fixture()
  const events = await collect(
    runTurn('designer', { sceneId, message: 'x' }, { root, env: { ...env, FAKE_CLAUDE_MODE: 'hang' }, timeoutMs: 500 }),
  )
  assert.equal(events.at(-1)!.type, 'error')
  assert.match((events.at(-1) as { message: string }).message, /timed out/)
})

test('bad requests fail before spawning anything', async () => {
  const { env, sceneId } = await fixture()
  assert.equal((await collect(runTurn('designer', { sceneId: 'missing', message: 'x' }, { root, env })))[0]!.type, 'error')
  const bad = await collect(runTurn('designer', { sceneId, conversationId: '../etc', message: 'x' }, { root, env }))
  assert.deepEqual(bad, [{ type: 'error', message: 'conversationId is not a valid id' }])
})

test('proposalProducts counts only items the proposal added', () => {
  const item = (productId: string) => ({ type: 'item', asset: { name: productId }, metadata: { productId, priceAmd: 1, shop: null } })
  const base = { nodes: { a: item('p1') } }
  const proposal = { nodes: { a: item('p1'), b: item('p1'), c: item('p2'), d: { type: 'wall' } } }
  assert.deepEqual(proposalProducts(base, proposal), [
    { productId: 'p1', name: 'p1', priceAmd: 1, shop: null, count: 1 },
    { productId: 'p2', name: 'p2', priceAmd: 1, shop: null, count: 1 },
  ])
})

test('the mapper skips subagent output and reports a failed result', () => {
  const mapper = new StreamMapper()
  assert.deepEqual(
    mapper.map({ type: 'stream_event', parent_tool_use_id: 'x', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hidden' } } }),
    [],
  )
  assert.deepEqual(mapper.map({ type: 'result', subtype: 'error_max_turns', is_error: true }), [])
  assert.equal(mapper.result?.subtype, 'error_max_turns')
})
