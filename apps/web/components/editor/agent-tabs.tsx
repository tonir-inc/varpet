'use client'

// The designer and architect sidebar tabs: the chat panels wired to the open editor's preview and Apply.
import { useMemo } from 'react'
import { DesignerPanel } from '@/components/designer/DesignerPanel'
import { PlanIntake } from '@/components/intake/PlanIntake'
import { useSceneEditor } from './scene-editor-store'

function useProposalHandlers() {
  return useMemo(() => ({
    onPreview: (id: string | null) => {
      const editor = useSceneEditor.getState()
      if (id) editor.showPreview(id)
      else editor.clearPreview()
    },
    onApply: async (id: string) => {
      await useSceneEditor.getState().applyPreview(id)
    },
    onDismiss: async (id: string) => {
      const editor = useSceneEditor.getState()
      if (editor.previewSceneId === id) editor.clearPreview()
      const response = await fetch(`/api/scenes/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) throw new Error(`The proposal could not be dismissed (${response.status})`)
    },
  }), [])
}

export function DesignerTab() {
  const sceneId = useSceneEditor((s) => s.sceneId)
  const handlers = useProposalHandlers()
  if (!sceneId) return null
  return <DesignerPanel className="varpet-sidebar-panel" sceneId={sceneId} {...handlers} />
}

export function ArchitectTab() {
  const sceneId = useSceneEditor((s) => s.sceneId)
  const handlers = useProposalHandlers()
  if (!sceneId) return null
  return <PlanIntake className="varpet-sidebar-panel" sceneId={sceneId} {...handlers} />
}
