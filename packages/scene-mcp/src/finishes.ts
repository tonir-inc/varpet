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
import { planWallDivisions } from '@pascal-app/core'
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
  /** The wall as stored (after any split this call makes). */
  stored: AnyNode
  /** The wall with the side tags the editor will give it at load (equal to stored when it had tags). */
  wall: AnyNode
  /** The faces the call is about. */
  faces: WallFace[]
  /** The tags to store with the change when the wall had none (so load-time tagging cannot move the edit). */
  tagged?: { frontSide: unknown; backSide: unknown }
}

type NodePatch = { op: 'update'; id: string; data: Record<string, unknown> }

/** Walls split at a room's edges by a zone-scoped call, applied in the same patch as the finish. */
export interface WallSplitPlan {
  creates: Array<{ node: AnyNode; parentId?: string }>
  updates: Map<string, Record<string, unknown>>
  /** Each split wall and the pieces it became (the first piece keeps the wall's id). */
  splits: Array<{ wall: string; pieces: string[] }>
}

// How a wall face meets the rooms: samples every ~2 cm, 5 cm in front of the face.
const SAMPLE_STEP = 0.02
const BEYOND_FACE = 0.05
/** Shorter touches are corner noise, not a face of the room. */
const MIN_ROOM_RUN = 0.05
/** The neighbouring room must hold this much of the face before the wall is split for it. */
const MIN_OTHER_RUN = 0.1
/** Pascal keeps at least 5 cm on each side of a split. */
const MIN_PIECE = 0.06

type Sample = 'room' | 'other' | 'hidden' | 'open'
export interface FaceRun { kind: Sample; from: number; to: number }

function frame(wall: AnyNode) {
  const [sx, sy] = wall.start as Point
  const [ex, ey] = wall.end as Point
  const length = Math.hypot(ex - sx, ey - sy)
  const dir: Point = length > 1e-9 ? [(ex - sx) / length, (ey - sy) / length] : [1, 0]
  // Front = the left normal of start->end, as in Pascal.
  return { start: [sx, sy] as Point, dir, normal: [-dir[1], dir[0]] as Point, length, half: ((wall.thickness as number | undefined) ?? 0.2) / 2 }
}

const isCurved = (wall: AnyNode) => Math.abs((wall.curveOffset as number | undefined) ?? 0) > 1e-6

function inFootprint([x, y]: Point, wall: AnyNode) {
  const { start, dir, length, half } = frame(wall)
  const dx = x - start[0]
  const dy = y - start[1]
  const along = dx * dir[0] + dy * dir[1]
  const across = -dx * dir[1] + dy * dir[0]
  return along >= -1e-6 && along <= length + 1e-6 && Math.abs(across) <= half + 1e-6
}

/** Classifies points on one level: in the room, in another zone (balconies too), inside a wall, or open air. */
function classifier(nodes: Record<string, AnyNode>, levelId: string, zoneId: string, zonePolygon: Point[]) {
  const others = Object.values(nodes)
    .filter((node) => node.type === 'zone' && node.parentId === levelId && node.id !== zoneId)
    .map(polygonOf)
    .filter((polygon): polygon is Point[] => polygon !== null)
  const walls = Object.values(nodes).filter((node) => node.type === 'wall' && node.parentId === levelId)
  return (point: Point, self?: string): Sample => {
    if (inside(point, zonePolygon)) return 'room'
    if (others.some((polygon) => inside(point, polygon))) return 'other'
    if (walls.some((wall) => wall.id !== self && inFootprint(point, wall))) return 'hidden'
    return 'open'
  }
}

/** What one face of a straight wall looks onto along its length, as runs (metres from the start). */
export function faceRuns(wall: AnyNode, face: WallFace, classify: (point: Point, self?: string) => Sample): FaceRun[] {
  const { start, dir, normal, length, half } = frame(wall)
  if (length < 1e-6) return []
  const sign = face === 'front' ? 1 : -1
  const count = Math.max(1, Math.ceil(length / SAMPLE_STEP))
  const step = length / count
  const runs: FaceRun[] = []
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) * step
    const off = (half + BEYOND_FACE) * sign
    const kind = classify([start[0] + dir[0] * s + normal[0] * off, start[1] + dir[1] * s + normal[1] * off], wall.id)
    const last = runs[runs.length - 1]
    if (last && last.kind === kind) last.to = (i + 1) * step
    else runs.push({ kind, from: i * step, to: (i + 1) * step })
  }
  return runs
}

