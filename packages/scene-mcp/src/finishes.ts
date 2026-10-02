// Finish tools: what walls and floors can be finished with (the shared catalogue), and two conveniences that
// write the right Pascal slots. apply_patch stays usable for the same edits (`slots` on walls and slabs).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneOperations } from '@pascal-app/mcp/operations'
import { z } from 'zod'
import {
  type Finish,
  type FinishSurface,
  getFinish,
  listFinishes,
  suggestFinishes,
} from '../../contracts/src/finishes.ts'
import { facesToward, slotForFace, type WallFace, type WallSlot, wallSideUpdates } from './wall-sides.ts'

type AnyNode = { id: string; type: string; parentId?: string | null; name?: string; [key: string]: unknown }
type Point = [number, number]
type Publish = (operations: SceneOperations, kind: string) => Promise<unknown>

export const FINISH_TOOLS = ['list_finishes', 'set_wall_finish', 'set_floor_finish'] as const

const FAMILIES = ['paint', 'wood', 'stone', 'tile', 'brick', 'concrete'] as const

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
}

function failure(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

const brief = (finish: Finish) => ({ id: finish.id, label: finish.label, family: finish.family, color: finish.color })

/** The finish, or an error that names the closest ones. */
function resolveFinish(id: string, surface: FinishSurface): { finish: Finish } | { error: ReturnType<typeof failure> } {
  const finish = getFinish(id)
  if (finish) return { finish }
  const close = suggestFinishes(id, surface)
  const hint = close.length
    ? ` Closest: ${close.map((f) => `${f.id} (${f.label})`).join(', ')}.`
    : ' Call list_finishes to see them.'
  return { error: failure(`unknown_finish: ${id}.${hint}`) }
}

function surfaceNote(finish: Finish, surface: FinishSurface) {
  return finish.surfaces.includes(surface) ? [] : [`${finish.label} is usually a ${finish.surfaces.join('/')} finish; applied anyway.`]
}

function nodesOf(operations: SceneOperations) {
  return operations.getNodes() as unknown as Record<string, AnyNode>
}

function polygonOf(node: AnyNode | undefined): Point[] | null {
  return node && Array.isArray(node.polygon) && node.polygon.length >= 3 ? (node.polygon as Point[]) : null
}

const wallLength = (wall: AnyNode) => {
  const [sx, sy] = wall.start as Point
  const [ex, ey] = wall.end as Point
  return Math.round(Math.hypot(ex - sx, ey - sy) * 100) / 100
}

/** Point-in-polygon, even-odd rule. */
function inside([x, y]: Point, polygon: Point[]) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function centroid(polygon: Point[]): Point {
  const sum = polygon.reduce<Point>((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0])
  return [sum[0] / polygon.length, sum[1] / polygon.length]
}

export function registerFinishTools(server: McpServer, operations: SceneOperations, publish: Publish) {
  server.registerTool(
    'list_finishes',
    {
      title: 'List finishes',
      description:
        'Finishes walls and floors can take: paint colours, wood floors (including chevron/herringbone parquet), stone, ' +
        'tile, brick, concrete. Each has an id, label, family and colour. Use the id with set_wall_finish or ' +
        'set_floor_finish, or write `library:<id>` into a wall or slab slot with apply_patch. query ranks by words ' +
        '(e.g. "deep green", "herringbone oak").',
      inputSchema: {
        surface: z.enum(['wall', 'floor']).optional(),
        family: z.enum(FAMILIES).optional(),
        query: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ surface, family, query }) => {
      let found = query?.trim() ? suggestFinishes(query, surface, 12) : listFinishes({ surface, family })
      if (query?.trim() && family) found = found.filter((finish) => finish.family === family)
      return text({ count: found.length, finishes: found.map(brief) })
    },
  )

  server.registerTool(
    'set_wall_finish',
    {
      title: 'Set wall finish',
      description:
        'Paint or clad walls. Give zone_id (a room) to finish every wall around it, or wall_ids (with zone_id to say ' +
        'which room they face). side: "room" = the face toward that room (or the interior faces when no zone is ' +
        'given), "outside" = the other face, "both". Writes the wall slot Pascal paints on that face and returns ' +
        'which walls and slots changed.',
      inputSchema: {
        finish_id: z.string().min(1),
        zone_id: z.string().optional(),
        wall_ids: z.array(z.string()).optional(),
        side: z.enum(['room', 'outside', 'both']).optional().describe('Default "room".'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ finish_id, zone_id, wall_ids, side = 'room' }) => {
      const resolved = resolveFinish(finish_id, 'wall')
      if ('error' in resolved) return resolved.error
      const { finish } = resolved
      if (!zone_id && !wall_ids?.length) return failure('missing_target: give zone_id, wall_ids, or both')
      const nodes = nodesOf(operations)

      let zonePolygon: Point[] | null = null
      if (zone_id) {
        const zone = nodes[zone_id]
        if (!zone || zone.type !== 'zone') return failure(`zone_not_found: ${zone_id}`)
        zonePolygon = polygonOf(zone)
        if (!zonePolygon) return failure(`zone_without_outline: ${zone_id}`)
      }

      // Sides the editor will tag at load for walls stored as unknown (same rules, wall-sides.ts).
      const predicted = new Map(wallSideUpdates(nodes as never).map((u) => [u.id, u]))
      const withTags = (wall: AnyNode) => {
        const tags = predicted.get(wall.id)
        return tags ? { ...wall, frontSide: tags.frontSide, backSide: tags.backSide } : wall
      }

      let walls: AnyNode[]
      if (wall_ids?.length) {
        const missing = wall_ids.filter((id) => nodes[id]?.type !== 'wall')
        if (missing.length) return failure(`wall_not_found: ${missing.join(', ')}`)
        walls = wall_ids.map((id) => nodes[id]!)
      } else {
        const levelId = operations.resolveLevelId(zone_id as never)
        walls = Object.values(nodes).filter(
          (node) => node.type === 'wall' && node.parentId === levelId && facesToward(node, zonePolygon!).length > 0,
        )
        if (!walls.length) return failure(`no_walls_around_zone: ${zone_id}`)
      }

      const notes = surfaceNote(finish, 'wall')
      const changed: Array<{ id: string; name?: string; length: number; slots: WallSlot[] }> = []
      const patches: Array<{ op: 'update'; id: string; data: Record<string, unknown> }> = []
      for (const stored of walls) {
        const wall = withTags(stored)
        let faces: WallFace[]
        if (side === 'both') faces = ['front', 'back']
        else if (zonePolygon) {
          const toward = facesToward(wall, zonePolygon)
          if (!toward.length) return failure(`wall_not_facing_zone: ${wall.id} does not border ${zone_id}`)
          faces = side === 'room' ? toward : (['front', 'back'] as WallFace[]).filter((face) => !toward.includes(face))
          if (!faces.length) notes.push(`${wall.id}: both faces look into ${zone_id}; no outside face.`)
        } else {
          const wanted = side === 'room' ? 'interior' : 'exterior'
          faces = (['front', 'back'] as WallFace[]).filter((face) => (face === 'front' ? wall.frontSide : wall.backSide) === wanted)
          if (!faces.length) {
            return failure(
              `ambiguous_side: ${wall.id} has rooms on both sides or untagged sides; pass zone_id to say which room's side to finish`,
            )
          }
        }
        const slots = [...new Set(faces.map((face) => slotForFace(wall, face)))]
        if (!slots.length) continue
        if (side !== 'both' && faces.length === 1 && slotForFace(wall, 'front') === slotForFace(wall, 'back')) {
          notes.push(`${wall.id}: both faces are tagged ${slots[0]} and share one slot, so both changed.`)
        }
        const data: Record<string, unknown> = {
          slots: { ...((stored.slots as Record<string, string> | undefined) ?? {}), ...Object.fromEntries(slots.map((slot) => [slot, finish.ref])) },
        }
        // Keep the sides the slots were chosen by, so the editor's load-time tagging cannot move the paint.
        if (wall !== stored) Object.assign(data, { frontSide: wall.frontSide, backSide: wall.backSide })
        patches.push({ op: 'update', id: stored.id, data })
        changed.push({ id: stored.id, name: stored.name, length: wallLength(stored), slots })
      }
      if (!patches.length) return failure('nothing_to_change')
      operations.applyPatch(patches as never)
      await publish(operations, 'set_wall_finish')
      return text({ finish: brief(finish), walls: changed, ...(notes.length ? { notes } : {}) })
    },
  )

  server.registerTool(
    'set_floor_finish',
    {
      title: 'Set floor finish',
      description:
        "Change a room's floor. Give zone_id (the room) or slab_id. Writes the slab's `surface` slot.",
      inputSchema: {
        finish_id: z.string().min(1),
        zone_id: z.string().optional(),
        slab_id: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ finish_id, zone_id, slab_id }) => {
      const resolved = resolveFinish(finish_id, 'floor')
      if ('error' in resolved) return resolved.error
      const { finish } = resolved
      const nodes = nodesOf(operations)
      let slab: AnyNode | undefined
      if (slab_id) {
        slab = nodes[slab_id]
        if (!slab || slab.type !== 'slab') return failure(`slab_not_found: ${slab_id}`)
      } else if (zone_id) {
        const zone = nodes[zone_id]
        if (!zone || zone.type !== 'zone') return failure(`zone_not_found: ${zone_id}`)
        slab = slabUnder(zone, nodes)
        if (!slab) return failure(`no_slab_under_zone: ${zone_id}; create one with apply_patch (type "slab", polygon, slots.surface)`)
      } else {
        return failure('missing_target: give zone_id or slab_id')
      }
      const slots = { ...((slab.slots as Record<string, string> | undefined) ?? {}), surface: finish.ref }
      operations.applyPatch([{ op: 'update', id: slab.id, data: { slots } }] as never)
      await publish(operations, 'set_floor_finish')
      const notes = surfaceNote(finish, 'floor')
      return text({ finish: brief(finish), slab: { id: slab.id, name: slab.name }, ...(notes.length ? { notes } : {}) })
    },
  )
}

/** The slab under a zone: same v1 room id when the flat came from a template, else the one the zone's centre is on. */
function slabUnder(zone: AnyNode, nodes: Record<string, AnyNode>): AnyNode | undefined {
  const slabs = Object.values(nodes).filter((node) => node.type === 'slab' && node.parentId === zone.parentId)
  const v1Id = (zone.metadata as { v1Id?: string } | undefined)?.v1Id
  const byId = v1Id ? slabs.find((slab) => (slab.metadata as { v1Id?: string } | undefined)?.v1Id === v1Id) : undefined
  if (byId) return byId
  const outline = polygonOf(zone)
  if (!outline) return undefined
  const centre = centroid(outline)
  return (
    slabs.find((slab) => polygonOf(slab) && inside(centre, polygonOf(slab)!)) ??
    slabs.find((slab) => polygonOf(slab) && inside(centroid(polygonOf(slab)!), outline))
  )
}
