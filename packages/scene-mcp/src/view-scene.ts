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

const EYE_HEIGHT = 1.5
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

// ---------------------------------------------------------------------------------------------------------------
// Eye level: stand in a doorway or the corner opposite the room's focal wall, look across the room, never from
// inside or right behind a piece of furniture.

interface Viewpoint {
  eye: Point
  look: Point
  from: string
}

interface Candidate {
  eye: Point
  from: string
  /** Tiebreak bonus: an indoor door reads as walking in; an outdoor door (balcony) looks back into the flat. */
  bonus: number
}

/** A plan box with a height range: a piece of furniture or a built-in run, rotated by `yaw` about the vertical. */
export interface Obstacle {
  centre: Point
  half: Point
  yaw: number
  bottom: number
  top: number
  name: string
}

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const yawOf = (rotation: unknown) => (Array.isArray(rotation) ? num(rotation[1]) : num(rotation))

/**
 * Floor-standing pieces and built-in cabinet runs as boxes. Wall- and ceiling-hung pieces (art, sconces, pendants)
 * are left out: they hang above or flat against a wall, never between the camera and the room.
 */
export function obstacles(graph: Graph): Obstacle[] {
  const out: Obstacle[] = []
  for (const node of Object.values(graph.nodes)) {
    const parent = graph.nodes[node.parentId ?? '']
    if (parent?.type === 'wall' || parent?.type === 'ceiling') continue
    const position = node.position as number[] | undefined
    if (!Array.isArray(position)) continue
    if (node.type === 'item') {
      const asset = node.asset as { dimensions?: number[] } | undefined
      const scale = (node.scale as number[] | undefined) ?? [1, 1, 1]
      const [w, h, d] = [0, 1, 2].map((i) => Math.abs(num(asset?.dimensions?.[i], 0.5) * num(scale[i], 1)))
      const bottom = num(position[1])
      out.push({ centre: [num(position[0]), num(position[2])], half: [w! / 2, d! / 2], yaw: yawOf(node.rotation), bottom, top: bottom + h!, name: String(node.name ?? node.id) })
    } else if (node.type === 'cabinet' && parent?.type === 'level') {
      const height = num(node.plinthHeight, 0.1) + num(node.carcassHeight, 0.8) + num(node.countertopThickness, 0.02)
      const tall = node.runTier === 'tall'
      const bottom = node.runTier === 'wall' ? 1.4 : 0
      out.push({
        centre: [num(position[0]), num(position[2])],
        half: [num(node.width, 0.6) / 2, num(node.depth, 0.6) / 2],
        yaw: yawOf(node.rotation),
        bottom,
        top: tall ? 2.2 : bottom + height,
        name: String(node.name ?? node.id),
      })
    }
  }
  return out
}

/** A plan point in an obstacle's own frame (Three.js yaw: local x = (cos, -sin), local z = (sin, cos)). */
function toLocal(o: Obstacle, [x, z]: Point): Point {
  const dx = x - o.centre[0]
  const dz = z - o.centre[1]
  const c = Math.cos(o.yaw)
  const s = Math.sin(o.yaw)
  return [dx * c - dz * s, dx * s + dz * c]
}

function insideBox(o: Obstacle, point: Point, margin: number) {
  const [lx, lz] = toLocal(o, point)
  return Math.abs(lx) <= o.half[0] + margin && Math.abs(lz) <= o.half[1] + margin
}

/** Distance along a 3D ray (unit direction) to an obstacle's box grown by `margin` in plan, or Infinity. */
function rayHit(o: Obstacle, origin: Vec3, dir: Vec3, margin: number) {
  const [ox, oz] = toLocal(o, [origin[0], origin[2]])
  const c = Math.cos(o.yaw)
  const s = Math.sin(o.yaw)
  const local: Vec3 = [dir[0] * c - dir[2] * s, dir[1], dir[0] * s + dir[2] * c]
  const lo: Vec3 = [-o.half[0] - margin, o.bottom, -o.half[1] - margin]
  const hi: Vec3 = [o.half[0] + margin, o.top, o.half[1] + margin]
  const from: Vec3 = [ox, origin[1], oz]
  let near = 0
  let far = Infinity
  for (let axis = 0; axis < 3; axis++) {
    const d = local[axis]!
    if (Math.abs(d) < 1e-9) {
      if (from[axis]! < lo[axis]! || from[axis]! > hi[axis]!) return Infinity
      continue
    }
    const t1 = (lo[axis]! - from[axis]!) / d
    const t2 = (hi[axis]! - from[axis]!) / d
    near = Math.max(near, Math.min(t1, t2))
    far = Math.min(far, Math.max(t1, t2))
    if (near > far) return Infinity
  }
  return near
}

