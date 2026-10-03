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
// - itemsPerM2: pieces of every kind (hung ones too) per m2 of floor. empty: no piece at all.
// - openFloor: the largest connected stretch of floor farther than 0.9 m from any floor piece, rug or built-in
//   cabinet run (m2, its share of the floor, its centre): an empty corridor or a bare middle shows up here.
// - finishes: the floor's finish and the room-facing wall finishes by length, and whether each is still what the
//   scene started with (the template's or shell's default) when the start scene is given.
// - kitchen: built-in base cabinet runs (part of the shell, not the agent's work) and how much of their length has
//   anything above it on the wall (wall units, shelves, a hung piece): the wall over a counter is the designer's to dress.

type Json = Record<string, any>
export interface Graph {
  nodes: Record<string, unknown>
}
type Vec2 = [number, number]

export interface RoomFacts {
  room: string
  zoneId: string
  areaM2: number
  ceilingM: number | null
  pieces: number
  footprintShare: number
  rugShare: number
  wallLengthM: number
  bareWallM: number
  bareWallShare: number
  itemsPerM2: number
  empty: boolean
  openFloor: { largestM2: number; share: number; centre: Vec2 } | null
  finishes: {
    floor: string | null
    floorUnchanged: boolean | null
    walls: Array<{ finish: string; m: number; unchanged: boolean | null }>
  }
  kitchen: { baseRunM: number; dressedAboveM: number } | null
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

const libraryRef = (ref: unknown) => (typeof ref === 'string' && ref ? ref.replace(/^library:/, '') : null)

/** The slab under a zone: the one whose outline matches the zone's (same centroid, same area within 10%). */
function slabOf(graph: Graph, polygon: Vec2[]): Json | undefined {
  const area = polygonArea(polygon)
  const middle = meanPoint(polygon)
  return (Object.values(graph.nodes) as Json[]).find((n) => {
    if (n.type !== 'slab' || !Array.isArray(n.polygon) || n.polygon.length < 3) return false
    const other = n.polygon as Vec2[]
    return insidePolygon(middle, other) && Math.abs(polygonArea(other) - area) <= 0.1 * area
  })
}

function meanPoint(polygon: Vec2[]): Vec2 {
  return [polygon.reduce((s, p) => s + p[0], 0) / polygon.length, polygon.reduce((s, p) => s + p[1], 0) / polygon.length]
}

/**
 * The finish each wall shows into the room, by length: sampled every 0.1 m along each wall, a face counts where the
 * point just off it lies in the room. A face shows its side tag's slot (interior/exterior), untagged front ->
 * interior and back -> exterior, as Pascal paints it (scene-mcp wall-sides.ts slotForFace).
 */
function wallFinishes(graph: Graph, polygon: Vec2[], start?: Graph) {
  const byFinish = new Map<string, { m: number; unchanged: number; known: boolean }>()
  for (const wall of Object.values(graph.nodes) as Json[]) {
    if (wall.type !== 'wall' || !Array.isArray(wall.start) || !Array.isArray(wall.end)) continue
    const [sx, sz] = wall.start as Vec2
    const [ex, ez] = wall.end as Vec2
    const length = Math.hypot(ex - sx, ez - sz)
    if (length < 1e-6) continue
    const [nx, nz] = [-(ez - sz) / length, (ex - sx) / length]
    const offset = Number(wall.thickness ?? 0.2) / 2 + 0.1
    const n = Math.max(1, Math.round(length / STEP))
    for (const [face, sign] of [['front', 1], ['back', -1]] as const) {
      let m = 0
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n
        if (insidePolygon([sx + (ex - sx) * t + nx * offset * sign, sz + (ez - sz) * t + nz * offset * sign], polygon)) m += length / n
      }
      if (m < 0.05) continue
      const tag = face === 'front' ? wall.frontSide : wall.backSide
      const slot = tag === 'interior' || tag === 'exterior' ? tag : face === 'front' ? 'interior' : 'exterior'
      const finish = libraryRef(wall.slots?.[slot]) ?? 'default'
      const before = start ? (start.nodes[wall.id] as Json | undefined) : undefined
      const unchanged = before ? (libraryRef(before.slots?.[slot]) ?? 'default') === finish : false
      const entry = byFinish.get(finish) ?? { m: 0, unchanged: 0, known: Boolean(start) }
      entry.m += m
      if (unchanged) entry.unchanged += m
      byFinish.set(finish, entry)
    }
  }
  return [...byFinish.entries()]
    .sort((a, b) => b[1].m - a[1].m)
    .map(([finish, e]) => ({ finish, m: round(e.m, 10), unchanged: e.known ? e.unchanged >= e.m / 2 : null }))
}