const touchesRoom = (runs: FaceRun[]) => runs.some((run) => run.kind === 'room' && run.to - run.from >= MIN_ROOM_RUN)

/**
 * Where a face passes from the room to another room (or back): the middle of what lies between them (a partition
 * meeting the wall, or nothing at an open boundary). Only real crossings of the room's edge count.
 */
export function roomEdgesAlong(runs: FaceRun[]): number[] {
  const cuts: number[] = []
  const solid = runs.filter(
    (run) => (run.kind === 'room' && run.to - run.from >= MIN_ROOM_RUN) || (run.kind === 'other' && run.to - run.from >= MIN_OTHER_RUN),
  )
  for (let i = 1; i < solid.length; i++) {
    const a = solid[i - 1]!
    const b = solid[i]!
    if (a.kind !== b.kind) cuts.push((a.to + b.from) / 2)
  }
  return cuts
}

/** How far a cut may move to the edge of a door, window or hung item that the room's edge runs through. */
const CUT_NUDGE = 0.15

/** Where the doors, windows and hung items of a wall sit along it (metres from the start). */
function openingSpans(wall: AnyNode, nodes: Record<string, AnyNode>): Array<[number, number]> {
  return Object.values(nodes)
    .filter((node) => (node.parentId === wall.id || node.wallId === wall.id) && ['door', 'window', 'item'].includes(node.type))
    .flatMap((node) => {
      const x = (node.position as number[] | undefined)?.[0]
      const width = node.type === 'item' ? ((node.asset as { dimensions?: number[] } | undefined)?.dimensions?.[0] ?? 0) * ((node.scale as number[] | undefined)?.[0] ?? 1) : (node.width as number | undefined)
      return typeof x === 'number' && typeof width === 'number' ? [[x - width / 2, x + width / 2] as [number, number]] : []
    })
}

/** A cut that falls just inside an opening moves to its nearer edge (a painter stops at the reveal). */
function clearOfOpenings(at: number, spans: Array<[number, number]>) {
  for (const [min, max] of spans) {
    if (at <= min || at >= max) continue
    if (at - min <= CUT_NUDGE && at - min <= max - at) return min - 0.005
    if (max - at <= CUT_NUDGE) return max + 0.005
  }
  return at
}

function applyChanges(nodes: Record<string, AnyNode>, changes: { create: Array<{ node: unknown; parentId?: unknown }>; update: Array<{ id: unknown; data: unknown }> }) {
  for (const { node, parentId } of changes.create) {
    const created = node as AnyNode
    nodes[created.id] = { ...created, ...(parentId ? { parentId: parentId as string } : {}) }
  }
  for (const { id, data } of changes.update) nodes[id as string] = { ...nodes[id as string]!, ...(data as Record<string, unknown>) }
}

/**
 * Splits the walls whose room-side face runs on into a neighbouring room (or a balcony) at the room's edge, with
 * Pascal's own wall division (what its editor does when a wall is cut): the first piece keeps the id; doors, windows
 * and hung items move to the piece they sit on; slots, trims, bands and tags are copied, so nothing changes look.
 * A wall is not split where an opening or a hung item spans the edge.
 */
function splitAtRoomEdges(
  nodes: Record<string, AnyNode>,
  candidates: AnyNode[],
  classify: (point: Point, self?: string) => Sample,
  notes: string[],
): { nodes: Record<string, AnyNode>; plan: WallSplitPlan } {
  const virtual = { ...nodes }
  const plan: WallSplitPlan = { creates: [], updates: new Map(), splits: [] }
  for (const wall of candidates) {
    if (isCurved(wall)) continue
    const length = frame(wall).length
    const spans = openingSpans(wall, virtual)
    const cuts = (['front', 'back'] as WallFace[])
      .flatMap((face) => roomEdgesAlong(faceRuns(wall, face, classify)))
      .map((at) => clearOfOpenings(at, spans))
      .filter((at) => at > MIN_PIECE && at < length - MIN_PIECE)
      .sort((a, b) => a - b)
      .filter((at, i, all) => i === 0 || at - all[i - 1]! > MIN_PIECE)
    if (!cuts.length) continue
    let changes: { create: Array<{ node: unknown; parentId?: unknown }>; update: Array<{ id: unknown; data: unknown }> }
    try {
      changes = planWallDivisions(virtual as never, wall.id as never, cuts).changes as never
    } catch {
      notes.push(`${wall.id}: runs on into the next room, but a door, window or hung item spans the room's edge, so it was not split; its whole face changed.`)
      continue
    }
    applyChanges(virtual, changes)
    for (const { node, parentId } of changes.create) plan.creates.push({ node: node as AnyNode, ...(parentId ? { parentId: parentId as string } : {}) })
    for (const { id, data } of changes.update) plan.updates.set(id as string, { ...(plan.updates.get(id as string) ?? {}), ...(data as Record<string, unknown>) })
    const { start, dir } = frame(wall)
    const along = (piece: AnyNode) => ((piece.start as Point)[0] - start[0]) * dir[0] + ((piece.start as Point)[1] - start[1]) * dir[1]
    const pieces = [wall.id, ...changes.create.map(({ node }) => (node as AnyNode).id)].sort((a, b) => along(virtual[a]!) - along(virtual[b]!))
    plan.splits.push({ wall: wall.id, pieces })
  }
  return { nodes: virtual, plan }
}

