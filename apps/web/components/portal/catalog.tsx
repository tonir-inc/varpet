'use client'

// Catalog tab (v1 portal/catalog.ts, `/?view=catalog`): developers' floor plans, one shelf per developer, each card
// the plan redrawn on blueprint paper beside its furnished apartment. v1 rendered the apartment live with three.js;
// here that pane is a placeholder until bundles carry a Pascal scene and a thumbnail.
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bedroomLabel, bundlesApi, catalogHref, developerHref, editorHref, shelfInitials, type BundleSummary, type DeveloperSummary } from './api'
import { Icon } from './icons'
import { drawInk, planInk, reducedMotion } from './ink'

interface Filter { bedrooms: number | null; developer: string | null }
const BEDROOM_FILTERS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: null, label: 'All' }, { value: 0, label: 'Studio' }, { value: 1, label: '1 bedroom' }, { value: 2, label: '2 bedrooms' }, { value: 3, label: '3+ bedrooms' },
]
const formatArea = (area: number) => `${area.toLocaleString(undefined, { maximumFractionDigits: 1 })} m²`

function readFilter(search: URLSearchParams): Filter {
  const bedrooms = search.get('bedrooms')
  const value = bedrooms === null || bedrooms === '' ? null : Number(bedrooms)
  return { bedrooms: value !== null && Number.isInteger(value) && value >= 0 && value <= 3 ? value : null, developer: search.get('developer') || null }
}
function filterUrl(filter: Filter): string {
  const search = new URLSearchParams()
  if (filter.bedrooms !== null) search.set('bedrooms', String(filter.bedrooms))
  if (filter.developer) search.set('developer', filter.developer)
  return search.size ? `${catalogHref}?${search}` : catalogHref
}
function matches(bundle: BundleSummary, filter: Filter): boolean {
  if (filter.developer && bundle.developerSlug !== filter.developer) return false
  if (filter.bedrooms === null) return true
  return filter.bedrooms >= 3 ? bundle.bedrooms >= 3 : bundle.bedrooms === filter.bedrooms
}

interface Shelf { developer: DeveloperSummary; bundles: BundleSummary[] }
/** One shelf per developer in the list's order (then by name), bundles by bedrooms, then area. */
function groupByDeveloper(bundles: readonly BundleSummary[], developers: readonly DeveloperSummary[]): Shelf[] {
  const shelves = new Map<string, Shelf>()
  for (const developer of developers) shelves.set(developer.slug, { developer, bundles: [] })
  const unknown: Shelf[] = []
  for (const bundle of bundles) {
    let shelf = shelves.get(bundle.developerSlug)
    if (!shelf) {
      shelf = { developer: { slug: bundle.developerSlug, name: bundle.developerName, city: '', tagline: '', bundleCount: 0, logoUrl: null }, bundles: [] }
      shelves.set(bundle.developerSlug, shelf); unknown.push(shelf)
    }
    shelf.bundles.push(bundle)
  }
  unknown.sort((a, b) => a.developer.name.localeCompare(b.developer.name))
  const ordered = [...developers.map(developer => shelves.get(developer.slug)!), ...unknown]
  for (const shelf of ordered) shelf.bundles.sort((a, b) => a.bedrooms - b.bedrooms || a.area - b.area || a.name.localeCompare(b.name))
  return ordered.filter(shelf => shelf.bundles.length > 0)
}

const Skeleton = () => {
  const card = <div className="bundle-card bundle-skeleton" aria-hidden="true"><div className="bundle-stage"><div className="bundle-pane" /><div className="bundle-pane" /></div><div className="bundle-body"><span /><span /></div></div>
  return <section className="developer-shelf" aria-label="Loading plans"><div className="developer-shelf-head bundle-skeleton-head" aria-hidden="true"><span className="developer-mark" /><span /></div>
    <div className="bundle-grid">{card}{card}</div></section>
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; bundles: BundleSummary[]; developers: DeveloperSummary[] }

