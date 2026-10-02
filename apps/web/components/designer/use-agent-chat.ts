'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  chatReducer, emptyChat, loadChat, saveChat, streamTurn,
  type AgentRole, type ChatState, type ProposalStatus, type StreamTurnOptions,
} from '../../lib/agent-stream'

export interface AgentChatOptions {
  role: AgentRole
  sceneId: string
  fetchImpl?: StreamTurnOptions['fetchImpl']
  /** Keep the conversation on this device (default true). */
  persist?: boolean
}

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
const storage = () => { try { return window.localStorage } catch { return undefined } }

/** One agent conversation per scene: sending, streaming, stopping, queueing, and the saved thread. */
export function useAgentChat({ role, sceneId, fetchImpl, persist = true }: AgentChatOptions) {
  const [state, dispatch] = useReducer(chatReducer, emptyChat)
  const [queued, setQueued] = useState('')
  const [saved, setSaved] = useState<boolean | null>(null)
  const [now, setNow] = useState(0)
  const active = useRef<AbortController | null>(null)
  const latest = useRef<ChatState>(state)
  latest.current = state
  const key = `varpet.${role}.chat:${encodeURIComponent(sceneId)}`
  const loadedKey = useRef<string | null>(null)
  /** The state a load replaced: never saved (React's dev double-run would otherwise store an empty thread). */
  const replaced = useRef<ChatState | null>(null)

  // Declared before the loader: on mount and on a scene switch it runs first and skips, so a stale thread never
  // overwrites the saved one.
  useEffect(() => {
    if (!persist || loadedKey.current !== key || state.turn || state === replaced.current) return
    setSaved(saveChat(storage(), key, state))
  }, [state, key, persist])

  // Browser storage only after mount, so the server render and the first client render agree.
  useEffect(() => {
    active.current?.abort(); active.current = null
    const saved = persist ? loadChat(storage(), key) : { messages: [] }
    replaced.current = latest.current
    dispatch({ type: 'reset', ...saved })
    setQueued('')
    loadedKey.current = key
  }, [key, persist])

  // The clock for the turn in flight.
  useEffect(() => {
    if (!state.turn) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [state.turn?.startedAt])

  useEffect(() => () => { active.current?.abort() }, [])

  const send = useCallback(async (text: string, images?: string[]) => {
    const message = text.trim()
    if (!message || latest.current.turn) return
    const controller = new AbortController()
    active.current = controller
    dispatch({ type: 'send', id: uid(), text: message, images, at: Date.now() })
    const conversationId = latest.current.conversationId
    try {
      await streamTurn(role, { sceneId, message, ...(conversationId ? { conversationId } : {}), ...(images?.length ? { images } : {}) }, {
        fetchImpl,
        signal: controller.signal,
        onEvent: (event) => { if (active.current === controller) dispatch({ type: 'event', event, at: Date.now(), id: uid() }) },
      })
    } catch (error) {
      if (active.current !== controller) return
      if (controller.signal.aborted) return
      const reason = error instanceof Error ? error.message : String(error)
      dispatch({ type: 'fail', at: Date.now(), id: uid(), message: /failed to fetch|networkerror|load failed|fetch failed/i.test(reason)
        ? `I can’t reach the ${role} right now. Check the connection and press Retry.` : reason || `The ${role} could not finish.` })
    } finally {
      if (active.current === controller) active.current = null
    }
  }, [role, sceneId, fetchImpl])

  // A message typed while the agent works goes out when the turn ends.
  useEffect(() => {
    if (state.turn || !queued || active.current) return
    const next = queued
    setQueued('')
    void send(next)
  }, [state.turn, queued, send])

  /** Stop means stop: a queued message is not sent; it is returned so the composer can offer it again. */
  const cancel = useCallback(() => {
    const controller = active.current
    if (!controller) return ''
    active.current = null
    controller.abort()
    dispatch({ type: 'cancel', at: Date.now(), id: uid() })
    const unsent = queued
    setQueued('')
    return unsent
  }, [queued])

  const queue = useCallback((text: string) => {
    const message = text.trim()
    if (!message) return
    if (!latest.current.turn) { void send(message); return }
    setQueued((current) => (current ? `${current}\n\n${message}` : message).slice(0, 20000))
  }, [send])

  const newConversation = useCallback(() => {
    active.current?.abort(); active.current = null
    setQueued('')
    dispatch({ type: 'reset' })
  }, [])

  const setProposalStatus = useCallback((proposalSceneId: string, status: ProposalStatus) =>
    dispatch({ type: 'proposal-status', proposalSceneId, status }), [])
  const note = useCallback((text: string, error = false) => dispatch({ type: 'note', id: uid(), text, error }), [])

  const elapsed = state.turn ? Math.max(0, (Math.max(now, state.turn.startedAt) - state.turn.startedAt) / 1000) : 0
  return { state, elapsed, queued, saved, send, cancel, queue, unqueue: () => setQueued(''), newConversation, setProposalStatus, note }
}
