'use client'

// New apartment: pick one of our reconstructed empty flats to start from (lib/flats/templates). Sunday B12121 first.
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_FLAT_TEMPLATE_ID, FLAT_TEMPLATES, type FlatTemplate } from '@/lib/flats/templates'
import { Icon } from './icons'

const area = (m2: number) => `${Math.round(m2)} m²`

/** A modal list of flats; `onPick` gets the chosen one, `onClose` runs when the dialog closes. */
export function FlatPicker({ busy, error, onPick, onClose }: {
  busy: boolean
  error: string | null
  onPick: (template: FlatTemplate) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [chosen, setChosen] = useState(DEFAULT_FLAT_TEMPLATE_ID)
  useEffect(() => { dialog.current?.showModal() }, [])
  const template = FLAT_TEMPLATES.find(t => t.id === chosen) ?? FLAT_TEMPLATES[0]!
  return (
    <dialog ref={dialog} className="portal-dialog flat-picker" aria-labelledby="flat-picker-title" onClose={onClose} onCancel={event => { if (busy) event.preventDefault() }}>
      <div className="flat-picker-top"><div><p className="portal-eyebrow">New apartment</p><h2 id="flat-picker-title">Start from a flat</h2>
        <p>Real plans, rebuilt in 3D with their walls, doors and windows. Furnish it any way you like.</p></div>
        <button className="portal-icon-button" type="button" aria-label="Close" disabled={busy} onClick={() => dialog.current?.close()}><Icon name="close" /></button></div>
      <div className="flat-picker-grid" role="radiogroup" aria-label="Flats">{FLAT_TEMPLATES.map(t => (
        <label key={t.id} className={`flat-picker-card${t.id === chosen ? ' is-chosen' : ''}`}>
          <input type="radio" name="flat-template" value={t.id} checked={t.id === chosen} onChange={() => setChosen(t.id)} />
          <span className="flat-picker-plan"><img src={t.thumbnail} alt="" loading="lazy" /></span>
          <span className="flat-picker-text"><strong>{t.name}</strong><span>{t.note}</span>
            <span className="flat-picker-facts">{area(t.area)} · {t.rooms} rooms{t.id === DEFAULT_FLAT_TEMPLATE_ID ? ' · Default' : ''}</span></span>
        </label>
      ))}</div>
      <p className="portal-error" role="alert" hidden={!error}>{error}</p>
      <div className="flat-picker-actions"><button className="portal-button" type="button" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="portal-button portal-primary" type="button" disabled={busy} onClick={() => onPick(template)}>
          {busy ? 'Creating…' : <>Start with {template.name}<Icon name="arrow" /></>}</button></div>
    </dialog>
  )
}
