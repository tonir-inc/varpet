// Architect shell score: an architect-built Pascal scene against a hand-checked flat template
// (apps/web/lib/flats/templates). Pure, no model. The built scene is first moved onto the template (templates are
// centred on their bounding box; the architect draws wherever it likes): same centring rule, then the shift within
// +-1.5 m that best overlaps the two floor plans. Translation only: both use x right, z down the plan, and a wrong
// scale is a real error, so it is not corrected.
//
//   node --experimental-strip-types --no-warnings evals/architect/score.ts <built.json> <templateId | template.json>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { polygonArea } from '../room-facts.ts'

type Vec2 = [number, number]
type Json = Record<string, any>
export interface Graph {
  nodes: Record<string, unknown>
}

export interface Room { id: string; name: string; polygon: Vec2[]; area: number }
export interface Wall { id: string; start: Vec2; end: Vec2; thickness: number }
export interface Opening { id: string; kind: 'door' | 'window'; centre: Vec2; width: number; sill: number; height: number }
export interface Shell { rooms: Room[]; walls: Wall[]; openings: Opening[] }

export const TEMPLATES_DIR = join(import.meta.dirname, '../../apps/web/lib/flats/templates')

/** Rooms (zones), walls and openings (world centre from the wall's start, Pascal's wall-local position[0]). */
export function shellOf(graph: Graph): Shell {
  const nodes = Object.values(graph.nodes) as Json[]
  const rooms = nodes
    .filter((n) => n.type === 'zone' && Array.isArray(n.polygon) && n.polygon.length >= 3)
    .map((n) => ({ id: n.id, name: String(n.name ?? n.id), polygon: n.polygon as Vec2[], area: polygonArea(n.polygon) }))
  const walls = nodes
    .filter((n) => n.type === 'wall' && Array.isArray(n.start) && Array.isArray(n.end))
    .map((n) => ({ id: n.id, start: n.start as Vec2, end: n.end as Vec2, thickness: Number(n.thickness ?? 0.1) }))
  const byId = new Map(walls.map((w) => [w.id, w]))
  const openings: Opening[] = []
  for (const n of nodes) {
    if (n.type !== 'door' && n.type !== 'window') continue
    const wall = byId.get(n.wallId ?? n.parentId)
    if (!wall || !Array.isArray(n.position)) continue
    const [sx, sz] = wall.start
    const [ex, ez] = wall.end
    const length = Math.hypot(ex - sx, ez - sz) || 1
    const along = Number(n.position[0])
    const height = Number(n.height ?? 0)
    openings.push({
      id: n.id,
      kind: n.type,
      centre: [sx + ((ex - sx) / length) * along, sz + ((ez - sz) / length) * along],
      width: Number(n.width ?? 0),
      height,
      sill: Math.max(0, Number(n.position[1]) - height / 2),
    })
  }
  return { rooms, walls, openings }
}

/** Every plan point scaled by k about the origin (sizes too). */
export function scaleShell(shell: Shell, k: number): Shell {
  const m = ([x, z]: Vec2): Vec2 => [x * k, z * k]
  return {
    rooms: shell.rooms.map((r) => ({ ...r, polygon: r.polygon.map(m), area: r.area * k * k })),
    walls: shell.walls.map((w) => ({ ...w, start: m(w.start), end: m(w.end), thickness: w.thickness * k })),
    openings: shell.openings.map((o) => ({ ...o, centre: m(o.centre), width: o.width * k })),
  }
}

export function moveShell(shell: Shell, [dx, dz]: Vec2): Shell {
  const m = ([x, z]: Vec2): Vec2 => [x + dx, z + dz]
  return {
    rooms: shell.rooms.map((r) => ({ ...r, polygon: r.polygon.map(m) })),
    walls: shell.walls.map((w) => ({ ...w, start: m(w.start), end: m(w.end) })),
    openings: shell.openings.map((o) => ({ ...o, centre: m(o.centre) })),
  }
}

function bboxCentre(shell: Shell): Vec2 {
  const points = [...shell.rooms.flatMap((r) => r.polygon), ...shell.walls.flatMap((w) => [w.start, w.end])]
  if (!points.length) return [0, 0]
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
}

