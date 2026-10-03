// check_clearances: the gaps a designer measures, from the scene. Pure: nodes in, measured findings out; no verdicts.
// Pieces are floor items on the room's level (level children without `asset.attachTo`), as plan rectangles from
// their dimensions, scale and yaw (front +z at rotation 0, world = R(yaw) local, as place_product writes them).
// Rugs and other flat pieces (<= 5 cm) and pieces standing on something (bottom > 0.25 m) are not obstacles;
// wall-hung and ceiling pieces are not counted. The room boundary is the zone polygon (at the wall faces in our
// flat templates) with the door openings cut out. Pascal's own layout checks (`check_collisions`, the door keep-out
// in its door-clearance.ts) answer "overlaps or not" on boxes and are not exported; the door keep-out depth (0.65 m)
// is mirrored here as the door approach target.

type Point = [number, number]
type AnyNode = { id: string; type: string; parentId?: string | null; [key: string]: unknown }
type Nodes = Record<string, AnyNode>

export const TARGETS = {
  walkway: 'main route 0.9 m; 0.6 m least for a secondary path',
  door_approach: '0.65 m clear in front of the opening (Pascal door keep-out); 0.9 m comfortable',
  door_swing: 'opens fully (90 deg); nothing in the arc',
  dining: '0.9 m from table edge to wall or furniture to pull out a chair and sit (0.75 tight); 1.1 m with a walkway behind',
  bed: 'sides 0.6 m (0.5 tight, 0.7 comfortable); foot 0.6 m, 0.9 m when it is the walkway',
  storage_front: 'wardrobe 0.9 m in front (0.75 with sliding doors); dresser 0.9 m to open drawers and stand',
  seating: 'sofa or armchair front to coffee table 0.4-0.5 m',
  window: 'pieces taller than the sill kept off the glass; low pieces under the sill are fine',
} as const

export type Check = keyof typeof TARGETS

export interface Finding {
  check: Check
  [key: string]: unknown
}

export interface RoomClearances {
  zone: string
  name: string
  findings: Finding[]
  /** Short names of the pieces the findings mention. */
  pieces: Record<string, string>
}

export interface ClearanceReport {
  rooms: RoomClearances[]
  targets: Partial<Record<Check, string>>
  notes?: string[]
}

type Role = 'bed' | 'dining_table' | 'coffee_table' | 'table' | 'sofa' | 'armchair' | 'chair' | 'wardrobe' | 'dresser' | 'desk' | 'other'

interface Piece {
  id: string
  name: string
  role: Role
  center: Point
  half: [number, number]
  /** Local +x (the piece's right at rotation 0) and +z (its front) in world x/z. */
  right: Point
  front: Point
  corners: Point[]
  top: number
}

interface Segment {
  a: Point
  b: Point
  owner: string
}

const r2 = (v: number) => Math.round(v * 100) / 100
const OUTDOOR = /balcon|loggia|terrace|patio/i
const MAX_RAY = 3
const CELL = 0.05

// ---- small geometry ----

function insidePolygon([x, y]: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function pointSegment(p: Point, a: Point, b: Point): { d: number; q: Point } {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2))
  const q: Point = [a[0] + dx * t, a[1] + dz * t]
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q }
}

/** Distance along the ray p + t u (u unit) to segment ab, or Infinity. */
function raySegment(p: Point, u: Point, a: Point, b: Point): number {
  const ex = b[0] - a[0]
  const ez = b[1] - a[1]
  const den = u[0] * ez - u[1] * ex
  if (Math.abs(den) < 1e-12) return Infinity
  const wx = a[0] - p[0]
  const wz = a[1] - p[1]
  const t = (wx * ez - wz * ex) / den
  const s = (wx * u[1] - wz * u[0]) / den
  return t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 ? t : Infinity
}

function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point) {
  const o = (a: Point, b: Point, c: Point) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  return o(p1, p2, q1) !== o(p1, p2, q2) && o(q1, q2, p1) !== o(q1, q2, p2)
}

function segmentHitsPolygon(a: Point, b: Point, poly: Point[]) {
  if (insidePolygon(a, poly) || insidePolygon(b, poly)) return true
  for (let i = 0; i < poly.length; i++) if (segmentsCross(a, b, poly[i]!, poly[(i + 1) % poly.length]!)) return true
  return false
}

function edges(poly: Point[], owner: string): Segment[] {
  return poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length]!, owner }))
}

