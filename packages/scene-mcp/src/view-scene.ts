// view_scene: the agent looks at its work scene as the person sees it. The camera is computed here from the graph
// (pure, tested); the web app's warm headless renderer (POST /api/render) draws it with the editor's look.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneOperations } from '@pascal-app/mcp/operations'
import { z } from 'zod'
import type { RenderCamera, RenderRequest, RenderResponse } from '../../contracts/src/index.ts'

type Point = [number, number]
type Vec3 = [number, number, number]
type AnyNode = { id: string; type: string; parentId?: string | null; name?: string; [key: string]: unknown }
type Graph = { nodes: Record<string, AnyNode> }

export type View = 'top' | '3d' | 'inside'
export const VIEWS: readonly View[] = ['top', '3d', 'inside']

export interface ViewPlan {
  request: Omit<RenderRequest, 'graph'>
  /** What the image shows, for the caption: room, view, camera, orientation. */
  room: string
  description: string
}

const EYE_HEIGHT = 1.6
const OUTDOOR_ZONE = /balcon|loggia|terrace|patio/i
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places
const fmt = (p: number[]) => `(${p.map((v) => round(v)).join(', ')})`

function insidePolygon([x, y]: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Area centroid; the vertex mean for degenerate outlines. */
function centroid(polygon: Point[]): Point {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    const cross = xj * yi - xi * yj
    area += cross
    cx += (xj + xi) * cross
    cy += (yj + yi) * cross
  }
  if (Math.abs(area) < 1e-9) {
    const n = polygon.length
    return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * area), cy / (3 * area)]
}

function bounds(points: Point[]) {
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, ex: maxX - minX, ez: maxZ - minZ }
}

const zonesOf = (graph: Graph) =>
  Object.values(graph.nodes).filter((n) => n.type === 'zone' && Array.isArray(n.polygon) && (n.polygon as unknown[]).length >= 3)

function wallPoints(graph: Graph): Point[] {
  const points: Point[] = []
  for (const node of Object.values(graph.nodes)) {
    if (node.type !== 'wall') continue
    if (Array.isArray(node.start)) points.push(node.start as Point)
    if (Array.isArray(node.end)) points.push(node.end as Point)
  }
  return points
}

const COMPASS = ['east (+x)', 'south-east', 'south (+z)', 'south-west', 'west (-x)', 'north-west', 'north (-z)', 'north-east']
/** Plan direction as words; north is -z (the top of the top view). */
function heading(dx: number, dz: number) {
  const angle = (Math.atan2(dz, dx) * 180) / Math.PI
  return COMPASS[((Math.round(angle / 45) % 8) + 8) % 8]!
}

/** Which way the 3/4 camera looks from: the diagonal pointing from the flat's middle out through the room. */
function outwardDiagonal(room: Point, flat: Point): Point {
  const sx = room[0] - flat[0] < 0 ? -1 : 1
  const sz = room[1] - flat[1] < 0 ? -1 : 1
  return [sx * Math.SQRT1_2, sz * Math.SQRT1_2]
}

/** Distance at which a sphere of this radius fills a perspective view (vertical fov, aspect w/h). */
function fitDistance(radius: number, fovDeg: number, aspect: number) {
  const vertical = (fovDeg * Math.PI) / 180
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect)
  return radius / Math.sin(Math.min(vertical, horizontal) / 2)
}

interface Viewpoint {
  eye: Point
  look: Point
  from: string
}

/** Doors in walls that border the zone: their centre in plan, and the unit normal pointing into the room. */
function doorViewpoints(graph: Graph, zone: AnyNode, polygon: Point[]): Array<Viewpoint & { outdoor: boolean; depth: number }> {
  const zones = zonesOf(graph)
  const target = centroid(polygon)
  const views: Array<Viewpoint & { outdoor: boolean; depth: number }> = []
  for (const door of Object.values(graph.nodes)) {
    if (door.type !== 'door') continue
    const wall = graph.nodes[(door.wallId as string | undefined) ?? door.parentId ?? '']
    if (wall?.type !== 'wall' || !Array.isArray(wall.start) || !Array.isArray(wall.end)) continue
    const [sx, sz] = wall.start as Point
    const [ex, ez] = wall.end as Point
    const length = Math.hypot(ex - sx, ez - sz)
    if (length < 1e-6) continue
    const ux = (ex - sx) / length
    const uz = (ez - sz) / length
    const along = ((door.position as number[] | undefined)?.[0] as number | undefined) ?? length / 2
    const centre: Point = [sx + ux * along, sz + uz * along]
    const step = ((wall.thickness as number | undefined) ?? 0.2) / 2 + 0.35
    const normal: Point = [-uz, ux]
    const front: Point = [centre[0] + normal[0] * step, centre[1] + normal[1] * step]
    const back: Point = [centre[0] - normal[0] * step, centre[1] - normal[1] * step]
    const frontIn = insidePolygon(front, polygon)
    const backIn = insidePolygon(back, polygon)
    if (frontIn === backIn) continue
    const eye = frontIn ? front : back
    const other = frontIn ? back : front
    const neighbour = zones.find((z) => z.id !== zone.id && insidePolygon(other, z.polygon as Point[]))
    views.push({
      eye,
      look: target,
      from: `the door from ${neighbour?.name ? String(neighbour.name).toLowerCase() : 'outside'}`,
      outdoor: OUTDOOR_ZONE.test(String(neighbour?.name ?? '')),
      depth: Math.hypot(target[0] - eye[0], target[1] - eye[1]),
    })
  }
  return views
}