export function CatalogPage() {
  const [filter, setFilter] = useState<Filter>({ bedrooms: null, developer: null })
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const toolbar = useRef<HTMLDivElement>(null)

  const fetchAll = useCallback(async (signal?: AbortSignal) => {
    setLoad({ kind: 'loading' })
    try {
      const [bundles, developers] = await Promise.all([bundlesApi.bundles(signal), bundlesApi.developers(signal).catch(() => [] as DeveloperSummary[])])
      if (signal?.aborted) return
      setFilter(current => current.developer && !bundles.some(bundle => bundle.developerSlug === current.developer) ? { ...current, developer: null } : current)
      setLoad({ kind: 'ready', bundles, developers })
    } catch (cause) {
      if (!signal?.aborted) setLoad({ kind: 'error', message: cause instanceof Error ? cause.message : 'Check your connection and try again.' })
    }
  }, [])

  useEffect(() => {
    setFilter(readFilter(new URLSearchParams(location.search)))
    const controller = new AbortController()
    void fetchAll(controller.signal)
    return () => controller.abort()
  }, [fetchAll])

  const bundles = load.kind === 'ready' ? load.bundles : []
  const developers = load.kind === 'ready' ? load.developers : []
  const seen = useMemo(() => groupByDeveloper(bundles, developers).map(shelf => shelf.developer), [bundles, developers])
  const visible = useMemo(() => bundles.filter(bundle => matches(bundle, filter)), [bundles, filter])
  const grouped = useMemo(() => groupByDeveloper(visible, developers), [visible, developers])

  function update(next: Filter, kind: 'bedrooms' | 'developer') {
    setFilter(next)
    history.replaceState(null, '', filterUrl(next))
    requestAnimationFrame(() => toolbar.current?.querySelector<HTMLButtonElement>(`button[aria-pressed="true"][data-${kind}]`)?.focus())
  }

  return (
    <>
      <section className="catalog-hero">
        <p className="portal-eyebrow"><span />Plans from the people who build them</p>
        <h1>Every plan, <em>already furnished.</em></h1>
        <p className="catalog-intro">Browse developers’ floor plans next to the furnished 3D apartment built from each one. Open any of them and change it with your designer.</p>
      </section>
      <div className="catalog-toolbar" role="group" aria-label="Filter plans" ref={toolbar}>
        <div className="catalog-filter-row"><span className="catalog-filter-label" id="catalog-bedrooms-label">Bedrooms</span>
          <div className="portal-filters" role="group" aria-labelledby="catalog-bedrooms-label">{BEDROOM_FILTERS.map(option => (
            <button key={option.label} type="button" data-bedrooms={option.value ?? ''} aria-pressed={filter.bedrooms === option.value}
              onClick={() => update({ ...filter, bedrooms: option.value }, 'bedrooms')}>{option.label}</button>
          ))}</div></div>
        <div className="catalog-filter-row" hidden={seen.length < 2}><span className="catalog-filter-label" id="catalog-developer-label">Developer</span>
          <div className="portal-filters" role="group" aria-labelledby="catalog-developer-label">
            <button type="button" data-developer="" aria-pressed={!filter.developer} onClick={() => update({ ...filter, developer: null }, 'developer')}>All developers</button>
            {seen.map(developer => <button key={developer.slug} type="button" data-developer={developer.slug} aria-pressed={filter.developer === developer.slug}
              onClick={() => update({ ...filter, developer: developer.slug }, 'developer')}>{developer.name}</button>)}
          </div></div>
        <p className="portal-result-count" role="status" aria-live="polite">{load.kind === 'ready'
          ? `${visible.length} plan${visible.length === 1 ? '' : 's'} from ${grouped.length} developer${grouped.length === 1 ? '' : 's'}` : ''}</p>
      </div>
      <div className="catalog-shelves" aria-busy={load.kind === 'loading'}>
        {load.kind === 'loading' ? <Skeleton />
          : load.kind === 'error' ? <section className="portal-empty portal-load-error"><span className="portal-empty-icon"><Icon name="folder" /></span><h2>We couldn&apos;t load the catalog.</h2>
            <p className="portal-profile-error" role="alert">{load.message}</p><button className="portal-button" type="button" onClick={() => void fetchAll()}>Try again</button></section>
          : !visible.length ? <div className="portal-filter-empty"><Icon name="room" /><h3>{bundles.length ? 'No plans match these filters' : 'No plans published yet'}</h3>
            <p>{bundles.length ? 'Try another number of bedrooms, or show every developer.' : 'Developers publish their plans from their studio. Check back soon.'}</p>
            {bundles.length > 0 && <button type="button" className="portal-button" onClick={() => { setFilter({ bedrooms: null, developer: null }); history.replaceState(null, '', catalogHref) }}>Show all plans</button>}</div>
          : grouped.map((shelf, index) => <DeveloperShelf key={shelf.developer.slug} shelf={shelf} index={index} />)}
      </div>
    </>
  )
}

function useReveal<T extends Element>(options: IntersectionObserverInit): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element || revealed) return
    if (typeof IntersectionObserver === 'undefined') { setRevealed(true); return }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setRevealed(true); observer.disconnect() } }, options)
    observer.observe(element)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed])
  return [ref, revealed]
}