const add = (p: Point, u: Point, t: number): Point => [p[0] + u[0] * t, p[1] + u[1] * t]
const neg = (u: Point): Point => [-u[0], -u[1]]

/** World compass name of a direction: north is -z (the top views' up). */
function compass([x, z]: Point) {
  return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'east' : 'west') : z > 0 ? 'south' : 'north'
}

// ---- the scene ----

function levelOf(nodes: Nodes, id: string): string | null {
  let node: AnyNode | undefined = nodes[id]
  while (node) {
    if (node.type === 'level') return node.id
    node = node.parentId ? nodes[node.parentId] : undefined
  }
  return null
}

function roleOf(category: string, name: string, height: number, w: number, d: number): Role {
  const n = name.toLowerCase()
  if (category === 'bed' || (/\bbed\b/.test(n) && !/bedside|sofa bed|bed ?side/.test(n))) return 'bed'
  if (category === 'wardrobe' || /wardrobe|armoire|closet/.test(n)) return 'wardrobe'
  if (category === 'dresser' || /dresser|chest of drawers|commode|tallboy/.test(n)) return 'dresser'
  if (category === 'desk' || /\bdesk\b/.test(n)) return 'desk'
  if (category === 'sofa' || /\bsofa\b|couch|loveseat|sectional/.test(n)) return 'sofa'
  if (category === 'table' || /\btable\b/.test(n)) {
    if (/coffee|cocktail/.test(n) || (height < 0.55 && w * d > 0.25 && !/side|end|bedside|night/.test(n))) return 'coffee_table'
    if (/side|end|bedside|night|console|accent/.test(n) || height < 0.6) return 'table'
    if (/dining|kitchen|breakfast/.test(n) || (height >= 0.65 && height <= 0.85 && w * d >= 0.45)) return 'dining_table'
    return 'table'
  }
  if (category === 'chair' || /\bchair\b|stool/.test(n)) return /arm ?chair|lounge|accent|club|wingback/.test(n) ? 'armchair' : 'chair'
  return 'other'
}

function pieceOf(node: AnyNode): Piece | null {
  const asset = node.asset as { attachTo?: string; category?: string; dimensions?: number[] } | undefined
  if (!asset || asset.attachTo || !Array.isArray(asset.dimensions)) return null
  const scale = (node.scale as number[] | undefined) ?? [1, 1, 1]
  const [w, h, d] = asset.dimensions.map((v, i) => Math.abs(v * (scale[i] ?? 1))) as [number, number, number]
  const [x, y, z] = (node.position as number[] | undefined) ?? [0, 0, 0]
  if (![x, y, z, w, h, d].every(Number.isFinite) || w <= 0 || d <= 0) return null
  const name = String(node.name ?? asset.category ?? node.id)
  const category = String(asset.category ?? '')
  if (category === 'rug' || h <= 0.05 || (/\brug\b|carpet|\bmat\b/i.test(name) && h <= 0.06)) return null
  if ((y ?? 0) > 0.25) return null
  const yaw = ((node.rotation as number[] | undefined) ?? [0, 0, 0])[1] ?? 0
  const right: Point = [Math.cos(yaw), -Math.sin(yaw)]
  const front: Point = [Math.sin(yaw), Math.cos(yaw)]
  const center: Point = [x!, z!]
  const half: [number, number] = [w / 2, d / 2]
  const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sz]) => add(add(center, right, sx * half[0]), front, sz * half[1]))
  return { id: node.id, name, role: roleOf(category, name, h, w, d), center, half, right, front, corners, top: (y ?? 0) + h }
}

interface Opening {
  id: string
  /** A passage is a stretch of the room outline with no wall on it (open plan to the next room). */
  kind: 'door' | 'window' | 'passage'
  node: AnyNode
  /** Opening centre on the room face, the jambs there, and the direction into the room. */
  center: Point
  jambs: [Point, Point]
  inward: Point
  /** The wall's direction and left normal; the side of the wall the room is on (+1 front, -1 back). */
  dir: Point
  normal: Point
  roomSide: 1 | -1
  wallMid: Point
  width: number
  bottom: number
}