/** Built-in base runs (cabinet nodes) standing in the room, and how much of their length has something above it. */
function kitchenFacts(graph: Graph, polygon: Vec2[], inRoom: Piece[]) {
  const cabinets = (Object.values(graph.nodes) as Json[]).filter((n) => n.type === 'cabinet' && Array.isArray(n.position))
  const base = cabinets.filter((c) => (c.runTier ?? 'base') === 'base' && insidePolygon([c.position[0], c.position[2]], polygon))
  if (!base.length) return null
  const above = [
    ...cabinets.filter((c) => c.runTier === 'wall' || c.runTier === 'tall').map((c) => cabinetPiece(c)),
    ...inRoom.filter((p) => p.hung || (p.h >= 1.5 && p.y < 0.05)),
  ]
  let run = 0
  let dressed = 0
  for (const c of base) {
    const piece = cabinetPiece(c)
    const n = Math.max(1, Math.round(piece.w / STEP))
    for (let k = 0; k < n; k++) {
      const along = -piece.w / 2 + (piece.w * (k + 0.5)) / n
      const point: Vec2 = [piece.at[0] + Math.cos(piece.rot) * along, piece.at[1] - Math.sin(piece.rot) * along]
      run += piece.w / n
      if (above.some((p) => p !== piece && nearPiece(point, p, 0.45))) dressed += piece.w / n
    }
  }
  return { baseRunM: round(run, 10), dressedAboveM: round(dressed, 10) }
}

function cabinetPiece(c: Json): Piece {
  const yaw = Number(Array.isArray(c.rotation) ? c.rotation[1] : c.rotation ?? 0)
  const h = Number(c.plinthHeight ?? 0.1) + Number(c.carcassHeight ?? 0.8)
  return {
    name: String(c.name ?? c.id), role: 'storage', at: [Number(c.position[0]), Number(c.position[2])], y: c.runTier === 'wall' ? 1.4 : 0,
    w: Number(c.width ?? 0.6), h: c.runTier === 'tall' ? 2.2 : h, d: Number(c.depth ?? 0.6), rot: yaw, hung: c.runTier === 'wall', mount: 'floor',
  }
}

const OPEN_MARGIN = 0.9
const GRID = 0.2

/** The largest connected patch of floor cells farther than OPEN_MARGIN from every floor piece, rug and cabinet run. */
function openFloor(polygon: Vec2[], area: number, blockers: Piece[]): RoomFacts['openFloor'] {
  const xs = polygon.map((p) => p[0])
  const zs = polygon.map((p) => p[1])
  const [x0, z0] = [Math.min(...xs), Math.min(...zs)]
  const cols = Math.ceil((Math.max(...xs) - x0) / GRID)
  const rows = Math.ceil((Math.max(...zs) - z0) / GRID)
  const open = new Set<number>()
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const point: Vec2 = [x0 + (i + 0.5) * GRID, z0 + (j + 0.5) * GRID]
      if (insidePolygon(point, polygon) && !blockers.some((p) => nearPiece(point, p, OPEN_MARGIN))) open.add(i * rows + j)
    }
  }
  let best: number[] = []
  const seen = new Set<number>()
  for (const cell of open) {
    if (seen.has(cell)) continue
    const patch: number[] = []
    const queue = [cell]
    seen.add(cell)
    while (queue.length) {
      const c = queue.pop()!
      patch.push(c)
      const [i, j] = [Math.floor(c / rows), c % rows]
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [ni, nj] = [i + di!, j + dj!]
        const next = ni * rows + nj
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || seen.has(next) || !open.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    if (patch.length > best.length) best = patch
  }
  const m2 = Math.min(best.length * GRID * GRID, area)
  if (m2 < 0.5) return null
  const centre: Vec2 = [
    round(x0 + (best.reduce((s, c) => s + Math.floor(c / rows), 0) / best.length + 0.5) * GRID, 10),
    round(z0 + (best.reduce((s, c) => s + (c % rows), 0) / best.length + 0.5) * GRID, 10),
  ]
  return { largestM2: round(m2, 10), share: round(m2 / (area || 1)), centre }
}

