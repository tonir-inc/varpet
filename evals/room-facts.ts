// Measured facts about each furnished room of a proposal graph, for the critic: context to look at the renders
// with, not pass/fail thresholds. Pure, so it is tested without a render or a turn.
//
// Definitions (what each number means, so the critic can weigh it):
// - footprintShare: floor-standing pieces (rugs and wall-hung pieces left out) as a share of the floor area.
// - rugShare: rugs as a share of the floor area.
// - wallLength: the room outline minus door and window openings. bareWall: the part of it with no piece standing
//   against it (within 0.35 m) and nothing hung on it.
// - seatsWithoutSurface / seatsWithoutLight: seats and beds with no table-like surface within 0.6 m, or no lamp
//   within 1.2 m (plan distance between footprints; a pendant over a table counts for the chairs around it).

type Json = Record<string, any>
export interface Graph {
  nodes: Record<string, unknown>
}
type Vec2 = [number, number]

export interface RoomFacts {
  room: string
  areaM2: number
  ceilingM: number | null
  pieces: number
  footprintShare: number
  rugShare: number
  wallLengthM: number
  bareWallM: number
  counts: {
    seating: number
    beds: number
    surfaces: number
    storage: number
    lights: { floor: number; table: number; ceiling: number; wall: number }
    rugs: number
    softTextiles: number
    wallDecor: number
    plants: number
    objects: number
  }
  seatsWithoutSurface: string[]
  seatsWithoutLight: string[]
}

export type Role = 'seat' | 'bed' | 'surface' | 'storage' | 'light' | 'rug' | 'textile' | 'wallDecor' | 'plant' | 'object' | 'other'

const ROLE_BY_CATEGORY: Record<string, Role> = {
  sofa: 'seat', chair: 'seat', armchair: 'seat', bench: 'seat', stool: 'seat', pouf: 'seat', ottoman: 'seat',
  bed: 'bed',
  table: 'surface', desk: 'surface', nightstand: 'surface', console: 'surface',
  cabinet: 'storage', wardrobe: 'storage', dresser: 'storage', shelf: 'storage', bookcase: 'storage', sideboard: 'storage',
  lamp: 'light', light: 'light', lighting: 'light',
  rug: 'rug',
  curtain: 'textile', textile: 'textile', cushion: 'textile', pillow: 'textile', throw: 'textile', bedding: 'textile',
  wall_art: 'wallDecor', art: 'wallDecor', mirror: 'wallDecor',
  plant: 'plant',
  decor: 'object', books: 'object', vase: 'object', accessory: 'object',
}

const ROLE_BY_NAME: Array<[RegExp, Role]> = [
  [/\b(rug|carpet|kilim)\b/i, 'rug'],
  [/\b(curtain|drape|throw|cushion|pillow|blanket|bedspread)s?\b/i, 'textile'],
  [/\b(lamp|pendant|chandelier|sconce|light)\b/i, 'light'],
  [/\b(canvas|print|poster|painting|artwork|wall art|mirror|frame)\b/i, 'wallDecor'],
  [/\b(plant|tree|ficus|monstera|palm|cactus|fern|olive)\b/i, 'plant'],
  [/\bbed\b/i, 'bed'],
  [/\b(sofa|couch|loveseat|armchair|chair|bench|stool|pouf|ottoman)\b/i, 'seat'],
  [/\b(nightstand|bedside|side table|coffee table|table|desk|console)\b/i, 'surface'],
  [/\b(wardrobe|dresser|chest|cabinet|sideboard|bookcase|shelf|shelving|credenza|tv unit|tv bench)\b/i, 'storage'],
  [/\b(vase|book|candle|bowl|sculpture|tray|clock|basket)s?\b/i, 'object'],
]

export function roleOf(item: Json): Role {
  const category = String(item.asset?.category ?? '').toLowerCase()
  if (ROLE_BY_CATEGORY[category]) return ROLE_BY_CATEGORY[category]!
  const name = String(item.asset?.name ?? item.name ?? '')
  return ROLE_BY_NAME.find(([pattern]) => pattern.test(name))?.[1] ?? 'other'
}

const round = (n: number, step = 100) => Math.round(n * step) / step

export function polygonArea(polygon: Vec2[]) {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i]!
    const [x2, z2] = polygon[(i + 1) % polygon.length]!
    sum += x1 * z2 - x2 * z1
  }
  return Math.abs(sum) / 2
}

