'use client'

import { useMemo, useState } from 'react'
import { fixtureFetch } from '../../lib/agent-stream'
import { PlanIntake } from '../intake/PlanIntake'
import { DesignerPanel } from './DesignerPanel'

/** The dev page's body: the panel and the intake against recorded streams, with the host callbacks logged. */
export function DevChat({ designer, architect, speed = 1 }: { designer: string; architect: string; speed?: number }) {
  const designerFetch = useMemo(() => fixtureFetch(designer, { speed }), [designer, speed])
  const architectFetch = useMemo(() => fixtureFetch(architect, { speed }), [architect, speed])
  const [log, setLog] = useState<string[]>([])
  const [failApply, setFailApply] = useState(false)
  const record = (line: string) => setLog((lines) => [`${new Date().toLocaleTimeString()}  ${line}`, ...lines].slice(0, 30))
  const host = {
    onPreview: (id: string | null) => record(`onPreview(${id ?? 'null'})`),
    onApply: async (id: string) => {
      record(`onApply(${id})`)
      await new Promise((resolve) => setTimeout(resolve, 500))
      if (failApply) throw new Error('The flat changed while you were looking. Ask for a fresh proposal.')
    },
    onDismiss: (id: string) => record(`onDismiss(${id})`),
  }
  return (
    <div className="folio" style={{ display: 'flex', height: '100dvh', background: 'var(--ground)' }}>
      <DesignerPanel sceneId="dev-scene" fetchImpl={designerFetch} badge="Recorded replay" {...host} />
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 24, display: 'grid', gap: 24, alignContent: 'start' }}>
        <PlanIntake sceneId="dev-scene" fetchImpl={architectFetch} {...host} />
        <section style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 560 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input type="checkbox" checked={failApply} onChange={(event) => setFailApply(event.target.checked)} /> Make Apply fail
          </label>
          <strong style={{ color: 'var(--ink)' }}>Host callbacks</strong>
          <pre data-testid="host-log" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'var(--condensed)' }}>{log.join('\n') || 'None yet.'}</pre>
        </section>
      </main>
    </div>
  )
}
