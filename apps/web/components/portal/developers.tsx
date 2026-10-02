'use client'

// Developer profiles (v1 portal/developer-profile.ts): the public profile `/developers/[slug]`, the signed-in
// account's studio `/studio` (create/edit the profile, unpublish plans) and the upload page `/studio/upload`.
// Plan cards show the original drawing beside a placeholder for the furnished 3D pane (v1 drew it with three.js).
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { bedroomLabel, catalogHref, developerApi, developerHref, editorHref, PortalError, profileInitials, slugify, studioHref,
  type BundleSummary, type Developer, type ProfileInput } from './api'
import { BlueprintWelcome } from './blueprint-welcome'
import { usePortal } from './frame'
import { Icon } from './icons'
import { BLUEPRINT_PAPER, reducedMotion } from './ink'

const paper = { ['--paper' as string]: BLUEPRINT_PAPER }
const Loading = ({ text }: { text: string }) => <div className="portal-profile-status dev-loading" role="status"><span className="developer-spinner" aria-hidden="true" />{text}</div>

function Problem({ title, text, retry }: { title: string; text: string; retry?: () => void }) {
  return <section className="portal-empty dev-problem"><span className="portal-empty-icon"><Icon name="folder" /></span><h2>{title}</h2><p role="alert">{text}</p>
    <div className="portal-empty-actions">{retry && <button className="portal-button" type="button" onClick={retry}>Try again</button>}<Link className="portal-button" href={catalogHref}>Browse the catalog</Link></div></section>
}

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

/* ---------------------------------------------------------------- public profile */

export function DeveloperProfilePage({ slug }: { slug: string }) {
  const { user, status } = usePortal()
  const [developer, setDeveloper] = useState<Developer | null>(null)
  const [problem, setProblem] = useState<{ title: string; text: string; retry: boolean } | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setProblem(null)
    try {
      const next = await developerApi.developer(slug, signal)
      if (signal?.aborted) return
      document.title = `${next.name} · Varpet`
      setDeveloper(next)
    } catch (cause) {
      if (signal?.aborted) return
      setProblem(cause instanceof PortalError && cause.status === 404
        ? { title: 'This developer profile isn’t here.', text: 'It may have moved or been removed. Browse the catalog for other developers’ plans.', retry: false }
        : { title: 'We couldn’t load this profile.', text: cause instanceof Error ? cause.message : 'Please try again.', retry: true })
    }
  }, [slug])
  // Ownership depends on who is signed in, so the profile reloads when the account changes.
  useEffect(() => {
    if (status === 'loading') return
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, status, user?.id])

  if (problem) return <Problem title={problem.title} text={problem.text} retry={problem.retry ? () => void load() : undefined} />
  if (!developer) return <Loading text="Opening developer profile…" />
  return <><Hero developer={developer} mode={developer.ownedByViewer ? 'owner' : 'public'} /><Plans developer={developer} studio={false} /></>
}

/* ---------------------------------------------------------------- shared markup */

type HeroMode = 'public' | 'owner' | 'studio' | 'preview'

