// One agent turn = one `claude -p` process on Felix's subscription, editing a Pascal scene only through the
// scene MCP server (packages/scene-mcp). Streams AgentEvents (packages/contracts).
//
// This file is imported by the web app's route, so it keeps to bare-specifier imports and type-only relative
// imports (no `.ts` relative runtime imports; the web typecheck would reject them).
import { spawn } from 'node:child_process'
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
  /** Abort (e.g. the HTTP client went away): the process is killed. */
  signal?: AbortSignal
  /** Receives every raw stream-json line, for debugging and recordings. */
  onRawLine?: (line: string) => void
}

export const DEFAULT_MODEL = 'claude-opus-5-5'
export const DEFAULT_EFFORT: Record<AgentRole, Effort> = { architect: 'high', designer: 'medium' }
const MCP_SERVER = 'scene'
const MCP_PREFIX = `mcp__${MCP_SERVER}__`

const READ_TOOLS = [
  'get_scene', 'get_node', 'describe_node', 'find_nodes', 'list_levels', 'get_level_summary', 'get_walls',
  'get_zones', 'verify_scene', 'measure', 'validate_scene', 'check_collisions', 'list_units',
]
const EDIT_TOOLS = ['apply_patch', 'delete_node', 'undo', 'redo']

/** The scene MCP tools each role may call. Everything else on the server is hidden from it. */
export const ROLE_TOOLS: Record<AgentRole, string[]> = {
  architect: [
    ...READ_TOOLS, ...EDIT_TOOLS,
    'create_room', 'create_wall', 'add_door', 'add_window', 'cut_opening', 'set_zone', 'create_level',
    'create_story_shell', 'create_unit', 'set_unit_members', 'duplicate_level',
  ],
  designer: [...READ_TOOLS, ...EDIT_TOOLS, 'search_products', 'get_product', 'show_products', 'place_product'],
}

/** Every tool the scene server registers (Pascal 1.0.3 plus ours), so a role sees only its own. */
const ALL_TOOLS = [
  ...new Set([
    ...ROLE_TOOLS.architect, ...ROLE_TOOLS.designer,
    'place_item', 'search_assets', 'furnish_room', 'analyze_floorplan_image', 'analyze_room_photo', 'create_roof',
    'create_stair_between_levels', 'create_from_template', 'create_house_from_brief', 'list_templates',
    'export_glb', 'export_json', 'generate_variants', 'photo_to_scene', 'load_scene', 'save_scene', 'delete_scene',
    'rename_scene', 'list_scenes', 'create_project', 'get_project_status',
  ]),
]

export function toolFlags(role: AgentRole) {
  const allowed = ROLE_TOOLS[role]
  return {
    allowed: allowed.map((name) => MCP_PREFIX + name).join(','),
    disallowed: ALL_TOOLS.filter((name) => !allowed.includes(name)).map((name) => MCP_PREFIX + name).join(','),
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
    claudeBin: opts.claudeBin ?? env.VARPET_CLAUDE_BIN ?? 'claude',
    env,
  }
}

