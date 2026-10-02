// The one client of POST /api/agents/{role}/turn: streams NDJSON AgentEvents and folds them into chat state.
// Types come from the shared contracts; the import is type-only so nothing resolves at runtime.
import type { AgentEvent, AgentRole, ProposalProduct, TurnRequest } from '@varpet/contracts'

export type { AgentEvent, AgentRole, ProposalProduct, TurnRequest }

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface StreamTurnOptions {
  onEvent: (event: AgentEvent) => void
  signal?: AbortSignal
  /** Swap the network for a recorded stream (see `fixtureFetch`). */
  fetchImpl?: FetchLike
}

const EVENT_TYPES = new Set(['session', 'progress', 'message_delta', 'tool', 'rate_limit', 'proposal', 'done', 'error'])

/** One parsed line, or null when it is not an event we know (forward compatible: unknown types are skipped). */
export function parseEventLine(line: string): AgentEvent | null {
  const text = line.trim()
  if (!text) return null
  let value: unknown
  try { value = JSON.parse(text) } catch { return null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' && EVENT_TYPES.has(type) ? value as AgentEvent : null
}

/** Runs one agent turn. Resolves after the terminal event (`done` or `error`); a stream that closes without one
 * is reported as an error. Aborting rejects with the AbortError, which the caller treats as a cancel. */
export async function streamTurn(role: AgentRole, request: TurnRequest, options: StreamTurnOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const response = await fetchImpl(`/api/agents/${role}/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
    body: JSON.stringify(request),
    signal: options.signal,
  })
  if (!response.ok || !response.body) {
    let message = `The ${role} could not start (HTTP ${response.status}).`
    try {
      const body = await response.text()
      const parsed = (() => { try { return JSON.parse(body) as { error?: unknown; message?: unknown } } catch { return null } })()
      const detail = parsed && typeof (parsed.error ?? parsed.message) === 'string' ? String(parsed.error ?? parsed.message) : body.trim()
      if (detail) message = `${message} ${detail.slice(0, 400)}`
    } catch { /* keep the status line */ }
    options.onEvent({ type: 'error', message })
    return
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', finished = false
  const emit = (line: string) => {
    const event = parseEventLine(line)
    if (!event || finished) return
    if (event.type === 'done' || event.type === 'error') finished = true
    options.onEvent(event)
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        emit(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) emit(buffer)
  } finally {
    reader.releaseLock()
  }
  if (!finished) options.onEvent({ type: 'error', message: `The ${role} stopped before finishing the turn.` })
}

/* ---------- Recorded streams ---------- */

/** How long each kind of event waits before it is played, in ms at speed 1. */
const PACE: Record<AgentEvent['type'], number> = {
  session: 250, progress: 900, message_delta: 45, tool: 650, rate_limit: 300, proposal: 700, done: 400, error: 400,
}

/** A fetch that answers every request with a recorded NDJSON stream, paced like a real turn. Honours abort. */
export function fixtureFetch(ndjson: string, { speed = 1 }: { speed?: number } = {}): FetchLike {
  const lines = ndjson.split('\n').filter((line) => line.trim())
  return async (_input, init) => {
    const signal = init.signal ?? undefined
    if (signal?.aborted) throw new DOMException('The turn was cancelled.', 'AbortError')
    let timer: ReturnType<typeof setTimeout> | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        let index = 0
        const abort = () => {
          if (timer !== undefined) clearTimeout(timer)
          try { controller.error(new DOMException('The turn was cancelled.', 'AbortError')) } catch { /* already closed */ }
        }
        signal?.addEventListener('abort', abort, { once: true })
        const next = () => {
          if (index >= lines.length) { signal?.removeEventListener('abort', abort); controller.close(); return }
          const line = lines[index]!
          const type = parseEventLine(line)?.type
          timer = setTimeout(() => {
            index += 1
            controller.enqueue(encoder.encode(`${line}\n`))
            next()
          }, (type ? PACE[type] : 100) / Math.max(0.1, speed))
        }
        next()
      },
      cancel() { if (timer !== undefined) clearTimeout(timer) },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
  }
}

/* ---------- Chat state ---------- */

export type StepStatus = 'running' | 'done' | 'failed' | 'unfinished'
/** One visible step of a turn. Times are seconds since the turn started. */
export interface Step { key: string; label: string; status: StepStatus; at: number; end?: number; timed?: boolean; detail?: string }
export interface TurnSteps { steps: Step[]; seconds: number }

export type ProposalStatus = 'pending' | 'applied' | 'dismissed' | 'superseded'
export interface ProposalCard {
  baseSceneId: string
  proposalSceneId: string
  summary: string
  products: ProposalProduct[]
  status: ProposalStatus
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  text: string
  /** data: URLs the person attached. */
  images?: string[]
  steps?: TurnSteps
  proposal?: ProposalCard
  /** The turn failed; `retry` is what to send again. */
  error?: boolean
  retry?: { text: string; images?: string[] }
}

export interface LiveTurn {
  /** Wall-clock ms when the turn was sent; steps are relative to it. */
  startedAt: number
  steps: Step[]
  /** Streaming reply text. */
  draft: string
  progress: string
  proposal?: ProposalCard
  /** The scene the agent edits this turn (the `session` event's proposal copy); null when it edits the flat. */
  workSceneId?: string | null
  request: { text: string; images?: string[] }
}

export interface RateLimit { status: string; resetsAt: number | null }

export interface ChatState {
  conversationId?: string
  messages: ChatMessage[]
  turn: LiveTurn | null
  rateLimit: RateLimit | null
}

export type ChatAction =
  | { type: 'send'; id: string; text: string; images?: string[]; at: number }
  | { type: 'event'; event: AgentEvent; at: number; id: string }
  | { type: 'cancel'; at: number; id: string }
  | { type: 'fail'; message: string; at: number; id: string }
  | { type: 'proposal-status'; proposalSceneId: string; status: ProposalStatus }
  | { type: 'note'; id: string; text: string; error?: boolean }
  | { type: 'reset'; conversationId?: string; messages?: ChatMessage[] }

export const emptyChat: ChatState = { messages: [], turn: null, rateLimit: null }

const MAX_STEPS = 60
const seconds = (turn: LiveTurn, at: number) => Math.max(0, (at - turn.startedAt) / 1000)
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** m:ss, the way a stopwatch reads. */
export function clock(value: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** "5 steps · 1 failed · 1:42": a collapsed turn never hides a failure. */
export function stepsSummary(turn: TurnSteps): string {
  const failed = turn.steps.filter((step) => step.status === 'failed').length
  const open = turn.steps.filter((step) => step.status === 'unfinished').length
  return [plural(turn.steps.length, 'step'), failed ? `${failed} failed` : '', open ? `${open} unfinished` : '', clock(turn.seconds)]
    .filter(Boolean).join(' · ')
}

/** `mcp__scene__create_wall` -> `create_wall`. */
export const toolName = (name: string) => name.replace(/^mcp__.+?__/, '')

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const quoted = (value: unknown) => typeof value === 'string' && value.trim() ? ` · “${value.trim().slice(0, 60)}”` : ''

/** Plain-English label for a tool call; unknown tools read as their humanised name. */
export function toolLabel(rawName: string, input: unknown): string {
  const name = toolName(rawName), args = record(input)
  switch (name) {
    case 'search_products': return `Searching Yerevan shops${quoted(args.q ?? args.query)}`
    case 'get_product': return 'Reading a product’s details'
    case 'place_product': return 'Placing a piece in the flat'
    case 'get_scene': case 'get_level_summary': case 'describe_node': case 'get_node': case 'find_nodes': return 'Looking over your flat'
    case 'get_walls': return 'Reading the walls'
    case 'get_zones': return 'Reading the rooms'
    case 'list_levels': return 'Reading the floors'
    case 'measure': return 'Measuring'
    case 'check_collisions': return 'Checking for collisions'
    case 'validate_scene': case 'verify_scene': return 'Checking the scene'
    case 'analyze_floorplan_image': return 'Reading the plan'
    case 'analyze_room_photo': return 'Reading the photo'
    case 'create_level': return 'Setting up the floor'
    case 'create_wall': return 'Drawing a wall'
    case 'create_room': return `Outlining a room${quoted(args.name)}`
    case 'set_zone': return `Naming a room${quoted(args.name ?? args.label)}`
    case 'add_door': return 'Adding a door'
    case 'add_window': return 'Adding a window'
    case 'cut_opening': return 'Cutting an opening'
    case 'place_item': return 'Placing an item'
    case 'delete_node': return 'Removing something'
    case 'apply_patch': return 'Applying changes'
    case 'undo': return 'Undoing a step'
    case 'redo': return 'Redoing a step'
    default: {
      const words = name.replace(/[_-]+/g, ' ').trim()
      return words ? words[0]!.toUpperCase() + words.slice(1) : 'Working'
    }
  }
}

/** A progress line closes the previous progress line. */
function progressStep(steps: Step[], text: string, at: number): Step[] {
  const label = text.trim()
  if (!label || steps.at(-1)?.label === label) return steps
  const next = steps.map((step) => step.status === 'running' && step.key.startsWith('progress:') ? { ...step, status: 'done' as const, end: at } : step)
  next.push({ key: `progress:${next.length}:${label}`, label, status: 'running', at, timed: true })
  return next.slice(-MAX_STEPS)
}

function toolStep(steps: Step[], event: Extract<AgentEvent, { type: 'tool' }>, at: number): Step[] {
  const key = `tool:${event.id}`
  const status: StepStatus = event.status === 'running' ? 'running' : event.status === 'done' ? 'done' : 'failed'
  const detail = event.summary?.trim() || undefined
  const existing = steps.find((step) => step.key === key)
  if (existing) {
    return steps.map((step) => step.key !== key ? step : {
      ...step, status, ...(detail ? { detail } : {}), ...(status === 'running' ? {} : { end: at }),
    })
  }
  return [...steps, { key, label: toolLabel(event.name, event.input), status, at, ...(detail ? { detail } : {}), ...(status === 'running' ? {} : { end: at }) }]
    .slice(-MAX_STEPS)
}

/** When the turn ends anything still open did not finish in it; progress lines count as done. `t` is seconds since
 * the turn started, like every Step time. */
function settle(steps: Step[], t: number): Step[] {
  return steps.map((step) => {
    if (step.status !== 'running') return step.end === undefined ? { ...step, end: t } : step
    return step.key.startsWith('progress:') ? { ...step, status: 'done', end: t } : { ...step, status: 'unfinished' }
  })
}

function endTurn(state: ChatState, at: number, reply: Omit<ChatMessage, 'steps'> | null): ChatState {
  const turn = state.turn
  if (!turn) return state
  const steps = settle(turn.steps, seconds(turn, at))
  const messages = [...state.messages]
  const turnSteps = steps.length ? { steps, seconds: Math.floor(seconds(turn, at)) } : undefined
  if (reply) messages.push({ ...reply, ...(turnSteps ? { steps: turnSteps } : {}) })
  return { ...state, messages, turn: null }
}

/** Only one card can be applied per proposal scene: an older pending card for the same scene is superseded. */
function supersede(messages: ChatMessage[], proposalSceneId: string): ChatMessage[] {
  return messages.map((message) => message.proposal?.status === 'pending' && message.proposal.proposalSceneId === proposalSceneId
    ? { ...message, proposal: { ...message.proposal, status: 'superseded' } } : message)
}

function applyEvent(state: ChatState, event: AgentEvent, at: number, id: string): ChatState {
  if (event.type === 'rate_limit') return { ...state, rateLimit: { status: event.status, resetsAt: event.resetsAt } }
  const turn = state.turn
  if (!turn) return state
  const t = seconds(turn, at)
  switch (event.type) {
    case 'session': return { ...state, conversationId: event.conversationId, turn: { ...turn, workSceneId: event.proposalSceneId } }
    case 'progress': return { ...state, turn: { ...turn, progress: event.text, steps: progressStep(turn.steps, event.text, t) } }
    case 'message_delta': return { ...state, turn: { ...turn, draft: (turn.draft + event.text).slice(-20000) } }
    case 'tool': return { ...state, turn: { ...turn, steps: toolStep(turn.steps, event, t) } }
    case 'proposal': return {
      ...state,
      turn: { ...turn, proposal: { baseSceneId: event.baseSceneId, proposalSceneId: event.proposalSceneId, summary: event.summary, products: event.products, status: 'pending' } },
    }
    case 'done': {
      const proposal = turn.proposal
      const text = turn.draft.trim() || (proposal ? '' : 'Done.')
      const next = { ...state, conversationId: event.conversationId, messages: proposal ? supersede(state.messages, proposal.proposalSceneId) : state.messages }
      return endTurn(next, at, { id, role: 'agent', text, ...(proposal ? { proposal } : {}) })
    }
    case 'error': {
      const prefix = turn.draft.trim() ? `${turn.draft.trim()}\n\n` : ''
      return endTurn(state, at, { id, role: 'agent', text: `${prefix}${event.message}`, error: true, retry: turn.request })
    }
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'send': {
      if (state.turn) return state
      const request = { text: action.text, ...(action.images?.length ? { images: action.images } : {}) }
      return {
        ...state,
        messages: [...state.messages, { id: action.id, role: 'user', ...request }],
        turn: { startedAt: action.at, steps: [], draft: '', progress: '', request },
      }
    }
    case 'event': return applyEvent(state, action.event, action.at, action.id)
    case 'cancel': {
      // What was already written stays; the stop is said under it.
      const said = state.turn?.draft.trim()
      return endTurn(state, action.at, { id: action.id, role: 'agent', text: `${said ? `${said}\n\n` : ''}*Stopped.* You can ask again or try something else.` })
    }
    case 'fail': return endTurn(state, action.at, { id: action.id, role: 'agent', text: action.message, error: true, retry: state.turn?.request })
    case 'proposal-status': return {
      ...state,
      messages: state.messages.map((message) => message.proposal?.proposalSceneId === action.proposalSceneId && message.proposal.status === 'pending'
        ? { ...message, proposal: { ...message.proposal, status: action.status } } : message),
    }
    case 'note': return { ...state, messages: [...state.messages, { id: action.id, role: 'agent', text: action.text, ...(action.error ? { error: true } : {}) }] }
    case 'reset': return { ...emptyChat, conversationId: action.conversationId, messages: action.messages ?? [] }
  }
}

/* ---------- Saved conversations ---------- */

interface SavedChat { version: 1; conversationId?: string; messages: ChatMessage[] }

/** Stored history is untrusted: anything malformed is dropped whole. Images are not stored (quota). */
export function loadChat(storage: Pick<Storage, 'getItem'> | undefined, key: string): { conversationId?: string; messages: ChatMessage[] } {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return { messages: [] }
    const data = JSON.parse(raw) as SavedChat
    if (data.version !== 1 || !Array.isArray(data.messages)) return { messages: [] }
    const messages = data.messages.filter((message) => message && typeof message.id === 'string'
      && (message.role === 'user' || message.role === 'agent') && typeof message.text === 'string')
      // A damaged card or step record is dropped; the message is kept.
      .map(({ proposal, steps, images, ...message }) => ({
        ...message,
        ...(proposal && typeof proposal.proposalSceneId === 'string' && typeof proposal.summary === 'string' && Array.isArray(proposal.products) ? { proposal } : {}),
        ...(steps && Array.isArray(steps.steps) && typeof steps.seconds === 'number' ? { steps } : {}),
        ...(Array.isArray(images) ? { images: images.filter((image) => typeof image === 'string' && image.startsWith('data:image/')) } : {}),
      }))
    return { ...(typeof data.conversationId === 'string' ? { conversationId: data.conversationId } : {}), messages }
  } catch { return { messages: [] } }
}

export function saveChat(storage: Pick<Storage, 'setItem'> | undefined, key: string, state: ChatState): boolean {
  if (!storage) return false
  const messages = state.messages.slice(-80).map(({ images, retry, ...message }) => ({
    ...message,
    ...(images?.length ? { images: images.filter((image) => image.length < 300_000).slice(0, 2) } : {}),
    ...(retry ? { retry: { text: retry.text } } : {}),
  }))
  try {
    storage.setItem(key, JSON.stringify({ version: 1, conversationId: state.conversationId, messages } satisfies SavedChat))
    return true
  } catch {
    // Quota: try once without pictures.
    try {
      storage.setItem(key, JSON.stringify({ version: 1, conversationId: state.conversationId, messages: messages.map(({ images: _, ...rest }) => rest) }))
      return true
    } catch { return false }
  }
}

/* ---------- Money ---------- */

export const amd = (value: number) => `${Math.round(value).toLocaleString('en-US')} ֏`

export function proposalTotal(products: ProposalProduct[]): { total: number; unpriced: number; pieces: number } {
  let total = 0, unpriced = 0, pieces = 0
  for (const product of products) {
    const count = Math.max(1, product.count || 1)
    pieces += count
    if (product.priceAmd === null || !Number.isFinite(product.priceAmd)) unpriced += count
    else total += product.priceAmd * count
  }
  return { total, unpriced, pieces }
}
