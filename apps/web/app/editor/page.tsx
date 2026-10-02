'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_FLAT_TEMPLATE_ID, flatTemplate } from '@/lib/flats/templates'
import type { SceneMeta } from '@/lib/scenes/types'

// Creates a scene and opens it. A client POST, not a server-side write, so link prefetches never mint scenes.
// The scene is a copy of a flat template: `?template=<id>`, else the default flat (Sunday B12121).
export default function NewScenePage() {
  const router = useRouter()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const projectId = params.get('projectId')
    const template = flatTemplate(params.get('template') ?? DEFAULT_FLAT_TEMPLATE_ID)
    if (!template) { setError(`Unknown flat template "${params.get('template')}"`); return }
    fetch('/api/scenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: template.name, templateId: template.id, ...(projectId ? { projectId } : {}) }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not create a scene (${response.status})`)
        const meta = (await response.json()) as SceneMeta
        router.replace(`/editor/${encodeURIComponent(meta.id)}`)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [router])

  return <main className="varpet-not-found">{error ? <p>{error}</p> : <p>Opening a new flat…</p>}</main>
}