function DeveloperShelf({ shelf, index }: { shelf: Shelf; index: number }) {
  const { developer, bundles } = shelf
  const [head, revealed] = useReveal<HTMLElement>({ rootMargin: '0px 0px -8% 0px' })
  const where = [developer.city, developer.tagline].filter(Boolean).join(' · ')
  const headingId = `developer-shelf-${index}`
  return (
    <section className="developer-shelf" aria-labelledby={headingId}>
      <header className={`developer-shelf-head${revealed ? ' is-revealed' : ''}`} ref={head}>
        {developer.logoUrl ? <img className="developer-mark" src={developer.logoUrl} alt="" loading="lazy" /> : <span className="developer-mark" aria-hidden="true">{shelfInitials(developer.name)}</span>}
        <div className="developer-shelf-title"><h2 id={headingId}>{developer.name}</h2>{where && <p>{where}</p>}</div>
        <span className="developer-shelf-count">{bundles.length} plan{bundles.length === 1 ? '' : 's'}</span>
        <Link className="portal-card-link developer-profile-link" href={developerHref(developer.slug)}>Developer profile<Icon name="arrow" /></Link>
      </header>
      <div className="bundle-grid">{bundles.map(bundle => <BundleCard key={bundle.id} bundle={bundle} />)}</div>
    </section>
  )
}

/** In view, the plan draws itself, a sweep carries it across the seam and the apartment pane opens. */
function BundleCard({ bundle }: { bundle: BundleSummary }) {
  const [card, revealed] = useReveal<HTMLElement>({ threshold: 0.2 })
  const ink = useRef<HTMLCanvasElement>(null)
  const [plan, setPlan] = useState<'none' | 'drawn' | 'missing'>('none')
  const [swept, setSwept] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!revealed) return
    let alive = true
    const still = reducedMotion()
    void planInk(bundle.blueprintUrl).then(traced => {
      if (!alive || !ink.current) return
      setPlan('drawn')
      return drawInk(ink.current, traced, still ? 0 : 1100, () => alive)
    }).catch(() => { if (alive) setPlan('missing') })
    const timer = setTimeout(() => { if (alive) setSwept(true) }, still ? 0 : 650)
    return () => { alive = false; clearTimeout(timer) }
  }, [revealed, bundle.blueprintUrl])

  const href = bundle.sceneId ? editorHref(bundle.sceneId) : null
  const classes = ['bundle-card', revealed && 'is-revealed', plan !== 'none' && 'has-plan', plan === 'missing' && 'plan-missing', swept && 'is-swept', 'has-model', active && 'is-active']
  const stage = (
    <>
      <div className="bundle-pane bundle-plan"><canvas className="bundle-ink" ref={ink} aria-hidden="true" /><span className="bundle-pane-label">Plan</span></div>
      <div className="bundle-pane bundle-model"><div className="bundle-model-host"><div className="portal-preview-fallback"><Icon name="cube" />
        <span>{href ? 'Open this plan to explore its 3D model.' : 'The furnished 3D model is on its way.'}</span></div></div><span className="bundle-pane-label">Furnished 3D</span></div>
      <span className="bundle-seam" aria-hidden="true"><Icon name="arrow" /></span>
      <span className="bundle-sweep" aria-hidden="true" />
    </>
  )
  return (
    <article className={classes.filter(Boolean).join(' ')} data-bundle-id={bundle.id} ref={card}
      onPointerEnter={() => setActive(true)} onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setActive(false) }}
      onFocus={() => setActive(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setActive(false) }}>
      {href ? <a className="bundle-stage" href={href} tabIndex={-1} aria-hidden="true">{stage}</a> : <div className="bundle-stage" aria-hidden="true">{stage}</div>}
      <div className="bundle-body">
        <div className="bundle-titles"><p className="portal-kicker">{bundle.building ?? bundle.developerName}</p><h3>{bundle.name}</h3></div>
        <div className="portal-card-facts"><span><Icon name="home" />{bedroomLabel(bundle.bedrooms)}</span><span><Icon name="room" />{formatArea(bundle.area)}</span><span><Icon name="sofa" />{bundle.furnishedPieces} pieces</span></div>
        {href ? <a className="portal-card-link bundle-open" href={href} aria-label={`Open ${bundle.name} by ${bundle.developerName} in Design`}>Open in Design<Icon name="arrow" /></a>
          : <Link className="portal-card-link bundle-open" href={developerHref(bundle.developerSlug)} aria-label={`${bundle.name} by ${bundle.developerName}: developer profile`}>Developer profile<Icon name="arrow" /></Link>}
      </div>
    </article>
  )
}
