// v1 flat (varpet.editor scene: rooms, walls with openings, 2D plan metres) -> Pascal scene graph.
// Pure: same input, same graph, byte for byte. Node ids derive from the v1 ids, so rebuilding the templates is
// a no-op diff. Plan [x, y] maps to Pascal [x, z] unchanged (v1 drew plan y on three.js z too); the flat is
// shifted so its bounding box is centred on the origin.
import {
  BuildingNode,
  CeilingNode,
  DoorNode,
  LevelNode,
  SiteNode,
  SlabNode,
  WallNode,
  WindowNode,
  ZoneNode,
} from '@pascal-app/core/schema'

type Vec2 = [number, number]

/** Both faces of every wall: Pascal's warm white matte paint, not its unpainted "Prepared Drywall" default. */
export const WALL_PAINT = 'library:preset-softwhite'

/** The parts of a v1 `SceneDocument` the converter reads (v1 apps/editor/src/contracts.ts). */
export interface V1Opening {
  id: string
  kind: 'door' | 'window'
  /** Metres from wall.start to the opening's near edge, toward wall.end. */
  offset: number
  width: number
  height: number
  /** Floor to the opening's bottom; 0 for doors. */
  sill: number
  assetId?: string
}
export interface V1Wall { id: string; start: Vec2; end: Vec2; height: number; thickness: number; color?: string; openings?: V1Opening[] }
export interface V1Room { id: string; name: string; polygon: Vec2[]; color?: string }
/** v1 renovation finishes: a material per room surface (names only; v1 drew them as flat colours). */
export interface V1FinishMaterial { id: string; name: string }
export interface V1FinishAssignment { entityId: string; surface: string; materialId: string }
export interface V1Scene {
  format: 'varpet.editor'
  id: string
  name: string
  rooms: V1Room[]
  walls: V1Wall[]
  project?: {
    metadata?: Record<string, { name?: string; zone?: string } | undefined>
    materials?: V1FinishMaterial[]
    finishes?: V1FinishAssignment[]
  }
}

/** What a room's floor is made of, from its v1 name (and v1 zone metadata for outdoor rooms). */
export type FloorKind = 'wet' | 'outdoor' | 'dry'

const WET_ROOM = /bath|shower|\bwc\b|toilet|lavatory|ensuite|en-suite|laundry|utility/i
const OUTDOOR_ROOM = /balcon|loggia|terrace|patio/i

export function floorKind(name: string, zone?: string): FloorKind {
  if ((zone && zone !== 'interior') || OUTDOOR_ROOM.test(name)) return 'outdoor'
  if (WET_ROOM.test(name)) return 'wet'
  // Kitchens, living rooms, bedrooms, halls and closets: v1 gave no kitchen its own finish, so they share the wood.
  return 'dry'
}

/**
 * Floor finish per kind, as slab `surface` slot refs. Wet rooms: Pascal's light porcelain (large tiles, grout);
 * balconies: its dark porcelain, an outdoor tile; dry rooms: our v1 oak (registered by the editor's viewer look).
 */
export const FLOOR_FINISH: Record<FloorKind, string> = {
  wet: 'library:flooring-lightceramic24',
  outdoor: 'library:flooring-darkceramic22',
  dry: 'library:varpet-oak',
}

/** A v1 floor material by name, when the flat assigned one: our finishes first, then tile for any tiled name. */
const V1_FLOOR_MATERIAL: Array<[RegExp, string]> = [
  [/travertine/i, 'library:varpet-travertine'],
  [/marble/i, 'library:varpet-marble-white-alt'],
  [/walnut/i, 'library:varpet-walnut'],
  [/\bash\b/i, 'library:varpet-ash-light'],
  [/oak|parquet|wood|laminate/i, 'library:varpet-oak'],
  [/porcelain|ceramic|tile|stone/i, FLOOR_FINISH.wet],
]

function v1FloorFinish(scene: V1Scene, roomId: string): string | undefined {
  const assignment = scene.project?.finishes?.find((f) => f.entityId === roomId && f.surface === 'floor')
  const material = assignment && scene.project?.materials?.find((m) => m.id === assignment.materialId)
  return material ? V1_FLOOR_MATERIAL.find(([pattern]) => pattern.test(material.name))?.[1] : undefined
}

export interface PascalGraph { nodes: Record<string, Record<string, unknown>>; rootNodeIds: string[]; collections: Record<string, never>; materials: Record<string, never> }

export interface ConvertedFlat {
  graph: PascalGraph
  /** Floor area per room (m²), in v1 room order; the sum is the flat's area. */
  rooms: Array<{ id: string; name: string; area: number }>
  area: number
  /** Plan offset applied to every v1 point: pascal = v1 + shift. */
  shift: Vec2
}

const SITE_MARGIN = 5
const round = (value: number, digits = 4) => {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale + 0 // + 0 turns -0 into 0
}
/** Id suffix from a v1 id: lower-case letters, digits and dashes. */
const slug = (id: string) => id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'x'

export function polygonArea(polygon: readonly (readonly [number, number])[]): number {
  let twice = 0
  polygon.forEach(([x0, y0], i) => {
    const [x1, y1] = polygon[(i + 1) % polygon.length]!
    twice += x0 * y1 - x1 * y0
  })
  return Math.abs(twice) / 2
}

