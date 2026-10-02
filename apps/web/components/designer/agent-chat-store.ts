// Agent conversations live here, not in the panels: Pascal remounts sidebar tabs (tab switch, the mobile layout
// flip), and a turn must survive that. One session per role + scene owns the chat, the in-flight request, the
// queued message and the live preview. Only Stop, New chat or leaving the scene abort a turn.
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  chatReducer, emptyChat, loadChat, saveChat, streamTurn,
  type AgentRole, type ChatAction, type ChatState, type ProposalStatus, type StreamTurnOptions,
} from '../../lib/agent-stream'

export interface ChatSnapshot {
  chat: ChatState
  /** A message typed while the agent works; sent when the turn ends. */
  queued: string
  /** Whether the last save reached browser storage; null before the first save. */
  saved: boolean | null
  /** The proposal scene the panel shows in the editor, or null. */
  previewing: string | null
  /** What the person is composing, kept across panel remounts (memory only, never saved). */
  draft: ChatDraft
  /** Bumped when something outside the composer (e.g. "Ask the designer") puts text in it. */
  prefills: number
}

/** Unsent input: composer text and pictures, plus the plan intake's chosen plan and note. */
export interface ChatDraft {
  text: string
  images: string[]
  plan: { name: string; url: string } | null
  note: string
}

export const EMPTY_DRAFT: ChatDraft = { text: '', images: [], plan: null, note: '' }

/** The mounted panel's onPreview. Kept after it unmounts so a turn that ends meanwhile still settles the editor. */
export type PreviewHost = (proposalSceneId: string | null, working: boolean) => void

export interface ChatSession {
  readonly key: string
  readonly role: AgentRole
  readonly sceneId: string
  readonly persist: boolean
  readonly store: StoreApi<ChatSnapshot>
  fetchImpl?: StreamTurnOptions['fetchImpl']
  host: PreviewHost | null
  controller: AbortController | null
  /** The working copy this session opened in the editor for the live turn. */
  auto: string | null
}

export const EMPTY_SNAPSHOT: ChatSnapshot = { chat: emptyChat, queued: '', saved: null, previewing: null, draft: EMPTY_DRAFT, prefills: 0 }

const sessions = new Map<string, ChatSession>()
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
const browserStorage = () => { try { return globalThis.localStorage } catch { return undefined } }
let storage: () => Pick<Storage, 'getItem' | 'setItem'> | undefined = browserStorage

/** Tests only: swap browser storage. */
export function setChatStorage(next: (() => Pick<Storage, 'getItem' | 'setItem'> | undefined) | null) { storage = next ?? browserStorage }

export const chatKey = (role: AgentRole, sceneId: string) => `varpet.${role}.chat:${encodeURIComponent(sceneId)}`

/** The session for role + scene, created (and loaded from storage) on first use. Client only. */
export function getChatSession(role: AgentRole, sceneId: string, { persist = true }: { persist?: boolean } = {}): ChatSession {
  const key = chatKey(role, sceneId)
  const existing = sessions.get(key)
  if (existing) return existing
  // The initial state stays empty so zustand's server snapshot matches the server render; the saved thread
  // replaces it at once.
  const store = createStore<ChatSnapshot>(() => EMPTY_SNAPSHOT)
  if (persist) {
    const saved = loadChat(storage(), key)
    store.setState({ chat: { ...emptyChat, ...saved } })
  }
  const session: ChatSession = { key, role, sceneId, persist, store, host: null, controller: null, auto: null }
  sessions.set(key, session)
  return session
}

/** Leaving a scene: its turns stop (the server cancels them) and nothing stays previewed. The thread is kept. */
export function leaveScene(sceneId: string, role?: AgentRole) {
  for (const session of sessions.values()) {
    if (session.sceneId !== sceneId || (role && session.role !== role)) continue
    const controller = session.controller
    session.controller = null
    controller?.abort()
    if (controller) dispatch(session, { type: 'cancel', at: Date.now(), id: uid() })
    session.auto = null
    session.store.setState({ previewing: null, queued: '' })
  }
}

/** Another scene opened for this role: the previous one is left. */
export function leaveOtherScenes(role: AgentRole, sceneId: string) {
  for (const session of [...sessions.values()]) if (session.role === role && session.sceneId !== sceneId) leaveScene(session.sceneId, role)
}

function setPreview(session: ChatSession, id: string | null, working = false) {
  session.store.setState({ previewing: id })
  session.host?.(id, working)
}

