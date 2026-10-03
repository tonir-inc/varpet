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

export type AnyNode = { id: string; type: string; parentId?: string | null; name?: string; [key: string]: unknown }
type Point = [number, number]
type Publish = (operations: SceneOperations, kind: string) => Promise<unknown>

export const FINISH_TOOLS = ['list_finishes', 'set_wall_finish', 'set_floor_finish'] as const

const FAMILIES = ['paint', 'wood', 'stone', 'tile', 'brick', 'concrete', 'wallpaper'] as const

export function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
}

export function failure(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

const brief = (finish: Finish) => ({ id: finish.id, label: finish.label, family: finish.family, color: finish.color })

/** The finish, or an error that names the closest ones. */
export function resolveFinish(id: string, surface: FinishSurface): { finish: Finish } | { error: ReturnType<typeof failure> } {
  const finish = getFinish(id)
  if (finish) return { finish }
  const close = suggestFinishes(id, surface)
  const hint = close.length
    ? ` Closest: ${close.map((f) => `${f.id} (${f.label})`).join(', ')}.`
    : ' Call list_finishes to see them.'
  return { error: failure(`unknown_finish: ${id}.${hint}`) }
}

export function surfaceNote(finish: Finish, surface: FinishSurface) {
  return finish.surfaces.includes(surface) ? [] : [`${finish.label} is usually a ${finish.surfaces.join('/')} finish; applied anyway.`]
}

export function nodesOf(operations: SceneOperations) {
  return operations.getNodes() as unknown as Record<string, AnyNode>
}

function polygonOf(node: AnyNode | undefined): Point[] | null {
  return node && Array.isArray(node.polygon) && node.polygon.length >= 3 ? (node.polygon as Point[]) : null
}

export const wallLength = (wall: AnyNode) => {
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

export interface WallTarget {
  /** The wall as stored. */
  stored: AnyNode
  /** The wall with the side tags the editor will give it at load (equal to stored when it had tags). */
  wall: AnyNode
  /** The faces the call is about. */
  faces: WallFace[]
  /** The tags to store with the change when the wall had none (so load-time tagging cannot move the edit). */
  tagged?: { frontSide: unknown; backSide: unknown }
}

/**
 * The walls and faces a wall tool acts on: zone_id alone = every wall with a face toward the room; wall_ids (with
 * zone_id to name the room) = those walls. side "room" = the face toward the room (the interior-tagged faces
 * without a zone), "outside" = the other face, "both".
 */
export function wallTargets(
  operations: SceneOperations,
  { zone_id, wall_ids, side, verb }: { zone_id?: string; wall_ids?: string[]; side: 'room' | 'outside' | 'both'; verb: string },
): { targets: WallTarget[]; notes: string[] } | { error: ReturnType<typeof failure> } {
  if (!zone_id && !wall_ids?.length) return { error: failure('missing_target: give zone_id, wall_ids, or both') }
  const nodes = nodesOf(operations)
  let zonePolygon: Point[] | null = null
  if (zone_id) {
    const zone = nodes[zone_id]
    if (!zone || zone.type !== 'zone') return { error: failure(`zone_not_found: ${zone_id}`) }
    zonePolygon = polygonOf(zone)
    if (!zonePolygon) return { error: failure(`zone_without_outline: ${zone_id}`) }
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
    if (missing.length) return { error: failure(`wall_not_found: ${missing.join(', ')}`) }
    walls = wall_ids.map((id) => nodes[id]!)
  } else {
    const levelId = operations.resolveLevelId(zone_id as never)
    walls = Object.values(nodes).filter(
      (node) => node.type === 'wall' && node.parentId === levelId && facesToward(node, zonePolygon!).length > 0,
    )
    if (!walls.length) return { error: failure(`no_walls_around_zone: ${zone_id}`) }
  }

  const notes: string[] = []
  const targets: WallTarget[] = []
  for (const stored of walls) {
    const wall = withTags(stored)
    let faces: WallFace[]
    if (side === 'both') faces = ['front', 'back']
    else if (zonePolygon) {
      const toward = facesToward(wall, zonePolygon)
      if (!toward.length) return { error: failure(`wall_not_facing_zone: ${wall.id} does not border ${zone_id}`) }
      faces = side === 'room' ? toward : (['front', 'back'] as WallFace[]).filter((face) => !toward.includes(face))
      if (!faces.length) notes.push(`${wall.id}: both faces look into ${zone_id}; no outside face.`)
    } else {
      const wanted = side === 'room' ? 'interior' : 'exterior'
      faces = (['front', 'back'] as WallFace[]).filter((face) => (face === 'front' ? wall.frontSide : wall.backSide) === wanted)
      if (!faces.length) {
        return {
          error: failure(
            `ambiguous_side: ${wall.id} has rooms on both sides or untagged sides; pass zone_id to say which room's side to ${verb}`,
          ),
        }
      }
    }
    const tagged = wall !== stored ? { frontSide: wall.frontSide, backSide: wall.backSide } : undefined
    targets.push({ stored, wall, faces, ...(tagged ? { tagged } : {}) })
  }
  return { targets, notes }
}

/** The band count a wall is split into (1 = not split; Pascal's faceBands). */
export function bandCount(wall: AnyNode): number {
  const bands = wall.faceBands as { enabled?: boolean; count?: number } | undefined
  if (!bands?.enabled) return 1
  return Math.max(1, Math.min(4, Math.round(bands.count ?? 3)))
}

/** The topmost band slot a split wall shows on one side (`upperInterior`, `topExterior`...), null when not split. */
export function topBandSlot(wall: AnyNode, side: WallSlot): string | null {
  const count = bandCount(wall)
  if (count <= 1) return null
  return `${count >= 4 ? 'top' : 'upper'}${side === 'interior' ? 'Interior' : 'Exterior'}`
}

export function registerFinishTools(server: McpServer, operations: SceneOperations, publish: Publish) {
  server.registerTool(
    'list_finishes',
    {
      title: 'List finishes',
      description:
        'Finishes walls and floors can take: paint colours, wood floors (including chevron/herringbone parquet), stone, ' +
        'tile, brick, concrete, patterned wallpapers. Each has an id, label, family and colour. Use the id with set_wall_finish or ' +
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
        'which walls and slots changed; on walls with untagged sides it also stores the sides it used (sidesTagged). ' +
        'On a wall with a wainscot (set_wainscot) it finishes the part above it. Skirting, crown, chair rail: set_wall_trim.',
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
      const targeted = wallTargets(operations, { zone_id, wall_ids, side, verb: 'finish' })
      if ('error' in targeted) return targeted.error
      const notes = [...surfaceNote(finish, 'wall'), ...targeted.notes]
      const changed: Array<{ id: string; name?: string; length: number; slots: string[]; sidesTagged?: { frontSide: unknown; backSide: unknown } }> = []
      const patches: Array<{ op: 'update'; id: string; data: Record<string, unknown> }> = []
      for (const { stored, wall, faces, tagged } of targeted.targets) {
        const sides = [...new Set(faces.map((face) => slotForFace(wall, face)))]
        if (!sides.length) continue
        if (side !== 'both' && faces.length === 1 && slotForFace(wall, 'front') === slotForFace(wall, 'back')) {
          notes.push(`${wall.id}: both faces are tagged ${sides[0]} and share one slot, so both changed.`)
        }
        // A wall split into bands (set_wainscot) shows its band slots instead of the whole-face slot: the finish
        // goes to the topmost band too, so painting keeps working above a wainscot.
        const top = sides.map((s) => topBandSlot(stored, s)).filter((slot): slot is string => slot !== null)
        const slots = [...sides, ...top]
        const data: Record<string, unknown> = {
          slots: { ...((stored.slots as Record<string, string> | undefined) ?? {}), ...Object.fromEntries(slots.map((slot) => [slot, finish.ref])) },
        }
        // Keep the sides the slots were chosen by, so the editor's load-time tagging cannot move the paint.
        if (tagged) Object.assign(data, tagged)
        patches.push({ op: 'update', id: stored.id, data })
        changed.push({ id: stored.id, name: stored.name, length: wallLength(stored), slots, ...(tagged ? { sidesTagged: tagged } : {}) })
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
