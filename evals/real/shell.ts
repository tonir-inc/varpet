// A traced flat shell: rooms (rectangles or polygons) and openings read off a published plan, turned into a v1 flat
// (walls derived from the room outlines) and then into a Pascal graph by the flat-template converter. Tracing by hand
// is deterministic and costs no agent turn; an architect run from the plan image is the alternative.
//
// Spec coordinates are plan units (image pixels, say) mapped to metres by `scale` (units per metre) from `origin`;
// widths, heights and sills are metres. Room edges become walls; collinear edges on one line merge into one wall;
// `open` segments (plan units) are left without a wall (an open kitchen, a wide passage). `kitchen` runs drawn on the
// plan become Pascal cabinet runs (base units with a worktop, or tall units) standing against their room edge.
import { readFileSync } from 'node:fs'
import { CabinetModuleNode, CabinetNode } from '@pascal-app/core/schema'
import { convertV1Scene, polygonArea, type V1Scene, type V1Wall } from '../../apps/web/lib/flats/convert.ts'

type Vec2 = [number, number]

export interface ShellSpec {
  id: string
  name: string
  /** Plan units per metre (1 when the spec is already in metres). */
  scale?: number
  origin?: Vec2
  height?: number
  thickness?: number
  rooms: Array<{ name: string; rect?: [number, number, number, number]; polygon?: Vec2[] }>
  open?: Array<[number, number, number, number]>
  openings?: Array<{ kind: 'door' | 'window'; at: Vec2; width: number; height?: number; sill?: number }>
  /**
   * Kitchen runs as drawn on the plan: `from`-`to` is the run's back edge on a room edge (plan units); the run stands
   * on the side that is inside a room. `depth` metres (0.6 base, 0.6 tall); `tall` for a column of tall units
   * (fridge, oven tower); `sink` / `hob` (plan points) put a sink or a cooktop in the unit nearest them. An `island`
   * stands free: `from`-`to` is its centre line.
   */
  kitchen?: Array<{ from: Vec2; to: Vec2; depth?: number; tall?: boolean; island?: boolean; sink?: Vec2; hob?: Vec2 }>
  /** How the trace was made (scale source, simplifications), for the record. */
  note?: string
}

const snap = (v: number) => Math.round(v * 100) / 100

export function shellToV1(spec: ShellSpec): V1Scene {
  const scale = spec.scale ?? 1
  const [ox, oy] = spec.origin ?? [0, 0]
  const m = ([x, y]: Vec2): Vec2 => [snap((x - ox) / scale), snap((y - oy) / scale)]
  const height = spec.height ?? 2.7
  const thickness = spec.thickness ?? 0.15

  const rooms = spec.rooms.map((room, i) => {
    const raw: Vec2[] = room.polygon ?? (room.rect ? rectPolygon(room.rect) : [])
    if (raw.length < 3) throw new Error(`${spec.id}: room ${room.name} needs a rect or a polygon`)
    return { id: `room-${i + 1}`, name: room.name, polygon: raw.map(m) }
  })

  // Axis-aligned edges grouped by line, merged into intervals; other edges kept as they are (deduplicated).
  const lines = new Map<string, Array<[number, number]>>()
  const slanted = new Map<string, [Vec2, Vec2]>()
  for (const room of rooms) {
    room.polygon.forEach((a, i) => {
      const b = room.polygon[(i + 1) % room.polygon.length]!
      if (a[1] === b[1] && a[0] !== b[0]) push(lines, `h:${a[1]}`, [Math.min(a[0], b[0]), Math.max(a[0], b[0])])
      else if (a[0] === b[0] && a[1] !== b[1]) push(lines, `v:${a[0]}`, [Math.min(a[1], b[1]), Math.max(a[1], b[1])])
      else if (a[0] !== b[0] || a[1] !== b[1]) {
        const key = [a, b].map((p) => p.join(',')).sort().join('|')
        slanted.set(key, [a, b])
      }
    })
  }
  const opens = (spec.open ?? []).map(([x0, y0, x1, y1]) => [m([x0, y0]), m([x1, y1])] as [Vec2, Vec2])
  const segments: Array<[Vec2, Vec2]> = []
  for (const [key, intervals] of lines) {
    const [axis, at] = [key[0], Number(key.slice(2))]
    let merged = mergeIntervals(intervals)
    for (const [p, q] of opens) {
      if (axis === 'h' && p[1] === at && q[1] === at) merged = subtract(merged, [Math.min(p[0], q[0]), Math.max(p[0], q[0])])
      if (axis === 'v' && p[0] === at && q[0] === at) merged = subtract(merged, [Math.min(p[1], q[1]), Math.max(p[1], q[1])])
    }
    for (const [lo, hi] of merged) segments.push(axis === 'h' ? [[lo, at], [hi, at]] : [[at, lo], [at, hi]])
  }
  segments.push(...slanted.values())

  const walls: V1Wall[] = segments.map(([start, end], i) => ({ id: `wall-${i + 1}`, start, end, height, thickness, openings: [] }))
  ;(spec.openings ?? []).forEach((opening, i) => {
    const at = m(opening.at)
    const hit = walls
      .map((wall) => ({ wall, ...project(at, wall.start, wall.end) }))
      .filter((h) => h.distance < 0.25 && h.along >= -0.05 && h.along <= h.length + 0.05)
      .sort((a, b) => a.distance - b.distance)[0]
    if (!hit) throw new Error(`${spec.id}: opening ${i + 1} at ${at.join(', ')} m is on no wall`)
    const width = Math.min(opening.width, hit.length)
    const isDoor = opening.kind === 'door'
    hit.wall.openings!.push({
      id: `${opening.kind}-${i + 1}`,
      kind: opening.kind,
      offset: snap(Math.max(0, Math.min(hit.length - width, hit.along - width / 2))),
      width,
      height: opening.height ?? (isDoor ? 2.1 : 1.5),
      sill: isDoor ? 0 : (opening.sill ?? 0.85),
    })
  })
  return { format: 'varpet.editor', id: spec.id, name: spec.name, rooms, walls }
}

