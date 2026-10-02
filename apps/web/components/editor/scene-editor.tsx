'use client'

// Scene-backed Pascal editor with live sync. Ported from Pascal (MIT) apps/editor/components/scene-loader.tsx,
// plus a read-only proposal preview (see scene-editor-store.ts for the API panels use).
import {
  applySceneGraphToEditor,
  Editor,
  type SceneGraph,
  useEditor,
  type SidebarTab,
  useScene,
  ViewerToolbarLeft,
  ViewerToolbarRight,
} from '@pascal-app/editor'
import { Layers, PencilRuler, Settings, Sofa, Sparkles } from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { countGraphNodes, isEmptyGraphOverwrite } from '@/lib/scenes/empty-graph-guard'
import { sceneGraphSignature } from '@/lib/scenes/scene-signature'
import type { LiveSceneEvent, SceneMeta, SceneResponse } from '@/lib/scenes/types'
import { hasPlanHandoff } from '@/lib/plan-handoff'
import { ArchitectTab, DesignerTab } from './agent-tabs'
import { CatalogTab } from './catalog-tab'
import { bindSceneEditorController, useSceneEditor } from './scene-editor-store'
import { useCatalogMetadata } from './use-catalog-metadata'

type Tab = SidebarTab & { component: ComponentType }

export interface SceneEditorProps {
  meta: SceneMeta
  initialGraph: SceneGraph
  /** Proposal scene to show read-only on open (`/editor/:id?preview=<proposalId>`). */
  initialPreviewSceneId?: string | null
  /** Mounted in the "designer" sidebar tab; the designer chat when absent. */
  designerPanel?: ComponentType
}

function editorGraph(): SceneGraph {
  const { nodes, rootNodeIds, collections, materials, installedPlugins } = useScene.getState()
  return { nodes, rootNodeIds, collections, materials, installedPlugins } as SceneGraph
}

function parseEvent(event: Event): LiveSceneEvent | null {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as LiveSceneEvent
  } catch {
    return null
  }
}

const sceneSettingsNoop = () => null

