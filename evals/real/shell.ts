// A traced flat shell: rooms (rectangles or polygons) and openings read off a published plan, turned into a v1 flat
// (walls derived from the room outlines) and then into a Pascal graph by the flat-template converter. Tracing by hand
// is deterministic and costs no agent turn; an architect run from the plan image is the alternative.
//
// Spec coordinates are plan units (image pixels, say) mapped to metres by `scale` (units per metre) from `origin`;
// widths, heights and sills are metres. Room edges become walls; collinear edges on one line merge into one wall;
// `open` segments (plan units) are left without a wall (an open kitchen, a wide passage).
import { readFileSync } from 'node:fs'
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
  const flat = convertV1Scene(shellToV1(spec))
  return { graph: flat.graph, rooms: flat.rooms, area: flat.area }
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
