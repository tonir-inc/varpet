// Wall treatments: skirting, crown and chair rail (Pascal 1.0.3 `skirting` / `crown` / `chairRail` on a wall, one
// config per wall, `sides` the only per-face setting) and a wainscot (Pascal's face bands: count 2, a lower band with
// its own slot per side). Pure helpers first, then the two tools.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SceneOperations } from '@pascal-app/mcp/operations'
import { z } from 'zod'
import type { Finish } from '../../contracts/src/finishes.ts'
import {
  type AnyNode,
  bandCount,
  failure,
  resolveFinish,
  surfaceNote,
  text,
  wallLength,
  wallTargets,
} from './finishes.ts'
import { slotForFace, type WallFace, type WallSlot } from './wall-sides.ts'

type Publish = (operations: SceneOperations, kind: string) => Promise<unknown>

export const WALL_TRIM_TOOLS = ['set_wall_trim', 'set_wainscot'] as const

export type TrimKind = 'skirting' | 'crown' | 'chairRail'
export type TrimSides = 'interior' | 'exterior' | 'both'

export interface TrimConfig {
  enabled: boolean
  sides: TrimSides
  height: number
  proud: number
  profile: string
  offsetY?: number
}

/** Pascal 1.0.3's defaults (core WALL_TRIM_DEFAULTS); written out in full so a stored config never leans on them. */
export const TRIM_DEFAULTS: Record<TrimKind, TrimConfig> = {
  skirting: { enabled: false, sides: 'both', height: 0.12, proud: 0.02, profile: 'flat' },
  crown: { enabled: false, sides: 'both', height: 0.12, proud: 0.055, profile: 'flat' },
  chairRail: { enabled: false, sides: 'both', height: 0.055, proud: 0.026, profile: 'flat', offsetY: 0.9 },
}

/** The profiles Pascal draws for each kind (nodes/wall/treatments.tsx TRIM_PROFILES); others fall back to flat. */
export const TRIM_PROFILES: Record<TrimKind, readonly string[]> = {
  skirting: ['flat', 'bevel', 'triangle', 'cove', 'bullnose', 'base-modern', 'base-colonial', 'base-shoe', 'base-ogee'],
  crown: ['flat', 'bevel', 'triangle', 'cove', 'bullnose', 'crown-cove', 'crown-ogee', 'crown-craftsman', 'crown-layered'],
  chairRail: ['flat', 'bevel', 'triangle', 'cove', 'bullnose', 'rail-rounded', 'rail-ogee', 'rail-picture', 'rail-stepped'],
}
const PROFILE_PREFIX: Record<TrimKind, string> = { skirting: 'base', crown: 'crown', chairRail: 'rail' }

/** A profile name for a kind, accepting the short form (`ogee` -> `base-ogee` for skirting); null when it has none. */
export function trimProfile(kind: TrimKind, profile: string): string | null {
  const name = profile.trim().toLowerCase()
  if (TRIM_PROFILES[kind].includes(name)) return name
  const long = `${PROFILE_PREFIX[kind]}-${name}`
  return TRIM_PROFILES[kind].includes(long) ? long : null
}

/** The face Pascal draws a trim side on (treatments.tsx resolveTreatmentSideSign: +1 front, -1 back). */
export function faceOfTrimSide(wall: AnyNode, side: WallSlot): WallFace {
  if (side === 'interior') {
    if (wall.frontSide === 'interior') return 'front'
    if (wall.backSide === 'interior') return 'back'
    return 'front'
  }
  if (wall.frontSide === 'exterior') return 'front'
  if (wall.backSide === 'exterior') return 'back'
  return 'back'
}

/** The trim side that draws on a face, or null when Pascal cannot reach that face (both faces tagged exterior). */
export function trimSideForFace(wall: AnyNode, face: WallFace): WallSlot | null {
  if (faceOfTrimSide(wall, 'interior') === face) return 'interior'
  if (faceOfTrimSide(wall, 'exterior') === face) return 'exterior'
  return null
}

const sidesSet = (sides: TrimSides): Set<WallSlot> => new Set(sides === 'both' ? ['interior', 'exterior'] : [sides])
const sidesOf = (set: Set<WallSlot>): TrimSides | null =>
  set.size === 2 ? 'both' : set.has('interior') ? 'interior' : set.has('exterior') ? 'exterior' : null

/**
 * The next trim config: `on` adds the given trim sides to those the trim already shows on, `off` removes them (the
 * trim is disabled when none is left). Size, profile and height above the floor apply to every side of the wall.
 */