// ---------------------------------------------------------------------------------------------------------------
// Rasters: floor plans as cell masks on one grid, for overlap and alignment.

interface Grid { x0: number; z0: number; cell: number; nx: number; nz: number }

function gridAround(shells: Shell[], cell: number, margin: number): Grid {
  const points = shells.flatMap((s) => [...s.rooms.flatMap((r) => r.polygon), ...s.walls.flatMap((w) => [w.start, w.end])])
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  const x0 = Math.floor((Math.min(...xs) - margin) / cell) * cell
  const z0 = Math.floor((Math.min(...zs) - margin) / cell) * cell
  return { x0, z0, cell, nx: Math.ceil((Math.max(...xs) + margin - x0) / cell), nz: Math.ceil((Math.max(...zs) + margin - z0) / cell) }
}

/** Cells whose centre is inside the polygon (even-odd), by scanline. */
function rasterize(polygon: Vec2[], g: Grid): Uint8Array {
  const mask = new Uint8Array(g.nx * g.nz)
  const xs: number[] = []
  for (let j = 0; j < g.nz; j++) {
    const z = g.z0 + (j + 0.5) * g.cell
    xs.length = 0
    for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
      const [xa, za] = polygon[a]!
      const [xb, zb] = polygon[b]!
      if (za > z !== zb > z) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k]! - g.x0) / g.cell - 0.5))
      const i1 = Math.min(g.nx - 1, Math.floor((xs[k + 1]! - g.x0) / g.cell - 0.5))
      for (let i = i0; i <= i1; i++) mask[j * g.nx + i] = 1
    }
  }
  return mask
}

function union(masks: Uint8Array[], size: number) {
  const out = new Uint8Array(size)
  for (const m of masks) for (let k = 0; k < size; k++) out[k] |= m[k]!
  return out
}

/** IoU of a with b shifted by (di, dj) cells; a is given by its set cells (i, j) and b's cell count. */
function shiftedIou(aCells: Int32Array, nb: number, b: Uint8Array, g: Grid, di: number, dj: number) {
  let inter = 0
  for (let k = 0; k < aCells.length; k += 2) {
    const bi = aCells[k]! - di
    const bj = aCells[k + 1]! - dj
    if (bi >= 0 && bi < g.nx && bj >= 0 && bj < g.nz) inter += b[bj * g.nx + bi]!
  }
  const na = aCells.length / 2
  return inter / Math.max(1, na + nb - inter)
}

function cellList(m: Uint8Array, g: Grid) {
  const out: number[] = []
  for (let k = 0; k < m.length; k++) if (m[k]) out.push(k % g.nx, Math.floor(k / g.nx))
  return Int32Array.from(out)
}

/** Shift that puts the built shell on the template: bbox centres, then the best overlap within +-range metres. */
export function align(built: Shell, template: Shell, range = 1.5): Vec2 {
  return alignWithIou(built, template, range).shift
}

function alignWithIou(built: Shell, template: Shell, range = 1.5): { shift: Vec2; iou: number } {
  const [bx, bz] = bboxCentre(built)
  const [tx, tz] = bboxCentre(template)
  let shift: Vec2 = [tx - bx, tz - bz]
  let iou = 0
  if (!built.rooms.length || !template.rooms.length) return { shift, iou }
  for (const [cell, reach] of [[0.1, range], [0.025, 0.1]] as const) {
    const moved = moveShell(built, shift)
    const g = gridAround([moved, template], cell, reach + 0.5)
    const size = g.nx * g.nz
    const t = union(template.rooms.map((r) => rasterize(r.polygon, g)), size)
    const b = union(moved.rooms.map((r) => rasterize(r.polygon, g)), size)
    const tCells = cellList(t, g)
    let nb = 0
    for (let k = 0; k < size; k++) nb += b[k]!
    const steps = Math.round(reach / cell)
    let best = { iou: -1, di: 0, dj: 0 }
    for (let dj = -steps; dj <= steps; dj++) {
      for (let di = -steps; di <= steps; di++) {
        const iou = shiftedIou(tCells, nb, b, g, di, dj)
        if (iou > best.iou + 1e-9 || (Math.abs(iou - best.iou) <= 1e-9 && Math.abs(di) + Math.abs(dj) < Math.abs(best.di) + Math.abs(best.dj))) {
          best = { iou, di, dj }
        }
      }
    }
    shift = [shift[0] + best.di * cell, shift[1] + best.dj * cell]
    iou = best.iou
  }
  return { shift, iou }
}