/** The corner (pulled 0.6 m toward the middle) with the longest view across the room. */
function cornerViewpoint(polygon: Point[]): Viewpoint {
  const middle = centroid(polygon)
  let best: Viewpoint | null = null
  let bestReach = -1
  for (const [x, z] of polygon) {
    const dx = middle[0] - x
    const dz = middle[1] - z
    const length = Math.hypot(dx, dz) || 1
    const eye: Point = [x + (dx / length) * 0.6, z + (dz / length) * 0.6]
    if (!insidePolygon(eye, polygon)) continue
    const reach = Math.max(...polygon.map((p) => Math.hypot(p[0] - eye[0], p[1] - eye[1])))
    if (reach > bestReach) {
      bestReach = reach
      best = { eye, look: middle, from: 'a corner' }
    }
  }
  return best ?? { eye: middle, look: [middle[0] + 1, middle[1]], from: 'the middle' }
}

export class ViewError extends Error {}

/**
 * The camera for one view of one room (or the whole flat without a zone): 'top' a plan-like orthographic view
 * from above, north (-z) up; '3d' a 3/4 view from above, walls toward the camera cut away; 'inside' eye level
 * from the room's door (an indoor door first) or its best corner.
 */
export function planView(graph: Graph, { zoneId, view, width, height }: { zoneId?: string; view: View; width: number; height: number }): ViewPlan {
  const aspect = width / height
  let zone: AnyNode | undefined
  let outline: Point[]
  if (zoneId) {
    zone = graph.nodes[zoneId]
    if (!zone) throw new ViewError(`zone_not_found: ${zoneId}`)
    if (zone.type !== 'zone' || !Array.isArray(zone.polygon)) throw new ViewError(`not_a_zone: ${zoneId} is a ${zone.type}`)
    outline = zone.polygon as Point[]
  } else {
    outline = wallPoints(graph)
    if (outline.length === 0) outline = zonesOf(graph).flatMap((z) => z.polygon as Point[])
    if (outline.length === 0) throw new ViewError('empty_scene: no walls or rooms to look at')
  }
  const room = zone ? `${zone.name ?? 'Room'} (${zone.id})` : 'Whole flat'
  const box = bounds(outline)
  const flatBox = bounds(wallPoints(graph).length ? wallPoints(graph) : outline)
  const base = { width, height }

  if (view === 'top') {
    // Near-orthographic: a narrow lens from high up, so walls read as their tops (a plan) with little lean.
    const fov = 20
    const margin = zone ? 0.8 : 0.6
    const viewHeight = Math.max(box.ez + margin, (box.ex + margin) / aspect)
    const halfH = viewHeight / 2
    const halfW = halfH * aspect
    const distance = halfH / Math.tan(((fov / 2) * Math.PI) / 180) + 2.7
    const camera: RenderCamera = {
      projection: 'perspective',
      position: [box.cx, distance, box.cz],
      target: [box.cx, 0, box.cz],
      up: [0, 0, -1],
      fov,
    }
    return {
      room,
      request: { ...base, camera, wallMode: 'up', hideCeilings: true },
      description:
        `top view from straight above (near-orthographic), walls seen as their tops. North (-z) is up: x runs ` +
        `${round(box.cx - halfW, 1)} (left) to ${round(box.cx + halfW, 1)} (right), z runs ${round(box.cz - halfH, 1)} ` +
        `(top) to ${round(box.cz + halfH, 1)} (bottom) on the floor; ${round(width / (2 * halfW), 0)} px per metre.`,
    }
  }

  if (view === '3d') {
    const fov = 45
    const [dx, dz] = outwardDiagonal([box.cx, box.cz], [flatBox.cx, flatBox.cz])
    const radius = Math.hypot(box.ex / 2, box.ez / 2, 1.35)
    const distance = fitDistance(radius, fov, aspect) * 0.8
    const elevation = (40 * Math.PI) / 180
    const target: Vec3 = [box.cx, 0.6, box.cz]
    const position: Vec3 = [
      target[0] + dx * Math.cos(elevation) * distance,
      target[1] + Math.sin(elevation) * distance,
      target[2] + dz * Math.cos(elevation) * distance,
    ]
    return {
      room,
      request: { ...base, camera: { projection: 'perspective', position, target, fov }, wallMode: 'cutaway', hideCeilings: true },
      description:
        `3/4 view from the ${heading(dx, dz)} and above (40 deg), walls toward the camera cut away; camera ` +
        `${fmt(position)} looking at ${fmt(target)}, fov ${fov}. Things nearer the camera are toward the ${heading(dx, dz)}.`,
    }
  }

  if (!zone) throw new ViewError('inside_needs_zone: pass zone_id for an eye-level view')
  const doors = doorViewpoints(graph, zone, outline).sort((a, b) => Number(a.outdoor) - Number(b.outdoor) || b.depth - a.depth)
  const viewpoint: Viewpoint = doors[0] ?? cornerViewpoint(outline)
  const fov = 65
  const position: Vec3 = [viewpoint.eye[0], EYE_HEIGHT, viewpoint.eye[1]]
  const target: Vec3 = [viewpoint.look[0], 1.1, viewpoint.look[1]]
  return {
    room,
    request: { ...base, camera: { projection: 'perspective', position, target, fov }, wallMode: 'up', hideCeilings: false },
    description:
      `eye level (${EYE_HEIGHT} m) from ${viewpoint.from}, all walls standing; camera ${fmt(position)} looking ` +
      `${heading(target[0] - position[0], target[2] - position[2])} at ${fmt(target)}, fov ${fov}.`,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The tool

export type Renderer = (request: RenderRequest) => Promise<RenderResponse>

export const RENDER_TOKEN_HEADER = 'x-varpet-render-token'

/** POST {url} with the request; any failure (HTTP status, timeout, unreachable) throws one readable line. */
export function httpRenderer(url: string, { token, timeoutMs = 170_000 }: { token?: string; timeoutMs?: number } = {}): Renderer {
  return async (request) => {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { [RENDER_TOKEN_HEADER]: token } : {}) },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const name = (error as { name?: string })?.name
      if (name === 'TimeoutError' || name === 'AbortError') throw new Error(`render_timeout: no image after ${Math.round(timeoutMs / 1000)} s`)
      throw new Error(`renderer_unreachable: ${url} (${error instanceof Error ? error.message : String(error)})`)
    }
    const body = (await response.json().catch(() => null)) as (RenderResponse & { error?: string }) | null
    if (!response.ok || !body?.image) throw new Error(body?.error ?? `render_failed: HTTP ${response.status}`)
    return body
  }
}

