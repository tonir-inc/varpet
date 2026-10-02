'use client'

// The headless renderer's stage: Pascal's bare <Viewer> with the editor's look (viewer-look.ts), no editor chrome.
// lib/render/browser.ts loads /render in a warm headless Chrome and calls window.__varpetRender(request) per job,
// then screenshots the canvas. One job at a time (the server queues them).
import { sceneRegistry } from '@pascal-app/core'
import { applySceneGraphToEditor, type SceneGraph } from '@pascal-app/editor'
import { CeilingSystem, SceneEnvironment, useViewer, Viewer, ViewerPresentations } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import type { RenderRequest } from '@varpet/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PerspectiveCamera } from 'three'
import { configureViewerLook, withWallSides } from '../editor/viewer-look'

type Job = RenderRequest & { key: number }
type Backend = 'webgpu' | 'webgl'

interface Pending {
  key: number
  resolve: (value: { backend: Backend }) => void
  reject: (error: Error) => void
}

declare global {
  interface Window {
    /** Load a graph, aim the camera, resolve once the scene is built and a few frames have settled. */
    __varpetRender?: (request: RenderRequest) => Promise<{ backend: Backend }>
    /** Resolve after n more rendered frames (lets late model loads and TRAA/SSGI settle). */
    __varpetFrames?: (n: number) => Promise<void>
  }
}

/** Frames after Pascal reports the scene ready, before the job resolves. */
const SETTLE_FRAMES = 20

export function RenderStage() {
  const [job, setJob] = useState<Job | null>(null)
  const pending = useRef<Pending | null>(null)
  const frameWaiters = useRef<Array<{ left: number; done: () => void }>>([])
  const backend = useRef<Backend>('webgl')
  // Before <Viewer> mounts: finishes registered, default walls painted, SSGI tuned, as in the editor.
  useState(() => {
    configureViewerLook()
    return null
  })

  useEffect(() => {
    let counter = 0
    window.__varpetRender = (request) =>
      new Promise((resolve, reject) => {
        const key = ++counter
        pending.current?.reject(new Error('superseded by a newer render'))
        pending.current = { key, resolve, reject }
        const viewer = useViewer.getState()
        useViewer.setState({
          shading: 'rendered',
          shadingByContext: { ...viewer.shadingByContext, editor: 'rendered' },
          sceneTheme: 'studio',
          shadows: true,
          textures: true,
          edges: 'off',
          wallMode: request.wallMode,
          cameraMode: 'perspective',
          levelMode: 'stacked',
          showGrid: false,
          showGuides: false,
          showScans: false,
          selection: { buildingId: null, levelId: null, zoneId: null, selectedIds: [] },
          hoveredId: null,
        })
        applySceneGraphToEditor(withWallSides(request.graph as SceneGraph))
        setJob({ ...request, key })
      })
    window.__varpetFrames = (n) => new Promise((done) => frameWaiters.current.push({ left: n, done }))
    return () => {
      delete window.__varpetRender
      delete window.__varpetFrames
    }
  }, [])

  const onSceneReadyChange = useCallback(
    (ready: boolean) => {
      const waiting = pending.current
      if (!ready || !job || !waiting || waiting.key !== job.key) return
      frameWaiters.current.push({
        left: SETTLE_FRAMES,
        done: () => {
          if (pending.current !== waiting) return
          pending.current = null
          waiting.resolve({ backend: backend.current })
        },
      })
    },
    [job],
  )

  const onFrame = useCallback((current: Backend) => {
    backend.current = current
    const waiters = frameWaiters.current
    if (!waiters.length) return
    frameWaiters.current = []
    for (const waiter of waiters) {
      if (--waiter.left <= 0) waiter.done()
      else frameWaiters.current.push(waiter)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fafafa' }}>
      <Viewer
        maxFps={60}
        onSceneReadyChange={onSceneReadyChange}
        renderContext="editor"
        sceneReadyKey={job?.key ?? null}
        sceneReadyMaxWaitMs={20_000}
        selectionManager="custom"
      >
        <SceneEnvironment />
        <CeilingSystem />
        <ViewerPresentations />
        <CameraRig job={job} onFrame={onFrame} />
      </Viewer>
    </div>
  )
}

/** Holds the job's camera every frame (before the wall cutout reads it) and hides ceilings when asked. */
function CameraRig({ job, onFrame }: { job: Job | null; onFrame: (backend: Backend) => void }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const gl = useThree((state) => state.gl)
  useFrame(() => {
    const isWebGpu = Boolean((gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend?.isWebGPUBackend)
    if (job) {
      const spec = job.camera
      camera.up.set(...(spec.up ?? [0, 1, 0]))
      camera.position.set(...spec.position)
      if ((camera as PerspectiveCamera).isPerspectiveCamera) {
        const perspective = camera as PerspectiveCamera
        perspective.fov = spec.fov ?? 50
        perspective.aspect = size.width / Math.max(1, size.height)
      }
      camera.lookAt(...spec.target)
      ;(camera as PerspectiveCamera).updateProjectionMatrix()
      camera.updateMatrixWorld()
      if (job.hideCeilings) {
        sceneRegistry.byType.ceiling?.forEach((id) => {
          const object = sceneRegistry.nodes.get(id)
          if (object) object.visible = false
        })
      }
    }
    onFrame(isWebGpu ? 'webgpu' : 'webgl')
  }, -5)
  return null
}