/** The uniform scale (0.8..1.2) at which the built floor plan best overlaps the template's. */
export function bestScale(built: Shell, template: Shell): number {
  let best = { k: 1, iou: -1 }
  const probe = (k: number) => {
    const { iou } = alignWithIou(scaleShell(built, k), template, 0.4)
    if (iou > best.iou) best = { k, iou }
  }
  for (let k = 0.8; k <= 1.2001; k += 0.04) probe(k)
  for (const step of [0.01, 0.0025]) {
    const centre = best.k
    for (let i = -3; i <= 3; i++) if (i) probe(centre + i * step)
  }
  return best.k
}

// ---------------------------------------------------------------------------------------------------------------
// Score

export interface RoomRow { template: string | null; built: string | null; templateArea: number | null; builtArea: number | null; areaErr: number | null; iou: number | null }
export interface OpeningScore { template: number; built: number; matched: number; missing: number; extra: number; meanPosErr: number | null; meanWidthErr: number | null }
export interface ShellScore {
  shift: Vec2
  floorIou: number
  totalArea: { template: number; built: number; err: number }
  rooms: RoomRow[]
  roomsMatched: number
  roomsMissing: number
  roomsExtra: number
  /** Share of the template's room area in a room the built scene missed. */
  missingAreaShare: number
  walls: { template: number; built: number; templateLength: number; builtLength: number; coverage: number; precision: number }
  doors: OpeningScore
  windows: OpeningScore
  /** The layout alone: the built shell at the uniform scale that best overlaps the template, scored again.
   * Separates a wrong scale (one number, often a reading convention) from wrong walls and rooms. */
  scaled?: { factor: number; floorIou: number; wallCoverage: number; wallPrecision: number; doorsMatched: number; windowsMatched: number }
}

const ROOM_IOU_MIN = 0.25
const WALL_TOLERANCE = 0.3
const OPENING_TOLERANCE = 0.75

function distToSegment([px, pz]: Vec2, { start: [ax, az], end: [bx, bz] }: Wall) {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

/** Length of `walls` lying within tolerance of some wall in `others` (centrelines sampled every 5 cm). */
function coveredLength(walls: Wall[], others: Wall[], tolerance = WALL_TOLERANCE) {
  let total = 0
  let covered = 0
  for (const w of walls) {
    const length = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
    const n = Math.max(1, Math.round(length / 0.05))
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      const p: Vec2 = [w.start[0] + (w.end[0] - w.start[0]) * t, w.start[1] + (w.end[1] - w.start[1]) * t]
      if (others.some((o) => distToSegment(p, o) <= tolerance + o.thickness / 2)) covered += length / n
    }
    total += length
  }
  return { total, covered }
}

