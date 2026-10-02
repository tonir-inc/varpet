// Which side of each wall faces a room. Pascal tags sides while a person draws walls in the editor; walls created
// through MCP tools arrive "unknown", and cutaway then keeps them standing. Tag them before a graph is saved:
// Pascal's room detector first, the level's zones (room outlines) where it finds no closed room.
import { detectSpacesForLevel } from '@pascal-app/core'

type Point = [number, number]
type AnyNode = { id: string; type: string; parentId?: string | null; [key: string]: unknown }
export type WallSide = 'interior' | 'exterior'
export interface WallSideUpdate { id: string; frontSide: WallSide; backSide: WallSide }

/** Balconies are outdoors: the wall between flat and balcony is a facade. */
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

/** A wall's front faces its left normal (-dy, dx), as in Pascal. A room on both sides (partition): no answer. */
function sidesFromZones(wall: AnyNode, zones: Point[][]): Omit<WallSideUpdate, 'id'> | null {
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

const unknown = (wall: AnyNode) => wall.frontSide === undefined || wall.frontSide === 'unknown' || wall.backSide === undefined || wall.backSide === 'unknown'

/** Side tags for the walls whose sides are unknown and can be told; walls already tagged are left alone. */
export function wallSideUpdates(nodes: Record<string, AnyNode>): WallSideUpdate[] {
  const wallsByLevel = new Map<string, AnyNode[]>()
  const zonesByLevel = new Map<string, Point[][]>()
  for (const node of Object.values(nodes)) {
    if ((node.type !== 'wall' && node.type !== 'zone') || !node.parentId || nodes[node.parentId]?.type !== 'level') continue
    const levelId = node.parentId
    if (node.type === 'wall') wallsByLevel.set(levelId, [...(wallsByLevel.get(levelId) ?? []), node])
    else if (Array.isArray(node.polygon) && node.polygon.length >= 3 && !OUTDOOR_ZONE.test(String(node.name ?? ''))) {
      zonesByLevel.set(levelId, [...(zonesByLevel.get(levelId) ?? []), node.polygon as Point[]])
    }
  }
  const updates: WallSideUpdate[] = []
  for (const [levelId, walls] of wallsByLevel) {
    if (!walls.some(unknown)) continue
    const detected = new Map(detectSpacesForLevel(levelId, walls as never).wallUpdates.map((u) => [u.wallId as string, u]))
    const zones = zonesByLevel.get(levelId) ?? []
    for (const wall of walls) {
      if (!unknown(wall)) continue
      const update = detected.get(wall.id)
      const sides = update && update.frontSide !== 'unknown' && update.backSide !== 'unknown'
        ? { frontSide: update.frontSide as WallSide, backSide: update.backSide as WallSide }
        : sidesFromZones(wall, zones)
      if (sides) updates.push({ id: wall.id, ...sides })
    }
  }
  return updates
}
