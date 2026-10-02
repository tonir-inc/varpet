'use client'

// Saved apartments (v1 portal.ts `?view=apartments` + team-apartments.ts). Signed in: the account's apartments,
// each opening its Pascal scene in the editor. Signed out: the team's shared saves, no sign-in needed.
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FlatTemplate } from '@/lib/flats/templates'
import { accountApi, createScene, editorHref, flatsApi, type ApartmentSummary, type FlatMeta } from './api'
import { FlatPicker } from './flat-picker'
import { formatSavedDate, usePortal } from './frame'
import { Icon } from './icons'

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'list'; apartments: ApartmentSummary[] }

export function ApartmentsPage() {
  const { user, status, showNotice } = usePortal()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [creating, setCreating] = useState(false)
  const [picking, setPicking] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const version = useRef(0)

  const load = useCallback(async () => {
    const v = ++version.current
    setState({ kind: 'loading' })
    try {
      const apartments = await accountApi.listApartments()
      if (v === version.current) setState({ kind: 'list', apartments })
    } catch (cause) {
      if (v === version.current) setState({ kind: 'error', message: cause instanceof Error ? cause.message : 'Check your connection and try again.' })
    }
  }, [])
  useEffect(() => { if (user) void load(); else ++version.current }, [user, load])

  /** A new apartment from a flat template: a Pascal scene (lane A's store), then the account record pointing at it. */
  async function create(template: FlatTemplate) {
    if (creating) return
    setCreating(true); setCreateError(null); showNotice(null)
    try {
      const sceneId = await createScene(template.name, template.id)
      await accountApi.createApartment({ name: template.name, templateId: template.id, sceneId })
      location.assign(editorHref(sceneId))
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Could not create the apartment. Please try again.')
      setCreating(false)
    }
  }

  const firstName = user?.name.trim().split(/\s+/)[0]
  const heading = (
    <div className="portal-profile-heading"><div><p className="portal-eyebrow">Your personal collection</p>
      <h1>{firstName ? `${firstName}'s apartments` : 'My apartments'}</h1><p>All your spaces. Every possibility.</p></div>
      <button className="portal-button portal-primary" type="button" onClick={() => setPicking(true)} disabled={creating}><Icon name="plus" />{creating ? 'Creating…' : 'New apartment'}</button>
      {picking && <FlatPicker busy={creating} error={createError} onPick={template => void create(template)} onClose={() => { setPicking(false); setCreateError(null) }} />}</div>
  )

  if (status === 'loading') return <>{heading}<div className="portal-profile-status" role="status">Checking your account…</div></>
  if (!user) return <TeamApartments />
  if (state.kind === 'loading') return <>{heading}<div className="portal-profile-status" role="status">Loading your apartments…</div></>
  if (state.kind === 'error') {
    return <>{heading}<section className="portal-empty portal-load-error"><span className="portal-empty-icon"><Icon name="folder" /></span><h2>We couldn&apos;t load your apartments.</h2>
      <p className="portal-profile-error" role="alert">{state.message}</p><button className="portal-button" type="button" onClick={() => void load()}>Try again</button></section></>
  }
  if (!state.apartments.length) {
    return <>{heading}<section className="portal-empty"><span className="portal-empty-icon"><Icon name="home" /></span><p className="portal-eyebrow">Room for something new</p>
      <h2>Your first apartment is waiting.</h2><p>Choose a floor plan, make it your own, and save it here. Your ideas will be ready whenever you are.</p>
      <Link className="portal-button portal-primary" href="/">Upload a floor plan<Icon name="arrow" /></Link></section></>
  }
  const count = state.apartments.length
  return (
    <>
      {heading}
      <p className="portal-profile-count">{count} saved apartment{count === 1 ? '' : 's'}</p>
      <div className="portal-apartment-grid portal-saved-grid">{state.apartments.map(apartment => (
        <article className="portal-apartment-card" key={apartment.id}>
          <div className="portal-card-stage"><div className="portal-preview"><div className="portal-preview-fallback"><Icon name="home" /><span>Your apartment</span></div></div>
            <span className="portal-card-badge">Saved apartment</span></div>
          <div className="portal-card-body"><p className="portal-kicker">{formatSavedDate(apartment.updatedAt)}</p><h3>{apartment.name}</h3>
            <p className="portal-location">Your personal project</p>
            <div className="portal-card-bottom"><span className="portal-saved-state"><Icon name="save" />Saved in your account</span>
              <a className="portal-card-link" href={editorHref(apartment.sceneId)} aria-label={`Open ${apartment.name}`}>Open apartment<Icon name="arrow" /></a></div></div>
        </article>
      ))}</div>
    </>
  )
}

const KIND: Record<FlatMeta['kind'], string> = { template: 'Template', upload: 'Upload', blank: 'Blank', other: 'Other' }

/** v1 team-apartments.ts: the team's shared saves. v1 flats are v1 scenes, so there is no v2 editor to open them in. */
function TeamApartments() {
  const [flats, setFlats] = useState<FlatMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null); setFlats(null)
    try { setFlats(await flatsApi.list()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load team apartments.') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function act(id: string, action: () => Promise<void>) {
    setBusy(id); setActionError(null)
    try { await action(); await load() } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Could not update apartment.') } finally { setBusy(null) }
  }

  if (error) return <><h1>Saved apartments</h1><p role="alert">{error}</p><button type="button" onClick={() => void load()}>Retry</button></>
  if (!flats) return <><h1>Saved apartments</h1><p role="status">Loading team apartments…</p></>
  return (
    <>
      {actionError && <p role="alert">{actionError}</p>}
      <h1>Saved apartments</h1><p>Shared with everyone on the team. No sign-in needed.</p>
      {!flats.length ? <section className="portal-empty"><h2>No saved apartments yet</h2><p>Open a plan and Save to share it with the team.</p><Link href="/">Start with a plan</Link></section>
        : <div className="portal-apartment-grid portal-saved-grid">{[...flats].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(flat => (
          <article className="portal-apartment-card" key={flat.id}>
            <div className="portal-card-stage">{flat.has_thumbnail
              ? <img src={flatsApi.thumbnail(flat.id)} alt={flat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              : <div className="portal-preview-fallback">Plan saved</div>}
              <span className="portal-card-badge">{flat.designed ? 'Designed' : 'Plan only'} · {KIND[flat.kind] ?? 'Other'}</span></div>
            <div className="portal-card-body"><h3>{flat.name}</h3>
              <p>{new Date(flat.updated_at).toLocaleString()}{flat.updated_by ? ` · ${flat.updated_by}` : ''}</p>
              <div className="portal-card-bottom">
                <button type="button" disabled={busy === flat.id} onClick={() => {
                  const name = window.prompt('Rename apartment', flat.name)?.trim()
                  if (name && name !== flat.name) void act(flat.id, () => flatsApi.rename(flat.id, name))
                }}>Rename</button>
                <button type="button" disabled={busy === flat.id} onClick={() => {
                  if (window.confirm('Delete this saved apartment from the team collection?')) void act(flat.id, () => flatsApi.remove(flat.id))
                }}>Delete</button>
              </div></div>
          </article>
        ))}</div>}
    </>
  )
}