export function nextTrim(
  kind: TrimKind,
  current: Partial<TrimConfig> | undefined,
  sides: WallSlot[],
  change: { enabled: boolean; height?: number; proud?: number; profile?: string; offsetY?: number },
): TrimConfig {
  const base: TrimConfig = { ...TRIM_DEFAULTS[kind], ...(current ?? {}) }
  const have = base.enabled ? sidesSet(base.sides) : new Set<WallSlot>()
  for (const side of sides) change.enabled ? have.add(side) : have.delete(side)
  const next: TrimConfig = { ...base, sides: sidesOf(have) ?? base.sides, enabled: have.size > 0 }
  if (change.height !== undefined) next.height = change.height
  if (change.proud !== undefined) next.proud = change.proud
  if (change.profile !== undefined) next.profile = change.profile
  if (change.offsetY !== undefined) next.offsetY = change.offsetY
  return next
}

const SLOT_SUFFIX: Record<WallSlot, string> = { interior: 'Interior', exterior: 'Exterior' }
export const trimSlot = (kind: TrimKind, side: WallSlot) => `${kind}${SLOT_SUFFIX[side]}`

/** Where a chair rail sits on a wall split into a wainscot: straddling the seam. */
export const railOverSeam = (lowerHeight: number, railHeight: number) => Math.round((lowerHeight - railHeight / 2) * 1000) / 1000

/** The lower band's top on a split wall, null when the wall is not split. */
export function wainscotHeight(wall: AnyNode): number | null {
  if (bandCount(wall) < 2) return null
  return ((wall.faceBands as { lowerHeight?: number } | undefined)?.lowerHeight ?? 0.84)
}

/**
 * Slots and face bands for a wainscot on some paint sides of a wall (Pascal shows `lower<Side>` below lowerHeight and
 * `upper<Side>` above once faceBands has count 2). `finishRef` null removes the wainscot from those sides; the wall is
 * un-split when no side keeps one. Faces it does not touch keep their look: their bands copy the whole-face slot.
 * A band slot is left unset where the whole-face slot is unset, so it shows the same default.
 */
export function wainscotPatch(
  wall: AnyNode,
  sides: WallSlot[],
  finishRef: string | null,
  lowerHeight: number | undefined,
): { faceBands: Record<string, unknown>; slots: Record<string, string> } {
  const slots = { ...((wall.slots as Record<string, string> | undefined) ?? {}) }
  const count = bandCount(wall)
  const bands = { enabled: false, count: 1, lowerHeight: 0.84, middleHeight: 0.61, upperHeight: 0.61, ...((wall.faceBands as object | undefined) ?? {}) }
  const set = (slot: string, value: string | undefined) => (value === undefined ? delete slots[slot] : (slots[slot] = value))
  for (const side of ['interior', 'exterior'] as const) {
    const suffix = SLOT_SUFFIX[side]
    const whole = slots[side]
    if (count < 2) {
      // Splitting now: both bands start as the face looked.
      set(`lower${suffix}`, whole)
      set(`upper${suffix}`, whole)
    }
    if (!sides.includes(side)) continue
    if (finishRef) set(`lower${suffix}`, finishRef)
    else set(`lower${suffix}`, slots[`upper${suffix}`] ?? whole)
  }
  const split = (['interior', 'exterior'] as const).some((side) => {
    const suffix = SLOT_SUFFIX[side]
    return (slots[`lower${suffix}`] ?? '') !== (slots[`upper${suffix}`] ?? '')
  })
  if (!split && !finishRef) {
    // Nothing left below a seam: one face again, showing what the upper band showed.
    for (const side of ['interior', 'exterior'] as const) {
      const suffix = SLOT_SUFFIX[side]
      if (slots[`upper${suffix}`] !== undefined) slots[side] = slots[`upper${suffix}`]!
      for (const band of ['lower', 'middle', 'upper', 'top']) delete slots[`${band}${suffix}`]
    }
    return { faceBands: { ...bands, enabled: false, count: 1 }, slots }
  }
  return {
    faceBands: { ...bands, enabled: true, count: count >= 2 ? count : 2, ...(lowerHeight !== undefined ? { lowerHeight } : {}) },
    slots,
  }
}

const TARGET = {
  zone_id: z.string().optional().describe('The room. Alone: every wall around it.'),
  wall_ids: z.array(z.string()).optional().describe('Only these walls (with zone_id to say which room they face).'),
  side: z.enum(['room', 'outside', 'both']).optional().describe('Default "room": the face toward the room.'),
}

const trimFields = (kind: TrimKind) => ({
  enabled: z.boolean().optional().describe('Default true; false removes it from the chosen faces.'),
  height: z.number().min(0.02).max(0.4).optional().describe(`The moulding's own height, m (default ${TRIM_DEFAULTS[kind].height}).`),
  proud: z.number().min(0.005).max(0.12).optional().describe(`How far it stands off the wall, m (default ${TRIM_DEFAULTS[kind].proud}).`),
  profile: z.string().optional().describe(`One of ${TRIM_PROFILES[kind].join(', ')}.`),
  finish_id: z.string().optional().describe("A list_finishes id for the moulding (default: Pascal's white paint)."),
})
const trimSpec = (kind: TrimKind) => z.object(trimFields(kind)).optional()
const railSpec = z
  .object({
    ...trimFields('chairRail'),
    at: z.number().min(0.3).max(2.4).optional().describe('Bottom of the rail above the floor, m (default 0.9; over a wainscot: on its top edge).'),
  })
  .optional()

