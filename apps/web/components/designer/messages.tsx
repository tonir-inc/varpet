'use client'

import { useState } from 'react'
import { amd, proposalTotal, type ChatMessage, type ProposalCard as ProposalCardData } from '../../lib/agent-stream'
import { Icon, IconButton } from './icons'
import { Markdown } from './markdown'
import { CollapsedSteps } from './steps'

const statusLine: Record<ProposalCardData['status'], string> = {
  pending: 'Ready for your review',
  applied: 'Applied to your flat',
  dismissed: 'Dismissed',
  superseded: 'Replaced by a newer proposal',
}

export interface ProposalHandlers {
  previewing: string | null
  busy: boolean
  /** Which card is waiting on Apply or Dismiss. */
  acting: string | null
  onPreview: (proposalSceneId: string) => void
  onApply: (proposalSceneId: string) => void
  onDismiss: (proposalSceneId: string) => void
}

export function ProposalCard({ proposal, handlers }: { proposal: ProposalCardData; handlers: ProposalHandlers }) {
  const { total, unpriced, pieces } = proposalTotal(proposal.products)
  const short = proposal.summary.trim().length <= 90 && !proposal.summary.includes('\n')
  const previewing = handlers.previewing === proposal.proposalSceneId
  const acting = handlers.acting === proposal.proposalSceneId
  return (
    <div className="designer-proposal-card" data-status={proposal.status}>
      <h3>{short ? proposal.summary.trim() : 'Proposed change'}</h3>
      {short ? null : <Markdown text={proposal.summary} />}
      {proposal.products.length ? (
        <>
          <ul className="designer-products" aria-label="Pieces in this proposal">
            {proposal.products.map((product, index) => (
              <li className="designer-product" key={`${product.productId}:${index}`} title={product.shop ? `${product.name} · ${product.shop}` : product.name}>
                <span className="designer-product-index" aria-hidden="true">{index + 1}</span>
                <span className="designer-product-name">{product.count > 1 ? `${product.count} × ` : ''}{product.name}</span>
                <span className="designer-product-price">
                  {product.priceAmd === null ? 'price on request' : amd(product.priceAmd * Math.max(1, product.count))}
                </span>
              </li>
            ))}
          </ul>
          <dl className="designer-metrics">
            <dt>Pieces</dt><dd>{pieces}</dd>
            <dt>Total{unpriced ? ` · ${unpriced} on request` : ''}</dt><dd>{amd(total)}</dd>
          </dl>
        </>
      ) : null}
      <p className="designer-proposal-status" role="status">{previewing && proposal.status === 'pending' ? 'Previewing in your flat · not applied' : statusLine[proposal.status]}</p>
      {proposal.status === 'pending' ? (
        <div className="designer-proposal-actions">
          <button type="button" className="button primary designer-apply" disabled={handlers.busy || acting}
            onClick={() => handlers.onApply(proposal.proposalSceneId)}>{acting ? 'Applying…' : 'Apply'}</button>
          <button type="button" className="button quiet designer-preview" disabled={handlers.busy || acting} aria-pressed={previewing}
            onClick={() => handlers.onPreview(proposal.proposalSceneId)}>{previewing ? 'Exit preview' : 'Preview'}</button>
          <IconButton name="close" label="Dismiss" className="designer-dismiss" disabled={handlers.busy || acting}
            onClick={() => handlers.onDismiss(proposal.proposalSceneId)} />
        </div>
      ) : null}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const label = state === 'done' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy message'
  const copy = () => {
    const reset = () => setTimeout(() => setState('idle'), 1600)
    if (!navigator.clipboard) { setState('failed'); reset(); return }
    navigator.clipboard.writeText(text).then(() => setState('done'), () => setState('failed')).finally(reset)
  }
  return <IconButton name={state === 'done' ? 'check' : state === 'failed' ? 'cross' : 'copy'} label={label} onClick={copy} className="designer-copy" />
}

export function MessageView({ message, last, busy, author, handlers, suggestions, onRetry, onSuggest }: {
  message: ChatMessage
  last: boolean
  busy: boolean
  author: string
  handlers?: ProposalHandlers
  suggestions?: string[]
  onRetry: (message: ChatMessage) => void
  onSuggest?: (text: string) => void
}) {
  const agent = message.role === 'agent'
  const classes = ['designer-message', `designer-message-${agent ? 'designer' : 'user'}`]
  if (message.error && last) classes.push('designer-message-error')
  const chips = agent && onSuggest && (message.proposal || (last && !message.error)) ? suggestions : undefined
  return (
    <article className={classes.join(' ')}>
      <strong className="designer-author">{agent ? author : 'You'}</strong>
      {message.steps ? <CollapsedSteps turn={message.steps} /> : null}
      {message.images?.map((image, index) => <img key={index} className="designer-attached" src={image} alt="Picture you attached" />)}
      {message.text ? (agent ? <Markdown text={message.text} /> : <div className="designer-message-copy">{message.text}</div>) : null}
      {message.proposal && handlers ? <ProposalCard proposal={message.proposal} handlers={handlers} /> : null}
      {chips?.length ? (
        <div className="designer-suggestions" aria-label="Continue the conversation">
          {chips.map((chip) => (
            <button key={chip} type="button" className="button quiet designer-suggestion" disabled={busy} onClick={() => onSuggest?.(chip)}>{chip}</button>
          ))}
        </div>
      ) : null}
      {message.error && message.retry && last ? (
        <button type="button" className="button designer-retry" disabled={busy} onClick={() => onRetry(message)}>Retry</button>
      ) : null}
      {agent && message.text ? <div className="designer-message-tools"><CopyButton text={message.text} /></div> : null}
    </article>
  )
}

export function DraftView({ text, author }: { text: string; author: string }) {
  return (
    <article className="designer-message designer-message-designer designer-draft" aria-live="off">
      <strong className="designer-author">{author}</strong>
      <Markdown text={text} />
    </article>
  )
}

export function QueuedView({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <article className="designer-message designer-message-user designer-queued">
      <strong className="designer-author">You, queued</strong>
      <div className="designer-message-copy">{text}</div>
      <div className="designer-queued-foot">
        <small>Queued · sends when the designer finishes</small>
        <IconButton name="close" label="Remove queued message" onClick={onRemove} className="designer-unqueue" />
      </div>
    </article>
  )
}

export function RateLimitNotice({ status, resetsAt }: { status: string; resetsAt: number | null }) {
  if (status === 'allowed') return null
  const blocked = status === 'rejected'
  // resetsAt is a Unix time; seconds and milliseconds both appear in the wild.
  const when = resetsAt ? new Date(resetsAt < 1e12 ? resetsAt * 1000 : resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div className={`designer-service-status ${blocked ? 'designer-service-offline' : 'designer-service-warming'}`} role="status">
      <strong>{blocked ? 'Usage limit reached' : 'Close to the usage limit'}</strong>
      {when ? ` · ${blocked ? 'available again' : 'resets'} at ${when}` : ''}
    </div>
  )
}

export { Icon }
