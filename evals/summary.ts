// What a case did, from its event streams and the base and proposal graphs: the critic's evidence and the
// report's columns. Pure, so it is tested without spending a turn.
import type { AgentEvent } from '../packages/contracts/src/index.ts'
import type { EvalCase } from './cases.ts'
import { worldPose } from './room-facts.ts'

type Json = Record<string, any>
interface Graph {
  nodes: Record<string, unknown>
}

export interface TurnLog {
  message: string
  events: AgentEvent[]
  raw: Json[]
}

export interface PlacedItem {
  name: string
  productId: string | null
  priceAmd: number | null
  /** [width, height, depth] metres. */
  size: number[]
  /** Footprint centre [x, z] and rotation about the vertical, degrees. */
  at: [number, number]
  rotationDeg: number
  room: string | null
  /** How it stands: on the floor (or a surface), hung on a wall, or from the ceiling. */
  mount: 'floor' | 'wall' | 'ceiling'
}

export interface CaseSummary {
  turnsDone: number
  answers: string[]
  errors: string[]
  skillsLoaded: string[]
  skillsUsed: string[]
  toolCount: number
  toolErrors: number
  /** The room the ask is about: its outline and area, for judging fit. */
  room: { name: string; area: number; bounds: [number, number, number, number] } | null
  added: PlacedItem[]
  removed: string[]
  finishes: Array<{ target: string; ref: string }>
  totalAmd: number
  /** Architect: what the flat has after the turn. */
  structure: { walls: number; doors: number; windows: number; zones: Array<{ name: string; area: number }> } | null
  /** Per turn, the tool calls in order (name, error flag), kept out of the critic's input. */
  trace: Array<Array<{ name: string; error: boolean; summary?: string }>>
}

const round = (n: number, step = 100) => Math.round(n * step) / step

function polygonArea(polygon: number[][]) {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i]!
    const [x2, z2] = polygon[(i + 1) % polygon.length]!
    sum += x1! * z2! - x2! * z1!
  }
  return Math.abs(sum) / 2
}

function inside(point: [number, number], polygon: number[][]) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!
    const [xj, zj] = polygon[j]!
    if (zi! > point[1] !== zj! > point[1] && point[0] < ((xj! - xi!) * (point[1] - zi!)) / (zj! - zi!) + xi!) hit = !hit
  }
  return hit
}

const nodesOfType = (graph: Graph | null, type: string) =>
  Object.values(graph?.nodes ?? {}).filter((n) => (n as Json).type === type) as Json[]

export function summarize(c: EvalCase, turns: TurnLog[], base: Graph | null, proposal: Graph | null, turnsDone: number): CaseSummary {
  const zones = nodesOfType(proposal, 'zone').filter((z) => Array.isArray(z.polygon))
  const roomOf = (at: [number, number]) => zones.find((z) => inside(at, z.polygon))?.name ?? null

  const added: PlacedItem[] = []
  for (const [id, node] of Object.entries(proposal?.nodes ?? {}) as Array<[string, Json]>) {
    if (node.type !== 'item' || (base && id in base.nodes)) continue
    const pose = worldPose(node, proposal!.nodes)
    const at: [number, number] = [round(pose.at[0]), round(pose.at[1])]
    added.push({
      name: node.asset?.name ?? node.name ?? id,
      productId: typeof node.metadata?.productId === 'string' ? node.metadata.productId : null,
      priceAmd: typeof node.metadata?.priceAmd === 'number' ? node.metadata.priceAmd : null,
      size: (node.asset?.dimensions ?? []).map((v: number) => round(v)),
      at,
      rotationDeg: Math.round((pose.rot * 180) / Math.PI),
      room: roomOf(at),
      mount: pose.mount,
    })
  }
  const removed = Object.entries(base?.nodes ?? {})
    .filter(([id, node]) => (node as Json).type === 'item' && !(id in (proposal?.nodes ?? {})))
    .map(([, node]) => String((node as Json).name ?? (node as Json).asset?.name))

  const finishes: Array<{ target: string; ref: string }> = []
  for (const [id, node] of Object.entries(proposal?.nodes ?? {}) as Array<[string, Json]>) {
    if (node.type !== 'wall' && node.type !== 'slab') continue
    const before = ((base?.nodes[id] as Json | undefined)?.slots ?? {}) as Record<string, string>
    for (const [slot, ref] of Object.entries((node.slots ?? {}) as Record<string, string>)) {
      if (before[slot] !== ref) finishes.push({ target: `${node.type} ${node.name ?? id} ${slot}`, ref })
    }
  }

  const target = zones.find((z) => String(z.name).toLowerCase() === c.room.toLowerCase())
  const xs = target ? target.polygon.map((p: number[]) => p[0]) : []
  const zs = target ? target.polygon.map((p: number[]) => p[1]) : []

  const skillsLoaded = new Set<string>()
  const skillsUsed: string[] = []
  for (const turn of turns) {
    for (const line of turn.raw) {
      if (line.type === 'system' && line.subtype === 'init') for (const s of line.skills ?? []) if (String(s).includes(':')) skillsLoaded.add(String(s))
      if (line.type !== 'assistant' || line.parent_tool_use_id) continue
      for (const block of line.message?.content ?? []) {
        if (block.type === 'tool_use' && block.name === 'Skill' && !skillsUsed.includes(block.input?.skill)) skillsUsed.push(String(block.input?.skill))
      }
    }
  }

  const trace = turns.map((turn) => {
    const calls = new Map<string, { name: string; error: boolean; summary?: string }>()
    for (const e of turn.events) {
      if (e.type !== 'tool') continue
      const known = calls.get(e.id) ?? { name: e.name, error: false }
      if (e.status === 'error') Object.assign(known, { error: true, summary: e.summary })
      calls.set(e.id, known)
    }
    return [...calls.values()]
  })

  return {
    turnsDone,
    answers: turns.map((turn) => turn.events.filter((e) => e.type === 'message_delta').map((e) => (e as { text: string }).text).join('').trim()),
    errors: turns.flatMap((turn) => turn.events.filter((e) => e.type === 'error').map((e) => (e as { message: string }).message)),
    skillsLoaded: [...skillsLoaded],
    skillsUsed,
    toolCount: trace.flat().length,
    toolErrors: trace.flat().filter((t) => t.error).length,
    room: target
      ? { name: target.name, area: round(polygonArea(target.polygon)), bounds: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)].map((v) => round(v)) as [number, number, number, number] }
      : null,
    added,
    removed,
    finishes,
    totalAmd: added.reduce((sum, item) => sum + (item.priceAmd ?? 0), 0),
    structure:
      c.role === 'architect'
        ? {
            walls: nodesOfType(proposal, 'wall').length,
            doors: nodesOfType(proposal, 'door').length,
            windows: nodesOfType(proposal, 'window').length,
            zones: zones.map((z) => ({ name: String(z.name), area: round(polygonArea(z.polygon)) })),
          }
        : null,
    trace,
  }
}