const stores = new Map<string, Promise<SceneStore>>()
function openStore(dbPath: string) {
  let store = stores.get(dbPath)
  if (!store) {
    mkdirSync(dirname(dbPath), { recursive: true })
    store = createSceneStore({ PASCAL_DB_PATH: dbPath })
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
  const tools = toolFlags(input.role)
  return [
    '-p',
    '--model', input.s.model,
    '--effort', input.s.effort,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--input-format', 'stream-json',
    '--tools', '',
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

/** The user message as a stream-json line: text plus image blocks from data: URLs. */
export function userMessageLine(message: string, images: string[] = []) {
  const content: unknown[] = []
  for (const url of images) {
    const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(url)
    if (!match) throw new Error('images must be base64 data: URLs (jpeg, png, webp)')
    content.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } })
  }
  content.push({ type: 'text', text: message })
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`
}

function childEnv(env: NodeJS.ProcessEnv) {
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
// The turn

/** Run one agent turn. Yields, in order: session, progress/message_delta/tool/rate_limit, at most one proposal,
 * then exactly one done or error. Never throws. */
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
  let s: Settings
  let store: SceneStore
  let sessionId: string
  let resume: boolean
  let dir: string
  let state: ConversationState
  let stdinLine: string
  let systemPrompt: string
  try {
    s = settings(role, opts)
    store = await openStore(s.dbPath)
    if (req.conversationId !== undefined) {
      if (!UUID.test(req.conversationId)) throw new Error('conversationId is not a valid id')
      dir = conversationDir(s, req.conversationId)
      const previous = readState(dir)
      if (!previous) throw new Error(`unknown conversation: ${req.conversationId}`)
      if (previous.role !== role) throw new Error(`conversation ${req.conversationId} belongs to the ${previous.role}`)
      sessionId = req.conversationId
      resume = true
      state = previous
    } else {
      sessionId = randomUUID()
      resume = false
      dir = conversationDir(s, sessionId)
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
          ...(s.env.PASCAL_ALLOWED_ASSET_ORIGINS ? { PASCAL_ALLOWED_ASSET_ORIGINS: s.env.PASCAL_ALLOWED_ASSET_ORIGINS } : {}),
        },
      },
    },
  })
  const args = claudeArgs({ role, s, sessionId, resume, mcpConfig, systemPrompt })
  const child = spawn(s.claudeBin, args, { cwd: dir, env: childEnv(s.env), stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4000)
  })
  let spawnError: Error | null = null
  child.on('error', (error) => {
    spawnError = error
  })
  const exited = new Promise<number | null>((done) => child.on('close', (code) => done(code)))

  let stopReason: string | null = null
  const kill = (reason: string) => {
    stopReason ??= reason
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      setTimeout(() => child.exitCode === null && child.signalCode === null && child.kill('SIGKILL'), 3000).unref()
    }
  }
  const timer = setTimeout(() => kill(`timed out after ${Math.round(s.timeoutMs / 1000)} s`), s.timeoutMs)
  const onAbort = () => kill('cancelled')
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  if (opts.signal?.aborted) onAbort()

  child.stdin.on('error', () => {})
  child.stdin.end(stdinLine)

  const mapper = new StreamMapper()
  let resultTimer: NodeJS.Timeout | null = null
  try {
    for await (const raw of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      if (!raw.trim()) continue
      opts.onRawLine?.(raw)
      let line: Json
      try {
        line = JSON.parse(raw)
      } catch {
        continue
      }
      for (const event of mapper.map(line)) yield event
      if (mapper.initError) {
        kill(mapper.initError)
        break
      }
      if (mapper.result && !resultTimer) {
        // The result is the last line that matters; do not wait forever for a lingering process.
        resultTimer = setTimeout(() => kill('done'), 2000)
      }
    }
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
    if (child.exitCode === null && child.signalCode === null && !mapper.result) kill('stream ended')
  }
  const code = await exited
  if (resultTimer) clearTimeout(resultTimer)

  if (state.proposalSceneId) {
    try {
      const [base, proposal] = await Promise.all([store.load(req.sceneId), store.load(state.proposalSceneId)])
      if (base && proposal && JSON.stringify(base.graph.nodes) !== JSON.stringify(proposal.graph.nodes)) {
        yield {
          type: 'proposal',
          baseSceneId: req.sceneId,
          proposalSceneId: state.proposalSceneId,
          summary: summarize(typeof mapper.result?.result === 'string' ? mapper.result.result : ''),
          products: proposalProducts(base.graph, proposal.graph),
        }
      }
    } catch (error) {
      yield { type: 'error', message: `could not read the proposal: ${errorMessage(error)}` }
      return
    }
  }

  const result = mapper.result
  const failed = spawnError
    ? `could not start claude: ${errorMessage(spawnError)}`
    : mapper.initError
      ? mapper.initError
      : stopReason && stopReason !== 'done'
        ? `agent ${stopReason}`
        : !result
          ? `claude exited (${code}) without a result${stderr ? `: ${stderr.trim().slice(-600)}` : ''}`
          : result.is_error || result.subtype !== 'success'
            ? `agent failed (${result.subtype ?? 'error'}): ${String(result.result ?? result.errors ?? '').slice(0, 600)}`
            : null
  if (failed) yield { type: 'error', message: failed }
  else yield { type: 'done', conversationId: sessionId, durationMs: Date.now() - started }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
