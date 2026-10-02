// Which side of each wall faces a room. Pascal tags sides while a person draws walls in the editor; walls created
// through MCP tools arrive "unknown". The editor tags them at load (apps/web viewer-look withWallSides, same rules:
// Pascal's room detector first, the level's zones where it finds no closed room). The scene MCP does not rewrite
// saved graphs; set_wall_finish uses these rules to know which slot a face will show, and keeps the tags it used.
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

export type WallFace = 'front' | 'back'
export type WallSlot = 'interior' | 'exterior'

/** The faces of a wall that look into a polygon (a room outline), sampled at a quarter, half and three quarters. */
export function facesToward(wall: AnyNode, polygon: Point[]): WallFace[] {
  const start = wall.start as Point | undefined
  const end = wall.end as Point | undefined
  if (!start || !end || polygon.length < 3) return []
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < 1e-6) return []
  const offset = ((wall.thickness as number | undefined) ?? 0.2) / 2 + 0.1
  const nx = -dy / length
  const ny = dx / length
  const faces: WallFace[] = []
  for (const [face, sign] of [['front', 1], ['back', -1]] as const) {
    const hit = [0.25, 0.5, 0.75].some((t) => {
      const x = start[0] + dx * t + nx * offset * sign
      const y = start[1] + dy * t + ny * offset * sign
      return insidePolygon([x, y], polygon)
    })
    if (hit) faces.push(face)
  }
  return faces
}

/**
 * The slot Pascal (1.0.3) paints on one face of a wall: the face's side tag when it is interior or exterior,
 * otherwise front -> `interior`, back -> `exterior` (viewer wall-system getWallFaceMaterialIndex).
 */
export function slotForFace(wall: AnyNode, face: WallFace): WallSlot {
  const tag = face === 'front' ? wall.frontSide : wall.backSide
  if (tag === 'interior' || tag === 'exterior') return tag
  return face === 'front' ? 'interior' : 'exterior'
}