export function insidePolygon(point: Vec2, polygon: Vec2[]) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!
    const [xj, zj] = polygon[j]!
    if (zi > point[1] !== zj > point[1] && point[0] < ((xj - xi) * (point[1] - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

interface Piece {
  name: string
  role: Role
  at: Vec2
  y: number
  w: number
  h: number
  d: number
  rot: number
  hung: boolean
  mount: 'floor' | 'wall' | 'ceiling'
}

/**
 * Where an item stands in the flat. place_product hangs wall pieces as wall children in the wall's frame
 * ([along, bottom, +-thickness/2], rotation about the wall) and ceiling pieces as ceiling children ([x, -drop, z]);
 * floor and surface pieces are level children in plan coordinates. `at` is the plan point the piece covers (a wall
 * piece's centre in front of its face), `y` its bottom above the floor, `rot` its yaw in the flat.
 */
export function worldPose(node: Json, nodes: Record<string, unknown>): { at: Vec2; y: number; rot: number; mount: 'floor' | 'wall' | 'ceiling' } {
  const position = (node.position ?? [0, 0, 0]) as number[]
  const yaw = Number(node.rotation?.[1] ?? (typeof node.rotation === 'number' ? node.rotation : 0))
  const parent = nodes[String(node.parentId)] as Json | undefined
  if (parent?.type === 'wall' && Array.isArray(parent.start) && Array.isArray(parent.end)) {
    const [sx, sz] = parent.start as Vec2
    const [ex, ez] = parent.end as Vec2
    const length = Math.hypot(ex - sx, ez - sz) || 1
    const dir: Vec2 = [(ex - sx) / length, (ez - sz) / length]
    const normal: Vec2 = [-dir[1], dir[0]]
    const face = Number(position[2] ?? 0)
    const depth = Number(node.asset?.dimensions?.[2] ?? 0.05)
    const out = face + (face < 0 ? -1 : 1) * Math.max(depth / 2, 0.1)
    const along = Number(position[0] ?? 0)
    return {
      at: [sx + dir[0] * along + normal[0] * out, sz + dir[1] * along + normal[1] * out],
      y: Number(position[1] ?? 0),
      rot: Math.atan2(-dir[1], dir[0]) + yaw,
      mount: 'wall',
    }
  }
  if (parent?.type === 'ceiling') {
    const level = Object.values(nodes).find((n) => (n as Json).type === 'level') as Json | undefined
    const height = Number(parent.height ?? level?.height ?? 2.7)
    const [cx = 0, , cz = 0] = (parent.position ?? [0, 0, 0]) as number[]
    return { at: [cx + Number(position[0] ?? 0), cz + Number(position[2] ?? 0)], y: height + Number(position[1] ?? 0), rot: yaw, mount: 'ceiling' }
  }
  return { at: [Number(position[0] ?? 0), Number(position[2] ?? 0)], y: Number(position[1] ?? 0), rot: yaw, mount: 'floor' }
}

function pieceOf(node: Json, nodes: Record<string, unknown>): Piece {
  const [w = 0.5, h = 0.5, d = 0.5] = (node.asset?.dimensions ?? []) as number[]
  const pose = worldPose(node, nodes)
  const role = roleOf(node)
  return {
    name: String(node.asset?.name ?? node.name ?? node.id).slice(0, 60),
    role,
    at: pose.at,
    y: pose.y,
    w, h, d,
    rot: pose.rot,
    // Hung: on a wall (mounted, or off the floor and thin: art, mirrors, sconces, wall shelves) or from the ceiling.
    hung: pose.mount !== 'floor' || (pose.y >= 0.3 && Math.min(w, d) <= 0.12),
    mount: pose.mount,
  }
}

/** Half extents of a piece's plan footprint along x and z, after its rotation. */
function halfExtents(p: Piece): Vec2 {
  const c = Math.abs(Math.cos(p.rot))
  const s = Math.abs(Math.sin(p.rot))
  return [(p.w * c + p.d * s) / 2, (p.w * s + p.d * c) / 2]
}

/** Plan distance between two footprints (0 when they touch or overlap). */
export function gap(a: Piece, b: Piece) {
  const [ax, az] = halfExtents(a)
  const [bx, bz] = halfExtents(b)
  const gx = Math.max(0, Math.abs(a.at[0] - b.at[0]) - ax - bx)
  const gz = Math.max(0, Math.abs(a.at[1] - b.at[1]) - az - bz)
  return Math.hypot(gx, gz)
}

/** Whether a plan point lies within `margin` of a piece's rotated footprint. */
function nearPiece(point: Vec2, p: Piece, margin: number) {
  const dx = point[0] - p.at[0]
  const dz = point[1] - p.at[1]
  const c = Math.cos(p.rot)
  const s = Math.sin(p.rot)
  const lx = dx * c - dz * s
  const lz = dx * s + dz * c
  return Math.abs(lx) <= p.w / 2 + margin && Math.abs(lz) <= p.d / 2 + margin
}

function distanceToSegment(point: Vec2, a: Vec2, b: Vec2) {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]]
  const len2 = dx * dx + dz * dz || 1e-9
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / len2))
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz))
}