/**
 * The walls and faces a wall tool acts on: zone_id alone = every wall face that bounds the room (any part of it
 * looking into the room, piers and returns included); wall_ids (with zone_id to name the room) = those walls. With a
 * zone, a wall whose face runs on into the next room is split at the room's edge first (WallSplitPlan), so the
 * neighbour keeps its finish. side "room" = the face toward the room (the interior-tagged faces without a zone),
 * "outside" = the other face, "both". A wall in the room whose far face is buried in another wall (a column, a
 * return) gets that face too, so its end caps show the finish whole.
 */
export function wallTargets(
  operations: SceneOperations,
  { zone_id, wall_ids, side, verb }: { zone_id?: string; wall_ids?: string[]; side: 'room' | 'outside' | 'both'; verb: string },
): { targets: WallTarget[]; notes: string[]; plan: WallSplitPlan } | { error: ReturnType<typeof failure> } {
  if (!zone_id && !wall_ids?.length) return { error: failure('missing_target: give zone_id, wall_ids, or both') }
  let nodes = nodesOf(operations)
  const notes: string[] = []
  let plan: WallSplitPlan = { creates: [], updates: new Map(), splits: [] }
  let zonePolygon: Point[] | null = null
  let classify: ((point: Point, self?: string) => Sample) | null = null
  let levelId: string | null = null
  if (zone_id) {
    const zone = nodes[zone_id]
    if (!zone || zone.type !== 'zone') return { error: failure(`zone_not_found: ${zone_id}`) }
    zonePolygon = polygonOf(zone)
    if (!zonePolygon) return { error: failure(`zone_without_outline: ${zone_id}`) }
    levelId = operations.resolveLevelId(zone_id as never) as string
  }
  if (wall_ids?.length) {
    const missing = wall_ids.filter((id) => nodes[id]?.type !== 'wall')
    if (missing.length) return { error: failure(`wall_not_found: ${missing.join(', ')}`) }
  }

  const facing = (wall: AnyNode) =>
    isCurved(wall) ? facesToward(wall, zonePolygon!) : (['front', 'back'] as WallFace[]).filter((face) => touchesRoom(faceRuns(wall, face, classify!)))
  let walls: AnyNode[]
  if (zonePolygon && levelId) {
    classify = classifier(nodes, levelId, zone_id!, zonePolygon)
    const named = wall_ids?.length ? new Set(wall_ids) : null
    const around = Object.values(nodes).filter((node) => node.type === 'wall' && node.parentId === levelId && facing(node).length > 0)
    const split = splitAtRoomEdges(nodes, named ? around.filter((wall) => named.has(wall.id)) : around, classify, notes)
    nodes = split.nodes
    plan = split.plan
    classify = classifier(nodes, levelId, zone_id!, zonePolygon)
    const pieces = new Map(plan.splits.map(({ wall, pieces }) => [wall, pieces]))
    if (named) {
      // A named wall that was split stands for its pieces in the room; the ones in the next room are left alone.
      walls = wall_ids!.flatMap((id) => {
        const split = pieces.get(id)
        return split ? split.map((piece) => nodes[piece]!).filter((piece) => facing(piece).length > 0) : [nodes[id]!]
      })
    } else {
      walls = Object.values(nodes).filter((node) => node.type === 'wall' && node.parentId === levelId && facing(node).length > 0)
    }
    if (!walls.length) return { error: failure(`no_walls_around_zone: ${zone_id}`) }
  } else {
    walls = wall_ids!.map((id) => nodes[id]!)
  }

  // Sides the editor will tag at load for walls stored as unknown (same rules, wall-sides.ts), on the split walls.
  const predicted = new Map(wallSideUpdates(nodes as never).map((u) => [u.id, u]))
  const withTags = (wall: AnyNode) => {
    const tags = predicted.get(wall.id)
    return tags ? { ...wall, frontSide: tags.frontSide, backSide: tags.backSide } : wall
  }

  const targets: WallTarget[] = []
  for (const stored of walls) {
    const wall = withTags(stored)
    let faces: WallFace[]
    if (side === 'both') faces = ['front', 'back']
    else if (zonePolygon) {
      const toward = facing(wall)
      if (!toward.length) return { error: failure(`wall_not_facing_zone: ${wall.id} does not border ${zone_id}`) }
      if (side === 'room' && toward.length === 1 && !isCurved(wall) && buriedReturn(wall, toward[0]!, classify!)) {
        faces = ['front', 'back']
      } else {
        faces = side === 'room' ? toward : (['front', 'back'] as WallFace[]).filter((face) => !toward.includes(face))
      }
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
  if (plan.splits.length) {
    notes.push(
      `Split at the room's edge so the next room keeps its finish (first piece keeps the id; use the new ids from now on): ${plan.splits
        .map(({ wall, pieces }) => `${wall} -> ${pieces.join(' + ')}`)
        .join('; ')}.`,
    )
  }
  return { targets, notes, plan }
}

/** A column or return: its far face lies buried in other walls and one of its ends stands in the room. */
function buriedReturn(wall: AnyNode, toward: WallFace, classify: (point: Point, self?: string) => Sample) {
  const far = faceRuns(wall, toward === 'front' ? 'back' : 'front', classify)
  if (!far.length || far.some((run) => run.kind !== 'hidden')) return false
  const { start, dir, length } = frame(wall)
  const past = (s: number): Point => [start[0] + dir[0] * s, start[1] + dir[1] * s]
  return classify(past(-BEYOND_FACE), wall.id) === 'room' || classify(past(length + BEYOND_FACE), wall.id) === 'room'
}

/**
 * Applies a wall tool's per-wall updates together with the splits its targets needed, as one undoable patch:
 * new pieces are created with their finish, split walls get their new geometry and finish in one update.
 */
export function commitWallPatches(operations: SceneOperations, plan: WallSplitPlan, patches: NodePatch[]) {
  const creates = plan.creates.map(({ node, parentId }) => ({ node: { ...node }, parentId }))
  const byId = new Map(creates.map((create) => [create.node.id, create]))
  const updates = new Map(plan.updates)
  for (const { id, data } of patches) {
    const created = byId.get(id)
    if (created) created.node = { ...created.node, ...data }
    else updates.set(id, { ...(updates.get(id) ?? {}), ...data })
  }
  operations.applyPatch([
    ...creates.map(({ node, parentId }) => ({ op: 'create' as const, node, ...(parentId ? { parentId } : {}) })),
    ...[...updates].map(([id, data]) => ({ op: 'update' as const, id, data })),
  ] as never)
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

/** The `split` field of a wall tool's result: the walls it split and their pieces. */
export const splitsOf = (plan: WallSplitPlan) => (plan.splits.length ? { split: plan.splits } : {})

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
        'Paint or clad walls. Give zone_id (a room) to finish every wall face that bounds it (piers, returns, column ' +
        'ends and reveals included), or wall_ids (with zone_id to say which room they face). With zone_id, a wall that ' +
        'runs on into the next room is split at the room\'s edge first, so the neighbour keeps its finish: the result\'s ' +
        '`split` lists the pieces (the first keeps the id); use those ids from then on. side: "room" = the face toward ' +
        'that room (or the interior faces when no zone is given), "outside" = the other face, "both". Returns which ' +
        'walls and slots changed; on walls with untagged sides it also stores the sides it used (sidesTagged). On a ' +
        'wall with a wainscot (set_wainscot) it finishes the part above it. Skirting, crown, chair rail: set_wall_trim.',
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
      const patches: NodePatch[] = []
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
      commitWallPatches(operations, targeted.plan, patches)
      await publish(operations, 'set_wall_finish')
      return text({ finish: brief(finish), walls: changed, ...splitsOf(targeted.plan), ...(notes.length ? { notes } : {}) })
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