function matchOpenings(template: Opening[], built: Opening[]): OpeningScore {
  const pairs: Array<{ t: number; b: number; d: number }> = []
  template.forEach((t, ti) => built.forEach((b, bi) => {
    const d = Math.hypot(t.centre[0] - b.centre[0], t.centre[1] - b.centre[1])
    if (d <= OPENING_TOLERANCE) pairs.push({ t: ti, b: bi, d })
  }))
  pairs.sort((a, b) => a.d - b.d)
  const usedT = new Set<number>()
  const usedB = new Set<number>()
  const matched: typeof pairs = []
  for (const p of pairs) {
    if (usedT.has(p.t) || usedB.has(p.b)) continue
    usedT.add(p.t)
    usedB.add(p.b)
    matched.push(p)
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  return {
    template: template.length,
    built: built.length,
    matched: matched.length,
    missing: template.length - matched.length,
    extra: built.length - matched.length,
    meanPosErr: mean(matched.map((p) => p.d)),
    meanWidthErr: mean(matched.map((p) => Math.abs(template[p.t]!.width - built[p.b]!.width))),
  }
}

export function scoreShell(builtGraph: Graph, templateGraph: Graph): ShellScore {
  const template = shellOf(templateGraph)
  const raw = shellOf(builtGraph)
  const score = scoreShells(raw, template)
  const factor = raw.rooms.length && template.rooms.length ? bestScale(raw, template) : 1
  const scaled = scoreShells(scaleShell(raw, factor), template)
  score.scaled = {
    factor,
    floorIou: scaled.floorIou,
    wallCoverage: scaled.walls.coverage,
    wallPrecision: scaled.walls.precision,
    doorsMatched: scaled.doors.matched,
    windowsMatched: scaled.windows.matched,
  }
  return score
}

export function scoreShells(raw: Shell, template: Shell): ShellScore {
  const shift = align(raw, template)
  const built = moveShell(raw, shift)

  // Room overlap on a 5 cm grid.
  const g = gridAround([built, template], 0.05, 0.5)
  const size = g.nx * g.nz
  const tMasks = template.rooms.map((r) => rasterize(r.polygon, g))
  const bMasks = built.rooms.map((r) => rasterize(r.polygon, g))
  const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0)
  const pairs: Array<{ t: number; b: number; iou: number }> = []
  const cells = (m: Uint8Array) => {
    const out: number[] = []
    for (let k = 0; k < m.length; k++) if (m[k]) out.push(k)
    return out
  }
  const tCells = tMasks.map(cells)
  tMasks.forEach((_, ti) => bMasks.forEach((bm, bi) => {
    let inter = 0
    for (const k of tCells[ti]!) inter += bm[k]!
    if (!inter) return
    const iou = inter / (tCells[ti]!.length + count(bm) - inter)
    if (iou >= ROOM_IOU_MIN) pairs.push({ t: ti, b: bi, iou })
  }))
  pairs.sort((a, b) => b.iou - a.iou)
  const usedT = new Map<number, number>()
  const usedB = new Set<number>()
  const iouOf = new Map<number, number>()
  for (const p of pairs) {
    if (usedT.has(p.t) || usedB.has(p.b)) continue
    usedT.set(p.t, p.b)
    usedB.add(p.b)
    iouOf.set(p.t, p.iou)
  }
  const rooms: RoomRow[] = template.rooms.map((t, ti) => {
    const bi = usedT.get(ti)
    const b = bi === undefined ? null : built.rooms[bi]!
    return {
      template: t.name,
      built: b?.name ?? null,
      templateArea: t.area,
      builtArea: b?.area ?? null,
      areaErr: b ? (b.area - t.area) / t.area : null,
      iou: iouOf.get(ti) ?? null,
    }
  })
  built.rooms.forEach((b, bi) => {
    if (!usedB.has(bi)) rooms.push({ template: null, built: b.name, templateArea: null, builtArea: b.area, areaErr: null, iou: null })
  })
  const tUnion = union(tMasks, size)
  const bUnion = union(bMasks, size)
  let inter = 0
  for (let k = 0; k < size; k++) inter += tUnion[k]! & bUnion[k]!
  const floorIou = inter / Math.max(1, count(tUnion) + count(bUnion) - inter)
  const tArea = template.rooms.reduce((s, r) => s + r.area, 0)
  const bArea = built.rooms.reduce((s, r) => s + r.area, 0)
  const missingArea = template.rooms.reduce((s, r, ti) => s + (usedT.has(ti) ? 0 : r.area), 0)

  const tw = coveredLength(template.walls, built.walls)
  const bw = coveredLength(built.walls, template.walls)
  return {
    shift,
    floorIou,
    totalArea: { template: tArea, built: bArea, err: tArea ? (bArea - tArea) / tArea : 0 },
    rooms,
    roomsMatched: usedT.size,
    roomsMissing: template.rooms.length - usedT.size,
    roomsExtra: built.rooms.length - usedB.size,
    missingAreaShare: tArea ? missingArea / tArea : 0,
    walls: {
      template: template.walls.length,
      built: built.walls.length,
      templateLength: tw.total,
      builtLength: bw.total,
      coverage: tw.total ? tw.covered / tw.total : 0,
      precision: bw.total ? bw.covered / bw.total : 0,
    },
    doors: matchOpenings(template.openings.filter((o) => o.kind === 'door'), built.openings.filter((o) => o.kind === 'door')),
    windows: matchOpenings(template.openings.filter((o) => o.kind === 'window'), built.openings.filter((o) => o.kind === 'window')),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Table

const pct = (x: number | null) => (x === null ? '-' : `${(x * 100).toFixed(1)}%`)
const sq = (x: number | null) => (x === null ? '-' : x.toFixed(2))
const m = (x: number | null) => (x === null ? '-' : `${x.toFixed(2)} m`)

function table(rows: string[][]) {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)))
  return rows.map((r) => r.map((cell, c) => cell.padEnd(widths[c]!)).join('  ').trimEnd()).join('\n')
}

