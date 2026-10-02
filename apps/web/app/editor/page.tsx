'use client'

import { Editor } from '@pascal-app/editor'

// Phase 0 proof that Pascal renders; lane A replaces this with the scene-backed editor.
export default function EditorPage() {
  return (
    <div style={{ height: '100dvh' }}>
      <Editor layoutVersion="v2" />
    </div>
  )
}