/**
 * Facts for every zone that holds at least one item, or only for `rooms` (zone ids or names, empty rooms too).
 * With the scene the agent started from (`start`), the finishes say whether they are still its defaults.
 */
export function roomFacts(graph: Graph, rooms?: string[], start?: Graph): RoomFacts[] {
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
    if (wanted ? !wanted.includes(name.toLowerCase()) && !wanted.includes(String(zone.id).toLowerCase()) : !inRoom.length) continue
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
    const cabinets = (Object.values(graph.nodes) as Json[])
      .filter((n) => n.type === 'cabinet' && Array.isArray(n.position) && n.runTier !== 'wall' && insidePolygon([n.position[0], n.position[2]], polygon))
      .map(cabinetPiece)
    const slab = slabOf(graph, polygon)
    const startSlab = slab && start ? (start.nodes[slab.id] as Json | undefined) : undefined
    const floorFinish = libraryRef(slab?.slots?.surface)
    out.push({
      room: name,
      zoneId: String(zone.id),
      areaM2: round(area, 10),
      ceilingM: typeof zone.ceilingHeight === 'number' ? round(zone.ceilingHeight) : null,
      pieces: inRoom.length,
      footprintShare: round(floor.filter((p) => p.role !== 'rug').reduce((s, p) => s + p.w * p.d, 0) / (area || 1)),
      rugShare: round(floor.filter((p) => p.role === 'rug').reduce((s, p) => s + p.w * p.d, 0) / (area || 1)),
      wallLengthM: round(wall, 10),
      bareWallM: round(bare, 10),
      bareWallShare: round(bare / (wall || 1)),
      itemsPerM2: round(inRoom.length / (area || 1)),
      empty: inRoom.length === 0,
      openFloor: openFloor(polygon, area, [...floor, ...cabinets]),
      finishes: {
        floor: floorFinish,
        floorUnchanged: slab && start ? (startSlab ? libraryRef(startSlab.slots?.surface) === floorFinish : false) : null,
        walls: wallFinishes(graph, polygon, start),
      },
      kitchen: kitchenFacts(graph, polygon, inRoom),
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

/**
 * Zones the agent changed between the start scene and its result: an item added, removed, moved or turned in it,
 * its floor refinished, or a wall face that looks into it repainted.
 */
export function changedZones(graph: Graph, start: Graph): string[] {
  const zones = (Object.values(graph.nodes) as Json[]).filter((n) => n.type === 'zone' && Array.isArray(n.polygon) && n.polygon.length >= 3)
  const changed = new Set<string>()
  const mark = (point: Vec2) => {
    for (const zone of zones) if (insidePolygon(point, zone.polygon)) changed.add(String(zone.id))
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  for (const [id, node] of Object.entries(graph.nodes) as Array<[string, Json]>) {
    const before = start.nodes[id] as Json | undefined
    if (node.type === 'item' && (!before || !same(before.position, node.position) || !same(before.rotation, node.rotation) || before.parentId !== node.parentId)) {
      mark(worldPose(node, graph.nodes).at)
      if (before) mark(worldPose(before, start.nodes).at)
    }
    if (node.type === 'slab' && Array.isArray(node.polygon) && !same(before?.slots, node.slots)) mark(meanPoint(node.polygon))
    if (node.type === 'wall' && Array.isArray(node.start) && Array.isArray(node.end) && !same(before?.slots, node.slots)) {
      const [sx, sz] = node.start as Vec2
      const [ex, ez] = node.end as Vec2
      const length = Math.hypot(ex - sx, ez - sz) || 1
      const offset = Number(node.thickness ?? 0.2) / 2 + 0.1
      for (const t of [0.25, 0.5, 0.75]) {
        for (const sign of [1, -1]) mark([sx + (ex - sx) * t - ((ez - sz) / length) * offset * sign, sz + (ez - sz) * t + ((ex - sx) / length) * offset * sign])
      }
    }
  }
  for (const [id, node] of Object.entries(start.nodes) as Array<[string, Json]>) {
    if (node.type === 'item' && !(id in graph.nodes)) mark(worldPose(node, start.nodes).at)
  }
  return zones.map((z) => String(z.id)).filter((id) => changed.has(id))
}