export function buildShell(spec: ShellSpec) {
  const v1 = shellToV1(spec)
  const flat = convertV1Scene(v1)
  const graph = flat.graph as { nodes: Record<string, Record<string, unknown>> }
  const level = Object.values(graph.nodes).find((n) => n.type === 'level')!
  for (const node of kitchenNodes(spec, v1, flat.shift, String(level.id))) {
    graph.nodes[String(node.id)] = node
    if (node.type === 'cabinet') level.children = [...(level.children as string[]), String(node.id)]
  }
  return { graph: flat.graph, rooms: flat.rooms, area: flat.area }
}

const UNIT = 0.6
const MAX_RUN = 3

/** Cabinet runs (and their units) for the spec's kitchen, in the converted graph's (shifted) coordinates. */
export function kitchenNodes(spec: ShellSpec, v1: V1Scene, shift: Vec2, levelId: string) {
  const scale = spec.scale ?? 1
  const [ox, oy] = spec.origin ?? [0, 0]
  const m = ([x, y]: Vec2): Vec2 => [(x - ox) / scale + shift[0], (y - oy) / scale + shift[1]]
  const rooms = v1.rooms.map((r) => r.polygon.map(([x, y]) => [x + shift[0], y + shift[1]] as Vec2))
  const half = (spec.thickness ?? 0.15) / 2
  const nodes: Array<Record<string, unknown>> = []
  ;(spec.kitchen ?? []).forEach((run, r) => {
    const [a, b] = [m(run.from), m(run.to)]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length < 0.3) throw new Error(`${spec.id}: kitchen run ${r + 1} is shorter than 0.3 m`)
    const u: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
    const depth = run.depth ?? 0.6
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const probe = (sign: number): Vec2 => [mid[0] - u[1] * sign * (half + depth / 2), mid[1] + u[0] * sign * (half + depth / 2)]
    const sign = run.island ? 1 : [1, -1].find((s) => rooms.some((poly) => insidePolygon(probe(s), poly)))
    if (!sign) throw new Error(`${spec.id}: kitchen run ${r + 1} has no room on either side`)
    const normal: Vec2 = [-u[1] * sign, u[0] * sign] // into the room: the units' fronts face this way
    const offset = run.island ? 0 : half + depth / 2
    const rotation = Math.atan2(normal[0], normal[1]) // three.js yaw: local +z (front) -> normal
    const xAxis: Vec2 = [Math.cos(rotation), -Math.sin(rotation)] // local +x in plan
    const pieces = Math.ceil(length / MAX_RUN)
    const marks = [run.sink && { type: 'sink' as const, at: m(run.sink) }, run.hob && { type: 'cooktop-induction' as const, at: m(run.hob) }].filter(Boolean) as Array<{ type: 'sink' | 'cooktop-induction'; at: Vec2 }>
    for (let p = 0; p < pieces; p++) {
      const pieceLength = length / pieces
      const count = Math.max(1, Math.round(pieceLength / UNIT))
      const width = Math.round((pieceLength / count) * 1000) / 1000
      const along = (p + 0.5) * pieceLength - length / 2
      const centre: Vec2 = [mid[0] + u[0] * along + normal[0] * offset, mid[1] + u[1] * along + normal[1] * offset]
      const id = `cabinet_${spec.id}_${r + 1}_${p + 1}`
      const tall = Boolean(run.tall)
      const carcassHeight = tall ? 2.07 : 0.8
      const localXs = Array.from({ length: count }, (_, i) => -pieceLength / 2 + width * (i + 0.5))
      const plan = (localX: number): Vec2 => [centre[0] + xAxis[0] * localX, centre[1] + xAxis[1] * localX]
      // Each drawn sink or hob goes to the unit nearest it, if that unit is within a unit's reach.
      const markAt = new Map<number, (typeof marks)[number]>()
      if (!tall) {
        for (const mark of [...marks]) {
          const dist = localXs.map((x) => Math.hypot(plan(x)[0] - mark.at[0], plan(x)[1] - mark.at[1]))
          const i = dist.indexOf(Math.min(...dist))
          if (dist[i]! <= Math.max(width, depth) && !markAt.has(i)) {
            markAt.set(i, mark)
            marks.splice(marks.indexOf(mark), 1)
          }
        }
      }
      const modules = localXs.map((localX, i) => {
        const mark = markAt.get(i)
        return CabinetModuleNode.parse({
          id: `cabinet-module_${spec.id}_${r + 1}_${p + 1}_${i + 1}`,
          name: mark?.type === 'sink' ? 'Sink unit' : mark ? 'Hob unit' : tall ? 'Tall unit' : 'Base unit',
          parentId: id,
          position: [round3(localX), 0.1, 0],
          width,
          depth,
          carcassHeight,
          cabinetType: tall ? 'tall' : 'base',
          ...(mark ? { stack: [{ id: `${mark.type}-1`, type: mark.type }] } : {}),
        })
      })
      nodes.push(
        CabinetNode.parse({
          id,
          name: tall ? 'Kitchen tall units' : run.island ? 'Kitchen island' : 'Kitchen run',
          parentId: levelId,
          position: [round3(centre[0]), 0, round3(centre[1])],
          rotation,
          runTier: tall ? 'tall' : 'base',
          width: Math.min(MAX_RUN, Math.round(pieceLength * 1000) / 1000),
          depth,
          carcassHeight,
          withCountertop: !tall,
          ...(run.island ? { withFinishedBack: true, withFinishedEnds: true } : {}),
          children: modules.map((mod) => mod.id),
          metadata: { shellKitchen: true },
        }),
        ...modules,
      )
    }
  })
  return nodes as Array<Record<string, unknown> & { id: string; type: string }>
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

function insidePolygon([x, y]: Vec2, polygon: Vec2[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function loadShell(file: string) {
  return buildShell(JSON.parse(readFileSync(file, 'utf8')) as ShellSpec)
}

export { polygonArea }

function rectPolygon([x0, y0, x1, y1]: [number, number, number, number]): Vec2[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  map.set(key, [...(map.get(key) ?? []), value])
}

function mergeIntervals(intervals: Array<[number, number]>) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const [lo, hi] of sorted) {
    const last = out.at(-1)
    if (last && lo <= last[1] + 1e-6) last[1] = Math.max(last[1], hi)
    else out.push([lo, hi])
  }
  return out
}

function subtract(intervals: Array<[number, number]>, [lo, hi]: [number, number]) {
  return intervals.flatMap(([a, b]): Array<[number, number]> => {
    if (hi <= a || lo >= b) return [[a, b]]
    return ([[a, lo], [hi, b]] as Array<[number, number]>).filter(([p, q]) => q - p > 0.05)
  })
}

function project(point: Vec2, a: Vec2, b: Vec2) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
  const [dx, dy] = [point[0] - a[0], point[1] - a[1]]
  return { length, along: dx * ux + dy * uy, distance: Math.abs(dx * uy - dy * ux) }
}
