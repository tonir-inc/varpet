// How a catalog product goes up, and where Pascal hangs it. Pascal mounts items three ways: on the floor (a level
// child), on a wall face (`asset.attachTo: 'wall-side'`, a wall child in the wall's frame: x along the wall from its
// start, y up from the floor, z through the wall, `side` front = the wall's left normal), or under a ceiling
// (`attachTo: 'ceiling'`, a ceiling child in level x/z, y down from the ceiling plane). The editor's own placement
// tools write the same nodes (placement-strategies.ts wallStrategy / ceilingStrategy), so a person can then drag
// a hung piece along its wall or ceiling. Everything here is pure: nodes in, a node pose out.
import { resolveCeilingHeight } from '@pascal-app/core'
import { facesToward, type WallFace } from './wall-sides.ts'

export type Mount = 'floor' | 'surface' | 'wall' | 'ceiling'
export const MOUNTS = ['floor', 'surface', 'wall', 'ceiling'] as const

type Point = [number, number]
type AnyNode = { id: string; type: string; parentId?: string | null; [key: string]: unknown }
type Nodes = Record<string, AnyNode>

const PLACEMENT: Record<string, Mount> = {
  floor: 'floor',
  surface: 'surface',
  wall: 'wall',
  'wall-mounted': 'wall',
  ceiling: 'ceiling',
  'ceiling-mounted': 'ceiling',
}

const WALL_WORDS = /\bsconces?\b|\bwall[- ]?(mount(ed)?|hung|light|lamp|fixture|shel(f|ves)|cabinet|clock|decor|sculpture|hanging)\b|\bfloating shel|\bpicture light|\bvanity light/i
const CEILING_WORDS = /\bpendants?\b|\bchandeliers?\b|\bceiling\b|\bflush[- ]?mount|\bhanging (light|lamp)/i
const SURFACE_LAMP = /\b(table|desk|bedside|nightstand|accent|mini|buffet|piano) lamp|\blamp,? (table|desk)\b/i
const FLOOR_MIRROR = /\bfloor\b|\bstanding\b|full[- ]length|\blean(er|ing)\b|\bcheval\b/i
const SURFACE_MIRROR = /\bvanity\b|\btable ?top\b|\btable mirror|\bmakeup\b|\bcountertop\b/i
const SURFACE_CLOCK = /\b(table|desk|mantel|alarm|shelf) clock|\bclock,? (table|desk|mantel)\b/i
const ALWAYS_WALL = new Set(['wall_art', 'wall_hanging', 'curtain', 'blind', 'radiator'])
const SURFACE_KINDS = new Set(['decor', 'laptop', 'computer', 'monitor', 'printer', 'game_console', 'microwave', 'speaker', 'vase', 'candle', 'book', 'books'])

/**
 * Where a catalog item goes: the catalog's explicit placement tag when it has one, else its kind and name.
 * `size` is Pascal's [w, h, d]. A default, not a rule: place_product takes `mount` to override it (a TV on a wall).
 */
export function mountOf(item: { kind: string; name: string; placement?: string | null; size?: [number, number, number] }): Mount {
  const tagged = item.placement ? PLACEMENT[item.placement.trim().toLowerCase()] : undefined
  if (tagged) return tagged
  const { kind, name } = item
  const height = item.size?.[1] ?? 1
  if (ALWAYS_WALL.has(kind)) return 'wall'
  switch (kind) {
    case 'light':
      if (WALL_WORDS.test(name)) return 'wall'
      if (/\bfloor lamp\b/i.test(name)) return 'floor'
      if (SURFACE_LAMP.test(name)) return 'surface'
      return 'ceiling'
    case 'lamp':
      if (WALL_WORDS.test(name)) return 'wall'
      if (CEILING_WORDS.test(name)) return 'ceiling'
      if (/\bfloor\b/i.test(name)) return 'floor'
      if (SURFACE_LAMP.test(name)) return 'surface'
      return height >= 1 ? 'floor' : 'surface'
    case 'mirror':
      if (FLOOR_MIRROR.test(name)) return 'floor'
      if (SURFACE_MIRROR.test(name)) return 'surface'
      return 'wall'
    case 'clock':
      return SURFACE_CLOCK.test(name) ? 'surface' : 'wall'
    case 'fan':
      return CEILING_WORDS.test(name) ? 'ceiling' : 'floor'
    case 'tv':
      return 'surface'
    case 'plant':
      return height >= 0.6 ? 'floor' : 'surface'
  }
  if (WALL_WORDS.test(name)) return 'wall'
  if (SURFACE_KINDS.has(kind)) return 'surface'
  return 'floor'
}

