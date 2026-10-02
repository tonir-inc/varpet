'use client'

// The home page's drafting sheet (v1 portal/blueprint.ts, welcome half). Choosing a plan draws it on the sheet as
// in v1. Building it in 3D is the plan intake (lane D) driving the architect agent (lane C); until that lands here,
// the build step says so instead of starting.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { bundlesApi, catalogHref, type BundleSummary } from './api'
import { Icon } from './icons'
import { BLUEPRINT_PAPER, drawInk, inkOfImage, reducedMotion } from './ink'

const COLUMNS = 9, ROWS = 7
const IMAGE = /^image\/(?:jpeg|png|webp)$/
const MAX_IMAGE = 2 * 1024 * 1024
const MAX_PHOTOS = 10

export function BlueprintWelcome({ audience, studioName }: { audience?: 'developer'; studioName?: string }) {
  const developer = audience === 'developer'
  const router = useRouter()
  const ink = useRef<HTMLCanvasElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const photoPicker = useRef<HTMLInputElement>(null)
  const selection = useRef(0)
  const [plan, setPlan] = useState<File | null>(null)
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [paste, setPaste] = useState('Ctrl+V')
  const [samples, setSamples] = useState<BundleSummary[]>([])
  const photoUrls = useRef<string[]>([])

  useEffect(() => { if (/Mac|iPhone|iPad|iPod/.test(navigator.platform)) setPaste('⌘V') }, [])
  useEffect(() => () => photoUrls.current.forEach(url => URL.revokeObjectURL(url)), [])
  // Samples are the catalog's own plans; v1's two built-in templates have no Pascal scene.
  useEffect(() => {
    if (developer) return
    const controller = new AbortController()
    bundlesApi.bundles(controller.signal).then(list => setSamples(list.slice(0, 3))).catch(() => {})
    return () => controller.abort()
  }, [developer])

  const choose = useCallback(async (files: File[]) => {
    if (!files.length) return
    const candidate = files.find(file => /plan|blueprint/i.test(file.name)) ?? files[0]!
    const version = ++selection.current
    if (candidate.type === 'application/pdf') { setError('PDF plans are not read here yet. Export the page as a JPG, PNG or WebP image.'); return }
    if (!IMAGE.test(candidate.type)) { setError('Choose a JPG, PNG or WebP image of your plan.'); return }
    if (candidate.size > MAX_IMAGE) { setError('Keep the plan image under 2 MB.'); return }
    const url = URL.createObjectURL(candidate)
    try {
      const image = new Image(); image.src = url; await image.decode()
      if (version !== selection.current) return
      const traced = inkOfImage(image)
      setPlan(candidate); setError(null)
      requestAnimationFrame(() => { if (ink.current) void drawInk(ink.current, traced, reducedMotion() ? 0 : 1400, () => version === selection.current) })
    } catch {
      if (version === selection.current) setError('This image could not be read. Try another file.')
    } finally { URL.revokeObjectURL(url) }
  }, [])

  // Paste an image anywhere on the page, as in v1.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])]
      if (files.length) { event.preventDefault(); void choose(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [choose])

  function change() {
    ++selection.current
    setPlan(null); setError(null)
    if (picker.current) picker.current.value = ''
    picker.current?.click()
  }
  function addPhotos(files: File[]) {
    const accepted = files.filter(file => IMAGE.test(file.type) && file.size <= MAX_IMAGE)
    if (accepted.length !== files.length) setError('Room photos must be JPG, PNG or WebP images under 2 MB each.')
    if (photos.length + accepted.length > MAX_PHOTOS) { setError('Add up to 10 room photos. Remove a photo to make space.'); return }
    const added = accepted.map(file => ({ file, url: URL.createObjectURL(file) }))
    photoUrls.current.push(...added.map(photo => photo.url))
    setPhotos([...photos, ...added])
  }
  const onDrop = (event: DragEvent) => { event.preventDefault(); setOver(false); void choose([...event.dataTransfer.files]) }

  return (
    <section className="blueprint-welcome" aria-labelledby="blueprint-title">
      <div className="blueprint-heading">{developer
        ? <><p className="blueprint-eyebrow"><span />DEVELOPER STUDIO · NEW PLAN</p>
          <h1 id="blueprint-title">Add a plan to <em>your profile.</em></h1>
          <p>Drop a floor plan. We build it in 3D, you design it, then publish it.</p></>
        : <><p className="blueprint-eyebrow"><span />A LITTLE PLAN. A WHOLE NEW PERSPECTIVE.</p>
          <h1 id="blueprint-title">It starts with <em>a plan.</em></h1>
          <p>Drop your blueprint. We’ll start reading it right away.</p></>}</div>
      <div className="blueprint-drawing">
        <div className={`blueprint-board${plan ? ' has-plan' : ''}${over ? ' is-over' : ''}`} style={{ ['--paper' as string]: BLUEPRINT_PAPER }}
          onDragEnter={event => { event.preventDefault(); setOver(true) }} onDragOver={event => event.preventDefault()}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false) }} onDrop={onDrop}>
          <div className="bp-grid" aria-hidden="true" />
          <svg className="bp-frame" aria-hidden="true"><rect x="0" y="0" width="100%" height="100%" pathLength="1" /></svg>
          <ol className="bp-cols" aria-hidden="true">{Array.from({ length: COLUMNS }, (_, i) => <li key={i} style={{ ['--i' as string]: i }}>{i + 1}</li>)}</ol>
          <ol className="bp-rows" aria-hidden="true">{Array.from({ length: ROWS }, (_, i) => <li key={i} style={{ ['--i' as string]: i }}>{String.fromCharCode(65 + i)}</li>)}</ol>
          <div className="bp-dims" aria-hidden="true"><i className="bp-dim bp-dim-a" /><i className="bp-dim bp-dim-b" /><i className="bp-dim bp-dim-c" /><i className="bp-dim bp-dim-v bp-dim-d" /><i className="bp-dim bp-dim-v bp-dim-e" /></div>
          <div className="bp-title" aria-hidden="true"><span>VARPET · FLOOR PLAN</span><strong>{plan ? plan.name.replace(/\.[a-z]+$/i, '') : 'Awaiting your plan'}</strong><span>SHEET 01 / 01</span></div>
          <div className="bp-area">
            <canvas ref={ink} className="bp-ink" hidden={!plan} />
            <button className="blueprint-drop" type="button" aria-describedby="blueprint-file-hint blueprint-upload-notice" hidden={Boolean(plan)} onClick={() => picker.current?.click()}>
              <span className="blueprint-upload-mark" aria-hidden="true"><Icon name="upload" /></span>
              <strong>{over ? 'Release to place it on the sheet' : 'Drop your blueprint here'}</strong><span>or <u>browse files</u></span>
              <span>Paste an image with <kbd>{paste}</kbd></span>
              <small id="blueprint-file-hint">JPG, PNG or WebP · 2 MB</small>
            </button>
          </div>
          <input ref={picker} type="file" className="blueprint-file-input" accept="image/jpeg,image/png,image/webp,application/pdf" hidden
            onChange={event => void choose([...(event.currentTarget.files ?? [])])} />
        </div>
      </div>
      <p className="blueprint-build-note" id="blueprint-upload-notice">{developer
        ? 'Upload only plans your company may publish. Nothing is public until you publish it.'
        : 'Upload only plans and photos of a home you own or rent.'}</p>
      <div className="blueprint-next" hidden={!plan}>
        <div className="blueprint-file"><span><Icon name="layers" /><strong>{plan?.name}</strong></span><button type="button" onClick={change}>Change plan</button></div>
        <div className="blueprint-photos">
          <button type="button" onClick={() => photoPicker.current?.click()}><Icon name="plus" /> Add room photos <span>optional</span></button>
          <input ref={photoPicker} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => { addPhotos([...(event.currentTarget.files ?? [])]); event.currentTarget.value = '' }} />
          <div className="blueprint-photo-list">{photos.map((photo, i) => (
            <span key={photo.url}><img src={photo.url} alt={photo.file.name} />
              <button type="button" aria-label={`Remove ${photo.file.name}`} onClick={() => { URL.revokeObjectURL(photo.url); setPhotos(photos.filter((_, j) => j !== i)) }}><Icon name="close" /></button></span>
          ))}</div>
        </div>
        <button type="button" className="portal-button portal-primary blueprint-build" disabled>Bring my plan to life <Icon name="arrow" /></button>
        <p className="blueprint-build-note" role="status">Building in 3D from a plan arrives with the new plan intake. Your plan stays in this browser.</p>
      </div>
      <p className="blueprint-error" role="alert" hidden={!error}>{error}</p>
      <div className="blueprint-bottom"><span><Icon name="layers" /> Your plan</span><i /><span><Icon name="walls" /> A space in 3D</span><i /><span><Icon name="home" /> Make it yours</span></div>
      {developer
        ? studioName && <p className="blueprint-watch"><Link href="/studio">Back to {studioName} studio <Icon name="arrow" /></Link></p>
        : <details className="blueprint-samples"><summary>No plan handy? <span>Try a sample <Icon name="arrow" /></span></summary><div>
          {samples.length ? samples.map(sample => <button key={sample.id} type="button" onClick={() => router.push(catalogHref)}>{sample.name}<span>{sample.area} m² <Icon name="arrow" /></span></button>)
            : <button type="button" onClick={() => router.push(catalogHref)}>Browse the catalog<span><Icon name="arrow" /></span></button>}
        </div></details>}
    </section>
  )
}