export function SceneEditor({ meta, initialGraph, initialPreviewSceneId = null, designerPanel }: SceneEditorProps) {
  const versionRef = useRef(meta.version)
  // Node count the server is known to hold: an empty save from a not-yet-hydrated editor must never wipe it.
  const serverNodeCountRef = useRef(meta.nodeCount)
  const lastRemoteGraphJsonRef = useRef<string | null>(null)
  const suppressRemoteSaveUntilRef = useRef(0)
  const initialGraphRef = useRef(initialGraph)
  // While previewing: the base graph to restore on exit (newer base events land here instead of the editor).
  const baseGraphRef = useRef<SceneGraph | null>(null)
  const previewingRef = useRef(false)
  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewGraph, setPreviewGraph] = useState<SceneGraph | null>(null)
  const previewSceneId = useSceneEditor((s) => s.previewSceneId)
  const previewError = useSceneEditor((s) => s.previewError)
  useCatalogMetadata()

  const setVersion = useCallback((version: number) => {
    versionRef.current = version
    useSceneEditor.setState({ version })
  }, [])

  /** Puts a graph that came from the server into the editor without saving it straight back. */
  const applyRemote = useCallback((graph: SceneGraph) => {
    lastRemoteGraphJsonRef.current = sceneGraphSignature(graph)
    suppressRemoteSaveUntilRef.current = Date.now() + 2500
    applySceneGraphToEditor(graph)
  }, [])

  useEffect(() => {
    useSceneEditor.setState({ sceneId: meta.id, version: meta.version, previewSceneId: initialPreviewSceneId, previewError: null })
    bindSceneEditorController({
      apply: async (proposalSceneId) => {
        const response = await fetch(`/api/scenes/${encodeURIComponent(meta.id)}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'If-Match': String(versionRef.current) },
          body: JSON.stringify({ proposalSceneId }),
        })
        if (!response.ok) throw new Error(`Apply failed (${response.status})`)
        const next = (await response.json()) as SceneMeta
        // The applied proposal becomes the graph restored when the preview closes; its own event is then stale.
        const applied = await fetch(`/api/scenes/${encodeURIComponent(meta.id)}`, { cache: 'no-store' })
        if (applied.ok) {
          const graph = ((await applied.json()) as SceneResponse).graph
          // Applied without a loaded preview (straight from the proposal card): show it now.
          if (previewingRef.current) baseGraphRef.current = graph
          else applyRemote(graph)
        }
        setVersion(next.version)
        serverNodeCountRef.current = next.nodeCount
        useSceneEditor.getState().clearPreview()
        return next
      },
    })
    return () => {
      bindSceneEditorController(null)
      useSceneEditor.setState({ sceneId: null, version: 0, previewSceneId: null, previewError: null })
    }
  }, [meta.id, meta.version, initialPreviewSceneId, setVersion, applyRemote])

  // Pascal's <Editor> adds `dark` to <body> on mount; Folio is light, so keep it off while the editor is open.
  useEffect(() => {
    const body = document.body
    const strip = () => {
      if (body.classList.contains('dark')) body.classList.remove('dark')
    }
    strip()
    const observer = new MutationObserver(strip)
    observer.observe(body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // A plan handed over from the portal opens the plan tab, after the sidebar has registered it.
  useEffect(() => {
    if (!hasPlanHandoff(meta.id)) return
    const timer = setTimeout(() => useEditor.getState().setActiveSidebarPanel('architect'), 0)
    return () => clearTimeout(timer)
  }, [meta.id])

  // Keep ?preview= in the address bar so a reload shows the same thing.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (previewSceneId) url.searchParams.set('preview', previewSceneId)
    else url.searchParams.delete('preview')
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  }, [previewSceneId])

  const handleLoad = useCallback(async () => initialGraphRef.current, [])

  const handleSave = useCallback(
    async (graph: SceneGraph, options?: { keepalive?: boolean }) => {
      if (previewingRef.current) return
      const graphJson = sceneGraphSignature(graph)
      if (lastRemoteGraphJsonRef.current === graphJson) {
        lastRemoteGraphJsonRef.current = null
        suppressRemoteSaveUntilRef.current = 0
        return
      }
      if (Date.now() < suppressRemoteSaveUntilRef.current) return

      if (isEmptyGraphOverwrite(countGraphNodes(graph), serverNodeCountRef.current)) {
        console.error(`[scene-editor] refusing to overwrite scene ${meta.id} (${serverNodeCountRef.current} nodes) with an empty graph`)
        setSaveError('Autosave blocked: the editor tried to save an empty scene')
        return
      }

      try {
        const response = await fetch(`/api/scenes/${encodeURIComponent(meta.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'If-Match': String(versionRef.current) },
          body: JSON.stringify({ graph }),
          // Browsers cap keepalive bodies at 64KB, so only the unload flush opts in.
          keepalive: options?.keepalive,
        })
        if (response.status === 409) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          if (body?.error === 'empty_graph_rejected') {
            setSaveError('Autosave blocked: the editor tried to save an empty scene')
            return
          }
          setConflict(true)
          return
        }
        if (!response.ok) {
          setSaveError(`Save failed (${response.status})`)
          return
        }
        const next = (await response.json()) as SceneMeta
        setVersion(next.version)
        serverNodeCountRef.current = next.nodeCount
        setSaveError(null)
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Save failed')
      }
    },
    [meta.id, setVersion],
  )

  // Base scene: newer scene_events (agents, scripts, Apply) replace what the editor shows.
  useEffect(() => {
    const source = new EventSource(`/api/scenes/${encodeURIComponent(meta.id)}/events`)
    source.addEventListener('scene', (event) => {
      const payload = parseEvent(event)
      if (!payload || payload.sceneId !== meta.id || payload.version <= versionRef.current) return
      setVersion(payload.version)
      serverNodeCountRef.current = countGraphNodes(payload.graph)
      setConflict(false)
      setSaveError(null)
      if (previewingRef.current) baseGraphRef.current = payload.graph
      else applyRemote(payload.graph)
    })
    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CLOSED) setSaveError('Live scene connection closed')
    })
    return () => source.close()
  }, [meta.id, applyRemote, setVersion])

  // Proposal preview: load it, follow its events while the agent works, restore the base on exit.
  useEffect(() => {
    if (!previewSceneId) {
      if (previewingRef.current) {
        previewingRef.current = false
        setPreviewGraph(null)
        if (baseGraphRef.current) applyRemote(baseGraphRef.current)
        baseGraphRef.current = null
      }
      return
    }
    let cancelled = false
    let source: EventSource | null = null
    let previewVersion = 0
    const id = encodeURIComponent(previewSceneId)
    ;(async () => {
      const response = await fetch(`/api/scenes/${id}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Proposal ${previewSceneId} could not be loaded (${response.status})`)
      const body = (await response.json()) as SceneResponse
      if (cancelled) return
      if (!previewingRef.current) {
        baseGraphRef.current = editorGraph()
        previewingRef.current = true
      }
      previewVersion = body.meta.version
      setPreviewGraph(body.graph)
      source = new EventSource(`/api/scenes/${id}/events`)
      source.addEventListener('scene', (event) => {
        const payload = parseEvent(event)
        if (!payload || payload.version <= previewVersion) return
        previewVersion = payload.version
        setPreviewGraph(payload.graph)
      })
    })().catch((error: unknown) => {
      if (cancelled) return
      useSceneEditor.setState({ previewSceneId: null, previewError: error instanceof Error ? error.message : String(error) })
    })
    return () => {
      cancelled = true
      source?.close()
    }
  }, [previewSceneId, applyRemote])

  const sidebarTabs = useMemo<Tab[]>(
    () => [
      { id: 'site', label: 'Scene', component: sceneSettingsNoop, icon: <Layers className="size-5" />, mobileIcon: <Layers className="size-5" />, mobileDefaultSnap: 0.5 },
      { id: 'catalog', label: 'Catalog', component: CatalogTab, icon: <Sofa className="size-5" />, mobileIcon: <Sofa className="size-5" />, mobileDefaultSnap: 0.5 },
      { id: 'designer', label: 'Designer', component: designerPanel ?? DesignerTab, icon: <Sparkles className="size-5" />, mobileIcon: <Sparkles className="size-5" />, mobileDefaultSnap: 0.6 },
      { id: 'architect', label: 'Plan', component: ArchitectTab, icon: <PencilRuler className="size-5" />, mobileIcon: <PencilRuler className="size-5" />, mobileDefaultSnap: 0.6 },
      { id: 'settings', label: 'Settings', component: sceneSettingsNoop, icon: <Settings className="size-5" />, mobileIcon: <Settings className="size-5" />, mobileDefaultSnap: 0.5 },
    ],
    [designerPanel],
  )

  const previewing = previewSceneId !== null && previewGraph !== null
  const banner = conflict ? (
    <div className="varpet-banner" role="alert">
      <span>Another session saved first. Your last change is not saved.</span>
      <button onClick={() => window.location.reload()} type="button">Reload</button>
      <button onClick={() => setConflict(false)} type="button">Dismiss</button>
    </div>
  ) : saveError || previewError ? (
    <div className="varpet-banner varpet-banner-danger" role="alert">
      <span>{previewError ?? saveError}</span>
    </div>
  ) : null

  return (
    <div className="varpet-editor-stage">
      {banner}
      <Editor
        isVersionPreviewMode={previewing}
        layoutVersion="v2"
        onLoad={handleLoad}
        onSave={handleSave}
        previewScene={previewGraph ?? undefined}
        projectId={meta.projectId ?? meta.id}
        sidebarTabs={sidebarTabs}
        viewerBanner={previewing ? <PreviewBanner /> : null}
        viewerToolbarLeft={<ViewerToolbarLeft />}
        viewerToolbarRight={<ViewerToolbarRight />}
      />
    </div>
  )
}

function PreviewBanner() {
  const clearPreview = useSceneEditor((s) => s.clearPreview)
  const applyPreview = useSceneEditor((s) => s.applyPreview)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="varpet-preview-banner pointer-events-auto" role="status">
      <span>Showing the designer&apos;s proposal. Nothing changes in your flat until you apply it.</span>
      {error ? <span className="varpet-preview-error">{error}</span> : null}
      <button
        className="varpet-button-primary"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(null)
          applyPreview()
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false))
        }}
        type="button"
      >
        Apply
      </button>
      <button disabled={busy} onClick={clearPreview} type="button">
        Back to my flat
      </button>
    </div>
  )
}