export function formatScore(s: ShellScore, title = 'shell'): string {
  const opening = (name: string, o: OpeningScore) =>
    [name, `${o.matched}/${o.template}`, String(o.missing), String(o.extra), m(o.meanPosErr), m(o.meanWidthErr)]
  return [
    `# ${title}`,
    `shift ${s.shift.map((v) => v.toFixed(2)).join(', ')} m; floor IoU ${pct(s.floorIou)}; total area ${sq(s.totalArea.built)} / ${sq(s.totalArea.template)} m2 (${pct(s.totalArea.err)})`,
    `rooms matched ${s.roomsMatched}/${s.rooms.filter((r) => r.template).length}, missing ${s.roomsMissing} (${pct(s.missingAreaShare)} of area), extra ${s.roomsExtra}`,
    ...(s.scaled
      ? [`layout at best scale (x${s.scaled.factor.toFixed(3)}): floor IoU ${pct(s.scaled.floorIou)}, wall coverage ${pct(s.scaled.wallCoverage)}, precision ${pct(s.scaled.wallPrecision)}, doors ${s.scaled.doorsMatched}, windows ${s.scaled.windowsMatched}`]
      : []),
    `walls ${s.walls.built} built / ${s.walls.template} template; length ${s.walls.builtLength.toFixed(1)} / ${s.walls.templateLength.toFixed(1)} m; coverage ${pct(s.walls.coverage)}, precision ${pct(s.walls.precision)}`,
    '',
    table([
      ['template room', 'built room', 'tmpl m2', 'built m2', 'area err', 'IoU'],
      ...s.rooms.map((r) => [r.template ?? '(extra)', r.built ?? '(missing)', sq(r.templateArea), sq(r.builtArea), pct(r.areaErr), pct(r.iou)]),
    ]),
    '',
    table([['openings', 'matched', 'missing', 'extra', 'pos err', 'width err'], opening('doors', s.doors), opening('windows', s.windows)]),
  ].join('\n')
}

/** One line for a run table. */
export function summaryRow(name: string, s: ShellScore): string[] {
  return [
    name,
    pct(s.floorIou),
    pct(s.totalArea.err),
    `${s.roomsMatched}/${s.rooms.filter((r) => r.template).length}`,
    String(s.roomsExtra),
    pct(s.walls.coverage),
    pct(s.walls.precision),
    `${s.doors.matched}/${s.doors.template}+${s.doors.extra}`,
    `${s.windows.matched}/${s.windows.template}+${s.windows.extra}`,
    s.scaled ? pct(s.scaled.floorIou) : '-',
  ]
}
export const SUMMARY_HEADER = ['run', 'floor IoU', 'area err', 'rooms', 'extra', 'wall cov', 'wall prec', 'doors', 'windows', 'IoU@scale']
export const summaryTable = (rows: string[][]) => table([SUMMARY_HEADER, ...rows])

export function loadTemplate(idOrPath: string): Graph {
  const file = idOrPath.endsWith('.json') ? idOrPath : join(TEMPLATES_DIR, `${idOrPath}.json`)
  return JSON.parse(readFileSync(file, 'utf8')) as Graph
}

if (import.meta.main) {
  const [builtFile, template] = process.argv.slice(2)
  if (!builtFile || !template) {
    console.error('usage: score.ts <built.json> <templateId | template.json>')
    process.exit(2)
  }
  const built = JSON.parse(readFileSync(builtFile, 'utf8')) as Graph & { graph?: Graph }
  console.log(formatScore(scoreShell(built.graph ?? built, loadTemplate(template)), template))
}