function openingsOf(nodes: Nodes, zone: AnyNode, polygon: Point[]): Opening[] {
  const out: Opening[] = []
  const levelId = levelOf(nodes, zone.id)
  for (const node of Object.values(nodes)) {
    if (node.type !== 'door' && node.type !== 'window') continue
    const wall = nodes[(node.wallId as string | undefined) ?? node.parentId ?? '']
    if (!wall || wall.type !== 'wall' || levelOf(nodes, wall.id) !== levelId) continue
    const start = wall.start as Point
    const end = wall.end as Point
    const len = Math.hypot(end[0] - start[0], end[1] - start[1])
    if (!start || !end || len < 1e-6) continue
    const dir: Point = [(end[0] - start[0]) / len, (end[1] - start[1]) / len]
    const normal: Point = [-dir[1], dir[0]]
    const thickness = (wall.thickness as number | undefined) ?? 0.1
    const pos = (node.position as number[] | undefined) ?? [len / 2, 1, 0]
    const mid = add(start, dir, pos[0]!)
    const probe = thickness / 2 + 0.08
    const side = insidePolygon(add(mid, normal, probe), polygon) ? 1 : insidePolygon(add(mid, normal, -probe), polygon) ? -1 : 0
    if (!side) continue
    const width = (node.width as number | undefined) ?? 0.9
    const height = (node.height as number | undefined) ?? 1
    const inward: Point = [normal[0] * side, normal[1] * side]
    const center = add(mid, inward, thickness / 2)
    out.push({
      id: node.id,
      kind: node.type as 'door' | 'window',
      node,
      center,
      jambs: [add(center, dir, -width / 2), add(center, dir, width / 2)],
      inward,
      dir,
      normal,
      roomSide: side as 1 | -1,
      wallMid: mid,
      width,
      bottom: pos[1]! - height / 2,
    })
  }
  return out
}

/** Stretches of the zone outline no wall runs along (at least 0.4 m): open-plan ways into the next room. */
function passagesOf(nodes: Nodes, zone: AnyNode, polygon: Point[]): Opening[] {
  const levelId = levelOf(nodes, zone.id)
  const walls = Object.values(nodes).filter((n) => n.type === 'wall' && levelOf(nodes, n.id) === levelId && n.start && n.end)
  const out: Opening[] = []
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 0.4) return
    const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    const covered: Array<[number, number]> = []
    for (const wall of walls) {
      const s = wall.start as Point
      const e = wall.end as Point
      const half = ((wall.thickness as number | undefined) ?? 0.1) / 2
      const off = (p: Point) => (p[0] - a[0]) * -u[1] + (p[1] - a[1]) * u[0]
      const along = (p: Point) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]
      if (Math.abs(off(s) - off(e)) > 0.05 || Math.abs(Math.abs(off(s)) - half) > 0.06) continue
      const t0 = Math.min(along(s), along(e)) - half
      const t1 = Math.max(along(s), along(e)) + half
      if (t1 > 0 && t0 < len) covered.push([Math.max(0, t0), Math.min(len, t1)])
    }
    covered.sort((p, q) => p[0] - q[0])
    let at = 0
    const gaps: Array<[number, number]> = []
    for (const [c0, c1] of covered) {
      if (c0 - at >= 0.4) gaps.push([at, c0])
      at = Math.max(at, c1)
    }
    if (len - at >= 0.4) gaps.push([at, len])
    for (const [g0, g1] of gaps) {
      const mid = add(a, u, (g0 + g1) / 2)
      let n: Point = [-u[1], u[0]]
      if (!insidePolygon(add(mid, n, 0.05), polygon)) n = neg(n)
      out.push({
        id: `opening (${r2(mid[0])}, ${r2(mid[1])})`,
        kind: 'passage',
        node: zone,
        center: mid,
        jambs: [add(a, u, g0), add(a, u, g1)],
        inward: n,
        dir: u,
        normal: n,
        roomSide: 1,
        wallMid: mid,
        width: g1 - g0,
        bottom: 0,
      })
    }
  })
  return out
}

/** The zone outline as segments, the door openings cut out (a doorway is not a wall). */
function boundary(polygon: Point[], doors: Opening[]): Segment[] {
  const out: Segment[] = []
  for (const seg of edges(polygon, 'wall')) {
    const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1])
    if (len < 1e-6) continue
    const u: Point = [(seg.b[0] - seg.a[0]) / len, (seg.b[1] - seg.a[1]) / len]
    let cuts: Array<[number, number]> = []
    for (const door of doors) {
      if (pointSegment(door.center, seg.a, seg.b).d > 0.05) continue
      const t = (door.center[0] - seg.a[0]) * u[0] + (door.center[1] - seg.a[1]) * u[1]
      cuts.push([t - door.width / 2, t + door.width / 2])
    }
    cuts = cuts.sort((p, q) => p[0] - q[0])
    let at = 0
    for (const [c0, c1] of cuts) {
      if (c0 > at) out.push({ a: add(seg.a, u, at), b: add(seg.a, u, Math.min(c0, len)), owner: 'wall' })
      at = Math.max(at, c1)
    }
    if (at < len) out.push({ a: add(seg.a, u, at), b: seg.b, owner: 'wall' })
  }
  return out
}