type TrimArgs = { enabled?: boolean; height?: number; proud?: number; profile?: string; finish_id?: string; at?: number }

export function registerWallTrimTools(server: McpServer, operations: SceneOperations, publish: Publish) {
  server.registerTool(
    'set_wall_trim',
    {
      title: 'Set wall trim',
      description:
        'Skirting boards, crown moulding and a chair rail on walls. Target like set_wall_finish: zone_id (every wall ' +
        'around the room), wall_ids (with zone_id to say which room they face), side room|outside|both. Give any of ' +
        'skirting, crown, chair_rail as {enabled?, height?, proud?, profile?, finish_id?} (chair_rail also `at`, its ' +
        'bottom above the floor). A trim is one setting per wall: size, profile and `at` are shared by both faces; ' +
        'enabled adds or removes the chosen faces. Over a wainscot (set_wainscot) a chair rail without `at` sits on ' +
        'its top edge. Returns each wall\'s trims and the slots written.',
      inputSchema: { ...TARGET, skirting: trimSpec('skirting'), crown: trimSpec('crown'), chair_rail: railSpec },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ zone_id, wall_ids, side = 'room', skirting, crown, chair_rail }) => {
      const asked: Array<[TrimKind, TrimArgs]> = []
      if (skirting) asked.push(['skirting', skirting])
      if (crown) asked.push(['crown', crown])
      if (chair_rail) asked.push(['chairRail', chair_rail])
      if (!asked.length) return failure('nothing_to_change: give skirting, crown or chair_rail')

      const notes: string[] = []
      const finishes = new Map<TrimKind, Finish>()
      const profiles = new Map<TrimKind, string>()
      for (const [kind, spec] of asked) {
        if (spec.finish_id) {
          const resolved = resolveFinish(spec.finish_id, 'wall')
          if ('error' in resolved) return resolved.error
          finishes.set(kind, resolved.finish)
        }
        if (spec.profile) {
          const profile = trimProfile(kind, spec.profile)
          if (!profile) return failure(`unknown_profile: ${spec.profile} for ${kind}. One of: ${TRIM_PROFILES[kind].join(', ')}`)
          profiles.set(kind, profile)
        }
      }

      const targeted = wallTargets(operations, { zone_id, wall_ids, side, verb: 'trim' })
      if ('error' in targeted) return targeted.error
      notes.push(...targeted.notes)

      const patches: Array<{ op: 'update'; id: string; data: Record<string, unknown> }> = []
      const changed: Array<Record<string, unknown>> = []
      for (const { stored, wall, faces, tagged } of targeted.targets) {
        const trimSides = [...new Set(faces.map((face) => trimSideForFace(wall, face)).filter((s): s is WallSlot => s !== null))]
        const unreachable = faces.filter((face) => trimSideForFace(wall, face) === null)
        if (unreachable.length) notes.push(`${stored.id}: Pascal draws no trim on its ${unreachable.join(' and ')} face (both faces tagged ${wall.frontSide}).`)
        if (!trimSides.length) continue
        const data: Record<string, unknown> = {}
        const slots = { ...((stored.slots as Record<string, string> | undefined) ?? {}) }
        const written: string[] = []
        const result: Record<string, unknown> = { id: stored.id, name: stored.name, length: wallLength(stored) }
        for (const [kind, spec] of asked) {
          const enabled = spec.enabled ?? true
          let offsetY = spec.at
          const railHeight = spec.height ?? (stored[kind] as Partial<TrimConfig> | undefined)?.height ?? TRIM_DEFAULTS[kind].height
          const seam = wainscotHeight(stored)
          if (kind === 'chairRail' && enabled && offsetY === undefined && seam !== null) offsetY = railOverSeam(seam, railHeight)
          const next = nextTrim(kind, stored[kind] as Partial<TrimConfig> | undefined, trimSides, {
            enabled,
            height: spec.height,
            proud: spec.proud,
            profile: profiles.get(kind),
            offsetY,
          })
          data[kind] = next
          const finish = finishes.get(kind)
          if (finish && enabled) {
            for (const trimSide of trimSides) {
              slots[trimSlot(kind, trimSide)] = finish.ref
              written.push(trimSlot(kind, trimSide))
            }
          }
          result[kind === 'chairRail' ? 'chair_rail' : kind] = next.enabled
            ? { sides: next.sides, height: next.height, profile: next.profile, ...(kind === 'chairRail' ? { at: next.offsetY } : {}) }
            : { enabled: false }
        }
        if (written.length) data.slots = slots
        if (tagged) Object.assign(data, tagged)
        patches.push({ op: 'update', id: stored.id, data })
        changed.push({ ...result, ...(written.length ? { slots: written } : {}), ...(tagged ? { sidesTagged: tagged } : {}) })
      }
      if (!patches.length) return failure('nothing_to_change')
      for (const finish of finishes.values()) notes.push(...surfaceNote(finish, 'wall'))
      operations.applyPatch(patches as never)
      await publish(operations, 'set_wall_trim')
      return text({ walls: changed, ...(notes.length ? { notes: [...new Set(notes)] } : {}) })
    },
  )

  server.registerTool(
    'set_wainscot',
    {
      title: 'Set wainscot',
      description:
        'A different finish on the lower part of walls: wainscot panelling, half-height tile, a painted dado. Target ' +
        'like set_wall_finish (zone_id, wall_ids, side). finish_id = the lower part\'s finish (list_finishes), height ' +
        '= its top above the floor (default 0.9 m; one height per wall, shared by both faces). The rest of the face ' +
        'keeps its finish; set_wall_finish afterwards paints the part above. enabled: false removes it. An enabled ' +
        'chair rail moves onto the seam; add one with set_wall_trim. For a tiled splashback behind a kitchen run use ' +
        'backsplash panel products instead (they stop where the run stops).',
      inputSchema: {
        ...TARGET,
        finish_id: z.string().optional(),
        height: z.number().min(0.3).max(2.2).optional().describe('Top of the lower part above the floor, m. Default 0.9.'),
        enabled: z.boolean().optional().describe('Default true; false removes the wainscot from the chosen faces.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ zone_id, wall_ids, side = 'room', finish_id, height, enabled = true }) => {
      let finish: Finish | null = null
      if (enabled) {
        if (!finish_id) return failure('missing_finish: give finish_id (or enabled: false to remove)')
        const resolved = resolveFinish(finish_id, 'wall')
        if ('error' in resolved) return resolved.error
        finish = resolved.finish
      }
      const targeted = wallTargets(operations, { zone_id, wall_ids, side, verb: 'change' })
      if ('error' in targeted) return targeted.error
      const notes = [...(finish ? surfaceNote(finish, 'wall') : []), ...targeted.notes]
      const patches: Array<{ op: 'update'; id: string; data: Record<string, unknown> }> = []
      const changed: Array<Record<string, unknown>> = []
      for (const { stored, wall, faces, tagged } of targeted.targets) {
        const sides = [...new Set(faces.map((face) => slotForFace(wall, face)))]
        if (!sides.length) continue
        if (side !== 'both' && faces.length === 1 && slotForFace(wall, 'front') === slotForFace(wall, 'back')) {
          notes.push(`${stored.id}: both faces are tagged ${sides[0]} and share one slot, so both changed.`)
        }
        const wallHeight = (stored.height as number | undefined) ?? 2.5
        let top = enabled ? (height ?? wainscotHeight(stored) ?? 0.9) : undefined
        if (top !== undefined && top > wallHeight - 0.1) {
          top = Math.round((wallHeight - 0.1) * 100) / 100
          notes.push(`${stored.id}: wall is ${wallHeight} m high; wainscot top lowered to ${top} m.`)
        }
        const patch = wainscotPatch(stored, sides, finish?.ref ?? null, top)
        const data: Record<string, unknown> = { ...patch }
        const rail = stored.chairRail as Partial<TrimConfig> | undefined
        let railAt: number | undefined
        if (rail?.enabled && patch.faceBands.enabled && top !== undefined) {
          railAt = railOverSeam(top, rail.height ?? TRIM_DEFAULTS.chairRail.height)
          data.chairRail = { ...TRIM_DEFAULTS.chairRail, ...rail, offsetY: railAt }
        }
        if (tagged) Object.assign(data, tagged)
        patches.push({ op: 'update', id: stored.id, data })
        changed.push({
          id: stored.id,
          name: stored.name,
          length: wallLength(stored),
          split: patch.faceBands.enabled,
          ...(patch.faceBands.enabled ? { height: patch.faceBands.lowerHeight } : {}),
          slots: sides.map((s) => `lower${SLOT_SUFFIX[s]}`),
          ...(railAt !== undefined ? { chairRailAt: railAt } : {}),
          ...(tagged ? { sidesTagged: tagged } : {}),
        })
      }
      if (!patches.length) return failure('nothing_to_change')
      operations.applyPatch(patches as never)
      await publish(operations, 'set_wainscot')
      return text({ ...(finish ? { finish: { id: finish.id, label: finish.label, family: finish.family } } : {}), walls: changed, ...(notes.length ? { notes } : {}) })
    },
  )
}
