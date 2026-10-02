'use client'

import { create } from 'zustand'
import type { SceneMeta } from '@/lib/scenes/types'

/**
 * The open editor, for panels mounted inside it (the designer panel gets no props from Pascal's sidebar).
 *
 *   const { sceneId, previewSceneId, showPreview, clearPreview, applyPreview } = useSceneEditor()
 *   showPreview(proposalSceneId)   // the flat shows the proposal, read-only, live as the agent edits it
 *   await applyPreview()           // POST /api/scenes/:sceneId/apply, then back to the (now updated) flat
 *   await applyPreview(id)         // the same for a proposal that is not being previewed
 *   clearPreview()                 // Dismiss: back to the flat as it was
 */
export interface SceneEditorState {
  sceneId: string | null
  /** Last version of the base scene this editor knows the server holds. */
  version: number
  /** Proposal scene shown read-only in place of the base scene, or null. */
  previewSceneId: string | null
  previewError: string | null
  showPreview: (proposalSceneId: string) => void
  clearPreview: () => void
  applyPreview: (proposalSceneId?: string) => Promise<SceneMeta>
}

type Controller = { apply: (proposalSceneId: string) => Promise<SceneMeta> }
let controller: Controller | null = null

/** Called by <SceneEditor>; the apply step needs its echo-suppression refs. */
export function bindSceneEditorController(next: Controller | null) {
  controller = next
}

export const useSceneEditor = create<SceneEditorState>((set, get) => ({
  sceneId: null,
  version: 0,
  previewSceneId: null,
  previewError: null,
  showPreview: (proposalSceneId) => set({ previewSceneId: proposalSceneId, previewError: null }),
  clearPreview: () => set({ previewSceneId: null, previewError: null }),
  applyPreview: async (proposalSceneId) => {
    const proposal = proposalSceneId ?? get().previewSceneId
    if (!proposal) throw new Error('no proposal is being previewed')
    if (!controller) throw new Error('no scene editor is open')
    return controller.apply(proposal)
  },
}))
