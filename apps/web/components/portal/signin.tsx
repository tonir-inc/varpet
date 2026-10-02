'use client'

// `/signin`: v1 had no sign-in page, only the account dialog; this opens that dialog and then goes on to
// `?next=` (a same-site path) or the saved apartments.
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { usePortal } from './frame'

function nextPath(): string {
  const next = new URLSearchParams(location.search).get('next') ?? ''
  return next.startsWith('/') && !next.startsWith('//') ? next : '/apartments'
}

export function SignInPage() {
  const { user, status, authenticate } = usePortal()
  const router = useRouter()
  const opened = useRef(false)
  useEffect(() => {
    if (status === 'loading') return
    if (user) { router.replace(nextPath()); return }
    if (opened.current) return
    opened.current = true
    const mode = new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login'
    void authenticate(mode).then(signedIn => { if (signedIn) router.replace(nextPath()) })
  }, [status, user, authenticate, router])
  return <div className="portal-profile-status" role="status">{user ? 'Signed in. Opening your apartments…' : 'Sign in to continue.'}</div>
}
