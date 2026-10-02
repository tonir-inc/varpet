// One agent conversation = one long-lived `claude -p` process on Felix's subscription (stream-json input, one
// user line per turn), editing a Pascal scene only through the scene MCP server (packages/scene-mcp). Streams
// AgentEvents (packages/contracts).
//
// This file is imported by the web app's route, so it keeps to bare-specifier imports and type-only relative
// imports (no `.ts` relative runtime imports; the web typecheck would reject them).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { createSceneStore, type SceneStore } from '@pascal-app/mcp/storage'
import type { AgentEvent, AgentRole, ProposalProduct, TurnRequest } from '../../contracts/src/index'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type EditMode = 'proposal' | 'direct'

export interface RunTurnOptions {
  /** Repo root (holds prompts/ and packages/scene-mcp). Default: VARPET_ROOT, else the nearest pnpm workspace. */
  root?: string
  /** Env for paths and settings. Default process.env. Relative paths resolve against process.cwd(). */
  env?: NodeJS.ProcessEnv
  edits?: EditMode
  model?: string
  effort?: Effort
  /** Wall-clock limit; a subscription has no budget flag. Default VARPET_AGENT_TIMEOUT_MS or 15 minutes. */
  timeoutMs?: number
  claudeBin?: string
  /** Abort (e.g. the HTTP client went away): the turn is interrupted, the process is kept. */
  signal?: AbortSignal
  /** An idle conversation process closes after this. Default VARPET_AGENT_IDLE_MS or 10 minutes. */
  idleMs?: number
  /** Live processes kept; past it the least recently used idle one closes. Default VARPET_AGENT_MAX_LIVE or 6. */
  maxLive?: number
  /** After an interrupt (or closing stdin) the process is killed if it has not finished within this.
   * Default VARPET_AGENT_GRACE_MS or 10 s. */
  graceMs?: number
  /** Receives every raw stream-json line, for debugging and recordings. */
  onRawLine?: (line: string) => void
}

export const DEFAULT_MODEL = 'claude-opus-5-5'
export const DEFAULT_EFFORT: Record<AgentRole, Effort> = { architect: 'high', designer: 'medium' }
const MCP_SERVER = 'scene'
const MCP_PREFIX = `mcp__${MCP_SERVER}__`

/**
 * Both agents get every tool the scene MCP serves (Pascal's plus ours) and are steered by their prompts, not by
 * allow-lists. The scene server already removes the scene lifecycle tools (it is bound to one scene); they are denied
 * here too. No shell or file built-ins: only Claude Code's two MCP resource tools, so the agent can read Pascal's
 * guide and constraints (pascal://agent/guide, pascal://constraints/{levelId}).
 */
export const LIFECYCLE_TOOLS = [
  'load_scene', 'save_scene', 'delete_scene', 'rename_scene', 'list_scenes', 'create_project', 'get_project_status',
] as const
export const BUILTIN_TOOLS = ['ListMcpResourcesTool', 'ReadMcpResourceTool'] as const