// ---- measuring ----

class Room {
  readonly segments: Segment[]
  readonly polygon: Point[]
  readonly pieces: Piece[]
  constructor(polygon: Point[], pieces: Piece[], doors: Opening[]) {
    this.polygon = polygon
    this.pieces = pieces
    this.segments = [...boundary(polygon, doors), ...pieces.flatMap((p) => edges(p.corners, p.id))]
  }

  /** The nearest thing straight out from p along u (capped at 3 m), skipping `skip` owners. */
  ray(p: Point, u: Point, skip: Set<string>): { t: number; owner: string } {
    let best = { t: MAX_RAY, owner: 'open' }
    for (const s of this.segments) {
      if (skip.has(s.owner)) continue
      const t = raySegment(p, u, s.a, s.b)
      if (t < best.t) best = { t, owner: s.owner }
    }
    return best
  }

  /** Clear distance straight out of one face of a piece, over the part of the face between fractions f0..f1. */
  face(piece: Piece, out: Point, along: Point, halfAlong: number, halfOut: number, skip: Set<string>, f0 = 0, f1 = 1) {
    let best = { t: MAX_RAY, owner: 'open' }
    const base = add(piece.center, out, halfOut + 1e-3)
    const n = Math.max(2, Math.ceil((2 * halfAlong * (f1 - f0)) / 0.05))
    for (let i = 0; i <= n; i++) {
      const s = -halfAlong + 2 * halfAlong * (f0 + ((f1 - f0) * i) / n)
      const hit = this.ray(add(base, along, s), out, new Set([...skip, piece.id]))
      if (hit.t < best.t) best = hit
    }
    return { clear: r2(best.t), to: best.owner }
  }
}

function distanceToRect(p: Point, piece: Piece) {
  let d = Infinity
  for (let i = 0; i < 4; i++) d = Math.min(d, pointSegment(p, piece.corners[i]!, piece.corners[(i + 1) % 4]!).d)
  return insidePolygon(p, piece.corners) ? 0 : d
}

function pieceFindings(room: Room): Finding[] {
  const out: Finding[] = []
  const { pieces } = room
  const none = new Set<string>()
  for (const p of pieces) {
    if (p.role === 'bed') {
      // Sides measured over the half toward the foot (nightstands stand at the head); the foot over its width.
      const sides = [neg(p.right), p.right].map((u) => ({ side: compass(u), ...room.face(p, u, p.front, p.half[1], p.half[0], none, 0.45, 1) }))
      const foot = room.face(p, p.front, p.right, p.half[0], p.half[1], none)
      out.push({ check: 'bed', piece: p.id, sides, foot: { side: compass(p.front), ...foot } })
    } else if (p.role === 'wardrobe' || p.role === 'dresser') {
      const front = room.face(p, p.front, p.right, p.half[0], p.half[1], none)
      out.push({ check: 'storage_front', piece: p.id, kind: p.role, front: front.clear, to: front.to })
    } else if (p.role === 'dining_table') {
      // The table's own chairs (within 0.7 m of it) are what gets pulled out; they are not in the way.
      const chairs = new Set(pieces.filter((c) => (c.role === 'chair' || c.role === 'armchair') && distanceToRect(c.center, p) < 0.7).map((c) => c.id))
      const sides = [
        { out: p.front, along: p.right, ha: p.half[0], ho: p.half[1] },
        { out: neg(p.front), along: p.right, ha: p.half[0], ho: p.half[1] },
        { out: p.right, along: p.front, ha: p.half[1], ho: p.half[0] },
        { out: neg(p.right), along: p.front, ha: p.half[1], ho: p.half[0] },
      ].map((s) => ({ side: compass(s.out), ...room.face(p, s.out, s.along, s.ha, s.ho, chairs) }))
      out.push({ check: 'dining', piece: p.id, chairs: chairs.size, sides })
    } else if (p.role === 'sofa' || p.role === 'armchair') {
      const tables = pieces.filter((t) => t.role === 'coffee_table')
      if (!tables.length) continue
      const front = room.face(p, p.front, p.right, p.half[0] * 0.6, p.half[1], none)
      if (tables.some((t) => t.id === front.to)) out.push({ check: 'seating', piece: p.id, table: front.to, gap: front.clear })
    }
  }
  return out
}