function Hero({ developer, mode, onEdit }: { developer: Developer; mode: HeroMode; onEdit?: () => void }) {
  const sample = developer.bundles.length > 0 && developer.bundles.every(bundle => bundle.source === 'sample')
  let website: URL | null = null
  try { website = developer.website ? new URL(/^https?:\/\//i.test(developer.website) ? developer.website : `https://${developer.website}`) : null } catch { website = null }
  const preview = mode === 'preview'
  const Name = preview ? 'p' : 'h1'
  const Root = preview ? 'div' : 'section'
  return (
    <Root className={`dev-hero${preview ? ' is-preview' : ''}`} style={paper} aria-labelledby={preview ? undefined : 'dev-name'}>
      <div className="dev-hero-grid" aria-hidden="true" />
      <svg className="dev-hero-frame" aria-hidden="true"><rect x="0" y="0" width="100%" height="100%" pathLength="1" /></svg>
      <div className="dev-hero-inner">
        <div className="dev-mark" aria-hidden="true">{profileInitials(developer.name)}</div>
        <div className="dev-hero-copy">
          <p className="dev-hero-eyebrow">{sample ? 'SAMPLE COLLECTION' : 'DEVELOPER'}{developer.city ? ` · ${developer.city.toUpperCase()}` : ''}</p>
          <Name className="dev-name" id={preview ? undefined : 'dev-name'}>{developer.name}</Name>
          {developer.tagline && <p className="dev-tagline">{developer.tagline}</p>}
          <ul className="dev-meta">
            {developer.city && <li><Icon name="home" />{developer.city}</li>}
            <li><Icon name="layers" />{developer.bundleCount} plan{developer.bundleCount === 1 ? '' : 's'}</li>
            {website && <li>{preview ? <span><Icon name="share" />{website.hostname}</span>
              : <a href={website.href} target="_blank" rel="noopener noreferrer nofollow ugc"><Icon name="share" />{website.hostname}</a>}</li>}
          </ul>
          {mode === 'studio' && <div className="dev-hero-actions">
            <button className="portal-button dev-hero-button" type="button" data-edit-profile onClick={onEdit}><Icon name="sliders" /> Edit profile</button>
            <Link className="portal-button dev-hero-button" href={developerHref(developer.slug)}><Icon name="eye" /> View public profile</Link></div>}
          {mode === 'owner' && <div className="dev-hero-actions"><Link className="portal-button dev-hero-button" href={studioHref}><Icon name="sliders" /> Manage in studio</Link></div>}
        </div>
        <div className="dev-titleblock" aria-hidden="true"><span>VARPET · DEVELOPER PROFILE</span><strong>{developer.name}</strong><span>SHEET 01 / 01</span></div>
      </div>
    </Root>
  )
}

function Plans({ developer, studio, onUnpublish, unpublishing }: { developer: Developer; studio: boolean; onUnpublish?: (bundle: BundleSummary) => void; unpublishing?: string | null }) {
  // Sample profiles already say so in their own words; otherwise the note is added here.
  const sample = developer.bundles.some(bundle => bundle.source === 'sample') && !/sample collection/i.test(developer.about)
  const count = developer.bundles.length
  return (
    <div className="dev-body">
      {developer.about && <section className="dev-about" aria-label={`About ${developer.name}`}><h2>About</h2><p>{developer.about}</p>
        {sample && <p className="dev-sample-note"><Icon name="help" /> Sample collection prepared by Varpet. Not a verified listing, offer or price list.</p>}</section>}
      <section className="dev-plans" aria-labelledby="dev-plans-title">
        <div className="dev-plans-heading"><div><h2 id="dev-plans-title">{studio ? 'Published plans' : 'Plans'}</h2>
          <p>{count ? `${count} plan${count === 1 ? '' : 's'} · the original drawing beside a furnished 3D apartment` : ''}</p></div>
          {count > 0 && <span className="portal-collection-label"><Icon name="cube" /> Open any plan in Design</span>}</div>
        {count ? <div className="dev-grid">{developer.bundles.map((bundle, i) => <PlanCard key={bundle.id} bundle={bundle} index={i} studio={studio}
          onUnpublish={onUnpublish} busy={unpublishing === bundle.id} />)}</div>
          : studio ? <div className="dev-empty"><span className="portal-empty-icon"><Icon name="layers" /></span><h3>No published plans yet</h3>
            <p>Upload a blueprint, design it, and choose Publish to profile in the editor. It appears here.</p><Link className="portal-button" href={`${studioHref}/upload`}><Icon name="upload" /> Upload a blueprint</Link></div>
          : <div className="dev-empty"><span className="portal-empty-icon"><Icon name="layers" /></span><h3>No plans published yet</h3>
            <p>This developer hasn’t published a plan. Explore other developers in the catalog.</p><Link className="portal-button" href={catalogHref}>Browse the catalog <Icon name="arrow" /></Link></div>}
      </section>
    </div>
  )
}

function PlanCard({ bundle, index, studio, onUnpublish, busy }: { bundle: BundleSummary; index: number; studio: boolean; onUnpublish?: (bundle: BundleSummary) => void; busy: boolean }) {
  const [image, setImage] = useState<'loading' | 'loaded' | 'missing'>('loading')
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => { if (img.current?.complete && img.current.naturalWidth) setImage('loaded') }, [])
  const facts = [`${bundle.area} m²`, bedroomLabel(bundle.bedrooms), `${bundle.furnishedPieces} piece${bundle.furnishedPieces === 1 ? '' : 's'}`]
  const kicker = [bundle.building, bundle.source === 'sample' ? 'Sample' : null].filter(Boolean).join(' · ')
  const href = bundle.sceneId ? editorHref(bundle.sceneId) : null
  const content = (
    <>
      <div className="dev-card-stage">
        <figure className={`dev-card-plan${image === 'loaded' ? ' is-loaded' : image === 'missing' ? ' is-missing' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={img} src={bundle.blueprintUrl} alt={`Original floor plan of ${bundle.name}`} loading="lazy" decoding="async"
            onLoad={() => setImage('loaded')} onError={() => setImage('missing')} /><figcaption><Icon name="layers" />Original plan</figcaption></figure>
        <figure className="dev-card-model"><div className="dev-card-3d" role="img" aria-label={`Furnished 3D apartment of ${bundle.name}`}>
          <div className="portal-preview-fallback"><Icon name="cube" /><span>{href ? 'Open the plan to explore it in 3D.' : 'The furnished 3D model is on its way.'}</span></div></div>
          <figcaption><Icon name="cube" />Furnished 3D</figcaption></figure>
      </div>
      <div className="dev-card-body">
        {kicker && <p className="portal-kicker">{kicker}</p>}
        <h3>{bundle.name}</h3>
        <div className="portal-card-facts">{facts.map(fact => <span key={fact}>{fact}</span>)}</div>
        <span className="dev-card-cta">{href ? <>Open in Design <Icon name="arrow" /></> : 'Design opens when the 3D model is ready'}</span>
      </div>
    </>
  )
  return (
    <article className="dev-card" data-bundle={bundle.id} style={{ ['--i' as string]: Math.min(index, 8) }}>
      {href ? <a className="dev-card-open" href={href} aria-label={`Open ${bundle.name} in Design`}>{content}</a> : <div className="dev-card-open">{content}</div>}
      {studio && <div className="dev-card-manage"><span>{bundle.source === 'published' ? `Published ${formatDate(bundle.updatedAt)}` : 'Sample'}</span>
        <button className="portal-text-button" type="button" disabled={busy} onClick={() => onUnpublish?.(bundle)}>{busy ? 'Unpublishing…' : <><Icon name="trash" /> Unpublish</>}</button></div>}
    </article>
  )
}

/* ---------------------------------------------------------------- studio */

function StudioGate() {
  const { authenticate, reload } = usePortal()
  const auth = async (mode: 'login' | 'register') => { if (await authenticate(mode)) await reload() }
  return (
    <section className="dev-studio-gate"><div className="dev-gate-sheet" style={paper} aria-hidden="true"><i /><span>VARPET · DEVELOPER STUDIO</span></div>
      <p className="portal-eyebrow"><span />For developers</p><h1>Show buyers what your plans can become.</h1>
      <p>Create a developer profile, upload your floor plans, and publish each one with a furnished 3D apartment that buyers can open and make their own.</p>
      <div className="portal-empty-actions"><button className="portal-button portal-primary" type="button" onClick={() => void auth('register')}>Create account <Icon name="arrow" /></button>
        <button className="portal-button" type="button" onClick={() => void auth('login')}>Sign in</button></div>
      <Link className="portal-text-link" href={catalogHref}>Browse the catalog first</Link></section>
  )
}

type Studio = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'create' } | { kind: 'studio'; developer: Developer; created: boolean }

export function StudioPage() {
  const { user, status, showNotice } = usePortal()
  const [state, setState] = useState<Studio>({ kind: 'loading' })
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState<BundleSummary | null>(null)
  const [unpublishing, setUnpublishing] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: 'loading' })
    try {
      const studio = await developerApi.studio(signal)
      if (signal?.aborted) return
      setState(studio.developer ? { kind: 'studio', developer: studio.developer, created: false } : { kind: 'create' })
    } catch (cause) {
      if (!signal?.aborted) setState({ kind: 'error', message: cause instanceof Error ? cause.message : 'Please try again.' })
    }
  }, [])
  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [user, load])

  async function unpublish(bundle: BundleSummary) {
    setConfirming(null)
    if (state.kind !== 'studio') return
    setUnpublishing(bundle.id)
    try {
      await developerApi.unpublish(bundle.id)
      const card = document.querySelector<HTMLElement>(`.dev-card[data-bundle="${CSS.escape(bundle.id)}"]`)
      if (card && !reducedMotion()) {
        await card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 240, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.catch(() => {})
      }
      const bundles = state.developer.bundles.filter(item => item.id !== bundle.id)
      setState({ kind: 'studio', developer: { ...state.developer, bundles, bundleCount: bundles.length }, created: false })
    } catch (cause) {
      showNotice(cause instanceof Error ? cause.message : 'Could not unpublish this plan. Please try again.')
    } finally { setUnpublishing(null) }
  }

  if (status === 'loading') return <Loading text="Opening your studio…" />
  if (!user) return <StudioGate />
  if (state.kind === 'loading') return <Loading text="Opening your studio…" />
  if (state.kind === 'error') return <Problem title="We couldn’t open your studio." text={state.message} retry={() => void load()} />
  if (state.kind === 'create') return <CreateProfile onCreated={developer => setState({ kind: 'studio', developer, created: true })} />
  const { developer, created } = state
  return (
    <>
      <Hero developer={developer} mode="studio" onEdit={() => setEditing(true)} />
      <section className="dev-studio-actions" aria-labelledby="dev-studio-title">
        <div><p className="portal-eyebrow"><span />{created ? 'Profile created · step 2 of 2' : 'Developer studio'}</p><h2 id="dev-studio-title">Add a plan</h2>
          <p>Upload a floor plan. It goes through the same three steps as any apartment, then you publish it here.</p></div>
        <ol className="dev-steps" aria-label="How a plan reaches your profile">
          <li><span>01</span>Build<small>Walls, doors and windows from your plan</small></li>
          <li><span>02</span>Design<small>Furnish it with the designer</small></li>
          <li><span>03</span>Customize<small>Adjust any piece yourself</small></li>
          <li><span><Icon name="upload" /></span>Publish<small>Plan and 3D model, side by side</small></li>
        </ol>
        <Link className="portal-button portal-primary dev-upload-button" href={`${studioHref}/upload`} autoFocus={created}><Icon name="upload" /> Upload a blueprint <Icon name="arrow" /></Link>
      </section>
      <Plans developer={developer} studio onUnpublish={setConfirming} unpublishing={unpublishing} />
      {editing && <EditProfile developer={developer} onClose={updated => { setEditing(false); if (updated) setState({ kind: 'studio', developer: updated, created: false }) }} />}
      {confirming && <ConfirmDialog title={`Unpublish ${confirming.name}?`} action="Unpublish"
        text="It disappears from your profile and the catalog. Copies buyers already saved to their own accounts are not affected."
        onDone={ok => { if (ok) void unpublish(confirming); else setConfirming(null) }} />}
    </>
  )
}

function CreateProfile({ onCreated }: { onCreated: (developer: Developer) => void }) {
  const [draft, setDraft] = useState<ProfileInput>({ name: '', slug: '', city: '', tagline: '', about: '', website: '' })
  return (
    <section className="dev-create"><div className="dev-create-copy"><p className="portal-eyebrow"><span />Developer studio · step 1 of 2</p>
      <h1>Create your developer profile</h1><p>Buyers see this beside every plan you publish. You can change it later.</p>
      <ProfileForm developer={null} submit="Create profile" onChange={setDraft} save={async input => onCreated(await developerApi.createProfile(input))} /></div>
      <aside className="dev-create-preview" aria-label="Profile preview"><p className="portal-kicker">Preview</p><div className="dev-create-live">
        <Hero mode="preview" developer={{ slug: draft.slug || 'your-company', name: draft.name || 'Your company', city: draft.city, tagline: draft.tagline || 'Your tagline',
          about: '', website: draft.website || null, bundleCount: 0, logoUrl: null, ownedByViewer: true, bundles: [] }} /></div></aside></section>
  )
}

function EditProfile({ developer, onClose }: { developer: Developer; onClose: (updated: Developer | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const result = useRef<Developer | null>(null)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    if (!reducedMotion()) element.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' })
  }, [])
  return (
    <dialog ref={dialog} className="portal-dialog dev-edit-dialog" aria-labelledby="dev-edit-title" onClose={() => onClose(result.current)}>
      <div className="dev-dialog-top"><h2 id="dev-edit-title">Edit profile</h2><button className="portal-icon-button" type="button" aria-label="Close" onClick={() => dialog.current?.close()}><Icon name="close" /></button></div>
      <ProfileForm developer={developer} submit="Save profile" save={async input => {
        result.current = await developerApi.updateProfile(developer.slug, input)
        dialog.current?.close()
      }} />
    </dialog>
  )
}

function profileProblem(input: ProfileInput): string | null {
  if (!input.name) return 'Enter your company name.'
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(input.slug) || input.slug.includes('--')) return 'Choose a profile address of 3–48 lowercase letters, numbers and single hyphens.'
  return null
}

/** The address follows the name until the person edits it. */
function ProfileForm({ developer, submit, save, onChange }: { developer: Developer | null; submit: string; save: (input: ProfileInput) => Promise<void>; onChange?: (input: ProfileInput) => void }) {
  const [input, setInput] = useState<ProfileInput>({ name: developer?.name ?? '', slug: developer?.slug ?? '', city: developer?.city ?? '',
    tagline: developer?.tagline ?? '', about: developer?.about ?? '', website: developer?.website ?? '' })
  const [follow, setFollow] = useState(!developer)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const slugInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<ProfileInput>) => { const next = { ...input, ...patch }; setInput(next); onChange?.(next) }
  const trimmed = (): ProfileInput => ({ name: input.name.trim(), slug: input.slug.trim().toLowerCase(), city: input.city.trim(), tagline: input.tagline.trim(), about: input.about.trim(), website: input.website.trim() })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const value = trimmed()
    const problem = profileProblem(value)
    if (problem) { setError(problem); return }
    setBusy(true); setError(null)
    try { await save(value) } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your profile. Please try again.')
      if (cause instanceof PortalError && cause.code === 'slug_taken') slugInput.current?.focus()
    } finally { setBusy(false) }
  }

  return (
    <form className="dev-profile-form" noValidate onSubmit={event => void onSubmit(event)}>
      <label className="portal-field">Company name<input name="name" required maxLength={80} autoComplete="organization" value={input.name} placeholder="Ararat Homes"
        onChange={event => set({ name: event.target.value, ...(follow ? { slug: slugify(event.target.value) } : {}) })} /></label>
      <label className="portal-field">Profile address<span className="dev-slug-field"><span>/developers/</span><input ref={slugInput} name="slug" required maxLength={48} autoCapitalize="off" spellCheck={false}
        value={input.slug} placeholder="ararat-homes" aria-label="Profile address"
        onChange={event => { setFollow(false); set({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }) }} /></span></label>
      <div className="developer-publish-row">
        <label className="portal-field"><span className="dev-label">City <span className="portal-field-optional">optional</span></span><input name="city" maxLength={80} autoComplete="address-level2" value={input.city} placeholder="Yerevan" onChange={event => set({ city: event.target.value })} /></label>
        <label className="portal-field"><span className="dev-label">Website <span className="portal-field-optional">optional</span></span><input name="website" maxLength={200} inputMode="url" value={input.website} placeholder="example.com" onChange={event => set({ website: event.target.value })} /></label>
      </div>
      <label className="portal-field"><span className="dev-label">Tagline <span className="portal-field-optional">optional</span></span><input name="tagline" maxLength={140} value={input.tagline} placeholder="Bright homes near the park" onChange={event => set({ tagline: event.target.value })} /></label>
      <label className="portal-field"><span className="dev-label">About <span className="portal-field-optional">optional</span></span><textarea name="about" maxLength={2000} rows={4} value={input.about} placeholder="What you build, where, and for whom." onChange={event => set({ about: event.target.value })} /></label>
      <p className="portal-error" role="alert" hidden={!error}>{error}</p>
      <button className="portal-button portal-primary dev-profile-submit" type="submit" disabled={busy}>{busy ? <>Saving… <span className="developer-spinner" aria-hidden="true" /></> : <>{submit} <Icon name="arrow" /></>}</button>
    </form>
  )
}

function ConfirmDialog({ title, text, action, onDone }: { title: string; text: string; action: string; onDone: (ok: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const result = useRef(false)
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus() }, [])
  return (
    <dialog ref={dialog} className="portal-dialog dev-confirm-dialog" aria-labelledby="dev-confirm-title" onClose={() => onDone(result.current)}>
      <h2 id="dev-confirm-title">{title}</h2><p>{text}</p>
      <div><button className="portal-button" type="button" data-cancel onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="portal-button dev-danger" type="button" onClick={() => { result.current = true; dialog.current?.close() }}>{action}</button></div>
    </dialog>
  )
}

/* ---------------------------------------------------------------- upload */

export function StudioUploadPage() {
  const { user, status } = usePortal()
  const [developer, setDeveloper] = useState<Developer | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setError(null)
    try {
      const studio = await developerApi.studio()
      if (!studio.developer) { location.replace(studioHref); return }
      setDeveloper(studio.developer)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.') }
  }, [])
  useEffect(() => { if (user) void load() }, [user, load])

  if (status === 'loading') return <Loading text="Opening your studio…" />
  if (!user) return <StudioGate />
  if (error) return <Problem title="We couldn’t open your studio." text={error} retry={() => void load()} />
  if (!developer) return <Loading text="Opening your studio…" />
  return (
    <>
      <div className="dev-upload-bar"><Link className="dev-upload-back" href={studioHref}><Icon name="undo" /> {developer.name} studio</Link></div>
      <BlueprintWelcome audience="developer" />
    </>
  )
}
