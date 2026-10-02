'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { useSceneEditor } from '../editor/scene-editor-store'
import type { AgentRole, ProposalStatus, StreamTurnOptions } from '../../lib/agent-stream'
import {
  EMPTY_SNAPSHOT, attachChat, cancelChat, getChatSession, leaveOtherScenes, leaveScene, newChat, noteChat, previewChat,
  queueChat, sendChat, setProposalStatus, unqueueChat, type ChatSession,
} from './agent-chat-store'

export interface AgentChatOptions {
  role: AgentRole
  sceneId: string
  fetchImpl?: StreamTurnOptions['fetchImpl']
  /** Keep the conversation on this device (default true). */
  persist?: boolean
  /** Show a proposal scene in the editor (working: the agent still edits it), or null for the flat. */
  onPreview?: (proposalSceneId: string | null, opts: { working: boolean }) => void
}

// The editor closing or opening another scene is leaving the scene: its turns stop. Unmounting a panel is not.
if (typeof window !== 'undefined') {
  useSceneEditor.subscribe((state, previous) => {
    if (previous.sceneId && state.sceneId !== previous.sceneId) leaveScene(previous.sceneId)
  })
}

const serverStore = createStore(() => EMPTY_SNAPSHOT)

/** One agent conversation per scene, held outside React (see agent-chat-store): a remounted panel picks up the same
 * thread and the same running turn. */
export function useAgentChat({ role, sceneId, fetchImpl, persist = true, onPreview }: AgentChatOptions) {
  const session: ChatSession | null = useMemo(
    () => (typeof window === 'undefined' ? null : getChatSession(role, sceneId, { persist })), [role, sceneId, persist])
  const { chat: state, queued, saved, previewing } = useStore(session?.store ?? serverStore)
  const [now, setNow] = useState(0)
  const host = useRef(onPreview)
  host.current = onPreview
  if (session) session.fetchImpl = fetchImpl

  useEffect(() => { leaveOtherScenes(role, sceneId) }, [role, sceneId])
  // This panel previews for the session; mounted again, it re-announces what the session shows.
  useEffect(() => {
    if (session) attachChat(session, (id, working) => host.current?.(id, { working }))
  }, [session])

  // The clock for the turn in flight.
  useEffect(() => {
    if (!state.turn) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [state.turn?.startedAt])

  const actions = useMemo(() => ({
    send: (text: string, images?: string[]) => (session ? sendChat(session, text, images) : Promise.resolve()),
    /** Returns a queued message that was not sent. */
    cancel: () => (session ? cancelChat(session) : ''),
    queue: (text: string) => { if (session) queueChat(session, text) },
    unqueue: () => { if (session) unqueueChat(session) },
    newConversation: () => { if (session) newChat(session) },
    setProposalStatus: (proposalSceneId: string, status: ProposalStatus) => { if (session) setProposalStatus(session, proposalSceneId, status) },
    note: (text: string, error = false) => { if (session) noteChat(session, text, error) },
    /** Show a proposal (or the flat, null) in the editor. */
    preview: (id: string | null) => { if (session) previewChat(session, id) },
  }), [session])

  const elapsed = state.turn ? Math.max(0, (Math.max(now, state.turn.startedAt) - state.turn.startedAt) / 1000) : 0
  return { state, elapsed, queued, saved, previewing, ...actions }
}