function doorFindings(room: Room, nodes: Nodes, openings: Opening[]): Finding[] {
  const out: Finding[] = []
  const solid = room.pieces
  for (const o of openings) {
    if (o.kind !== 'door') continue
    // Approach: straight into the room across the opening.
    let best = { t: MAX_RAY, owner: 'open' }
    for (let i = 0; i <= 8; i++) {
      const p = add(add(o.center, o.dir, -o.width / 2 + 0.05 + ((o.width - 0.1) * i) / 8), o.inward, 1e-3)
      const hit = room.ray(p, o.inward, new Set())
      if (hit.t < best.t) best = hit
    }
    out.push({ check: 'door_approach', door: o.id, clear: r2(best.t), to: best.owner })
    // Swing: hinged leaves sweep a quarter circle on their swing side (Pascal's floor-plan door: inward = the wall's
    // front side, hinge at the hingesSide end, both flipped when the door is turned round).
    const door = o.node
    const type = String(door.doorType ?? 'hinged')
    if (door.openingKind === 'opening' || !['hinged', 'double', 'french'].includes(type)) continue
    const yaw = ((door.rotation as number[] | undefined) ?? [0, 0, 0])[1] ?? 0
    const turned = (() => {
      const a = (((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) + 1e-6
      return a > Math.PI / 2 && a < (3 * Math.PI) / 2
    })()
    let hinges = door.hingesSide === 'right' ? 'right' : 'left'
    let swing = door.swingDirection === 'outward' ? 'outward' : 'inward'
    if (turned) {
      hinges = hinges === 'left' ? 'right' : 'left'
      swing = swing === 'inward' ? 'outward' : 'inward'
    }
    const swingSide = swing === 'inward' ? 1 : -1
    if (swingSide !== o.roomSide) continue
    const thickness = (nodes[(door.wallId as string | undefined) ?? door.parentId ?? '']?.thickness as number | undefined) ?? 0.1
    const face = add(o.wallMid, o.normal, (swingSide * thickness) / 2)
    const leaves: Array<{ hinge: Point; closed: Point }> =
      type === 'hinged'
        ? [
            hinges === 'left'
              ? { hinge: add(face, o.dir, -o.width / 2), closed: [o.dir[0] * o.width, o.dir[1] * o.width] }
              : { hinge: add(face, o.dir, o.width / 2), closed: [-o.dir[0] * o.width, -o.dir[1] * o.width] },
          ]
        : [
            { hinge: add(face, o.dir, -o.width / 2), closed: [(o.dir[0] * o.width) / 2, (o.dir[1] * o.width) / 2] },
            { hinge: add(face, o.dir, o.width / 2), closed: [(-o.dir[0] * o.width) / 2, (-o.dir[1] * o.width) / 2] },
          ]
    let opens = 90
    let by = ''
    for (const leaf of leaves) {
      // Turn the closed leaf toward the swing side in 2 deg steps; the first angle it meets a piece stops it.
      const toward: Point = [o.normal[0] * swingSide, o.normal[1] * swingSide]
      for (let deg = 2; deg <= 90; deg += 2) {
        const a = (deg * Math.PI) / 180
        const r = Math.hypot(leaf.closed[0], leaf.closed[1])
        const u: Point = [leaf.closed[0] / r, leaf.closed[1] / r]
        const tip: Point = add(add(leaf.hinge, u, r * Math.cos(a)), toward, r * Math.sin(a))
        const hit = solid.find((p) => segmentHitsPolygon(leaf.hinge, tip, p.corners))
        if (hit) {
          if (deg - 2 < opens) {
            opens = deg - 2
            by = hit.id
          }
          break
        }
      }
    }
    out.push({ check: 'door_swing', door: o.id, opens, ...(by ? { by } : {}) })
  }
  return out
}

function windowFindings(room: Room, openings: Opening[]): Finding[] {
  const out: Finding[] = []
  for (const o of openings) {
    if (o.kind !== 'window') continue
    for (const p of room.pieces) {
      if (p.top <= o.bottom + 0.05) continue
      // The piece's extent along the window's wall and its distance from the glass face.
      const along = p.corners.map((c) => (c[0] - o.center[0]) * o.dir[0] + (c[1] - o.center[1]) * o.dir[1])
      const off = p.corners.map((c) => (c[0] - o.center[0]) * o.inward[0] + (c[1] - o.center[1]) * o.inward[1])
      const covers = Math.min(Math.max(...along), o.width / 2) - Math.max(Math.min(...along), -o.width / 2)
      const gap = Math.min(...off)
      if (covers <= 0.05 || gap > 0.6 || Math.max(...off) < 0) continue
      out.push({ check: 'window', window: o.id, piece: p.id, covers: r2(covers), of: r2(o.width), gap: r2(Math.max(0, gap)), top: r2(p.top), sill: r2(o.bottom) })
    }
  }
  return out
}

// ---- walkways: widest paths on a 5 cm grid ----

class Grid {
  readonly nx: number
  readonly nz: number
  readonly x0: number
  readonly z0: number
  /** Distance from each free cell centre to the nearest obstacle or wall; -1 where blocked. */
  readonly clear: Float32Array
  /** The obstacle covering a blocked cell (for "what is in the way"), else ''. */
  readonly cover: string[]
  readonly room: Room

  constructor(room: Room) {
    this.room = room
    const xs = room.polygon.map((p) => p[0])
    const zs = room.polygon.map((p) => p[1])
    this.x0 = Math.min(...xs)
    this.z0 = Math.min(...zs)
    this.nx = Math.max(1, Math.ceil((Math.max(...xs) - this.x0) / CELL))
    this.nz = Math.max(1, Math.ceil((Math.max(...zs) - this.z0) / CELL))
    this.clear = new Float32Array(this.nx * this.nz).fill(-1)
    this.cover = new Array(this.nx * this.nz).fill('')
    for (let k = 0; k < this.nx * this.nz; k++) {
      const p = this.at(k)
      if (!insidePolygon(p, room.polygon)) continue
      const inside = room.pieces.find((piece) => insidePolygon(p, piece.corners))
      if (inside) {
        this.cover[k] = inside.id
        continue
      }
      let d = Infinity
      for (const s of room.segments) d = Math.min(d, pointSegment(p, s.a, s.b).d)
      this.clear[k] = d
    }
  }

  at(k: number): Point {
    return [this.x0 + ((k % this.nx) + 0.5) * CELL, this.z0 + (Math.floor(k / this.nx) + 0.5) * CELL]
  }

  near(p: Point, radius: number): number[] {
    const out: number[] = []
    const i0 = Math.max(0, Math.floor((p[0] - radius - this.x0) / CELL))
    const i1 = Math.min(this.nx - 1, Math.floor((p[0] + radius - this.x0) / CELL))
    const j0 = Math.max(0, Math.floor((p[1] - radius - this.z0) / CELL))
    const j1 = Math.min(this.nz - 1, Math.floor((p[1] + radius - this.z0) / CELL))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.nx + i
        const c = this.at(k)
        if (this.clear[k]! >= 0 && Math.hypot(c[0] - p[0], c[1] - p[1]) <= radius) out.push(k)
      }
    }
    return out
  }

  private neighbours(k: number): number[] {
    const i = k % this.nx
    const j = Math.floor(k / this.nx)
    const out: number[] = []
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if ((di || dj) && i + di >= 0 && i + di < this.nx && j + dj >= 0 && j + dj < this.nz) out.push((j + dj) * this.nx + i + di)
      }
    }
    return out
  }

  /**
   * The widest route between two spots: maximise the narrowest clearance on the way (cells within `ignore` of either
   * end do not count, so a doorway or the piece one walks up to does not set the width). Null when no route.
   */
  widest(from: { p: Point; ignore: number }, to: { p: Point; ignore: number }): { pinch: number | null } | null {
    const starts = this.near(from.p, 0.3)
    const goals = new Set(this.near(to.p, 0.3))
    if (!starts.length || !goals.size) return null
    const cap = (k: number) => {
      const c = this.at(k)
      if (Math.hypot(c[0] - from.p[0], c[1] - from.p[1]) < from.ignore || Math.hypot(c[0] - to.p[0], c[1] - to.p[1]) < to.ignore) return Infinity
      return this.clear[k]!
    }
    const best = new Float32Array(this.nx * this.nz).fill(-1)
    const prev = new Int32Array(this.nx * this.nz).fill(-1)
    const heap = new MaxHeap()
    for (const k of starts) {
      best[k] = cap(k)
      heap.push(k, best[k]!)
    }
    let goal = -1
    while (heap.size) {
      const [k, value] = heap.pop()
      if (value < best[k]!) continue
      if (goals.has(k)) {
        goal = k
        break
      }
      for (const n of this.neighbours(k)) {
        if (this.clear[n]! < 0) continue
        const v = Math.min(value, cap(n))
        if (v > best[n]!) {
          best[n] = v
          prev[n] = k
          heap.push(n, v)
        }
      }
    }
    if (goal < 0) return null
    let pinch: number | null = null
    for (let k = goal; k >= 0; k = prev[k]!) {
      const c = cap(k)
      if (Number.isFinite(c) && (pinch === null || c < this.clear[pinch]!)) pinch = k
    }
    return { pinch }
  }

  /** The pieces a straight-as-possible route has to cross when there is no free one (0-1 BFS over covered cells). */
  blockers(from: Point, to: Point): string[] {
    const inRoom = (k: number) => this.clear[k]! >= 0 || this.cover[k] !== ''
    const ki = (p: Point) => Math.min(this.nz - 1, Math.max(0, Math.floor((p[1] - this.z0) / CELL))) * this.nx + Math.min(this.nx - 1, Math.max(0, Math.floor((p[0] - this.x0) / CELL)))
    const start = ki(from)
    const goal = ki(to)
    const cost = new Int32Array(this.nx * this.nz).fill(1 << 30)
    const prev = new Int32Array(this.nx * this.nz).fill(-1)
    // 0-1 BFS: free steps go on a stack (same cost, taken first), covered steps on a queue.
    const free: number[] = [start]
    const later: number[] = []
    let head = 0
    cost[start] = 0
    while (free.length || head < later.length) {
      const k = free.length ? free.pop()! : later[head++]!
      if (k === goal) break
      for (const n of this.neighbours(k)) {
        if (!inRoom(n)) continue
        const w = this.cover[n] ? 1 : 0
        if (cost[k]! + w < cost[n]!) {
          cost[n] = cost[k]! + w
          prev[n] = k
          if (w) later.push(n)
          else free.push(n)
        }
      }
    }
    const out = new Set<string>()
    for (let k = goal; k >= 0; k = prev[k]!) if (this.cover[k]) out.add(this.cover[k]!)
    return [...out]
  }

  /** The gap at a cell: nearest thing on one side plus the nearest roughly opposite, and who they are. */
  gapAt(k: number): { width: number; between: string[] } {
    const p = this.at(k)
    const hits = this.room.segments.map((s) => ({ ...pointSegment(p, s.a, s.b), owner: s.owner })).sort((a, b) => a.d - b.d)
    const first = hits[0]!
    const u: Point = [first.q[0] - p[0], first.q[1] - p[1]]
    const opposite = hits.find((h) => h !== first && (h.q[0] - p[0]) * u[0] + (h.q[1] - p[1]) * u[1] < -0.2 * first.d * h.d)
    return opposite ? { width: r2(first.d + opposite.d), between: [first.owner, opposite.owner] } : { width: r2(2 * first.d), between: [first.owner] }
  }
}

