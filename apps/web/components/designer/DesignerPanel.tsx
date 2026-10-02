'use client'

import './designer-panel.css'
import { useEffect, useRef, useState } from 'react'
import type { StreamTurnOptions } from '../../lib/agent-stream'
import { Composer } from './composer'
import { Icon, IconButton } from './icons'
import { DraftView, MessageView, QueuedView, RateLimitNotice, type ProposalHandlers } from './messages'
import { LiveTurn } from './steps'
import { useAgentChat } from './use-agent-chat'

export const DEFAULT_STARTERS = [
  'Furnish the living room',
  'Make the bedroom cozier',
  'Where should a desk go for good light?',
  'Find a sofa under 400,000 ֏',
]
const FOLLOW_UPS = ['Show me another option', 'Why this layout?', 'Make it warmer', 'What would it cost?']

export interface DesignerPanelProps {
  sceneId: string
  /** Show a proposal scene in the editor, or null to go back to the flat. */
  /** working: the agent is still editing it, so it must not be applied yet. */
  onPreview?: (proposalSceneId: string | null, opts?: { working: boolean }) => void
  /** Copy the proposal onto the flat (POST /api/scenes/:id/apply). Reject to keep the card open with the error. */
  onApply?: (proposalSceneId: string) => void | Promise<void>
  onDismiss?: (proposalSceneId: string) => void | Promise<void>
  /** Scene-aware starter ideas; the defaults when absent. */
  starters?: string[]
  /** Replay a recorded stream instead of calling the agent (dev page, tests). */
  fetchImpl?: StreamTurnOptions['fetchImpl']
  /** A short label beside the title, e.g. "Recorded replay". */
  badge?: string
  className?: string
}

/** The designer column (v1 designer-panel.ts in React): header, greeting and ideas, the conversation with its steps
 * and proposals, and the composer. Speaks only the AgentEvent stream. */
export function DesignerPanel({ sceneId, onPreview, onApply, onDismiss, starters = DEFAULT_STARTERS, fetchImpl, badge, className = '' }: DesignerPanelProps) {
  // The conversation and its running turn outlive this component (Pascal remounts sidebar tabs).
  const chat = useAgentChat({ role: 'designer', sceneId, fetchImpl, onPreview })
  const { state, elapsed, queued, previewing, preview, draft, setDraft } = chat
  const busy = state.turn !== null
  // Pictures and text being composed live on the session, so switching tabs keeps them.
  const images = draft.images
  const setImages = (next: string[]) => setDraft({ images: next })
  const [acting, setActing] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [nearBottom, setNearBottom] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)

  const exitPreview = () => { if (previewing) preview(null) }

  // Follow the conversation while the reader is at the bottom.
  const lastId = state.messages.at(-1)?.id
  useEffect(() => {
    const element = scroller.current
    if (element && nearBottom) element.scrollTop = element.scrollHeight
  }, [lastId, state.turn?.draft, state.turn?.steps.length, queued, nearBottom])

  const send = (text: string, pictures: string[] = []) => {
    if (busy) { chat.queue(text); return true }
    void chat.send(text, pictures)
    setImages([])
    setNearBottom(true)
    return true
  }

  const act = async (id: string, action: 'apply' | 'dismiss') => {
    const handler = action === 'apply' ? onApply : onDismiss
    setActing(id)
    try {
      await handler?.(id)
      if (previewing === id) preview(null)
      chat.setProposalStatus(id, action === 'apply' ? 'applied' : 'dismissed')
    } catch (error) {
      chat.note(error instanceof Error ? error.message : `The proposal could not be ${action === 'apply' ? 'applied' : 'dismissed'}.`, true)
    } finally { setActing(null) }
  }
  const handlers: ProposalHandlers = {
    previewing, busy, acting,
    onPreview: (id) => preview(previewing === id ? null : id),
    onApply: (id) => { void act(id, 'apply') },
    onDismiss: (id) => { void act(id, 'dismiss') },
  }

  const empty = state.messages.length === 0 && !busy
  const lastIndex = state.messages.length - 1
  return (
    <section className={`designer-column${collapsed ? ' designer-collapsed' : ''} ${className}`.trim()} aria-label="Designer" aria-busy={busy}>
      <header className="designer-chat-header">
        <h2 className="designer-title"><span className="designer-dot" aria-hidden="true" />Designer</h2>
        {badge ? <span className="mock-label designer-badge">{badge}</span> : null}
        <div className="designer-header-actions">
          <IconButton name="plus" label="New conversation" className="designer-new" onClick={() => { exitPreview(); setImages([]); chat.newConversation() }} />
          <button type="button" className="designer-icon-button designer-collapse" aria-expanded={!collapsed}
            aria-label={collapsed ? 'Open designer' : 'Collapse designer'} title={collapsed ? 'Open designer' : 'Collapse designer'}
            onClick={() => setCollapsed(!collapsed)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16m7-11-3 3 3 3" />
            </svg>
          </button>
        </div>
      </header>
      {state.rateLimit ? <RateLimitNotice {...state.rateLimit} /> : null}
      <div className="designer-chat-body" hidden={collapsed}>
        <div className="designer-chat-scroll" ref={scroller}
          onScroll={(event) => { const el = event.currentTarget; setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60) }}>
          {empty ? (
            <div className="designer-greeting">
              <span className="designer-greeting-icon" aria-hidden="true"><Icon name="sparkles" size={22} /></span>
              <h2>What would make this feel like home?</h2>
              <p>Tell me what you have in mind. We can explore a change together, and you decide what to apply.</p>
            </div>
          ) : null}
          <details className="designer-starters" open={empty || undefined} key={empty ? 'open' : 'closed'}>
            <summary>Ideas for this flat</summary>
            <div className="designer-examples">
              {starters.map((starter) => (
                <button key={starter} type="button" className="designer-example" disabled={busy} onClick={() => send(starter)}>{starter}</button>
              ))}
            </div>
          </details>
          <div className="designer-messages" role="log" aria-label="Designer conversation" aria-live="polite">
            {state.messages.map((message, index) => (
              <MessageView key={message.id} message={message} last={index === lastIndex} busy={busy} author="Designer"
                handlers={handlers} suggestions={message.proposal ? FOLLOW_UPS : undefined}
                onRetry={(failed) => failed.retry && send(failed.retry.text, failed.retry.images)}
                onSuggest={(text) => send(text)} />
            ))}
            {state.turn ? <LiveTurn turn={state.turn} elapsed={elapsed} /> : null}
            {state.turn?.draft ? <DraftView text={state.turn.draft} author="Designer" /> : null}
            {queued ? <QueuedView text={queued} onRemove={chat.unqueue} /> : null}
          </div>
          {!nearBottom ? (
            <IconButton name="down" label="Jump to latest" className="designer-jump" onClick={() => {
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); setNearBottom(true)
            }} />
          ) : null}
        </div>
        <Composer busy={busy} images={images} onImages={setImages} onSubmit={(text) => send(text, images)} onStop={chat.cancel}
          initial={draft.text} onTextChange={(text) => setDraft({ text })} />
        <small className="designer-storage-status">
          {chat.saved === false ? 'This conversation stays in this tab until browser storage is available.' : 'Conversation saved on this device.'}
        </small>
      </div>
    </section>
  )
}

export default DesignerPanel
