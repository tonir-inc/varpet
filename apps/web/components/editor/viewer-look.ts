'use client'

// How the furnished flat looks in the editor: render defaults, the default wall finish, our v1 finishes as paint
// presets, wall sides for cutaway and the opening camera. Host-side configuration of Pascal; nothing here forks it.
import { detectSpacesForLevel, emitter, MATERIAL_CATALOG, type MaterialCatalogItem, registerLibraryMaterials } from '@pascal-app/core'
import { registerViewerPresentation, SSGI_PARAMS, useViewer } from '@pascal-app/viewer'
import type { SceneGraph } from '@pascal-app/editor'

type AnyNode = { id: string; type: string; parentId?: string | null; [key: string]: unknown }
type Graph = { nodes: Record<string, AnyNode> }

/** Bump to apply changed defaults once more to browsers that already got the previous ones. */
const LOOK_VERSION = 'varpet-viewer-look-v1'
const SCENE_THEME = 'studio'

/** Rendered shading needs WebGPU for SSGI; on the WebGL fallback Pascal skips the pipeline but still shades PBR. */
function hasWebGpu() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean((navigator as { gpu?: unknown }).gpu)
}

/**
 * Once per browser (per LOOK_VERSION): rendered shading, cut-away walls, soft daylight theme, shadows, no ink edges.
 * Later choices in the viewer toolbar persist as usual. Runs before <Editor> mounts so the Viewer picks it up.
 */
export function applyViewerLookDefaults() {
  if (typeof window === 'undefined') return
  let applied = false
  try {
    applied = window.localStorage.getItem(LOOK_VERSION) === '1'
  } catch {}
  if (applied) return
  const shading = 'rendered' as const
  const viewer = useViewer.getState()
  useViewer.setState({
    shading,
    shadingByContext: { ...viewer.shadingByContext, editor: shading },
    wallMode: 'cutaway',
    sceneTheme: SCENE_THEME,
    shadows: true,
    textures: true,
    edges: 'off',
  })
  try {
    window.localStorage.setItem(LOOK_VERSION, '1')
  } catch {}
}

// SSGI: Pascal ships AO only (giIntensity 0); a little indirect light gives walls the floor's warmth.
function tuneGlobalIllumination() {
  SSGI_PARAMS.giIntensity = 1
  SSGI_PARAMS.sliceCount = 2
  SSGI_PARAMS.stepCount = 8
}

const PAINT_WHITE = '#ece7de'

/**
 * Pascal's wall default is "Prepared Drywall" (unpainted board with filler spots). Static catalog entries win over
 * registered ones, so the only host-side way to change the default is to repaint that entry: warm white matte paint.
 */
function paintDefaultWalls() {
  const drywall = MATERIAL_CATALOG.find((item) => item.id === 'concrete-drywall')
  if (!drywall) return
  drywall.label = 'Painted wall'
  drywall.description = 'Warm white matte paint'
  drywall.previewThumbnailUrl = undefined
  drywall.previewColor = PAINT_WHITE
  drywall.preset = {
    ...drywall.preset,
    maps: {},
    mapProperties: { ...drywall.preset.mapProperties, color: PAINT_WHITE, roughness: 0.92 },
  }
}

/** v1 finishes (catalog/materials in varpet v1), served from public/finishes. Tile size in metres from material.json. */
const FINISHES: Array<{ id: string; label: string; category: 'wood' | 'stone'; surfaces: MaterialCatalogItem['surfaces']; color: string; tileM: number; roughness: number }> = [
  { id: 'oak', label: 'Oak', category: 'wood', surfaces: ['floor', 'furniture'], color: '#a27f58', tileM: 1.83, roughness: 0.55 },
  { id: 'ash-light', label: 'Light ash', category: 'wood', surfaces: ['floor', 'furniture'], color: '#ac957d', tileM: 1, roughness: 0.55 },
  { id: 'walnut', label: 'Walnut', category: 'wood', surfaces: ['floor', 'furniture'], color: '#aa8a72', tileM: 1, roughness: 0.5 },
  { id: 'travertine', label: 'Travertine', category: 'stone', surfaces: ['floor', 'wall'], color: '#dfccac', tileM: 1.2, roughness: 0.7 },
  { id: 'marble-white-alt', label: 'White marble', category: 'stone', surfaces: ['floor', 'wall'], color: '#adaeb7', tileM: 1, roughness: 0.35 },
]