/** While a turn runs the editor shows the agent's working copy; when it ends the copy stays only if it was proposed. */
function syncLivePreview(session: ChatSession, before: ChatState, after: ChatState) {
  const busy = after.turn !== null, live = after.turn?.workSceneId ?? null
  if (busy === (before.turn !== null) && live === (before.turn?.workSceneId ?? null)) return
  const { previewing } = session.store.getState()
  if (busy) {
    if (live && previewing !== live) { session.auto = live; setPreview(session, live, true) }
    else if (!live && previewing) setPreview(session, null)
    return
  }
  const shown = session.auto
  session.auto = null
  if (shown && previewing === shown) setPreview(session, after.messages.at(-1)?.proposal?.proposalSceneId === shown ? shown : null, false)
}

function dispatch(session: ChatSession, action: ChatAction) {
  const before = session.store.getState().chat
  const chat = chatReducer(before, action)
  if (chat === before) return
  // Saved whether or not a panel is mounted: a turn that ends on another tab is kept.
  const saved = session.persist && !chat.turn ? saveChat(storage(), session.key, chat) : session.store.getState().saved
  session.store.setState({ chat, saved })
  syncLivePreview(session, before, chat)
}

export async function sendChat(session: ChatSession, text: string, images?: string[]): Promise<void> {
  const message = text.trim()
  if (!message || session.store.getState().chat.turn) return
  const controller = new AbortController()
  session.controller = controller
  const conversationId = session.store.getState().chat.conversationId
  dispatch(session, { type: 'send', id: uid(), text: message, images, at: Date.now() })
  const { role, sceneId } = session
  try {
    await streamTurn(role, { sceneId, message, ...(conversationId ? { conversationId } : {}), ...(images?.length ? { images } : {}) }, {
      fetchImpl: session.fetchImpl,
      signal: controller.signal,
      onEvent: (event) => { if (session.controller === controller) dispatch(session, { type: 'event', event, at: Date.now(), id: uid() }) },
    })
  } catch (error) {
    if (session.controller !== controller || controller.signal.aborted) return
    const reason = error instanceof Error ? error.message : String(error)
    dispatch(session, { type: 'fail', at: Date.now(), id: uid(), message: /failed to fetch|networkerror|load failed|fetch failed/i.test(reason)
      ? `I can’t reach the ${role} right now. Check the connection and press Retry.` : reason || `The ${role} could not finish.` })
  } finally {
    if (session.controller === controller) {
      session.controller = null
      // A message typed while the agent worked goes out now.
      const { queued, chat } = session.store.getState()
      if (queued && !chat.turn) {
        session.store.setState({ queued: '' })
        void sendChat(session, queued)
      }
    }
  }
}

/** Stop means stop: a queued message is not sent; it is returned so the composer can offer it again. */
export function cancelChat(session: ChatSession): string {
  const controller = session.controller
  if (!controller) return ''
  session.controller = null
  controller.abort()
  dispatch(session, { type: 'cancel', at: Date.now(), id: uid() })
  const unsent = session.store.getState().queued
  session.store.setState({ queued: '' })
  return unsent
}

export function queueChat(session: ChatSession, text: string) {
  const message = text.trim()
  if (!message) return
  if (!session.store.getState().chat.turn) { void sendChat(session, message); return }
  const current = session.store.getState().queued
  session.store.setState({ queued: (current ? `${current}\n\n${message}` : message).slice(0, 20000) })
}

export const unqueueChat = (session: ChatSession) => session.store.setState({ queued: '' })

/** Put text in the composer from outside it (the inspector's "Ask the designer"); the panel shows it at once. */
export function prefillChat(session: ChatSession, text: string) {
  const { draft, prefills } = session.store.getState()
  session.store.setState({ draft: { ...draft, text }, prefills: prefills + 1 })
}

/** Keep part of the unsent input on the session, so a remounted panel shows it again. */
export const setChatDraft = (session: ChatSession, patch: Partial<ChatDraft>) =>
  session.store.setState({ draft: { ...session.store.getState().draft, ...patch } })

export function newChat(session: ChatSession) {
  const controller = session.controller
  session.controller = null
  controller?.abort()
  // A new chat drops the pictures and the chosen plan; text being typed stays in the box.
  session.store.setState({ queued: '', draft: { ...EMPTY_DRAFT, text: session.store.getState().draft.text } })
  dispatch(session, { type: 'reset' })
}

export const setProposalStatus = (session: ChatSession, proposalSceneId: string, status: ProposalStatus) =>
  dispatch(session, { type: 'proposal-status', proposalSceneId, status })

export const noteChat = (session: ChatSession, text: string, error = false) => dispatch(session, { type: 'note', id: uid(), text, error })

/** Show a proposal (or the flat) in the editor and remember it on the session. */
export const previewChat = (session: ChatSession, id: string | null) => setPreview(session, id, false)

/** A panel mounted (again): it becomes the preview host, and what the session shows is announced to it. */
export function attachChat(session: ChatSession, host: PreviewHost) {
  session.host = host
  const { previewing, chat } = session.store.getState()
  if (previewing) host(previewing, chat.turn !== null && chat.turn.workSceneId === previewing)
}
