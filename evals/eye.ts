// Eye-level camera per room for the critic's renders: the same rule as the scene MCP's view_scene 'inside' view
// (packages/scene-mcp view-scene.ts, eyes lane): stand in the room's door, preferring a door to another room over a
// balcony or entrance door, stepped into the room, looking at the room's centre; with no door, stand near the corner
// farthest from the centre. Rendered through a Pascal `spawn` node and the editor's Inside (first-person) view.
// The eval now renders its room views through POST /api/render with view_scene's own cameras (`roomShots` below,
// `planView` in packages/scene-mcp/src/view-scene.ts); the spawn path stays for the editor.
import { insidePolygon } from './room-facts.ts'

type Json = Record<string, any>
type Vec2 = [number, number]
interface Graph {
  nodes: Record<string, unknown>
}

export interface EyeSpot {
  room: string
  zoneId: string
  /** Floor point [x, 0, z] (the editor adds eye height). */
  position: [number, number, number]
  /** Radians about the vertical; the first-person camera looks along (-sin yaw, -cos yaw). */
  yaw: number
  target: Vec2
}

const OUTSIDE = /balcon|loggia|terrace|patio/i
const STEP_IN = 0.6

function centroid(polygon: Vec2[]): Vec2 {
  let a = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < polygon.length; i++) {
    const [x0, z0] = polygon[i]!
    const [x1, z1] = polygon[(i + 1) % polygon.length]!
    const cross = x0 * z1 - x1 * z0
    a += cross
    cx += (x0 + x1) * cross
    cz += (z0 + z1) * cross
  }
  if (Math.abs(a) < 1e-9) return [polygon.reduce((s, p) => s + p[0], 0) / polygon.length, polygon.reduce((s, p) => s + p[1], 0) / polygon.length]
  return [cx / (3 * a), cz / (3 * a)]
}

/** Share of the straight line from a spot to the target that runs inside the room. */
function sightline(from: Vec2, to: Vec2, polygon: Vec2[]) {
  const samples = 20
  let inside = 0
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    if (insidePolygon([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], polygon)) inside++
  }
  return inside / samples
}

export function eyeSpots(graph: Graph, rooms: string[]): EyeSpot[] {
  const nodes = Object.values(graph.nodes) as Json[]
  const zones = nodes.filter((n) => n.type === 'zone' && Array.isArray(n.polygon) && n.polygon.length >= 3)
  const doors = nodes
    .filter((n) => n.type === 'door')
    .flatMap((door) => {
      const wall = graph.nodes[door.wallId ?? door.parentId] as Json | undefined
      if (!wall?.start || !wall?.end) return []
      const [sx, sz] = wall.start as Vec2
      const [ex, ez] = wall.end as Vec2
      const len = Math.hypot(ex - sx, ez - sz) || 1
      const u: Vec2 = [(ex - sx) / len, (ez - sz) / len]
      const along = Number(door.position?.[0] ?? 0)
      return [{ at: [sx + u[0] * along, sz + u[1] * along] as Vec2, normal: [-u[1], u[0]] as Vec2 }]
    })
  const wanted = rooms.map((r) => r.toLowerCase())
  const spots: EyeSpot[] = []
  for (const zone of zones) {
    const name = String(zone.name ?? zone.id)
    if (!wanted.includes(name.toLowerCase())) continue
    const polygon = zone.polygon as Vec2[]
    const target = centroid(polygon)
    // Stand in a door (to another room first, then the entrance, then a balcony door), else near a corner; keep
    // only spots that see the room's centre without looking through a wall (L-shaped rooms, piers).
    const doorSpots = doors.flatMap(({ at, normal }) => {
      for (const sign of [1, -1]) {
        const inside: Vec2 = [at[0] + normal[0] * sign * STEP_IN, at[1] + normal[1] * sign * STEP_IN]
        const outside: Vec2 = [at[0] - normal[0] * sign * STEP_IN, at[1] - normal[1] * sign * STEP_IN]
        if (!insidePolygon(inside, polygon) || insidePolygon(outside, polygon)) continue
        const other = zones.find((z) => z !== zone && insidePolygon(outside, z.polygon as Vec2[]))
        return [{ stand: inside, rank: other && !OUTSIDE.test(String(other.name)) ? 0 : other ? 2 : 1 }]
      }
      return []
    })
    const cornerSpots = polygon.map((corner) => {
      const d = Math.hypot(target[0] - corner[0], target[1] - corner[1]) || 1
      const stand: Vec2 = [corner[0] + ((target[0] - corner[0]) / d) * STEP_IN, corner[1] + ((target[1] - corner[1]) / d) * STEP_IN]
      return { stand, rank: 3 }
    })
    const scoredSpots = [...doorSpots, ...cornerSpots]
      .filter((c) => insidePolygon(c.stand, polygon))
      .map((c) => ({ ...c, seen: sightline(c.stand, target, polygon), far: Math.hypot(target[0] - c.stand[0], target[1] - c.stand[1]) }))
      .sort((a, b) => Number(b.seen === 1) - Number(a.seen === 1) || a.rank - b.rank || b.seen - a.seen || b.far - a.far)
    const stand = scoredSpots[0]?.stand ?? target
    spots.push({
      room: name,
      zoneId: String(zone.id),
      position: [stand[0], 0, stand[1]],
      yaw: Math.atan2(-(target[0] - stand[0]), -(target[1] - stand[1])),
      target,
    })
  }
  return spots
}

