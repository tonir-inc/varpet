'use client'

// How the furnished flat looks in the editor: render defaults, the default wall finish, the shared finish
// catalogue (packages/contracts/src/finishes.ts), wall sides for cutaway and the opening camera. Host-side
// configuration of Pascal; nothing here forks it.
import { detectSpacesForLevel, emitter, type MaterialCatalogItem, registerLibraryMaterials, WALL_SLOT_DEFAULT, WALL_SURFACE_SLOT_DEFAULTS } from '@pascal-app/core'
import { registerViewerPresentation, SSGI_PARAMS, useViewer } from '@pascal-app/viewer'
import { finishMaterialItems, finishRef } from '@varpet/contracts/finishes'
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

/** Warm white matte paint from Pascal's library; the flat templates write the same ref into each wall's slots. */
export const WALL_PAINT = finishRef('preset-softwhite')

/**
 * Pascal's unpainted-wall default is "Prepared Drywall" (filler spots and tape seams). The viewer reads the default
 * from WALL_SURFACE_SLOT_DEFAULTS / WALL_SLOT_DEFAULT at render time, so pointing their wall faces at paint changes the
 * look of every wall without a slot of its own (drawn in the editor, written by agents, older scenes) with no scene
 * writes. Trim slots (skirting, crown, chair rail) keep Pascal's defaults.
 */
function paintDefaultWalls() {
  for (const slot of Object.keys(WALL_SURFACE_SLOT_DEFAULTS) as Array<keyof typeof WALL_SURFACE_SLOT_DEFAULTS>) {
    if (WALL_SURFACE_SLOT_DEFAULTS[slot] === 'library:concrete-drywall') {
      ;(WALL_SURFACE_SLOT_DEFAULTS as Record<string, string>)[slot] = WALL_PAINT
    }
  }
  ;(WALL_SLOT_DEFAULT as Record<string, string>).interior = WALL_PAINT
  ;(WALL_SLOT_DEFAULT as Record<string, string>).exterior = WALL_PAINT
}

/**
 * varpet's own finishes (v1 textures from public/finishes, strong paint colours Pascal lacks) from the shared
 * catalogue, so their `library:varpet-*` refs resolve here as they do in the scene MCP.
 */
function registerFinishes() {
  registerLibraryMaterials(finishMaterialItems(window.location.origin) as unknown as MaterialCatalogItem[])
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

type Point = [number, number]

const OUTDOOR_ZONE = /balcon|loggia|terrace|patio/i

function insidePolygon([x, y]: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Sides from the level's zones (room outlines), for walls Pascal's room detector cannot close (plans whose walls
 * stop short of each other). A wall's front faces its left normal, (-dy, dx), as in Pascal's own tagging. Walls
 * with a room on both sides (partitions) stay unknown, so cutaway keeps them standing.
 */
function sidesFromZones(wall: AnyNode, zones: Point[][]) {
  const start = wall.start as Point | undefined
  const end = wall.end as Point | undefined
  if (!start || !end || zones.length === 0) return null
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < 1e-6) return null
  const offset = ((wall.thickness as number | undefined) ?? 0.2) / 2 + 0.1
  const mid: Point = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
  const nx = -dy / length
  const ny = dx / length
  const front = zones.some((zone) => insidePolygon([mid[0] + nx * offset, mid[1] + ny * offset], zone))
  const back = zones.some((zone) => insidePolygon([mid[0] - nx * offset, mid[1] - ny * offset], zone))
  if (front === back) return null
  return { frontSide: front ? 'interior' : 'exterior', backSide: back ? 'interior' : 'exterior' }
}

/**
 * Cutaway hides a wall only when it knows which side faces the room. Pascal tags sides while a person draws walls;
 * walls agents create, templates and seeds arrive "unknown", so derive them before showing a graph (a load-time
 * stopgap; the scene MCP never rewrites saved graphs, and set_wall_finish predicts these tags with the same rules in
 * packages/scene-mcp/src/wall-sides.ts): Pascal's room detector first, the level's zones where it finds no closed
 * room. Pure: the same graph when nothing changes.
 */
export function withWallSides<T extends SceneGraph>(graph: T): T {
  const nodes = (graph as unknown as Graph).nodes
  if (!nodes) return graph
  const wallsByLevel = new Map<string, AnyNode[]>()
  const zonesByLevel = new Map<string, Point[][]>()
  for (const node of Object.values(nodes)) {
    if ((node.type !== 'wall' && node.type !== 'zone') || !node.parentId) continue
    const parent = nodes[node.parentId]
    if (parent?.type !== 'level') continue
    if (node.type === 'zone') {
      // A balcony is outdoors: its wall to the flat is a facade, cut away like any other.
      if (Array.isArray(node.polygon) && node.polygon.length >= 3 && !OUTDOOR_ZONE.test(String(node.name ?? ''))) {
        zonesByLevel.set(parent.id, [...(zonesByLevel.get(parent.id) ?? []), node.polygon as Point[]])
      }
      continue
    }
    wallsByLevel.set(parent.id, [...(wallsByLevel.get(parent.id) ?? []), node])
  }
  let next: Record<string, AnyNode> | null = null
  for (const [levelId, walls] of wallsByLevel) {
    const unknown = (wall: AnyNode) => wall.frontSide === 'unknown' || wall.backSide === 'unknown'
    if (!walls.some(unknown)) continue
    const detected = new Map(detectSpacesForLevel(levelId as never, walls as never).wallUpdates.map((u) => [u.wallId as string, u]))
    const zones = zonesByLevel.get(levelId) ?? []
    for (const wall of walls) {
      if (!unknown(wall)) continue
      const update = detected.get(wall.id)
      const sides = update && update.frontSide !== 'unknown' && update.backSide !== 'unknown' ? update : sidesFromZones(wall, zones)
      if (!sides || (wall.frontSide === sides.frontSide && wall.backSide === sides.backSide)) continue
      next ??= { ...nodes }
      next[wall.id] = { ...wall, frontSide: sides.frontSide, backSide: sides.backSide }
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
  const distance = extent * 1.1 + 2
  // Azimuth 225 degrees: the camera sits off the low-x, low-z corner, looking across the flat.
  const dir = -Math.SQRT1_2
  emitter.emit('camera-controls:apply-pose', {
    position: [cx + dir * distance, extent * 0.95 + 2, cz + dir * distance],
    target: [cx, 0.4, cz],
    projection: 'perspective',
  })
}
