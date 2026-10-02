'use client'

// v1's header (52px, paper): the varpet mark and the flat's name on the left; on the right the cost button with its
// "What it costs" dialog, the save state (and save problems, which used to be a floating banner), undo/redo, share.
import { type SaveStatus, useScene } from '@pascal-app/editor'
import { useEffect, useMemo, useRef, useState } from 'react'
import { amd } from '@/lib/agent-stream'
import { buildQuote, type Quote, type QuoteLine } from './costs'
import { redo, undo } from './folio-actions'
import { FolioIcon } from './folio-icon'

export interface FolioNavbarProps {
  name: string
  saveStatus: SaveStatus
  saveError: string | null
  conflict: boolean
  onDismissConflict: () => void
}

const SAVE_TEXT: Record<SaveStatus, string> = {
  idle: 'Saved',
  saved: 'Saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  paused: 'Saving paused',
  error: 'Not saved',
}

function useQuote(): Quote {
  const nodes = useScene((s) => s.nodes)
  return useMemo(() => buildQuote(nodes as Record<string, unknown>), [nodes])
}

function QuoteLines({ lines }: { lines: QuoteLine[] }) {
  return lines.map((line) => (
    <div className="folio-line" key={line.key}>
      <span>
        {line.name}{line.count > 1 ? ` × ${line.count}` : ''}
        <small className="folio-num">{[line.size, line.shop].filter(Boolean).join(' · ')}</small>
      </span>
      <span className="folio-num">{line.unit === null ? '–' : amd(line.unit * line.count)}</span>
    </div>
  ))
}

function CostsDialog({ quote, dialog }: { quote: Quote; dialog: React.RefObject<HTMLDialogElement | null> }) {
  return (
    <dialog
      aria-label="What it costs"
      className="folio-costs"
      onClick={(event) => {
        // A click on the backdrop (outside the card) closes it.
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close()
      }}
      onKeyDown={(event) => event.stopPropagation()}
      ref={dialog}
    >
      <header>
        <h2>What it costs</h2>
        <button aria-label="Close" className="folio-icon-button" onClick={() => dialog.current?.close()} title="Close" type="button">
          <FolioIcon name="close" />
        </button>
      </header>
      {quote.shops.length ? (
        <section className="folio-group">
          <h3>Yerevan shops</h3>
          <p>Catalog products with the shop&apos;s listed price.</p>
          <QuoteLines lines={quote.shops} />
        </section>
      ) : null}
      {quote.developer.length ? (
        <section className="folio-group">
          <h3>In the flat now, from the developer</h3>
          <p>Pieces that came with the flat; no price yet.</p>
          <QuoteLines lines={quote.developer} />
        </section>
      ) : null}
      {!quote.pieces ? <p className="folio-note">No furniture in the flat yet. Add some, or ask the designer.</p> : null}
      <div className="folio-total">
        <span>Total</span>
        <strong className="folio-num">{amd(quote.total)}</strong>
      </div>
      <p className="folio-note">{quote.priced} of {quote.pieces} pieces are catalog products.</p>
    </dialog>
  )
}

export function FolioNavbar({ name, saveStatus, saveError, conflict, onDismissConflict }: FolioNavbarProps) {
  const quote = useQuote()
  const dialog = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const share = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('preview')
    void navigator.clipboard?.writeText(url.href).then(() => setCopied(true), () => setCopied(false))
  }

  return (
    <header className="folio-navbar" data-folio-navbar>
      <a aria-label="varpet home" className="folio-brand" href="/">
        <span className="folio-mark" aria-hidden="true">V</span>
        <span>varpet</span>
      </a>
      <span className="folio-flat-name" title={name}>{name}</span>
      <div className="folio-navbar-actions">
        {conflict ? (
          <span className="folio-save-alert" role="alert">
            Another session saved first. Your last change is not saved.
            <button onClick={() => window.location.reload()} type="button">Reload</button>
            <button onClick={onDismissConflict} type="button">Dismiss</button>
          </span>
        ) : saveError ? (
          <span className="folio-save-alert" role="alert">{saveError}</span>
        ) : null}
        <button
          aria-label={`What it costs · ${amd(quote.total)}`}
          className="folio-quote"
          data-folio-action="costs"
          onClick={() => dialog.current?.showModal()}
          title="What it costs"
          type="button"
        >
          <FolioIcon name="receipt" />
          <span className="folio-num">{amd(quote.total)}</span>
        </button>
        <span className="folio-save-state" aria-live="polite">{saveError || conflict ? 'Not saved' : SAVE_TEXT[saveStatus]}</span>
        <button aria-label="Undo" className="folio-icon-button folio-quiet" onClick={undo} title="Undo (⌘Z)" type="button">
          <FolioIcon name="undo" />
        </button>
        <button aria-label="Redo" className="folio-icon-button folio-quiet" onClick={redo} title="Redo (⇧⌘Z)" type="button">
          <FolioIcon name="redo" />
        </button>
        <button aria-label={copied ? 'Link copied' : 'Copy a link to this flat'} className="folio-icon-button" onClick={share} title={copied ? 'Link copied' : 'Copy a link to this flat'} type="button">
          <FolioIcon name={copied ? 'check' : 'share'} />
        </button>
      </div>
      <CostsDialog dialog={dialog} quote={quote} />
    </header>
  )
}