/** Ask the web app to start its browser now, so the agent's first look does not pay for it. Never throws. */
export function warmRenderer(url: string, token?: string) {
  fetch(url, { method: 'GET', headers: token ? { [RENDER_TOKEN_HEADER]: token } : {}, signal: AbortSignal.timeout(200_000) })
    .then((r) => r.body?.cancel())
    .catch(() => {})
}

export function registerViewSceneTool(server: McpServer, operations: SceneOperations, render: Renderer) {
  server.registerTool(
    'view_scene',
    {
      title: 'View scene',
      description:
        'See the room as the person sees it in the editor: a picture of your current work scene, including every ' +
        'change you made so far. Look after placing furniture and before you say you are done, then fix what reads ' +
        'as empty, crowded, unbalanced or wrong in scale (bare walls, a lonely sofa, nothing on the floor, ' +
        'lighting missing). view: "3d" (default) a 3/4 view from above with near walls cut away, best for balance ' +
        'and how full the room feels; "top" a plan from above (north, -z, up; the caption gives the x/z range so ' +
        'you can aim moves), best for gaps, walkways and alignment; "inside" eye level from the door, best for ' +
        'how it feels to walk in. zone_id: the room (from get_zones); omit for the whole flat (not for "inside"). ' +
        'Takes a few seconds; one view per call.',
      inputSchema: {
        zone_id: z.string().min(1).optional(),
        view: z.enum(['top', '3d', 'inside']).optional(),
        width: z.number().int().min(512).max(1536).optional().describe('Image width in px; default 1024 (4:3).'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ zone_id, view = '3d', width = 1024 }) => {
      const height = Math.round((width * 3) / 4)
      let plan: ViewPlan
      const graph = operations.exportSceneGraph() as unknown as Graph
      try {
        plan = planView(graph, { zoneId: zone_id, view, width, height })
      } catch (error) {
        return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true }
      }
      try {
        const result = await render({ ...plan.request, graph })
        const caption =
          `${plan.room}: ${plan.description} Rendered with ${result.backend === 'webgpu' ? 'WebGPU' : 'WebGL'} at ` +
          `${result.width}x${result.height} in ${round(result.renderMs / 1000, 1)} s.`
        return {
          content: [
            { type: 'image' as const, data: result.image, mimeType: result.mimeType },
            { type: 'text' as const, text: caption },
          ],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `${error instanceof Error ? error.message : String(error)}. Carry on without the picture.` }],
          isError: true,
        }
      }
    },
  )
}