/**
 * The pieces that fill the near field of a camera at `eye` looking at `look`: the eye standing in a piece's
 * footprint, or a fan of rays across the frame (left to right, level and down toward the floor) hitting a piece
 * within reach. Reach shortens as the rays tilt down, so a sofa back seen across the room does not count.
 */
export function nearFieldBlockers(eye: Point, look: Point, height: number, boxes: Obstacle[], scale = 1): string[] {
  const hit = new Set<string>()
  for (const o of boxes) if (o.top > 0.3 && insideBox(o, eye, 0.25)) hit.add(o.name)
  const heading = Math.atan2(look[1] - eye[1], look[0] - eye[0])
  const origin: Vec3 = [eye[0], height, eye[1]]
  for (const yawDeg of [-32, -16, 0, 16, 32]) {
    for (const [pitchDeg, reach] of [[0, 1.2], [-14, 1.0], [-28, 0.7]] as const) {
      const yaw = heading + (yawDeg * Math.PI) / 180
      const pitch = (pitchDeg * Math.PI) / 180
      const dir: Vec3 = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)]
      for (const o of boxes) if (rayHit(o, origin, dir, 0.05) < reach * scale) hit.add(o.name)
    }
  }
  return [...hit]
}

/** Share of the straight line between two plan points that runs inside the polygon. */
function sightline(from: Point, to: Point, polygon: Point[]) {
  const samples = 24
  let inside = 0
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    if (insidePolygon([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], polygon)) inside++
  }
  return inside / samples
}

/** Openings (doors, windows) in plan: centre, width, height, and the wall's unit direction. */
function openingsOf(graph: Graph, type: 'door' | 'window') {
  const out: Array<{ centre: Point; width: number; height: number; along: Point; thickness: number }> = []
  for (const node of Object.values(graph.nodes)) {
    if (node.type !== type) continue
    const wall = graph.nodes[(node.wallId as string | undefined) ?? node.parentId ?? '']
    if (wall?.type !== 'wall' || !Array.isArray(wall.start) || !Array.isArray(wall.end)) continue
    const [sx, sz] = wall.start as Point
    const [ex, ez] = wall.end as Point
    const length = Math.hypot(ex - sx, ez - sz)
    if (length < 1e-6) continue
    const u: Point = [(ex - sx) / length, (ez - sz) / length]
    const at = num((node.position as number[] | undefined)?.[0], length / 2)
    out.push({ centre: [sx + u[0] * at, sz + u[1] * at], width: num(node.width, 0.9), height: num(node.height, 1.4), along: u, thickness: num(wall.thickness, 0.2) })
  }
  return out
}

function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz || 1e-9
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / len2))
  return { distance: Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz)), t }
}

/**
 * The room's focal wall: the outline edge carrying the most visual weight (pieces standing or hanging against it,
 * by their face area; windows at half weight), or the longest edge in a room with nothing on its walls. Its focal
 * point is the weighted middle of what stands against it.
 */
