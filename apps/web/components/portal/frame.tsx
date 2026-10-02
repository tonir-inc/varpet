'use client'

// The portal's shared page frame (v1 portal-header.ts + auth.ts + ui/theme.ts): brand, main navigation, account
// area, notice line, footer, the account dialog and the theme toggle. Pages render inside `.portal-main` and read
// the signed-in account through `usePortal()`.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { accountApi, catalogHref, type User } from './api'
import { Icon } from './icons'

export type AccountStatus = 'loading' | 'ready' | 'unavailable'
type AuthMode = 'login' | 'register'

interface PortalContext {
  user: User | null
  status: AccountStatus
  /** Re-check the session. */
  reload(): Promise<void>
  /** Opens the account dialog; resolves with the signed-in user, or null when dismissed. */
  authenticate(mode: AuthMode): Promise<User | null>
  showNotice(message: string | null): void
}

const Context = createContext<PortalContext | null>(null)
export function usePortal(): PortalContext {
  const value = useContext(Context)
  if (!value) throw new Error('usePortal outside the portal frame')
  return value
}

const THEME_KEY = 'varpet.ui.theme.v1'
/** Runs before paint, inside the wrapper, so a dark preference never flashes light. */
export const THEME_SCRIPT = `try{document.currentScript.parentElement.dataset.theme=localStorage.getItem('${THEME_KEY}')==='dark'?'dark':'light'}catch(e){}`

const Brand = () => <Link className="portal-brand" href="/" aria-label="Varpet home"><span className="portal-brand-mark" aria-hidden="true">v</span>varpet</Link>

/** Which nav tab a path belongs to, and the page class v1 put on `.portal`. */
function pageOf(path: string, signedIn: boolean) {
  if (path === '/') return { tab: 'explore', className: 'blueprint-home', signup: false }
  if (path.startsWith('/catalog')) return { tab: 'catalog', className: 'catalog-page', signup: false }
  if (path.startsWith('/apartments')) return { tab: 'apartments', className: '', signup: true }
  if (path.startsWith('/studio/upload')) return { tab: null, className: signedIn ? 'blueprint-home developer-upload' : 'developer-page', signup: true }
  if (path.startsWith('/studio')) return { tab: null, className: 'developer-page', signup: true }
  if (path.startsWith('/developers')) return { tab: null, className: 'developer-page', signup: false }
  return { tab: null, className: '', signup: true }
}

export function PortalFrame({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '/'
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AccountStatus>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const [auth, setAuth] = useState<{ mode: AuthMode; resolve: (user: User | null) => void } | null>(null)
  const version = useRef(0)
  const pending = useRef<Promise<User | null> | null>(null)

  const reload = useCallback(async () => {
    const request = ++version.current
    try {
      const next = await accountApi.session()
      if (request !== version.current) return
      setUser(next); setStatus('ready'); setNotice(null)
    } catch {
      if (request !== version.current) return
      setStatus('unavailable')
    }
  }, [])

  const authenticate = useCallback((mode: AuthMode) => {
    if (pending.current) return pending.current
    const promise = new Promise<User | null>(resolve => setAuth({ mode, resolve }))
    pending.current = promise
    void promise.then(next => {
      pending.current = null
      if (next) { ++version.current; setUser(next); setStatus('ready'); setNotice(null) }
    })
    return promise
  }, [])

  useEffect(() => { void reload() }, [reload])
  // A page restored from the back-forward cache checks the account again.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) void reload() }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [reload])

  const value = useMemo<PortalContext>(() => ({ user, status, reload, authenticate, showNotice: setNotice }), [user, status, reload, authenticate])
  const page = pageOf(path, Boolean(user))
  const current = (tab: string) => page.tab === tab ? { 'aria-current': 'page' as const } : {}

  async function signOut(button: HTMLButtonElement) {
    button.disabled = true
    try {
      await accountApi.logout()
      ++version.current
      setUser(null); setNotice(null)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'We could not sign you out. Please try again.')
      button.disabled = false
    }
  }

  return (
    <Context.Provider value={value}>
      <div className={`portal ${page.className}`.trim()}>
        <header className="portal-header"><div className="portal-header-inner">
          <Brand />
          <nav className="portal-nav" aria-label="Main navigation">
            <Link href="/" {...current('explore')}>Start with a plan</Link>
            <Link href={catalogHref} {...current('catalog')} title="Developer plans with a furnished 3D apartment">Catalog</Link>
            <a href="/editor" title="Explore an empty apartment and save to the team">Sandbox</a>
            <Link href="/apartments" {...current('apartments')}>Saved apartments</Link>
          </nav>
          <div className="portal-account">
            {status === 'loading' ? <span className="portal-account-loading" role="status">Checking account…</span>
              : status === 'unavailable' ? <button className="portal-text-button" type="button" onClick={() => void reload()}>Reconnect account</button>
              : user ? <>
                  <Link className="portal-account-profile" href="/apartments" aria-label={`${user.name}’s apartments`}>
                    <span className="portal-avatar" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span><span>{user.name}</span>
                  </Link>
                  <button className="portal-text-button portal-signout" type="button" onClick={event => void signOut(event.currentTarget)}>Sign out</button>
                </>
              : <>
                  <button className="portal-text-button" type="button" onClick={() => void authenticate('login')}>Sign in</button>
                  {page.signup && <button className="portal-button portal-header-signup" type="button" onClick={() => void authenticate('register')}>Create account</button>}
                </>}
          </div>
          <ThemeToggle />
        </div></header>
        <div className="portal-notice" role="status" hidden={!notice}>{notice}</div>
        <main className="portal-main" id="portal-main">{children}</main>
        <footer className="portal-footer"><Brand /><p>A little planning. A place that feels like you.</p><span>Made for living.</span></footer>
      </div>
      {auth && <AuthDialog initialMode={auth.mode} onDone={next => { auth.resolve(next); setAuth(null) }} />}
    </Context.Provider>
  )
}

