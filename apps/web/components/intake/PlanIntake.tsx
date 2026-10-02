'use client'

import '../designer/designer-panel.css'
import './intake.css'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { StreamTurnOptions } from '../../lib/agent-stream'
import { shrinkPicture } from '../designer/composer'
import { Icon } from '../designer/icons'
import { DraftView, MessageView, RateLimitNotice, type ProposalHandlers } from '../designer/messages'
import { LiveTurn } from '../designer/steps'
import { useAgentChat } from '../designer/use-agent-chat'
import { clearPlanHandoff, readPlanHandoff } from '../../lib/plan-handoff'

export const PLAN_REQUEST = 'Here is the floor plan of my flat. Build it: walls, rooms with their names, doors and windows, at the plan’s scale.'

export interface PlanIntakeProps {
  /** The (empty) scene the architect builds into. */
  sceneId: string
  /** working: the agent is still editing it, so it must not be applied yet. */
  onPreview?: (proposalSceneId: string | null, opts?: { working: boolean }) => void
  onApply?: (proposalSceneId: string) => void | Promise<void>
  onDismiss?: (proposalSceneId: string) => void | Promise<void>
  fetchImpl?: StreamTurnOptions['fetchImpl']
  className?: string
}

/** Plan in, architect turn out: upload a floor plan picture, add a note, and watch the architect build the shell
 * with the designer's step rows. Ends on the architect's reply and its proposal card. */
export function PlanIntake({ sceneId, onPreview, onApply, onDismiss, fetchImpl, className = '' }: PlanIntakeProps) {
  // The conversation and its running turn outlive this component (Pascal remounts sidebar tabs).
  const chat = useAgentChat({ role: 'architect', sceneId, fetchImpl, onPreview })
  const { state, elapsed, previewing, preview, draft, setDraft } = chat
  const busy = state.turn !== null
  // The chosen plan and the note live on the session, so switching tabs keeps them.
  const { plan, note } = draft
  const setPlan = (next: { name: string; url: string } | null) => setDraft({ plan: next })
  const setNote = (next: string) => setDraft({ note: next })
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // A plan chosen on the portal ("Bring my plan to life") waits here for the person to start the build.
  // A plan the person already chose here (kept across remounts) wins over the handoff.
  useEffect(() => { const handed = readPlanHandoff(sceneId); if (handed && !plan) setDraft({ plan: handed }) }, [sceneId, setDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    try {
      setError('')
      setPlan({ name: file.name.replace(/[\/\\\0\r\n]/g, '_').slice(0, 120), url: await shrinkPicture(file, 1500 * 1024) })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'That plan could not be read.') }
  }
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0]) }
  const start = () => {
    if (!plan || busy) return
    clearPlanHandoff(sceneId)
    void chat.send(note.trim() ? `${PLAN_REQUEST}\n\n${note.trim()}` : PLAN_REQUEST, [plan.url])
  }

  const act = async (id: string, action: 'apply' | 'dismiss') => {
    setActing(id)
    try {
      await (action === 'apply' ? onApply : onDismiss)?.(id)
      if (previewing === id) preview(null)
      chat.setProposalStatus(id, action === 'apply' ? 'applied' : 'dismissed')
    } catch (reason) {
      chat.note(reason instanceof Error ? reason.message : `The shell could not be ${action === 'apply' ? 'applied' : 'dismissed'}.`, true)
    } finally { setActing(null) }
  }
  const handlers: ProposalHandlers = {
    previewing, busy, acting,
    onPreview: (id) => preview(previewing === id ? null : id),
    onApply: (id) => { void act(id, 'apply') },
    onDismiss: (id) => { void act(id, 'dismiss') },
  }
  const started = state.messages.length > 0 || busy
  const lastIndex = state.messages.length - 1

  return (
    <section className={`intake-panel ${className}`.trim()} aria-label="Start from your plan" aria-busy={busy}>
      <div className="modal-heading">
        <h2><span className="designer-dot intake-dot" aria-hidden="true" />Start from your plan</h2>
        {started && !busy ? (
          <button type="button" className="button quiet" onClick={() => { chat.newConversation(); setPlan(null); setNote(''); preview(null) }}>New plan</button>
        ) : null}
      </div>
      <p className="modal-intro">Upload the developer’s floor plan. The architect reads it and builds the walls, rooms, doors and windows; you check the shell before it replaces the flat.</p>
      {state.rateLimit ? <RateLimitNotice {...state.rateLimit} /> : null}

      {!started ? (
        <div className="intake-start">
          <label className={`intake-upload${dragging ? ' intake-dragging' : ''}${plan ? ' intake-has-plan' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
            {plan ? <img src={plan.url} alt={`Floor plan ${plan.name}`} className="intake-plan" /> : <Icon name="plan" size={28} />}
            <strong>{plan ? plan.name : 'Choose a plan picture'}</strong>
            <span>{plan ? 'Choose another to replace it' : 'JPEG, PNG or WebP · drop it here or click'}</span>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="designer-visually-hidden"
              onChange={(event) => { void choose(event.target.files?.[0]) }} />
          </label>
          <label className="intake-note">Anything the plan does not show (optional)
            <textarea rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)}
              placeholder="Ceilings are 2.9 m; the loggia is glazed" />
          </label>
          <button type="button" className="button primary intake-go" disabled={!plan} onClick={start}>Build the flat from this plan</button>
          {error ? <p className="intake-error" role="alert">{error}</p> : null}
        </div>
      ) : (
        <div className="designer-messages intake-log" role="log" aria-label="Architect progress" aria-live="polite">
          {state.messages.map((message, index) => (
            <MessageView key={message.id} message={message} last={index === lastIndex} busy={busy} author="Architect" handlers={handlers}
              onRetry={(failed) => failed.retry && void chat.send(failed.retry.text, failed.retry.images)} />
          ))}
          {state.turn ? <LiveTurn turn={state.turn} elapsed={elapsed} noun="architect" /> : null}
          {state.turn?.draft ? <DraftView text={state.turn.draft} author="Architect" /> : null}
          {busy ? <button type="button" className="button quiet intake-stop" onClick={() => chat.cancel()}>Stop</button> : null}
        </div>
      )}
    </section>
  )
}

export default PlanIntake