export function toolFlags() {
  return {
    builtin: BUILTIN_TOOLS.join(','),
    allowed: [`mcp__${MCP_SERVER}`, ...BUILTIN_TOOLS].join(','),
    disallowed: LIFECYCLE_TOOLS.map((name) => MCP_PREFIX + name).join(','),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Settings

interface Settings {
  root: string
  dataDir: string
  dbPath: string
  catalogUrl: string
  publicOrigin: string
  edits: EditMode
  model: string
  effort: Effort
  timeoutMs: number
  idleMs: number
  maxLive: number
  graceMs: number
  claudeBin: string
  env: NodeJS.ProcessEnv
}

function findRoot(from: string) {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    if (dirname(dir) === dir) throw new Error('cannot find the varpet repo root; set VARPET_ROOT')
  }
}

function settings(role: AgentRole, opts: RunTurnOptions): Settings {
  const env = opts.env ?? process.env
  const root = resolve(opts.root ?? env.VARPET_ROOT ?? findRoot(process.cwd()))
  const dataDir = resolve(env.VARPET_DATA_DIR ?? join(root, '.data'))
  const edits = opts.edits ?? (env.VARPET_AGENT_EDITS === 'direct' ? 'direct' : 'proposal')
  const effort = opts.effort ?? (env[`VARPET_${role.toUpperCase()}_EFFORT`] as Effort | undefined) ?? DEFAULT_EFFORT[role]
  return {
    root,
    dataDir,
    dbPath: resolve(env.PASCAL_DB_PATH ?? join(dataDir, 'pascal.db')),
    catalogUrl: env.VARPET_CATALOG_URL ?? 'http://100.107.246.46:8765',
    publicOrigin: env.VARPET_PUBLIC_ORIGIN ?? 'http://localhost:3010',
    edits,
    model: opts.model ?? env.VARPET_AGENT_MODEL ?? DEFAULT_MODEL,
    effort,
    timeoutMs: opts.timeoutMs ?? (Number(env.VARPET_AGENT_TIMEOUT_MS) || 15 * 60_000),
    idleMs: opts.idleMs ?? (Number(env.VARPET_AGENT_IDLE_MS) || 10 * 60_000),
    maxLive: opts.maxLive ?? (Number(env.VARPET_AGENT_MAX_LIVE) || 6),
    graceMs: opts.graceMs ?? (Number(env.VARPET_AGENT_GRACE_MS) || 10_000),
    claudeBin: opts.claudeBin ?? env.VARPET_CLAUDE_BIN ?? 'claude',
    env,
  }
}

const stores = new Map<string, Promise<SceneStore>>()
function openStore(dbPath: string) {
  let store = stores.get(dbPath)
  if (!store) {
    mkdirSync(dirname(dbPath), { recursive: true })
    store = createSceneStore({ ...process.env, PASCAL_DB_PATH: dbPath })
    stores.set(dbPath, store)
  }
  return store
}

// ---------------------------------------------------------------------------------------------------------------
// Conversation state: one directory per conversation; claude keys --resume on the cwd.

interface ConversationState {
  role: AgentRole
  baseSceneId: string
  proposalSceneId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function conversationDir(s: Settings, id: string) {
  return join(s.dataDir, 'agents', id)
}

function readState(dir: string): ConversationState | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Copy the base scene to a fresh proposal scene the agent edits; the person applies or dismisses it. */
async function copyToProposal(store: SceneStore, baseSceneId: string) {
  const base = await store.load(baseSceneId)
  if (!base) throw new Error(`scene not found: ${baseSceneId}`)
  const id = `proposal-${randomUUID().slice(0, 8)}`
  await store.save({ id, name: `${base.name} (proposal)`.slice(0, 120), ownerId: base.ownerId, graph: base.graph })
  return id
}

// ---------------------------------------------------------------------------------------------------------------
// Proposal summary from the graphs

interface GraphLike {
  nodes: Record<string, unknown>
}

interface ItemLike {
  type?: string
  name?: string
  asset?: { name?: string }
  metadata?: { productId?: unknown; priceAmd?: unknown; shop?: unknown }
}

/** Products on item nodes the proposal added (ids not in the base), grouped by product id. */
export function proposalProducts(base: GraphLike, proposal: GraphLike): ProposalProduct[] {
  const products = new Map<string, ProposalProduct>()
  for (const [id, raw] of Object.entries(proposal.nodes)) {
    const node = raw as ItemLike
    if (node.type !== 'item' || id in base.nodes) continue
    const productId = node.metadata?.productId
    if (typeof productId !== 'string') continue
    const known = products.get(productId)
    if (known) {
      known.count += 1
      continue
    }
    products.set(productId, {
      productId,
      name: node.asset?.name ?? node.name ?? productId,
      priceAmd: typeof node.metadata?.priceAmd === 'number' ? node.metadata.priceAmd : null,
      shop: typeof node.metadata?.shop === 'string' ? node.metadata.shop : null,
      count: 1,
    })
  }
  return [...products.values()]
}

function summarize(text: string) {
  const first = text.trim().split(/\n\s*\n/)[0] ?? ''
  return first.length > 400 ? `${first.slice(0, 397)}...` : first
}

// ---------------------------------------------------------------------------------------------------------------
// claude invocation

export function claudeArgs(input: {
  role: AgentRole
  s: Pick<Settings, 'model' | 'effort'>
  sessionId: string
  resume: boolean
  mcpConfig: string
  systemPrompt: string
}) {
  const tools = toolFlags()
  return [
    '-p',
    '--model', input.s.model,
    '--effort', input.s.effort,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--input-format', 'stream-json',
    '--tools', tools.builtin,
    '--setting-sources', '',
    '--strict-mcp-config',
    '--mcp-config', input.mcpConfig,
    '--allowedTools', tools.allowed,
    '--disallowedTools', tools.disallowed,
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--disable-slash-commands',
    '--system-prompt', input.systemPrompt,
    ...(input.resume ? ['--resume', input.sessionId] : ['--session-id', input.sessionId]),
  ]
}

/**
 * Skills: the agents load Claude Code skills from our agent plugin only, never the user's ~/.claude config.
 * VARPET_AGENT_PLUGIN_DIR (default <root>/agent-plugins) holds one plugin per role (`designer/`, `architect/`);
 * "off" or "" turns skills off. Returns the role's plugin directory, or none.
 */
export function agentPluginDirs(role: AgentRole, root: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const base = env.VARPET_AGENT_PLUGIN_DIR
  if (base === '' || base === 'off') return []
  const dir = resolve(base ?? join(root, 'agent-plugins'), role)
  return existsSync(join(dir, '.claude-plugin', 'plugin.json')) ? [dir] : []
}

/**
 * claude args with our plugins' skills on: the Skill tool added to --tools and --allowedTools, slash commands (which
 * also gate skills) back on, Claude Code's bundled skills off, then one --plugin-dir per plugin. With --setting-sources
 * "" no user or project skills load. Unchanged when there are no plugin dirs.
 */
export function withSkills(args: string[], pluginDirs: string[]): string[] {
  if (!pluginDirs.length) return args
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--disable-slash-commands') continue
    out.push(arg)
    if (arg === '--tools' || arg === '--allowedTools') {
      const value = args[++i] ?? ''
      out.push(value ? `${value},Skill` : 'Skill')
    }
  }
  out.push('--settings', JSON.stringify({ disableBundledSkills: true }))
  for (const dir of pluginDirs) out.push('--plugin-dir', dir)
  return out
}

/** The user message as a stream-json line: text plus image blocks from data: URLs. */
export function userMessageLine(message: string, images: string[] = []) {
  const content: unknown[] = []
  for (const url of images) {
    const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(url)
    if (!match) throw new Error('images must be base64 data: URLs (jpeg, png, webp)')
    content.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } })
  }
  content.push({ type: 'text', text: message })
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null })}\n`
}

export function childEnv(env: NodeJS.ProcessEnv) {
  const out: NodeJS.ProcessEnv = { ...env }
  // Subscription only: never an API key. Drop markers of a parent Claude Code session.
  delete out.ANTHROPIC_API_KEY
  delete out.ANTHROPIC_AUTH_TOKEN
  delete out.CLAUDECODE
  for (const key of Object.keys(out)) {
    if (key.startsWith('CLAUDE_CODE_') && key !== 'CLAUDE_CODE_OAUTH_TOKEN') delete out[key]
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// stream-json -> AgentEvent

type Json = Record<string, any>

/** Maps claude's stream-json lines to AgentEvents. Stateful: remembers tool calls and text blocks. */
export class StreamMapper {
  private tools = new Map<string, string>()
  private wroteText = false
  result: Json | null = null
  initError: string | null = null

  map(line: Json): AgentEvent[] {
    switch (line.type) {
      case 'system':
        return this.system(line)
      case 'stream_event':
        return this.streamEvent(line)
      case 'assistant':
        return this.assistant(line)
      case 'user':
        return this.toolResults(line)
      case 'rate_limit_event': {
        const info = line.rate_limit_info ?? line
        return [{ type: 'rate_limit', status: String(info.status ?? 'unknown'), resetsAt: toEpochMs(info.resetsAt) }]
      }
      case 'result':
        this.result = line
        return []
      default:
        return []
    }
  }

  private system(line: Json): AgentEvent[] {
    if (line.subtype === 'init') {
      const server = (line.mcp_servers ?? []).find((s: Json) => s.name === MCP_SERVER)
      if (!server || server.status !== 'connected') {
        this.initError = `scene MCP server did not start (${server?.status ?? 'missing'})`
        return []
      }
      return [{ type: 'progress', text: 'Reading the scene' }]
    }
    if (line.subtype === 'api_retry') {
      return [{ type: 'progress', text: `Model busy, retrying (attempt ${line.attempt ?? '?'})` }]
    }
    if (line.subtype === 'compact_boundary') return [{ type: 'progress', text: 'Condensing the conversation' }]
    return []
  }

  private streamEvent(line: Json): AgentEvent[] {
    if (line.parent_tool_use_id) return []
    const event = line.event ?? {}
    if (event.type === 'content_block_start') {
      const kind = event.content_block?.type
      if (kind === 'thinking' || kind === 'redacted_thinking') return [{ type: 'progress', text: 'Thinking' }]
      if (kind === 'text' && this.wroteText) return [{ type: 'message_delta', text: '\n\n' }]
      return []
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
      this.wroteText = true
      return [{ type: 'message_delta', text: event.delta.text }]
    }
    return []
  }

  private assistant(line: Json): AgentEvent[] {
    if (line.parent_tool_use_id) return []
    const events: AgentEvent[] = []
    for (const block of line.message?.content ?? []) {
      if (block.type !== 'tool_use' || this.tools.has(block.id)) continue
      const name = toolName(block.name)
      this.tools.set(block.id, name)
      events.push({ type: 'tool', id: block.id, name, input: block.input ?? {}, status: 'running' })
    }
    return events
  }

  private toolResults(line: Json): AgentEvent[] {
    const events: AgentEvent[] = []
    const content = line.message?.content
    if (!Array.isArray(content)) return events
    for (const block of content) {
      if (block.type !== 'tool_result') continue
      const name = this.tools.get(block.tool_use_id) ?? 'tool'
      events.push({
        type: 'tool',
        id: block.tool_use_id,
        name,
        input: null,
        status: block.is_error ? 'error' : 'done',
        summary: resultSummary(block.content),
      })
    }
    return events
  }
}

function toolName(name: string) {
  return typeof name === 'string' && name.startsWith(MCP_PREFIX) ? name.slice(MCP_PREFIX.length) : name
}

function toEpochMs(value: unknown) {
  if (typeof value !== 'number') return null
  return value < 1e12 ? value * 1000 : value
}

function resultSummary(content: unknown) {
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((c: Json) => (c.type === 'text' ? c.text : c.type === 'image' ? '[image]' : '')).join(' ')
        : ''
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 240 ? `${flat.slice(0, 237)}...` : flat
}

// ---------------------------------------------------------------------------------------------------------------
// Live processes: one per conversation, kept between turns (Claude Code's streaming input mode).

interface LiveProcess {
  conversationId: string
  /** What the process was started with, minus the session flag; a turn that needs other args respawns. */
  binding: string
  /** The work scene's version when the last turn ended. The scene MCP holds the graph it loaded at start, so a
   * scene written by anyone else in between (the person in the editor) needs a fresh process. */
  sceneVersion: number | null
  child: ChildProcessWithoutNullStreams
  stderr: string
  spawnError: Error | null
  alive: boolean
  exitCode: number | null
  exited: Promise<void>
  /** The running turn's line handler and exit handler; null while idle. */
  listener: ((raw: string) => void) | null
  onExit: (() => void) | null
  lastUsed: number
  idleTimer: NodeJS.Timeout | null
}

interface Pool {
  live: Map<string, LiveProcess>
  /** Processes closing (stdin ended), by conversation: a respawn with --resume waits for them. */
  closing: Map<string, Promise<void>>
  /** One turn at a time per conversation: the tail of each conversation's queue. */
  locks: Map<string, Promise<void>>
}

/** On globalThis so every Next route bundle (and HMR reload) shares the same processes. */
function pool(): Pool {
  const key = Symbol.for('varpet.agents.pool')
  const holder = globalThis as unknown as Record<symbol, Pool | undefined>
  return (holder[key] ??= { live: new Map(), closing: new Map(), locks: new Map() })
}

function spawnProcess(conversationId: string, binding: string, bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let exited!: () => void
  const proc: LiveProcess = {
    conversationId,
    binding,
    sceneVersion: null,
    child,
    stderr: '',
    spawnError: null,
    alive: true,
    exitCode: null,
    exited: new Promise<void>((done) => (exited = done)),
    listener: null,
    onExit: null,
    lastUsed: Date.now(),
    idleTimer: null,
  }
  const dead = (code: number | null) => {
    if (!proc.alive) return
    proc.alive = false
    proc.exitCode = code
    if (proc.idleTimer) clearTimeout(proc.idleTimer)
    if (pool().live.get(conversationId) === proc) pool().live.delete(conversationId)
    proc.onExit?.()
    exited()
  }
  child.stderr.on('data', (chunk) => {
    proc.stderr = (proc.stderr + chunk).slice(-4000)
  })
  child.stdin.on('error', () => {})
  child.on('error', (error) => {
    proc.spawnError = error
    if (child.pid === undefined) dead(null)
  })
  child.on('close', (code) => dead(code))
  createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (raw) => {
    if (raw.trim()) proc.listener?.(raw)
  })
  pool().live.set(conversationId, proc)
  return proc
}

function send(proc: LiveProcess, line: string | Json) {
  if (proc.alive && proc.child.stdin.writable) proc.child.stdin.write(typeof line === 'string' ? line : `${JSON.stringify(line)}\n`)
}

/** Idle processes do not keep node alive (a script exits; its child then sees stdin close and exits too). */
function setRef(proc: LiveProcess, on: boolean) {
  const { child } = proc
  for (const handle of [child, child.stdin, child.stdout, child.stderr] as unknown as Array<{ ref?(): void; unref?(): void }>) {
    if (on) handle.ref?.()
    else handle.unref?.()
  }
}

function killProcess(proc: LiveProcess) {
  if (pool().live.get(proc.conversationId) === proc) pool().live.delete(proc.conversationId)
  if (!proc.alive) return
  proc.child.kill('SIGTERM')
  setTimeout(() => proc.alive && proc.child.kill('SIGKILL'), 3000).unref()
}

/** Close stdin (claude then exits on its own); kill it if it is still there after the grace period. */
function closeProcess(proc: LiveProcess, graceMs: number) {
  const { live, closing } = pool()
  if (live.get(proc.conversationId) === proc) live.delete(proc.conversationId)
  if (proc.idleTimer) clearTimeout(proc.idleTimer)
  if (!proc.alive) return proc.exited
  proc.child.stdin.end()
  setRef(proc, true) // a closing process keeps node alive until it exits (at most graceMs + 3 s)
  setTimeout(() => killProcess(proc), graceMs).unref()
  closing.set(proc.conversationId, proc.exited)
  void proc.exited.then(() => closing.get(proc.conversationId) === proc.exited && closing.delete(proc.conversationId))
  return proc.exited
}

/** Back to idle after a turn: closes after idleMs. */
function park(proc: LiveProcess, s: Settings) {
  proc.listener = null
  proc.onExit = null
  proc.lastUsed = Date.now()
  if (proc.idleTimer) clearTimeout(proc.idleTimer)
  proc.idleTimer = setTimeout(() => closeProcess(proc, s.graceMs), s.idleMs)
  proc.idleTimer.unref()
  setRef(proc, false)
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms).unref())

/** The conversation's live process if it was started for the same scene binding; else a fresh one (resuming the
 * session when the conversation already exists). */
async function processFor(input: {
  conversationId: string
  binding: string
  sceneVersion: number | null
  resume: boolean
  s: Settings
  dir: string
  args: (resume: boolean) => string[]
}) {
  const { live, closing } = pool()
  const { s } = input
  const current = live.get(input.conversationId)
  if (current?.alive && current.binding === input.binding && current.sceneVersion === input.sceneVersion) {
    if (current.idleTimer) clearTimeout(current.idleTimer)
    return current
  }
  if (current) void closeProcess(current, s.graceMs)
  // Two processes must not write one session at once: let the old one exit before resuming.
  const old = closing.get(input.conversationId)
  if (old) await Promise.race([old, sleep(s.graceMs + 3500)])
  while (live.size >= s.maxLive) {
    const idle = [...live.values()].filter((p) => !p.listener).sort((a, b) => a.lastUsed - b.lastUsed)[0]
    if (!idle) break // every live process is mid-turn: go over the cap rather than wait
    void closeProcess(idle, s.graceMs)
  }
  return spawnProcess(input.conversationId, input.binding, s.claudeBin, input.args(input.resume), input.dir, childEnv(s.env))
}

/** Wait for the conversation's previous turn. Resolves to the release function, or null if aborted first. */
async function acquire(conversationId: string, signal?: AbortSignal): Promise<(() => void) | null> {
  const { locks } = pool()
  const previous = locks.get(conversationId) ?? Promise.resolve()
  let release!: () => void
  const mine = new Promise<void>((done) => (release = done))
  const tail = previous.then(() => mine)
  locks.set(conversationId, tail)
  void tail.then(() => locks.get(conversationId) === tail && locks.delete(conversationId))
  if (signal?.aborted) {
    release()
    return null
  }
  let onAbort = () => {}
  const aborted = new Promise<'aborted'>((done) => {
    onAbort = () => done('aborted')
    signal?.addEventListener('abort', onAbort, { once: true })
  })
  const outcome = await Promise.race([previous.then(() => 'ready' as const), aborted])
  signal?.removeEventListener('abort', onAbort)
  if (outcome === 'aborted') {
    release()
    return null
  }
  return release
}

/** Close every live process (server shutdown, tests). */
export async function closeAgentSessions(graceMs = 5000) {
  await Promise.all([...pool().live.values()].map((proc) => closeProcess(proc, graceMs)))
  await Promise.all([...pool().closing.values()])
}

/** The live conversation processes, for debugging and tests. */
export function liveAgentSessions() {
  return [...pool().live.values()].map((p) => ({
    conversationId: p.conversationId,
    pid: p.child.pid ?? null,
    busy: p.listener !== null,
    lastUsed: p.lastUsed,
  }))
}

// ---------------------------------------------------------------------------------------------------------------
// One turn on a live process: write the user line, map lines until this turn's result.

/** A small async queue the turn fills and the generator drains. */
class Channel<T> {
  private items: T[] = []
  private wake: (() => void) | null = null
  private closed = false
  push(item: T) {
    this.items.push(item)
    this.wake?.()
  }
  close() {
    this.closed = true
    this.wake?.()
  }
  async *[Symbol.asyncIterator]() {
    for (;;) {
      if (this.items.length) {
        yield this.items.shift()!
        continue
      }
      if (this.closed) return
      await new Promise<void>((done) => (this.wake = done))
      this.wake = null
    }
  }
}

interface Turn {
  events: Channel<AgentEvent>
  /** Settles when the turn ends (result, process death, or kill after an unanswered interrupt). Never rejects. */
  finished: Promise<{ result: Json | null; failed: string | null }>
  done: () => boolean
  interrupt: (reason: string) => void
}

/** Runs to completion on its own, so a turn the client walked away from still ends cleanly and frees the process. */
function startTurn(proc: LiveProcess, userLine: string, s: Settings, opts: RunTurnOptions): Turn {
  const mapper = new StreamMapper()
  const events = new Channel<AgentEvent>()
  let stopReason: string | null = null
  let finished = false
  let graceTimer: NodeJS.Timeout | null = null
  let settle!: (outcome: { result: Json | null; failed: string | null }) => void
  const done = new Promise<{ result: Json | null; failed: string | null }>((resolve) => (settle = resolve))

  const sendInterrupt = () =>
    send(proc, { type: 'control_request', request_id: `interrupt-${randomUUID()}`, request: { subtype: 'interrupt' } })
  const interrupt = (reason: string) => {
    if (finished) return
    stopReason ??= reason
    sendInterrupt()
    graceTimer ??= setTimeout(() => killProcess(proc), s.graceMs)
  }
  const onAbort = () => interrupt('cancelled')
  const timer = setTimeout(() => interrupt(`timed out after ${Math.round(s.timeoutMs / 1000)} s`), s.timeoutMs)
  const finish = (failed: string | null) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    if (graceTimer) clearTimeout(graceTimer)
    opts.signal?.removeEventListener('abort', onAbort)
    events.close()
    settle({ result: mapper.result, failed })
  }

  proc.listener = (raw) => {
    opts.onRawLine?.(raw)
    let line: Json
    try {
      line = JSON.parse(raw)
    } catch {
      return
    }
    if (line.type === 'control_request') {
      // We register no hooks or permission tool; refuse anything the CLI asks so it never waits on us.
      send(proc, { type: 'control_response', response: { subtype: 'error', request_id: line.request_id, error: 'not supported' } })
      return
    }
    if (line.type === 'control_response') return
    // CLI 2.1.283 acknowledges but drops an interrupt that lands before a later turn's init: send it again.
    if (line.type === 'system' && line.subtype === 'init' && stopReason) sendInterrupt()
    for (const event of mapper.map(line)) events.push(event)
    if (mapper.initError) {
      killProcess(proc)
      finish(mapper.initError)
      return
    }
    if (mapper.result) {
      const result = mapper.result
      park(proc, s)
      finish(
        stopReason
          ? `agent ${stopReason}`
          : result.is_error || result.subtype !== 'success'
            ? `agent failed (${result.subtype ?? 'error'}): ${String(result.result ?? result.errors ?? '').slice(0, 600)}`
            : null,
      )
    }
  }
  proc.onExit = () =>
    finish(
      proc.spawnError
        ? `could not start claude: ${errorMessage(proc.spawnError)}`
        : stopReason
          ? `agent ${stopReason}`
          : `claude exited (${proc.exitCode}) without a result${proc.stderr ? `: ${proc.stderr.trim().slice(-600)}` : ''}`,
    )

  setRef(proc, true)
  if (!proc.alive) proc.onExit()
  else send(proc, userLine)
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  if (opts.signal?.aborted) onAbort()
  return { events, finished: done, done: () => finished, interrupt }
}

// ---------------------------------------------------------------------------------------------------------------
// The turn

/** Run one agent turn. Yields, in order: session, progress/message_delta/tool/rate_limit, at most one proposal,
 * then exactly one done or error. Never throws.
 *
 * Turns of one conversation run one at a time: a second turn waits (before its session event) until the first
 * has ended. While a turn runs, the proposal it edits is busy (isProposalBusy). */
export async function* runTurn(role: AgentRole, req: TurnRequest, opts: RunTurnOptions = {}): AsyncGenerator<AgentEvent> {
  const started = Date.now()
  if (role !== 'architect' && role !== 'designer') {
    yield { type: 'error', message: `unknown role: ${String(role)}` }
    return
  }
  if (!req || typeof req.sceneId !== 'string' || !req.sceneId || typeof req.message !== 'string' || !req.message.trim()) {
    yield { type: 'error', message: 'sceneId and message are required' }
    return
  }
  if (req.conversationId !== undefined && !UUID.test(req.conversationId)) {
    yield { type: 'error', message: 'conversationId is not a valid id' }
    return
  }
  const sessionId = req.conversationId ?? randomUUID()
  const resume = req.conversationId !== undefined
  const release = await acquire(sessionId, opts.signal)
  if (!release) {
    yield { type: 'error', message: 'agent cancelled' }
    return
  }

  let busy: string | null = null
  const releaseBusy = () => {
    if (busy) busyProposals().delete(busy)
    busy = null
  }
  let turn: Turn | null = null
  try {
    let s: Settings
    let store: SceneStore
    let dir: string
    let state: ConversationState
    let stdinLine: string
    let systemPrompt: string
    try {
      s = settings(role, opts)
      store = await openStore(s.dbPath)
      dir = conversationDir(s, sessionId)
      if (resume) {
        const previous = readState(dir)
        if (!previous) throw new Error(`unknown conversation: ${sessionId}`)
        if (previous.role !== role) throw new Error(`conversation ${sessionId} belongs to the ${previous.role}`)
        state = previous
      } else {
        state = { role, baseSceneId: req.sceneId, proposalSceneId: null }
      }
      if (!(await store.load(req.sceneId))) throw new Error(`scene not found: ${req.sceneId}`)
      if (s.edits === 'proposal') {
        const reusable =
          state.proposalSceneId && state.baseSceneId === req.sceneId && (await store.load(state.proposalSceneId))
        if (!reusable) state.proposalSceneId = await copyToProposal(store, req.sceneId)
      } else {
        state.proposalSceneId = null
      }
      state.baseSceneId = req.sceneId
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2))
      systemPrompt = readFileSync(join(s.root, 'prompts', `${role}.md`), 'utf8')
      stdinLine = userMessageLine(req.message, req.images)
    } catch (error) {
      yield { type: 'error', message: errorMessage(error) }
      return
    }

    const workSceneId = state.proposalSceneId ?? req.sceneId
    const workVersion = async () => ((await store.load(workSceneId)) as { version?: number } | null)?.version ?? null
    if (state.proposalSceneId) busyProposals().add((busy = state.proposalSceneId))
    yield { type: 'session', conversationId: sessionId, role, proposalSceneId: state.proposalSceneId }

    const mcpConfig = JSON.stringify({
      mcpServers: {
        [MCP_SERVER]: {
          type: 'stdio',
          command: process.execPath,
          args: ['--experimental-strip-types', '--no-warnings', join(s.root, 'packages/scene-mcp/src/bin.ts')],
          env: {
            PASCAL_DB_PATH: s.dbPath,
            VARPET_SCENE_ID: workSceneId,
            VARPET_CATALOG_URL: s.catalogUrl,
            VARPET_PUBLIC_ORIGIN: s.publicOrigin,
            ...(s.env.VARPET_RENDER_URL ? { VARPET_RENDER_URL: s.env.VARPET_RENDER_URL } : {}),
            ...(s.env.VARPET_RENDER_TOKEN ? { VARPET_RENDER_TOKEN: s.env.VARPET_RENDER_TOKEN } : {}),
            ...(s.env.PASCAL_ALLOWED_ASSET_ORIGINS ? { PASCAL_ALLOWED_ASSET_ORIGINS: s.env.PASCAL_ALLOWED_ASSET_ORIGINS } : {}),
          },
        },
      },
    })
    const pluginDirs = agentPluginDirs(role, s.root, s.env)
    let proc: LiveProcess
    try {
      proc = await processFor({
        conversationId: sessionId,
        binding: JSON.stringify([s.claudeBin, dir, role, s.model, s.effort, mcpConfig, systemPrompt, pluginDirs]),
        sceneVersion: await workVersion(),
        resume,
        s,
        dir,
        args: (resume) => withSkills(claudeArgs({ role, s, sessionId, resume, mcpConfig, systemPrompt }), pluginDirs),
      })
      turn = startTurn(proc, stdinLine, s, opts)
    } catch (error) {
      yield { type: 'error', message: `could not start claude: ${errorMessage(error)}` }
      return
    }

    for await (const event of turn.events) yield event
    const outcome = await turn.finished
    releaseBusy()
    try {
      proc.sceneVersion = await workVersion()
    } catch {
      proc.sceneVersion = null
    }

    if (state.proposalSceneId) {
      try {
        const [base, proposal] = await Promise.all([store.load(req.sceneId), store.load(state.proposalSceneId)])
        if (base && proposal && JSON.stringify(base.graph.nodes) !== JSON.stringify(proposal.graph.nodes)) {
          yield {
            type: 'proposal',
            baseSceneId: req.sceneId,
            proposalSceneId: state.proposalSceneId,
            summary: summarize(typeof outcome.result?.result === 'string' ? outcome.result.result : ''),
            products: proposalProducts(base.graph, proposal.graph),
          }
        }
      } catch (error) {
        yield { type: 'error', message: `could not read the proposal: ${errorMessage(error)}` }
        return
      }
    }

    if (outcome.failed) yield { type: 'error', message: outcome.failed }
    else yield { type: 'done', conversationId: sessionId, durationMs: Date.now() - started }
  } finally {
    if (turn && !turn.done()) {
      // The consumer left mid-turn: stop the agent, keep the process; the next turn waits until this one ends.
      turn.interrupt('cancelled')
      void turn.finished.then(() => {
        releaseBusy()
        release()
      })
    } else {
      releaseBusy()
      release()
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Proposals an agent is still editing in this process. On globalThis so every Next route bundle shares it. */
function busyProposals(): Set<string> {
  const key = Symbol.for('varpet.agents.busyProposals')
  const holder = globalThis as unknown as Record<symbol, Set<string> | undefined>
  return (holder[key] ??= new Set())
}

/** True while an agent turn is writing to this proposal; applying or deleting it then would lose the agent's work. */
export function isProposalBusy(proposalSceneId: string): boolean {
  return busyProposals().has(proposalSceneId)
}