/** A browser preference only (v1 ui/theme.ts), applied to the portal wrapper, never to the document root. */
function ThemeToggle() {
  const ref = useRef<HTMLButtonElement>(null)
  const [dark, setDark] = useState(false)
  const apply = useCallback((next: boolean) => {
    const root = ref.current?.closest<HTMLElement>('.portal-root')
    if (root) root.dataset.theme = next ? 'dark' : 'light'
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', next ? '#1e1f22' : '#f4f4f1')
    setDark(next)
  }, [])
  useEffect(() => {
    const read = () => { try { return localStorage.getItem(THEME_KEY) === 'dark' } catch { return false } }
    apply(read())
    const onStorage = (event: StorageEvent) => { if (event.key === THEME_KEY || event.key === null) apply(read()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [apply])
  return (
    <button ref={ref} type="button" className="theme-toggle" aria-label="Dark theme" aria-pressed={dark} title={`Switch to ${dark ? 'light' : 'dark'} theme`}
      onClick={() => {
        apply(!dark)
        try { localStorage.setItem(THEME_KEY, dark ? 'light' : 'dark') } catch { /* this page still switches */ }
      }}>
      <Icon name={dark ? 'moon' : 'sun'} /><span className="theme-toggle-label">Theme</span>
    </button>
  )
}

/** v1 auth.ts: one account dialog for sign in and registration. */
function AuthDialog({ initialMode, onDone }: { initialMode: AuthMode; onDone: (user: User | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reveal, setReveal] = useState(false)
  const finished = useRef(false)
  const registering = mode === 'register'

  const finish = useCallback((user: User | null) => {
    if (finished.current) return
    finished.current = true
    if (dialog.current?.open) dialog.current.close()
    onDone(user)
  }, [onDone])

  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement
    if (!element.open) element.showModal()
    element.querySelector('input')?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  useEffect(() => { dialog.current?.querySelector('input')?.focus() }, [mode])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (busy || !form.reportValidity()) return
    const data = new FormData(form)
    const email = String(data.get('email') ?? '').trim()
    const name = registering ? String(data.get('name') ?? '').trim() : ''
    const password = String(data.get('password') ?? '')
    if (registering && !name) { setError('Enter your name to create an account.'); return }
    setBusy(true); setError(null)
    try {
      const user = registering ? await accountApi.register(name, email, password) : await accountApi.login(email, password)
      window.dispatchEvent(new CustomEvent('varpet:auth-change', { detail: user }))
      finish(user)
    } catch (cause) {
      if (finished.current) return
      setError(cause instanceof Error ? cause.message : 'We could not connect. Please try again.')
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="portal-dialog auth-dialog" aria-labelledby="auth-title" aria-describedby="auth-description"
      onCancel={event => { event.preventDefault(); if (!busy) finish(null) }} onClose={() => finish(null)}>
      <div className="auth-topline"><Brand />
        <button className="portal-icon-button" type="button" aria-label="Close account dialog" onClick={() => finish(null)}><Icon name="close" /></button></div>
      <p className="portal-eyebrow">Your space starts here</p>
      <h2 id="auth-title">{registering ? 'Make room for your ideas.' : 'Welcome home.'}</h2>
      <p id="auth-description" className="auth-description">{registering ? 'Create an account to save your apartments and pick up where you left off.' : 'Sign in to your account to continue working on your apartments.'}</p>
      <form className="auth-form" onSubmit={event => void submit(event)} aria-busy={busy || undefined} key={mode}>
        {registering && <label className="portal-field">Name<input name="name" autoComplete="name" required maxLength={80} placeholder="Your name" disabled={busy} /></label>}
        <label className="portal-field">Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" autoCapitalize="none" spellCheck={false} disabled={busy} /></label>
        <label className="portal-field">Password<span className="auth-password-field">
          <input name="password" type={reveal ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={12} maxLength={128}
            aria-describedby={registering ? 'auth-password-hint' : undefined} disabled={busy} />
          <button className="auth-password-toggle" type="button" aria-label={reveal ? 'Hide password' : 'Show password'} aria-pressed={reveal} disabled={busy} onClick={() => setReveal(!reveal)}><Icon name="eye" /></button>
        </span></label>
        {registering && <p id="auth-password-hint" className="portal-field-hint">Use 12–128 characters.</p>}
        <p className="portal-error auth-error" role="alert" hidden={!error}>{error}</p>
        <button className="portal-button portal-primary auth-submit" type="submit" disabled={busy}>
          {busy ? (registering ? 'Creating your account…' : 'Signing in…') : <>{registering ? 'Create account' : 'Sign in'}<Icon name="arrow" /></>}
        </button>
      </form>
      <p className="auth-switch">{registering ? 'Already have an account?' : 'New to Varpet?'} <button className="portal-text-button" type="button" disabled={busy}
        onClick={() => { if (!busy) { setMode(registering ? 'login' : 'register'); setError(null) } }}>{registering ? 'Sign in' : 'Create an account'}</button></p>
      <p className="auth-footnote">Your saved apartments stay in your account.</p>
    </dialog>
  )
}

/* ---- small shared pieces ---- */

export const PortalLoading = ({ text, className = '' }: { text: string; className?: string }) =>
  <div className={`portal-profile-status ${className}`.trim()} role="status">{className.includes('dev-loading') && <span className="developer-spinner" aria-hidden="true" />}{text}</div>

export function formatSavedDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Saved in your account' : `Saved ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)}`
}