class MaxHeap {
  private keys: number[] = []
  private values: number[] = []
  get size() {
    return this.keys.length
  }
  push(key: number, value: number) {
    this.keys.push(key)
    this.values.push(value)
    let i = this.keys.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.values[parent]! >= this.values[i]!) break
      this.swap(i, parent)
      i = parent
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.keys[0]!, this.values[0]!]
    const lastKey = this.keys.pop()!
    const lastValue = this.values.pop()!
    if (this.keys.length) {
      this.keys[0] = lastKey
      this.values[0] = lastValue
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.keys.length && this.values[l]! > this.values[m]!) m = l
        if (r < this.keys.length && this.values[r]! > this.values[m]!) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }
  private swap(a: number, b: number) {
    ;[this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!]
    ;[this.values[a], this.values[b]] = [this.values[b]!, this.values[a]!]
  }
}

function walkwayFindings(room: Room, nodes: Nodes, doors: Opening[], zoneIdOf: (p: Point) => AnyNode | null): Finding[] {
  if (!doors.length) return []
  const grid = new Grid(room)
  const out: Finding[] = []
  const spot = (o: Opening) => ({ p: add(o.center, o.inward, 0.2), ignore: Math.max(0.6, o.width / 2 + 0.35) })
  const route = (fromId: string, from: { p: Point; ignore: number }, toLabel: string, to: { p: Point; ignore: number }) => {
    const path = grid.widest(from, to)
    if (!path) {
      out.push({ check: 'walkway', from: fromId, to: toLabel, width: 0, blockedBy: grid.blockers(from.p, to.p) })
      return
    }
    if (path.pinch === null) return
    const gap = grid.gapAt(path.pinch)
    const at = grid.at(path.pinch)
    out.push({ check: 'walkway', from: fromId, to: toLabel, width: gap.width, at: [r2(at[0]), r2(at[1])], between: gap.between })
  }
  for (let i = 0; i < doors.length; i++) {
    for (let j = i + 1; j < doors.length; j++) route(doors[i]!.id, spot(doors[i]!), doors[j]!.id, spot(doors[j]!))
  }
  // From the way in (a door from an indoor room first) to where people stand at beds and storage.
  const outdoor = (o: Opening) => OUTDOOR.test(String(zoneIdOf(add(o.center, o.inward, -0.4))?.name ?? ''))
  const entry = doors.find((o) => !outdoor(o)) ?? doors[0]!
  for (const p of room.pieces) {
    const spots: Array<[string, Point]> = []
    if (p.role === 'bed') {
      for (const u of [neg(p.right), p.right]) spots.push([`${compass(u)} side`, add(add(p.center, u, p.half[0] + 0.3), p.front, p.half[1] * 0.3)])
    } else if (p.role === 'wardrobe' || p.role === 'dresser' || p.role === 'desk') {
      spots.push(['front', add(p.center, p.front, p.half[1] + 0.35)])
    }
    for (const [label, point] of spots) {
      if (!insidePolygon(point, room.polygon) || room.pieces.some((q) => insidePolygon(point, q.corners))) continue
      route(entry.id, spot(entry), `${p.id} ${label}`, { p: point, ignore: 0.45 })
    }
  }
  return out
}