/** Door and window openings as plan segments, from each wall's children (centre = wall.start + u * position[0]). */
function openings(graph: Graph): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = []
  for (const node of Object.values(graph.nodes) as Json[]) {
    if (node.type !== 'door' && node.type !== 'window') continue
    const wall = graph.nodes[node.wallId ?? node.parentId] as Json | undefined
    if (!wall?.start || !wall?.end) continue
    const [sx, sz] = wall.start as Vec2
    const [ex, ez] = wall.end as Vec2
    const len = Math.hypot(ex - sx, ez - sz) || 1
    const [ux, uz] = [(ex - sx) / len, (ez - sz) / len]
    const centre = Number(node.position?.[0] ?? 0)
    const half = Number(node.width ?? 0.9) / 2
    out.push([
      [sx + ux * (centre - half), sz + uz * (centre - half)],
      [sx + ux * (centre + half), sz + uz * (centre + half)],
    ])
  }
  return out
}

const STEP = 0.1

/** Facts for every zone that holds at least one item (or only `rooms`, when given). */
export function roomFacts(graph: Graph, rooms?: string[]): RoomFacts[] {
  const nodes = Object.values(graph.nodes) as Json[]
  const zones = nodes.filter((n) => n.type === 'zone' && Array.isArray(n.polygon) && n.polygon.length >= 3)
  const pieces = nodes.filter((n) => n.type === 'item').map((n) => pieceOf(n, graph.nodes))
  const gaps = openings(graph)
  const wanted = rooms?.map((r) => r.toLowerCase())
  const out: RoomFacts[] = []
  for (const zone of zones) {
    const name = String(zone.name ?? zone.id)
    const polygon = zone.polygon as Vec2[]
    const inRoom = pieces.filter((p) => insidePolygon(p.at, polygon))
    if (wanted ? !wanted.includes(name.toLowerCase()) : !inRoom.length) continue
    const area = polygonArea(polygon)
    const floor = inRoom.filter((p) => !p.hung && p.y < 0.05)

    let wall = 0
    let bare = 0
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!
      const b = polygon[(i + 1) % polygon.length]!
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n = Math.max(1, Math.round(len / STEP))
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n
        const point: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        if (gaps.some(([g0, g1]) => distanceToSegment(point, g0, g1) < 0.3)) continue
        wall += len / n
        const dressed = inRoom.some((p) => p.role !== 'rug' && (p.hung ? nearPiece(point, p, 0.35) : p.y < 0.05 && nearPiece(point, p, 0.35)))
        if (!dressed) bare += len / n
      }
    }

    const seats = inRoom.filter((p) => p.role === 'seat' || p.role === 'bed')
    const surfaces = inRoom.filter((p) => p.role === 'surface' || p.role === 'storage')
    const lights = inRoom.filter((p) => p.role === 'light')
    const lightKind = (p: Piece) =>
      p.mount === 'ceiling' || (p.mount === 'floor' && (/pendant|chandelier|ceiling/i.test(p.name) || p.y >= 1.5))
        ? 'ceiling'
        : p.hung || /sconce|wall light/i.test(p.name) ? 'wall' : p.y < 0.05 && p.h >= 1 ? 'floor' : 'table'
    const count = (role: Role) => inRoom.filter((p) => p.role === role).length
    out.push({
      room: name,
      areaM2: round(area, 10),
      ceilingM: typeof zone.ceilingHeight === 'number' ? round(zone.ceilingHeight) : null,
      pieces: inRoom.length,
      footprintShare: round(floor.filter((p) => p.role !== 'rug').reduce((s, p) => s + p.w * p.d, 0) / (area || 1)),
      rugShare: round(floor.filter((p) => p.role === 'rug').reduce((s, p) => s + p.w * p.d, 0) / (area || 1)),
      wallLengthM: round(wall, 10),
      bareWallM: round(bare, 10),
      counts: {
        seating: count('seat'),
        beds: count('bed'),
        surfaces: count('surface'),
        storage: count('storage'),
        lights: {
          floor: lights.filter((p) => lightKind(p) === 'floor').length,
          table: lights.filter((p) => lightKind(p) === 'table').length,
          ceiling: lights.filter((p) => lightKind(p) === 'ceiling').length,
          wall: lights.filter((p) => lightKind(p) === 'wall').length,
        },
        rugs: count('rug'),
        softTextiles: count('textile'),
        wallDecor: count('wallDecor'),
        plants: count('plant'),
        objects: count('object'),
      },
      seatsWithoutSurface: seats.filter((s) => !surfaces.some((t) => gap(s, t) <= 0.6)).map((s) => s.name),
      seatsWithoutLight: seats.filter((s) => !lights.some((l) => gap(s, l) <= 1.2)).map((s) => s.name),
    })
  }
  return out
}
