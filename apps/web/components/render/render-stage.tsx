'use client'

// The headless renderer's stage: Pascal's bare <Viewer> with the editor's look (viewer-look.ts), no editor chrome.
// lib/render/browser.ts loads /render in a warm headless Chrome and calls window.__varpetRender(request) per job,
// then screenshots the canvas. One job at a time (the server queues them). Between jobs the GPU resources of whatever
// left the scene are disposed (Pascal keeps loaded models in a cache and mounts them with dispose={null}, so nothing
// else frees them), and models the new graph no longer uses leave that cache; browser.ts also reopens the page every
// N renders.
import { sceneRegistry } from '@pascal-app/core'
import { applySceneGraphToEditor, type SceneGraph } from '@pascal-app/editor'
import { CeilingSystem, SceneEnvironment, useViewer, Viewer, ViewerPresentations } from '@pascal-app/viewer'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import type { RenderRequest } from '@varpet/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BufferGeometry, Material, Object3D, PerspectiveCamera, Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { configureCaptureLook, withWallSides } from '../editor/viewer-look'

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
    /** Debugging: the renderer's live geometry and texture counts and the page's JS heap. */
    __varpetInfo?: () => { geometries: number; textures: number; heapMb: number }
  }
}

/** Frames after Pascal reports the scene ready, before the job resolves. */
const SETTLE_FRAMES = 20

/**
 * Supersampling: the canvas renders at 2× and the page shows it at 1×, so the screenshot averages four samples
 * per pixel (anti-aliased edges, crisper textures, quieter SSAO). Pascal's pipeline has no AA of its own.
 */
const CAPTURE_DPR = 2

type LoaderClass = Parameters<typeof useLoader.clear>[0]

/**
 * Model URLs in R3F's loader cache, with the loader class that keys them (Pascal's item loader extends GLTFLoader and
 * keeps every model it ever loaded): recorded by wrapping GLTFLoader.load once.
 */
const cachedModels = new Map<string, LoaderClass>()
function trackModelLoads() {
  const proto = GLTFLoader.prototype as GLTFLoader & { varpetTracked?: boolean }
  if (proto.varpetTracked) return
  proto.varpetTracked = true
  const load = proto.load
  proto.load = function (this: GLTFLoader, url, ...rest) {
    cachedModels.set(url, this.constructor as LoaderClass)
    return load.call(this, url, ...rest)
  }
}

const urlKey = (url: string) => {
  try {
    const u = new URL(url, window.location.href)
    return u.pathname + u.search
  } catch {
    return url
  }
}

/** Drop the cached models the graph does not use (their meshes left the scene and were disposed already). */
function releaseModels(graph: unknown) {
  const used = new Set<string>()
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      if (value.includes('/')) used.add(urlKey(value))
    } else if (value && typeof value === 'object') for (const v of Object.values(value)) walk(v)
  }
  walk(graph)
  for (const [url, loader] of cachedModels) {
    if (used.has(urlKey(url))) continue
    useLoader.clear(loader, url)
    cachedModels.delete(url)
  }
}

/** Every geometry, material and texture the scene holds now. */
function sceneResources(scene: Object3D | null) {
  const found = new Set<BufferGeometry | Material | Texture>()
  scene?.traverse((object) => {
    const { geometry, material } = object as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] }
    if (geometry?.isBufferGeometry) found.add(geometry)
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      found.add(m)
      for (const value of Object.values(m)) if ((value as Texture | null)?.isTexture) found.add(value as Texture)
    }
  })
  return found
}

/** Free the GPU side of what the previous jobs drew and this one no longer does (three re-uploads it if reused). */
function disposeLeftovers(previous: Set<BufferGeometry | Material | Texture>, scene: Object3D | null) {
  const current = sceneResources(scene)
  let n = 0
  for (const resource of previous) {
    if (current.has(resource)) continue
    resource.dispose()
    n++
  }
  previous.clear()
  return n
}

export function RenderStage() {
  const [job, setJob] = useState<Job | null>(null)
  const pending = useRef<Pending | null>(null)
  const frameWaiters = useRef<Array<{ left: number; done: () => void }>>([])
  const backend = useRef<Backend>('webgl')
  const three = useRef<{ scene: Object3D; info: { memory: { geometries: number; textures: number } } } | null>(null)
  /** What the scene held before the current job's graph replaced it; disposed (less what it still uses) once ready. */
  const leftovers = useRef(new Set<BufferGeometry | Material | Texture>())
  // Before <Viewer> mounts: finishes registered, default walls painted, SSGI tuned, as in the editor (with more
  // SSGI slices: a still frame can afford them).
  useState(() => {
    configureCaptureLook()
    trackModelLoads()
    return null
  })

  useEffect(() => {
    let counter = 0
    window.__varpetRender = (request) =>
      new Promise((resolve, reject) => {
        const key = ++counter
        pending.current?.reject(new Error('superseded by a newer render'))
        pending.current = { key, resolve, reject }
        for (const resource of sceneResources(three.current?.scene ?? null)) leftovers.current.add(resource)
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
    window.__varpetInfo = () => ({
      geometries: three.current?.info.memory.geometries ?? 0,
      textures: three.current?.info.memory.textures ?? 0,
      heapMb: Math.round(((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 2 ** 20),
    })
    return () => {
      delete window.__varpetRender
      delete window.__varpetFrames
      delete window.__varpetInfo
    }
  }, [])

  const onSceneReadyChange = useCallback(
    (ready: boolean) => {
      const waiting = pending.current
      if (!ready || !job || !waiting || waiting.key !== job.key) return
      disposeLeftovers(leftovers.current, three.current?.scene ?? null)
      releaseModels(job.graph)
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
        dpr={CAPTURE_DPR}
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
        <ThreeHandle target={three} />
      </Viewer>
    </div>
  )
}

/** Hands the stage the scene and renderer info, which only exist inside <Viewer>. */
function ThreeHandle({ target }: { target: { current: unknown } }) {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    target.current = { scene, info: (gl as unknown as { info: { memory: { geometries: number; textures: number } } }).info }
    return () => {
      target.current = null
    }
  }, [scene, gl, target])
  return null
}

/** Holds the job's camera every frame (before the wall cutout reads it) and hides ceiling surfaces when asked. */
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
      // Hide only the ceiling surfaces: clearing their layers drops the meshes from the render list while three.js
      // still draws their children (pendants and ceiling lights hang in the ceiling's frame); `visible = false`
      // would hide those too.
      sceneRegistry.byType.ceiling?.forEach((id) => {
        const object = sceneRegistry.nodes.get(id)
        if (!object) return
        const data = object.userData as { varpetLayers?: number }
        if (job.hideCeilings) {
          data.varpetLayers ??= object.layers.mask
          object.layers.mask = 0
        } else if (data.varpetLayers !== undefined) {
          object.layers.mask = data.varpetLayers
          delete data.varpetLayers
        }
      })
    }
    onFrame(isWebGpu ? 'webgpu' : 'webgl')
  }, -5)
  return null
}