/** A copy of the graph with one spawn node (and no other) at the spot, for the editor's first-person view. */
export function withSpawn(graph: Graph & Record<string, unknown>, spot: EyeSpot) {
  const nodes: Record<string, Json> = {}
  for (const [id, node] of Object.entries(graph.nodes) as Array<[string, Json]>) {
    if (node.type === 'spawn') continue
    nodes[id] = { ...node, ...(Array.isArray(node.children) ? { children: node.children.filter((c: string) => (graph.nodes[c] as Json | undefined)?.type !== 'spawn') } : {}) }
  }
  const level = Object.values(nodes).find((n) => n.type === 'level')
  if (!level) throw new Error('no level in the graph')
  const id = 'spawn_eval'
  nodes[id] = { object: 'node', id, type: 'spawn', name: `eye ${spot.room}`, parentId: level.id, visible: true, metadata: {}, position: spot.position, rotation: spot.yaw }
  level.children = [...(level.children ?? []), id]
  return { ...graph, nodes }
}

/** The per-room views the eval renders, in the order the critic sees them, with their file name prefix. */
export const ROOM_VIEWS = [
  { view: 'inside', prefix: 'shot-eye', label: 'eye-level view' },
  { view: 'top', prefix: 'shot-top', label: 'top view' },
  { view: '3d', prefix: 'shot-3d', label: '3/4 view' },
] as const

export const roomSlug = (room: string) => room.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * The zone to render for each judged room (by name, case-insensitive). When several zones share a name, the one with
 * the most items standing in it. Rooms with no zone are left out.
 */
export function roomZones(graph: Graph, rooms: string[]): Array<{ room: string; zoneId: string }> {
  const nodes = Object.values(graph.nodes) as Json[]
  const zones = nodes.filter((n) => n.type === 'zone' && Array.isArray(n.polygon) && n.polygon.length >= 3)
  const items = nodes.filter((n) => n.type === 'item' && Array.isArray(n.position))
  const count = (zone: Json) => items.filter((i) => insidePolygon([i.position[0], i.position[2]], zone.polygon)).length
  return rooms.flatMap((room) => {
    const named = zones.filter((z) => String(z.name ?? '').toLowerCase() === room.toLowerCase())
    const best = named.sort((a, b) => count(b) - count(a))[0]
    return best ? [{ room: String(best.name), zoneId: String(best.id) }] : []
  })
}