export function focalWall(graph: Graph, polygon: Point[]): { a: Point; b: Point; point: Point; why: string } {
  const edges = polygon.map((a, i) => ({ a, b: polygon[(i + 1) % polygon.length]!, weight: 0, sum: 0 }))
  const credit = (point: Point, weight: number, reach: number) => {
    let best: { edge: (typeof edges)[number]; t: number; distance: number } | null = null
    for (const edge of edges) {
      const { distance, t } = segmentDistance(point, edge.a, edge.b)
      if (distance <= reach && (!best || distance < best.distance)) best = { edge, t, distance }
    }
    if (!best) return
    best.edge.weight += weight
    best.edge.sum += weight * best.t
  }
  for (const node of Object.values(graph.nodes)) {
    if (node.type !== 'item') continue
    const parent = graph.nodes[node.parentId ?? '']
    const position = node.position as number[] | undefined
    const dims = ((node.asset as { dimensions?: number[] } | undefined)?.dimensions ?? []).map((v) => Math.abs(num(v)))
    if (!Array.isArray(position) || dims.length < 3) continue
    if (parent?.type === 'wall' && Array.isArray(parent.start) && Array.isArray(parent.end)) {
      const [sx, sz] = parent.start as Point
      const [ex, ez] = parent.end as Point
      const length = Math.hypot(ex - sx, ez - sz) || 1
      const along = num(position[0])
      const u: Point = [(ex - sx) / length, (ez - sz) / length]
      const side = num(position[2]) < 0 ? -1 : 1
      // Hung on the face toward the item's side of the wall: credit it only when that face looks into this room.
      const point: Point = [sx + u[0] * along - u[1] * 0.15 * side, sz + u[1] * along + u[0] * 0.15 * side]
      if (!insidePolygon(point, polygon)) continue
      credit(point, dims[0]! * dims[1]! * 1.5, 0.45)
    } else if (parent?.type !== 'ceiling') {
      const point: Point = [num(position[0]), num(position[2])]
      if (!insidePolygon(point, polygon) || dims[1]! < 0.3 || /rug|carpet/i.test(String(node.name ?? ''))) continue
      const reach = Math.max(dims[0]!, dims[2]!) / 2 + 0.6
      credit(point, Math.max(dims[0]!, dims[2]!) * dims[1]!, reach)
    }
  }
  for (const window of openingsOf(graph, 'window')) credit(window.centre, window.width * window.height * 0.5, window.thickness / 2 + 0.1)
  const best = [...edges].sort((p, q) => q.weight - p.weight || Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]) - Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]))[0]!
  const t = best.weight > 0 ? best.sum / best.weight : 0.5
  return {
    a: best.a,
    b: best.b,
    point: [best.a[0] + (best.b[0] - best.a[0]) * t, best.a[1] + (best.b[1] - best.a[1]) * t],
    why: best.weight > 0 ? 'the wall with the most standing against it' : 'the longest wall',
  }
}

/** Where a person can stand to take the room in: just inside each door, and each corner stepped in off both walls. */
function standingSpots(graph: Graph, zone: AnyNode, polygon: Point[]): Candidate[] {
  const zones = zonesOf(graph)
  const box = bounds(polygon)
  // 0.5 m off both walls, less in a narrow hall or closet so the spot stays inside it.
  const inset = Math.min(0.5, 0.35 * Math.min(box.ex, box.ez))
  const spots: Candidate[] = []
  for (const door of openingsOf(graph, 'door')) {
    const normal: Point = [-door.along[1], door.along[0]]
    const step = door.thickness / 2 + 0.35
    for (const sign of [1, -1]) {
      const eye: Point = [door.centre[0] + normal[0] * step * sign, door.centre[1] + normal[1] * step * sign]
      const other: Point = [door.centre[0] - normal[0] * step * sign, door.centre[1] - normal[1] * step * sign]
      if (!insidePolygon(eye, polygon) || insidePolygon(other, polygon)) continue
      const neighbour = zones.find((z) => z.id !== zone.id && insidePolygon(other, z.polygon as Point[]))
      const outdoor = OUTDOOR_ZONE.test(String(neighbour?.name ?? ''))
      spots.push({ eye, from: `the door from ${neighbour?.name ? String(neighbour.name).toLowerCase() : 'outside'}`, bonus: outdoor ? -1.5 : neighbour ? 0.6 : 0.3 })
    }
  }
  for (let i = 0; i < polygon.length; i++) {
    const corner = polygon[i]!
    const prev = polygon[(i + polygon.length - 1) % polygon.length]!
    const next = polygon[(i + 1) % polygon.length]!
    const u1: Point = [prev[0] - corner[0], prev[1] - corner[1]]
    const u2: Point = [next[0] - corner[0], next[1] - corner[1]]
    const l1 = Math.hypot(...u1) || 1
    const l2 = Math.hypot(...u2) || 1
    for (const sign of [1, -1]) {
      const eye: Point = [corner[0] + sign * inset * (u1[0] / l1 + u2[0] / l2), corner[1] + sign * inset * (u1[1] / l1 + u2[1] / l2)]
      if (insidePolygon(eye, polygon)) {
        spots.push({ eye, from: 'a corner', bonus: 0 })
        break
      }
    }
  }
  return spots
}