// ---- the tool ----

/** Measure the clearances of one room (`zoneId`) or of every room with furniture in it. */
export function checkClearances(nodes: Nodes, zoneId?: string): ClearanceReport | { error: string } {
  const zones = Object.values(nodes).filter((n) => n.type === 'zone' && Array.isArray(n.polygon) && (n.polygon as Point[]).length >= 3)
  if (zoneId && !zones.some((z) => z.id === zoneId)) return { error: `zone_not_found: ${zoneId}` }
  const zoneAt = (p: Point) => zones.find((z) => insidePolygon(p, z.polygon as Point[])) ?? null
  const rooms: RoomClearances[] = []
  const used = new Set<Check>()
  for (const zone of zones) {
    if (zoneId && zone.id !== zoneId) continue
    const polygon = zone.polygon as Point[]
    const levelId = levelOf(nodes, zone.id)
    const pieces = Object.values(nodes)
      .filter((n) => n.type === 'item' && n.parentId === levelId)
      .map(pieceOf)
      .filter((p): p is Piece => !!p && insidePolygon(p.center, polygon))
    if (!zoneId && !pieces.length) continue
    const openings = openingsOf(nodes, zone, polygon)
    const doors = [...openings.filter((o) => o.kind === 'door'), ...passagesOf(nodes, zone, polygon)]
    const room = new Room(polygon, pieces, doors)
    const findings = [
      ...walkwayFindings(room, nodes, doors, zoneAt),
      ...doorFindings(room, nodes, openings),
      ...pieceFindings(room),
      ...windowFindings(room, openings),
    ]
    for (const f of findings) used.add(f.check)
    const mentioned = new Set<string>()
    const collect = (v: unknown) => {
      if (typeof v === 'string' && pieces.some((p) => p.id === v)) mentioned.add(v)
      else if (Array.isArray(v)) v.forEach(collect)
      else if (v && typeof v === 'object') Object.values(v).forEach(collect)
    }
    findings.forEach(collect)
    for (const f of findings) if (typeof f.to === 'string') for (const p of pieces) if (f.to.startsWith(`${p.id} `)) mentioned.add(p.id)
    rooms.push({
      zone: zone.id,
      name: String(zone.name ?? ''),
      findings,
      pieces: Object.fromEntries(pieces.filter((p) => mentioned.has(p.id)).map((p) => [p.id, p.name.slice(0, 48)])),
    })
  }
  return {
    rooms,
    targets: Object.fromEntries([...used].map((c) => [c, TARGETS[c]])),
    ...(rooms.length ? {} : { notes: ['no room has floor furniture yet; pass zone_id to measure an empty room'] }),
  }
}