function registerFinishes() {
  const origin = window.location.origin
  const items: MaterialCatalogItem[] = FINISHES.map((finish) => {
    const base = `${origin}/finishes/${finish.id}`
    // Pascal maps one texture repeat per metre at repeat 1.
    const repeat = 1 / finish.tileM
    return {
      id: `varpet-${finish.id}`,
      label: finish.label,
      category: finish.category,
      source: 'workspace',
      surfaces: finish.surfaces,
      description: 'Varpet finish',
      previewThumbnailUrl: `${base}/basecolor.jpg`,
      previewColor: finish.color,
      preset: {
        maps: { albedoMap: `${base}/basecolor.jpg`, normalMap: `${base}/normal.jpg`, roughnessMap: `${base}/roughness.jpg` },
        mapProperties: {
          color: finish.color,
          roughness: finish.roughness,
          metalness: 0,
          repeatX: repeat,
          repeatY: repeat,
          rotation: 0,
          wrapS: 'Repeat',
          wrapT: 'Repeat',
          normalScaleX: 1,
          normalScaleY: 1,
          emissiveIntensity: 1,
          displacementScale: 0,
          transparent: false,
          flipY: true,
          bumpScale: 1,
          emissiveColor: '#000000',
          aoMapIntensity: 1,
          side: 0,
          opacity: 1,
          lightMapIntensity: 1,
        },
      },
    } as MaterialCatalogItem
  })
  registerLibraryMaterials(items)
}

let configured = false
/** Module-level Pascal configuration; idempotent, client only, must run before the first material is built. */
export function configureViewerLook() {
  if (configured || typeof window === 'undefined') return
  configured = true
  tuneGlobalIllumination()
  paintDefaultWalls()
  registerFinishes()
  // Host-owned (no pluginId): mounted in every editor and proposal view.
  registerViewerPresentation({ id: 'varpet:clear-cutaway', component: () => import('./clear-cutaway') })
}

/**
 * Cutaway hides a wall only when it knows which side faces the room. Pascal tags sides while a person draws walls;
 * walls written by our agents and seeds arrive "unknown", so derive them from the closed rooms before showing a graph.
 * Pure: returns the same graph when nothing changes, a copy otherwise.
 */
export function withWallSides<T extends SceneGraph>(graph: T): T {
  const nodes = (graph as unknown as Graph).nodes
  if (!nodes) return graph
  const wallsByLevel = new Map<string, AnyNode[]>()
  for (const node of Object.values(nodes)) {
    if (node.type !== 'wall' || !node.parentId) continue
    const parent = nodes[node.parentId]
    if (parent?.type !== 'level') continue
    const list = wallsByLevel.get(parent.id) ?? []
    list.push(node)
    wallsByLevel.set(parent.id, list)
  }
  let next: Record<string, AnyNode> | null = null
  for (const [levelId, walls] of wallsByLevel) {
    if (!walls.some((wall) => wall.frontSide === 'unknown' || wall.backSide === 'unknown')) continue
    const { wallUpdates } = detectSpacesForLevel(levelId as never, walls as never)
    for (const update of wallUpdates) {
      const wall = nodes[update.wallId]
      if (!wall || (wall.frontSide !== 'unknown' && wall.backSide !== 'unknown')) continue
      if (wall.frontSide === update.frontSide && wall.backSide === update.backSide) continue
      next ??= { ...nodes }
      next[update.wallId] = { ...wall, frontSide: update.frontSide, backSide: update.backSide }
    }
  }
  return next ? ({ ...graph, nodes: next } as T) : graph
}

/** Plan bounds (x, z) of every wall, or null for an empty graph. */
function wallBounds(graph: SceneGraph) {
  const nodes = (graph as unknown as Graph).nodes ?? {}
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const node of Object.values(nodes)) {
    if (node.type !== 'wall') continue
    for (const point of [node.start, node.end] as Array<[number, number] | undefined>) {
      if (!point) continue
      minX = Math.min(minX, point[0])
      maxX = Math.max(maxX, point[0])
      minZ = Math.min(minZ, point[1])
      maxZ = Math.max(maxZ, point[1])
    }
  }
  return Number.isFinite(minX) ? { minX, minZ, maxX, maxZ } : null
}

/**
 * Frame the flat at a 3/4 angle from above the south-west corner, close enough that rooms fill the view
 * (Pascal opens every scene at (20, 20, 20) looking at the origin).
 */
export function frameFlat(graph: SceneGraph) {
  const bounds = wallBounds(graph)
  if (!bounds) return
  const cx = (bounds.minX + bounds.maxX) / 2
  const cz = (bounds.minZ + bounds.maxZ) / 2
  const extent = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 3)
  const distance = extent * 1.5
  // Azimuth 225 degrees: the camera sits off the low-x, low-z corner, looking across the flat.
  const dir = -Math.SQRT1_2
  emitter.emit('camera-controls:apply-pose', {
    position: [cx + dir * distance, extent * 1.3 + 1, cz + dir * distance],
    target: [cx, 0.4, cz],
    projection: 'perspective',
  })
}