/**
 * The eye-level viewpoint: of the doorways and corners that see the focal wall without looking through a wall,
 * the one farthest from it, favouring a view along the room's long side and an indoor door; stepped toward the
 * focal wall (0.25 m at a time, up to 1.5 m) until no piece fills the near field, else the next spot.
 */
export function eyeViewpoint(graph: Graph, zone: AnyNode, polygon: Point[], height = EYE_HEIGHT): Viewpoint & { blockedBy: string[] } {
  const boxes = obstacles(graph)
  const focal = focalWall(graph, polygon)
  const middle = centroid(polygon)
  // Look at the focal wall's point, pulled 0.4 m into the room so the wall fills the back of the frame.
  const inward: Point = [middle[0] - focal.point[0], middle[1] - focal.point[1]]
  const inLength = Math.hypot(...inward) || 1
  let look: Point = [focal.point[0] + (inward[0] / inLength) * 0.4, focal.point[1] + (inward[1] / inLength) * 0.4]
  if (!insidePolygon(look, polygon)) look = middle
  const box = bounds(polygon)
  const long: Point = box.ex >= box.ez ? [1, 0] : [0, 1]
  const spots = standingSpots(graph, zone, polygon)
  // A spot right under the focal point sees nothing; in a closet-sized room every spot is that close, keep them.
  const far = spots.filter((spot) => Math.hypot(look[0] - spot.eye[0], look[1] - spot.eye[1]) > 0.5)
  const ranked = (far.length ? far : spots)
    .map((spot) => {
      const dx = look[0] - spot.eye[0]
      const dz = look[1] - spot.eye[1]
      const depth = Math.hypot(dx, dz)
      const align = depth > 1e-6 ? Math.abs((dx * long[0] + dz * long[1]) / depth) : 0
      return { ...spot, seen: sightline(spot.eye, look, polygon), score: depth * (0.7 + 0.3 * align) + spot.bonus }
    })
    .sort((a, b) => Number(b.seen >= 0.99) - Number(a.seen >= 0.99) || b.score - a.score)
  let fallback: (Viewpoint & { blockedBy: string[] }) | null = null
  for (const spot of ranked) {
    const dx = look[0] - spot.eye[0]
    const dz = look[1] - spot.eye[1]
    const depth = Math.hypot(dx, dz)
    // In a small room everything is near: the near field shrinks with the view's depth.
    const reach = Math.min(1, depth / 3)
    for (let step = 0; step <= 6 && (step === 0 || depth - step * 0.25 >= 1.2); step++) {
      const eye: Point = [spot.eye[0] + (dx / depth) * step * 0.25, spot.eye[1] + (dz / depth) * step * 0.25]
      if (!insidePolygon(eye, polygon)) break
      const blockedBy = nearFieldBlockers(eye, look, height, boxes, reach)
      const from = step ? `${spot.from}, stepped ${round(step * 0.25)} m in past the furniture` : spot.from
      if (!blockedBy.length) return { eye, look, from: `${from}, facing ${focal.why}`, blockedBy }
      if (!fallback || blockedBy.length < fallback.blockedBy.length) fallback = { eye, look, from: `${from}, facing ${focal.why}`, blockedBy }
    }
  }
  return fallback ?? { eye: middle, look: Math.hypot(look[0] - middle[0], look[1] - middle[1]) > 0.3 ? look : [middle[0] + 1, middle[1]], from: 'the middle', blockedBy: [] }
}

export class ViewError extends Error {}

/**
 * The camera for one view of one room (or the whole flat without a zone): 'top' a plan-like orthographic view
 * from above, north (-z) up; '3d' a 3/4 view from above, walls toward the camera cut away; 'inside' eye level
 * (1.5 m) from the doorway or corner opposite the room's focal wall, clear of furniture (eyeViewpoint).
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
  const viewpoint = eyeViewpoint(graph, zone, outline)
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
        'you can aim moves), best for gaps, walkways and alignment; "inside" eye level from the doorway or corner opposite the focal wall, best for ' +
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
