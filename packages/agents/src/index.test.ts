import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { SceneBridge } from '@pascal-app/mcp/bridge'
import { createSceneStore } from '@pascal-app/mcp/storage'
import type { AgentEvent } from '../../contracts/src/index.ts'
import {
  StreamMapper,
  closeAgentSessions,
  isProposalBusy,
  liveAgentSessions,
  proposalProducts,
  runTurn,
  toolFlags,
  userMessageLine,
} from './index.ts'

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

after(() => closeAgentSessions(500))

/** One line per fake claude start in the conversation's directory: {pid, args}. */
function spawns(dataDir: string, conversationId: string) {
  return readFileSync(join(dataDir, 'agents', conversationId, 'spawns.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { pid: number; args: string[] })
}

function stdinLines(dataDir: string, conversationId: string) {
  return readFileSync(join(dataDir, 'agents', conversationId, 'stdin.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { type: string; request?: { subtype: string } })
}

const flagOf = (args: string[], name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)

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

  // The next turn goes to the same live process (one more stdin line) and keeps editing the same proposal.
  const next = await collect(
    runTurn('designer', { sceneId, conversationId: session.conversationId, message: 'thanks' }, { root, env }),
  )
  assert.deepEqual(next[0], { ...session })
  assert.equal(next.at(-1)!.type, 'done', JSON.stringify(next.at(-1)))
  assert.deepEqual(next.filter((e) => e.type === 'message_delta').map((e) => (e as { text: string }).text), ['Placing', '\n\n', 'Two tables.'])
  assert.equal(spawns(dataDir, session.conversationId).length, 1)
  const users = stdinLines(dataDir, session.conversationId).filter((l) => l.type === 'user')
  assert.equal(users.length, 2)
  assert.deepEqual(users[1], JSON.parse(userMessageLine('thanks')))
  assert.equal(liveAgentSessions().find((p) => p.conversationId === session.conversationId)?.busy, false)
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

test('a proposal is busy from the session event until the agent hands it over', async () => {
  const { env, sceneId } = await fixture()
  let proposalSceneId: string | null = null
  const busyAt: Record<string, boolean> = {}
  for await (const event of runTurn('designer', { sceneId, message: 'two bedside tables' }, { root, env })) {
    if (event.type === 'session') proposalSceneId = event.proposalSceneId
    if (proposalSceneId) busyAt[event.type] = isProposalBusy(proposalSceneId)
  }
  assert.ok(proposalSceneId)
  assert.equal(busyAt.session, true)
  assert.equal(busyAt.tool, true)
  assert.equal(busyAt.proposal, false)
  assert.equal(isProposalBusy(proposalSceneId), false)
})

test('an idle-closed conversation resumes in a new process', async () => {
  const { env, dataDir, sceneId } = await fixture()
  const opts = { root, env: { ...env, VARPET_AGENT_IDLE_MS: '150' } }
  const first = await collect(runTurn('designer', { sceneId, message: 'one' }, opts))
  const { conversationId } = first[0] as Extract<AgentEvent, { type: 'session' }>
  assert.ok(liveAgentSessions().some((p) => p.conversationId === conversationId))
  await new Promise((done) => setTimeout(done, 600))
  assert.ok(!liveAgentSessions().some((p) => p.conversationId === conversationId), 'closed after the idle timeout')
  const second = await collect(runTurn('designer', { sceneId, conversationId, message: 'two' }, opts))
  assert.equal(second.at(-1)!.type, 'done', JSON.stringify(second.at(-1)))
  const started = spawns(dataDir, conversationId)
  assert.equal(started.length, 2)
  assert.equal(flagOf(started[0]!.args, '--session-id'), conversationId)
  assert.equal(flagOf(started[1]!.args, '--resume'), conversationId)
  assert.ok(!started[1]!.args.includes('--session-id'))
})

test('a new work scene (the proposal was applied or dismissed) restarts the process bound to the new copy', async () => {
  const { store, env, dataDir, sceneId } = await fixture()
  const first = await collect(runTurn('designer', { sceneId, message: 'one' }, { root, env }))
  const session = first[0] as Extract<AgentEvent, { type: 'session' }>
  await store.delete(session.proposalSceneId!)
  const second = await collect(runTurn('designer', { sceneId, conversationId: session.conversationId, message: 'two' }, { root, env }))
  const rebound = second[0] as Extract<AgentEvent, { type: 'session' }>
  assert.notEqual(rebound.proposalSceneId, session.proposalSceneId)
  assert.equal(second.at(-1)!.type, 'done', JSON.stringify(second.at(-1)))
  const started = spawns(dataDir, session.conversationId)
  assert.equal(started.length, 2)
  assert.equal(flagOf(started[1]!.args, '--resume'), session.conversationId)
  assert.equal(JSON.parse(flagOf(started[1]!.args, '--mcp-config')!).mcpServers.scene.env.VARPET_SCENE_ID, rebound.proposalSceneId)
  const live = liveAgentSessions().filter((p) => p.conversationId === session.conversationId)
  assert.deepEqual(live.map((p) => p.pid), [started[1]!.pid])
})

test('a cancelled turn is interrupted, re-sent after a later turn\'s init, and keeps its process', async () => {
  const { env, dataDir, sceneId } = await fixture()
  const opts = { root, env: { ...env, FAKE_CLAUDE_MODE: 'hang' }, timeoutMs: 60_000, graceMs: 60_000 }
  // Turn 1: the client goes away after the first words.
  const abort1 = new AbortController()
  const first: AgentEvent[] = []
  for await (const event of runTurn('designer', { sceneId, message: 'one' }, { ...opts, signal: abort1.signal })) {
    first.push(event)
    if (event.type === 'message_delta') abort1.abort()
  }
  assert.deepEqual(first.at(-1), { type: 'error', message: 'agent cancelled' })
  const { conversationId } = first[0] as Extract<AgentEvent, { type: 'session' }>

  // Turn 2: cancelled right after the user line, where CLI 2.1.283 drops the interrupt.
  const abort2 = new AbortController()
  const startedAt = Date.now()
  const second: AgentEvent[] = []
  for await (const event of runTurn('designer', { sceneId, conversationId, message: 'two' }, { ...opts, signal: abort2.signal })) {
    second.push(event)
    if (event.type === 'session') abort2.abort()
  }
  assert.deepEqual(second.at(-1), { type: 'error', message: 'agent cancelled' })
  assert.ok(Date.now() - startedAt < 5000, 'the re-sent interrupt ended the turn')
  const lines = stdinLines(dataDir, conversationId)
  const afterSecond = lines.slice(lines.findLastIndex((l) => l.type === 'user'))
  assert.equal(afterSecond.filter((l) => l.request?.subtype === 'interrupt').length, 2)

  // Turn 3: the client walks away without aborting (the route's events.return()); the next turn still runs.
  for await (const event of runTurn('designer', { sceneId, conversationId, message: 'three' }, opts)) {
    if (event.type === 'message_delta') break
  }
  const abort4 = new AbortController()
  const fourth: AgentEvent[] = []
  for await (const event of runTurn('designer', { sceneId, conversationId, message: 'four' }, { ...opts, signal: abort4.signal })) {
    fourth.push(event)
    if (event.type === 'message_delta') abort4.abort()
  }
  assert.deepEqual(fourth.at(-1), { type: 'error', message: 'agent cancelled' })
  assert.equal(spawns(dataDir, conversationId).length, 1)
  assert.ok(liveAgentSessions().some((p) => p.conversationId === conversationId))
})

test('an interrupt the agent never answers kills the process after the grace period', async () => {
  const { env, dataDir, sceneId } = await fixture()
  const events = await collect(
    runTurn('designer', { sceneId, message: 'x' }, { root, env: { ...env, FAKE_CLAUDE_MODE: 'deaf' }, timeoutMs: 200, graceMs: 200 }),
  )
  assert.match((events.at(-1) as { message: string }).message, /^agent timed out/)
  const { conversationId } = events[0] as Extract<AgentEvent, { type: 'session' }>
  assert.ok(!liveAgentSessions().some((p) => p.conversationId === conversationId))
  assert.equal(spawns(dataDir, conversationId).length, 1)
})

test('a process that dies mid-turn ends the turn with an error and the next turn resumes', async () => {
  const { env, dataDir, sceneId } = await fixture()
  const opts = { root, env: { ...env, FAKE_CLAUDE_MODE: 'crash' } }
  const first = await collect(runTurn('designer', { sceneId, message: 'one' }, opts))
  assert.equal(first.at(-1)!.type, 'done')
  const { conversationId } = first[0] as Extract<AgentEvent, { type: 'session' }>
  const second = await collect(runTurn('designer', { sceneId, conversationId, message: 'two' }, opts))
  assert.equal(second.at(-1)!.type, 'error')
  assert.match((second.at(-1) as { message: string }).message, /exited \(3\) without a result/)
  assert.ok(second.some((e) => e.type === 'message_delta'))
  assert.ok(!liveAgentSessions().some((p) => p.conversationId === conversationId))
  const third = await collect(runTurn('designer', { sceneId, conversationId, message: 'three' }, opts))
  assert.equal(third.at(-1)!.type, 'done')
  assert.equal(flagOf(spawns(dataDir, conversationId)[1]!.args, '--resume'), conversationId)
})

test('a second turn on a busy conversation waits for the first', async () => {
  const { env, dataDir, sceneId } = await fixture()
  const first = await collect(runTurn('designer', { sceneId, message: 'one' }, { root, env }))
  const { conversationId } = first[0] as Extract<AgentEvent, { type: 'session' }>
  const order: string[] = []
  const run = async (message: string) => {
    for await (const event of runTurn('designer', { sceneId, conversationId, message }, { root, env })) order.push(`${message}:${event.type}`)
  }
  await Promise.all([run('a'), run('b')])
  const aDone = order.indexOf('a:done')
  assert.ok(aDone >= 0 && order.indexOf('b:session') > aDone, order.join(' '))
  assert.equal(order.at(-1), 'b:done')
  assert.equal(spawns(dataDir, conversationId).length, 1)
})

test('past the live cap the least recently used idle process closes', async () => {
  await closeAgentSessions(500)
  const { env, sceneId } = await fixture()
  const opts = { root, env: { ...env, VARPET_AGENT_MAX_LIVE: '2' } }
  const ids: string[] = []
  for (const message of ['a', 'b', 'c']) {
    const events = await collect(runTurn('designer', { sceneId, message }, opts))
    ids.push((events[0] as Extract<AgentEvent, { type: 'session' }>).conversationId)
  }
  await new Promise((done) => setTimeout(done, 200))
  assert.deepEqual(liveAgentSessions().map((p) => p.conversationId).sort(), [ids[1], ids[2]].sort())
})

test('a proposal stays busy through a turn on a reused process', async () => {
  const { env, sceneId } = await fixture()
  const first = await collect(runTurn('designer', { sceneId, message: 'one' }, { root, env }))
  const { conversationId, proposalSceneId } = first[0] as Extract<AgentEvent, { type: 'session' }>
  const busyAt: Record<string, boolean> = {}
  for await (const event of runTurn('designer', { sceneId, conversationId, message: 'two' }, { root, env })) {
    busyAt[event.type] = isProposalBusy(proposalSceneId!)
  }
  assert.deepEqual(busyAt, { session: true, progress: true, message_delta: true, tool: true, rate_limit: true, proposal: false, done: false })
})
