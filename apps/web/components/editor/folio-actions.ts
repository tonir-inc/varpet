'use client'

// Editor actions the Folio chrome (tool row, dock, header) shares, on Pascal's public stores and events only.
import { emitter } from '@pascal-app/core'
import { type SceneGraph, useEditor, useScene, useSidebarStore, useViewer } from '@pascal-app/editor'
import { frameFlat } from './viewer-look'

export function editorGraph(): SceneGraph {
  const { nodes, rootNodeIds, collections, materials, installedPlugins } = useScene.getState()
  return { nodes, rootNodeIds, collections, materials, installedPlugins } as SceneGraph
}

/** Pascal binds its shortcuts on window keydown and exports no undo/redo/rotate API, so the chrome presses the key. */
export function pressKey(key: string, mods: { shift?: boolean; command?: boolean } = {}) {
  const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key,
    shiftKey: mods.shift ?? false,
    metaKey: Boolean(mods.command && mac),
    ctrlKey: Boolean(mods.command && !mac),
    bubbles: true,
    cancelable: true,
  }))
}

export const undo = () => pressKey('z', { command: true })
export const redo = () => pressKey('z', { command: true, shift: true })

export function selectTool(tool: 'select' | 'marquee' | 'delete') {
  const editor = useEditor.getState()
  if (tool === 'delete') { editor.armToolMode({ mode: 'delete' }); return }
  editor.armToolMode({ mode: 'select' })
  editor.setFloorplanSelectionTool(tool === 'marquee' ? 'marquee' : 'click')
}

/** Frame the selection, or the whole flat when nothing is selected. */
export function frame() {
  const [nodeId] = useViewer.getState().selection.selectedIds
  if (nodeId) emitter.emit('camera-controls:focus', { nodeId } as never)
  else frameFlat(editorGraph())
}

/** Pick the single selected piece up to move it (Pascal's floating menu Move). */
export function moveSelection(): boolean {
  const ids = useViewer.getState().selection.selectedIds
  const node = ids.length === 1 ? useScene.getState().nodes[ids[0] as keyof ReturnType<typeof useScene.getState>['nodes']] : undefined
  if (!node) return false
  useEditor.getState().setMovingNode(node as never)
  useViewer.getState().setSelection({ selectedIds: [] })
  return true
}

/** The inspector's own expand/collapse button (Pascal keeps that state private). */
export function inspectorToggle(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-viewer-bounds] button[aria-label="Expand panel"], [data-viewer-bounds] button[aria-label="Collapse panel"]')
}

export function openSidebar(panel: string) {
  const sidebar = useSidebarStore.getState()
  if (sidebar.isCollapsed) sidebar.setIsCollapsed(false)
  useEditor.getState().setActiveSidebarPanel(panel)
}