/** Pascal door family from the v1 catalog model, when the model says more than a plain hinged leaf. */
function doorStyle(assetId: string | undefined): Record<string, unknown> {
  if (assetId?.includes('french')) return { doorType: 'french', leafCount: 2 }
  return {}
}
function windowStyle(assetId: string | undefined): Record<string, unknown> {
  if (!assetId) return {}
  if (assetId.includes('slider')) return { windowType: 'sliding', columnRatios: [0.5, 0.5] }
  if (assetId.includes('tilt-turn') || assetId.includes('single')) return { windowType: 'casement' }
  if (assetId.includes('transom')) return { windowType: 'awning' }
  return {}
}

export function convertV1Scene(scene: V1Scene): ConvertedFlat {
  if (scene.format !== 'varpet.editor') throw new Error(`${scene.id}: not a v1 varpet.editor scene`)
  if (!scene.rooms.length || !scene.walls.length) throw new Error(`${scene.id}: no rooms or walls`)

  const points: Vec2[] = [...scene.rooms.flatMap((room) => room.polygon), ...scene.walls.flatMap((wall) => [wall.start, wall.end])]
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const shift: Vec2 = [round(-(minX + maxX) / 2, 2), round(-(minY + maxY) / 2, 2)]
  const move = ([x, y]: Vec2): Vec2 => [round(x + shift[0]), round(y + shift[1])]

  const flat = slug(scene.id)
  const siteId = `site_${flat}`, buildingId = `building_${flat}`, levelId = `level_${flat}`
  const wallHeight = Math.max(...scene.walls.map((wall) => wall.height))
  const nodes: PascalGraph['nodes'] = {}
  const seen = new Set<string>()
  const add = (node: { id: string }) => {
    if (seen.has(node.id)) throw new Error(`${scene.id}: duplicate node id ${node.id}`)
    seen.add(node.id)
    nodes[node.id] = node as Record<string, unknown>
    return node.id
  }
  const levelChildren: string[] = []
  const metadataName = (id: string) => scene.project?.metadata?.[id]?.name

  const rooms = scene.rooms.map((room) => {
    const polygon = room.polygon.map(move)
    const key = slug(room.id)
    levelChildren.push(
      add(ZoneNode.parse({
        id: `zone_${key}`, name: room.name, parentId: levelId, polygon, spaceRole: 'room', ceilingHeight: wallHeight,
        ...(room.color ? { color: room.color } : {}), metadata: { v1Id: room.id },
      })),
      add(SlabNode.parse({
        id: `slab_${key}`, name: `${room.name} floor`, parentId: levelId, polygon, metadata: { v1Id: room.id },
        slots: { surface: v1FloorFinish(scene, room.id) ?? FLOOR_FINISH[floorKind(room.name, scene.project?.metadata?.[room.id]?.zone)] },
      })),
      add(CeilingNode.parse({ id: `ceiling_${key}`, name: `${room.name} ceiling`, parentId: levelId, polygon, metadata: { v1Id: room.id } })),
    )
    return { id: room.id, name: room.name, area: round(polygonArea(room.polygon), 2) }
  })

  for (const wall of scene.walls) {
    const wallId = `wall_${slug(wall.id)}`
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    const children = (wall.openings ?? []).map((opening) => {
      if (opening.offset < -1e-6 || opening.offset + opening.width > length + 1e-6) {
        throw new Error(`${scene.id}: opening ${opening.id} runs off wall ${wall.id}`)
      }
      // Pascal: position is the opening's centre in wall-local metres from wall.start; y is the centre height.
      const x = round(opening.offset + opening.width / 2)
      const common = {
        name: opening.id, parentId: wallId, wallId, width: round(opening.width), height: round(opening.height),
        metadata: { v1Id: opening.id, ...(opening.assetId ? { v1AssetId: opening.assetId } : {}) },
      }
      return opening.kind === 'door'
        ? add(DoorNode.parse({ ...common, id: `door_${slug(opening.id)}`, position: [x, round(opening.height / 2), 0], ...doorStyle(opening.assetId) }))
        : add(WindowNode.parse({ ...common, id: `window_${slug(opening.id)}`, position: [x, round(opening.sill + opening.height / 2), 0], ...windowStyle(opening.assetId) }))
    })
    levelChildren.push(add(WallNode.parse({
      id: wallId, name: metadataName(wall.id) ?? wall.id, parentId: levelId, start: move(wall.start), end: move(wall.end),
      height: wall.height, thickness: round(wall.thickness), children, metadata: { v1Id: wall.id },
      slots: { interior: WALL_PAINT, exterior: WALL_PAINT },
    })))
  }

  const [hx, hy] = [round((maxX - minX) / 2 + SITE_MARGIN, 2), round((maxY - minY) / 2 + SITE_MARGIN, 2)]
  add(SiteNode.parse({
    id: siteId, parentId: null, children: [buildingId],
    polygon: { type: 'polygon', points: [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] },
  }))
  add(BuildingNode.parse({ id: buildingId, name: scene.name, parentId: siteId, children: [levelId] }))
  add(LevelNode.parse({ id: levelId, parentId: buildingId, level: 0, height: wallHeight, children: levelChildren }))

  // Parents before children, the order Pascal's own exports use.
  const ordered: PascalGraph['nodes'] = {}
  for (const id of [siteId, buildingId, levelId, ...Object.keys(nodes)]) ordered[id] = nodes[id]!
  return {
    graph: { nodes: ordered, rootNodeIds: [siteId], collections: {}, materials: {} },
    rooms,
    area: round(rooms.reduce((sum, room) => sum + room.area, 0), 2),
    shift,
  }
}