// ---- geometry ----

const OUTDOOR_ZONE = /balcon|loggia|terrace|patio/i
const round = (value: number) => Math.round(value * 1000) / 1000

function insidePolygon([x, y]: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function polygonCentroid(polygon: Point[]): Point {
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
  if (Math.abs(area) < 1e-9) return polygon[0] ?? [0, 0]
  return [cx / (3 * area), cy / (3 * area)]
}

interface WallFrame {
  start: Point
  dir: Point
  /** The front face's normal (Pascal: left normal of start -> end). */
  normal: Point
  length: number
  thickness: number
  height: number
}

function wallFrame(wall: AnyNode): WallFrame | null {
  const start = wall.start as Point | undefined
  const end = wall.end as Point | undefined
  if (!start || !end) return null
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const length = Math.hypot(dx, dz)
  if (length < 1e-6) return null
  return {
    start,
    dir: [dx / length, dz / length],
    normal: [-dz / length, dx / length],
    length,
    thickness: (wall.thickness as number | undefined) ?? 0.1,
    height: (wall.height as number | undefined) ?? 2.5,
  }
}

function levelOf(nodes: Nodes, id: string): string | null {
  let node: AnyNode | undefined = nodes[id]
  while (node) {
    if (node.type === 'level') return node.id
    node = node.parentId ? nodes[node.parentId] : undefined
  }
  return null
}

function zonesOnLevel(nodes: Nodes, levelId: string) {
  return Object.values(nodes).filter(
    (n) => n.type === 'zone' && levelOf(nodes, n.id) === levelId && Array.isArray(n.polygon) && (n.polygon as Point[]).length >= 3,
  )
}

function distanceToSegment([px, pz]: Point, frame: WallFrame) {
  const along = Math.max(0, Math.min(frame.length, (px - frame.start[0]) * frame.dir[0] + (pz - frame.start[1]) * frame.dir[1]))
  const x = frame.start[0] + frame.dir[0] * along
  const z = frame.start[1] + frame.dir[1] * along
  return Math.hypot(px - x, pz - z)
}

/** The nearest wall on the level to a floor point, among walls with a face toward `zone` when given. */
export function nearestWall(nodes: Nodes, levelId: string, point: Point, zone?: AnyNode | null): { wall: AnyNode; distance: number } | null {
  let best: { wall: AnyNode; distance: number } | null = null
  for (const wall of Object.values(nodes)) {
    if (wall.type !== 'wall' || levelOf(nodes, wall.id) !== levelId) continue
    const frame = wallFrame(wall)
    if (!frame) continue
    if (zone && facesToward(wall, zone.polygon as Point[]).length === 0) continue
    const distance = Math.max(0, distanceToSegment(point, frame) - frame.thickness / 2)
    if (!best || distance < best.distance) best = { wall, distance }
  }
  return best
}

export interface WallPoseRequest {
  /** Metres from the wall's start to the piece's centre; default the projection of `point`, else the middle. */
  along?: number
  /** Bottom edge above the floor, metres. */
  bottom: number
  /** A floor point on the room side of the wall: picks the face. */
  point?: Point
  /** The room the piece faces: picks the face. */
  zone?: AnyNode | null
  /** Pascal [w, h, d]. */
  size: [number, number, number]
  /** Skip the "covers an opening" note for these openings (curtains over their window). */
  coversOpening?: string
  /** Curtains and blinds cover windows by design: only doors they run over are noted. */
  windowsAllowed?: boolean
}

export interface WallPose {
  wallId: string
  side: WallFace
  position: [number, number, number]
  rotationY: number
  wallT: number
  along: number
  bottom: number
  top: number
  /** The piece's centre in level coordinates. */
  center: [number, number, number]
  /** Unit direction the piece faces, in level x/z. */
  facing: Point
  notes: string[]
}

/** Which face of a wall a piece hangs on: toward the given point, else the given room, else the one room it borders. */
export function wallFace(nodes: Nodes, wall: AnyNode, point?: Point, zone?: AnyNode | null): { side: WallFace } | { error: string } {
  const frame = wallFrame(wall)
  if (!frame) return { error: `bad_wall: ${wall.id} has no length` }
  if (point) {
    const offset = (point[0] - frame.start[0]) * frame.normal[0] + (point[1] - frame.start[1]) * frame.normal[1]
    if (Math.abs(offset) > 1e-6) return { side: offset > 0 ? 'front' : 'back' }
  }
  if (zone) {
    const faces = facesToward(wall, zone.polygon as Point[])
    if (faces.length === 1) return { side: faces[0]! }
    if (faces.length === 0) return { error: `wall_not_in_room: ${wall.id} has no face toward ${zone.id} (${String(zone.name ?? '')})` }
  }
  const levelId = levelOf(nodes, wall.id)
  const rooms = levelId
    ? zonesOnLevel(nodes, levelId).filter((z) => !OUTDOOR_ZONE.test(String(z.name ?? '')))
    : []
  const front = rooms.filter((z) => facesToward(wall, z.polygon as Point[]).includes('front'))
  const back = rooms.filter((z) => facesToward(wall, z.polygon as Point[]).includes('back'))
  if (front.length && !back.length) return { side: 'front' }
  if (back.length && !front.length) return { side: 'back' }
  if (front.length && back.length) {
    const names = [...front, ...back].map((z) => `${z.id} (${String(z.name ?? '')})`).join(', ')
    return { error: `ambiguous_side: ${wall.id} has rooms on both sides (${names}); pass target_id = the room's zone id` }
  }
  if (wall.frontSide === 'interior' && wall.backSide !== 'interior') return { side: 'front' }
  if (wall.backSide === 'interior' && wall.frontSide !== 'interior') return { side: 'back' }
  return { side: 'front' }
}

/** Where a wall piece goes: Pascal's wall-side pose on the chosen face, with notes on anything it runs into. */
export function wallPose(nodes: Nodes, wall: AnyNode, request: WallPoseRequest): WallPose | { error: string } {
  const frame = wallFrame(wall)
  if (!frame) return { error: `bad_wall: ${wall.id} has no length` }
  const face = wallFace(nodes, wall, request.point, request.zone)
  if ('error' in face) return face
  const [w, h, d] = request.size
  const notes: string[] = []
  let along = request.along
  if (along === undefined && request.point) {
    along = (request.point[0] - frame.start[0]) * frame.dir[0] + (request.point[1] - frame.start[1]) * frame.dir[1]
  }
  along ??= frame.length / 2
  const half = w / 2
  if (w > frame.length) notes.push(`wider than the wall: ${round(w)} m on a ${round(frame.length)} m wall`)
  const clampedAlong = w > frame.length ? frame.length / 2 : Math.min(frame.length - half, Math.max(half, along))
  if (Math.abs(clampedAlong - along) > 1e-3) notes.push(`moved along the wall to stay on it: centre ${round(clampedAlong)} m from the wall start (asked ${round(along)})`)
  along = clampedAlong
  let bottom = request.bottom
  if (bottom < 0) {
    notes.push(`bottom raised to the floor (asked ${round(bottom)} m)`)
    bottom = 0
  }
  if (bottom + h > frame.height + 1e-3) {
    const lowered = Math.max(0, frame.height - h)
    notes.push(`lowered to fit under the ${round(frame.height)} m wall: bottom ${round(lowered)} m (asked ${round(bottom)})`)
    bottom = lowered
  }
  {
    for (const childId of (wall.children as string[] | undefined) ?? []) {
      const opening = nodes[childId]
      if (!opening || (opening.type !== 'door' && opening.type !== 'window') || opening.id === request.coversOpening) continue
      if (request.windowsAllowed && opening.type === 'window') continue
      const [ox, oy] = (opening.position as number[] | undefined) ?? [0, 0]
      const ow = (opening.width as number | undefined) ?? 0
      const oh = (opening.height as number | undefined) ?? 0
      const overlapX = Math.min(along + half, ox! + ow / 2) - Math.max(along - half, ox! - ow / 2)
      const overlapY = Math.min(bottom + h, oy! + oh / 2) - Math.max(bottom, oy! - oh / 2)
      if (overlapX > 0.01 && overlapY > 0.01) {
        notes.push(`covers ${opening.type} ${opening.id} (${round(ox! - ow / 2)}-${round(ox! + ow / 2)} m along, ${round(oy! - oh / 2)}-${round(oy! + oh / 2)} m up)`)
      }
    }
  }
  const sign = face.side === 'front' ? 1 : -1
  const out = sign * (frame.thickness / 2 + d / 2)
  const cx = frame.start[0] + frame.dir[0] * along + frame.normal[0] * out
  const cz = frame.start[1] + frame.dir[1] * along + frame.normal[1] * out
  return {
    wallId: wall.id,
    side: face.side,
    // Same pose the editor's wall placement writes (resolveWallPlacementPose): wall-local, on the face.
    position: [round(along), round(bottom), round(sign * (frame.thickness / 2))],
    rotationY: face.side === 'front' ? 0 : Math.PI,
    wallT: round(along / frame.length),
    along: round(along),
    bottom: round(bottom),
    top: round(bottom + h),
    center: [round(cx), round(bottom + h / 2), round(cz)],
    facing: [round(frame.normal[0] * sign), round(frame.normal[1] * sign)],
    notes,
  }
}

/** Default bottom edge for a wall piece without a height: art and mirrors centred near eye height, and so on. */
export function defaultWallBottom(kind: string, name: string, size: [number, number, number], wallHeight: number): number {
  const h = size[1]
  const centred = (centre: number) => Math.max(0.1, centre - h / 2)
  if (kind === 'curtain') return Math.max(0.01, wallHeight - 0.05 - h)
  if (kind === 'blind') return Math.max(0.3, wallHeight - 0.25 - h)
  if (kind === 'tv') return centred(1.2)
  if (kind === 'radiator') return 0.12
  if (kind === 'shelf' || /\bshel(f|ves)\b/i.test(name)) return centred(1.4)
  if (kind === 'lamp' || kind === 'light') return centred(1.6)
  if (kind === 'mirror' && h >= 1.2) return 0.3
  return centred(1.5)
}

/** Curtains and blinds over a window: centred on it, curtains from just above it down to the floor. */
export function windowHang(window: AnyNode, wall: AnyNode, product: { kind: string; name: string }, size: [number, number, number]): { along: number; bottom: number; notes: string[] } {
  const [ox, oy] = (window.position as number[] | undefined) ?? [0, 0]
  const ow = (window.width as number | undefined) ?? 1
  const oh = (window.height as number | undefined) ?? 1
  const wallHeight = (wall.height as number | undefined) ?? 2.5
  const windowTop = oy! + oh / 2
  const [w, h] = size
  const notes: string[] = []
  const curtain = product.kind === 'curtain' || (product.kind !== 'blind' && /\bcurtains?\b|\bdrapes?\b/i.test(product.name))
  const top = curtain ? Math.min(windowTop + 0.15, wallHeight - 0.02) : Math.min(windowTop + 0.05, wallHeight - 0.02)
  let bottom = top - h
  if (bottom < 0.01) bottom = 0.01
  if (curtain && w < ow + 0.2) notes.push(`curtain ${round(w)} m wide on a ${round(ow)} m window: narrower than the window plus 0.1 m each side`)
  if (!curtain && w < ow - 0.02) notes.push(`blind ${round(w)} m wide on a ${round(ow)} m window: does not cover it`)
  if (!curtain && bottom + h > windowTop + 0.2 && h < oh * 0.5) notes.push(`blind ${round(h)} m tall covers less than half the ${round(oh)} m window`)
  return { along: ox!, bottom, notes }
}

export interface CeilingPose {
  ceilingId: string
  position: [number, number, number]
  ceilingHeight: number
  bottom: number
  notes: string[]
}

/** The ceiling over a floor point (the room's own ceiling first) and the pose that hangs a piece from it. */
export function ceilingPose(
  nodes: Nodes,
  levelId: string,
  point: Point | null,
  zone: AnyNode | null,
  size: [number, number, number],
  ceilingId?: string,
): CeilingPose | { error: string } {
  const ceilings = Object.values(nodes).filter(
    (n) =>
      n.type === 'ceiling' &&
      (ceilingId ? n.id === ceilingId : levelOf(nodes, n.id) === levelId) &&
      Array.isArray(n.polygon) &&
      (n.polygon as Point[]).length >= 3,
  )
  if (ceilings.length === 0) {
    return { error: `no_ceiling: level ${levelId} has no ceiling to hang from; add one (create_room makes one per room) or place the piece with mount: 'floor'` }
  }
  const notes: string[] = []
  const at: Point = point ?? (zone ? polygonCentroid(zone.polygon as Point[]) : polygonCentroid(ceilings[0]!.polygon as Point[]))
  const v1Id = (zone?.metadata as { v1Id?: string } | undefined)?.v1Id
  const containing = ceilings.filter((c) => insidePolygon(at, c.polygon as Point[]))
  let ceiling =
    containing.find((c) => v1Id && (c.metadata as { v1Id?: string } | undefined)?.v1Id === v1Id) ??
    containing.find((c) => zone && insidePolygon(polygonCentroid(c.polygon as Point[]), zone.polygon as Point[])) ??
    containing[0]
  if (!ceiling) {
    let best = Infinity
    for (const c of ceilings) {
      const [cx, cz] = polygonCentroid(c.polygon as Point[])
      const dist = Math.hypot(cx - at[0], cz - at[1])
      if (dist < best) {
        best = dist
        ceiling = c
      }
    }
    notes.push(`no ceiling over (${round(at[0])}, ${round(at[1])}); hung from the nearest one, ${ceiling!.id}`)
  }
  if (zone && !insidePolygon(at, zone.polygon as Point[])) notes.push(`(${round(at[0])}, ${round(at[1])}) is outside ${zone.id}`)
  const ceilingHeight = resolveCeilingHeight(ceiling as never, nodes as never)
  const [, h] = size
  const floor = slabElevationAt(nodes, levelId, at)
  const bottom = ceilingHeight - h - floor
  if (bottom < 1.9) notes.push(`hangs down to ${round(bottom)} m above the floor (a ${round(h)} m drop): only over a table or a bed, not a walkway`)
  return {
    ceilingId: ceiling!.id,
    // Same pose the editor's ceiling placement writes (ceilingStrategy): ceiling-local, top at the ceiling.
    position: [round(at[0]), round(-h), round(at[1])],
    ceilingHeight: round(ceilingHeight - floor),
    bottom: round(bottom),
    notes,
  }
}

/** The floor's height at a point: the slab under it (Pascal's default slab top is 0.05 m), else 0. */
function slabElevationAt(nodes: Nodes, levelId: string, at: Point) {
  for (const n of Object.values(nodes)) {
    if (n.type !== 'slab' || levelOf(nodes, n.id) !== levelId || !Array.isArray(n.polygon)) continue
    if (insidePolygon(at, n.polygon as Point[])) return (n.elevation as number | undefined) ?? 0.05
  }
  return 0
}
