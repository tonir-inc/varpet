// Where a surface piece rests: on the top of the floor piece under it (a table top, a sofa seat, a bed's mattress).
// A box top is wrong for beds and sofas (the headboard or the back is the tallest part), so the host's model is read
// as a height map: every triangle sampled every few cm, the highest point kept per cell, in the model's own frame.
// The rest height under a footprint is the lowest level holding 30% of those cells: past a headboard or sofa back.
import { compose, glbJson, multiply, type Gltf } from './model-bounds.ts'

type Point = [number, number]
type AnyNode = { id: string; type: string; parentId?: string | null; [key: string]: unknown }
type Nodes = Record<string, AnyNode>

export interface HeightMap {
  x0: number
  z0: number
  cell: number
  nx: number
  nz: number
  /** Highest model y per cell, NaN where the model has nothing. */
  top: Float32Array
}

export type ModelHeights = (url: string) => Promise<HeightMap | null>

const CELL = 0.04

type Accessor = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }
type View = { byteOffset?: number; byteStride?: number; byteLength: number }

/** The height map of a binary glTF (triangles, float positions; anything else is skipped). */
export function glbHeightMap(bytes: Uint8Array): HeightMap | null {
  const gltf = glbJson(bytes) as (Gltf & { accessors?: Accessor[]; bufferViews?: View[]; meshes?: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; mode?: number }> }> }) | null
  if (!gltf) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const jsonLength = view.getUint32(12, true)
  const binAt = 20 + jsonLength
  if (binAt + 8 > bytes.byteLength || view.getUint32(binAt + 4, true) !== 0x004e4942) return null
  const bin = binAt + 8
  const read = (index: number): { get: (i: number, c: number) => number; count: number; size: number } | null => {
    const a = gltf.accessors?.[index]
    const v = a?.bufferView !== undefined ? gltf.bufferViews?.[a.bufferView] : undefined
    if (!a || !v) return null
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] ?? 1
    const bytesPer = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType]
    if (!bytesPer) return null
    const stride = v.byteStride ?? size * bytesPer
    const base = bin + (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const get = (i: number, c: number) => {
      const at = base + i * stride + c * bytesPer
      switch (a.componentType) {
        case 5126: return view.getFloat32(at, true)
        case 5125: return view.getUint32(at, true)
        case 5123: return view.getUint16(at, true)
        default: return view.getUint8(at)
      }
    }
    return { get, count: a.count, size }
  }
  const triangles: number[] = [] // x, y, z per corner, model frame
  const walk = (index: number, parent: number[], depth: number) => {
    const node = gltf.nodes?.[index]
    if (!node || depth > 64) return
    const m = multiply(parent, compose(node))
    for (const primitive of node.mesh !== undefined ? (gltf.meshes?.[node.mesh]?.primitives ?? []) : []) {
      if ((primitive.mode ?? 4) !== 4) continue
      const positions = read(primitive.attributes.POSITION ?? -1)
      if (!positions || gltf.accessors?.[primitive.attributes.POSITION!]?.componentType !== 5126) continue
      const indices = primitive.indices !== undefined ? read(primitive.indices) : null
      const n = indices ? indices.count : positions.count
      for (let i = 0; i + 2 < n; i += 3) {
        for (let k = 0; k < 3; k++) {
          const vi = indices ? indices.get(i + k, 0) : i + k
          const x = positions.get(vi, 0)
          const y = positions.get(vi, 1)
          const z = positions.get(vi, 2)
          triangles.push(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!)
        }
      }
    }
    for (const child of node.children ?? []) walk(child, m, depth + 1)
  }
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? gltf.nodes?.map((_, i) => i) ?? []
  for (const root of roots) walk(root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0)
  if (!triangles.length) return null
  let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity]
  for (let i = 0; i < triangles.length; i += 3) {
    x0 = Math.min(x0, triangles[i]!)
    x1 = Math.max(x1, triangles[i]!)
    z0 = Math.min(z0, triangles[i + 2]!)
    z1 = Math.max(z1, triangles[i + 2]!)
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / CELL))
  const nz = Math.max(1, Math.ceil((z1 - z0) / CELL))
  const top = new Float32Array(nx * nz).fill(NaN)
  const mark = (x: number, y: number, z: number) => {
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / CELL)))
    const j = Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / CELL)))
    const k = j * nx + i
    if (!(top[k]! >= y)) top[k] = y
  }
  for (let t = 0; t < triangles.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.slice(t, t + 9) as number[]
    const span = Math.max(Math.hypot(bx! - ax!, bz! - az!), Math.hypot(cx! - ax!, cz! - az!), Math.hypot(cx! - bx!, cz! - bz!))
    const steps = Math.min(400, Math.max(1, Math.ceil(span / (CELL / 2))))
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; i + j <= steps; j++) {
        const u = i / steps
        const v = j / steps
        const w = 1 - u - v
        mark(w * ax! + u * bx! + v * cx!, w * ay! + u * by! + v * cy!, w * az! + u * bz! + v * cz!)
      }
    }
  }
  return { x0, z0, cell: CELL, nx, nz, top }
}

/** The level a piece rests at over a rectangle in the model's frame, or null when the model has nothing there. */
export function restHeight(map: HeightMap, [cx, cz]: Point, [hx, hz]: Point): number | null {
  const values: number[] = []
  const i0 = Math.max(0, Math.floor((cx - hx - map.x0) / map.cell))
  const i1 = Math.min(map.nx - 1, Math.floor((cx + hx - map.x0) / map.cell))
  const j0 = Math.max(0, Math.floor((cz - hz - map.z0) / map.cell))
  const j1 = Math.min(map.nz - 1, Math.floor((cz + hz - map.z0) / map.cell))
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!Number.isNaN(map.top[j * map.nx + i]!)) values.push(map.top[j * map.nx + i]!)
  if (!values.length) return null
  values.sort((a, b) => a - b)
  // The lowest level that carries at least 30% of the footprint: a seat in front of a sofa back, a mattress inside
  // its headboard and rails. Levels are 3 cm bands grown from the lowest value up.
  let start = 0
  while (start < values.length) {
    let end = start
    while (end + 1 < values.length && values[end + 1]! - values[start]! <= 0.03) end++
    if (end - start + 1 >= 0.3 * values.length) return values[Math.floor((start + end) / 2)]!
    start = end + 1
  }
  return values[Math.floor(values.length / 2)]!
}

/** Height maps over HTTP (the whole GLB), cached per URL. */
export function httpModelHeights({ timeoutMs = 30_000 }: { timeoutMs?: number } = {}): ModelHeights {
  const cache = new Map<string, Promise<HeightMap | null>>()
  return (url) => {
    let hit = cache.get(url)
    if (!hit) {
      hit = (async () => {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
          return response.ok ? glbHeightMap(new Uint8Array(await response.arrayBuffer())) : null
        } catch {
          return null
        }
      })()
      cache.set(url, hit)
      hit.then((m) => m ?? cache.delete(url))
    }
    return hit
  }
}

export interface Host {
  id: string
  name: string
  node: AnyNode
  /** Overall top of its box above the floor. */
  boxTop: number
}

function frame(node: AnyNode) {
  const asset = node.asset as { dimensions?: number[] } | undefined
  const scale = (node.scale as number[] | undefined) ?? [1, 1, 1]
  const [w, h, d] = (asset?.dimensions ?? [0, 0, 0]).map((v, i) => Math.abs(v * (scale[i] ?? 1))) as [number, number, number]
  const [px, py, pz] = (node.position as number[] | undefined) ?? [0, 0, 0]
  const yaw = ((node.rotation as number[] | undefined) ?? [0, 0, 0])[1] ?? 0
  return { w, h, d, px: px!, py: py ?? 0, pz: pz!, yaw, scale }
}

/** World x/z into a piece's local frame (front +z at rotation 0; world = R(yaw) local). */
function toLocal(node: AnyNode, [x, z]: Point): Point {
  const f = frame(node)
  const dx = x - f.px
  const dz = z - f.pz
  return [dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw), dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw)]
}

/** The floor piece whose footprint holds a point (not rugs; the tallest when several do). */
export function hostUnder(nodes: Nodes, levelId: string, point: Point): Host | null {
  let best: Host | null = null
  for (const n of Object.values(nodes)) {
    if (n.type !== 'item' || n.parentId !== levelId) continue
    const asset = n.asset as { attachTo?: string; dimensions?: number[] } | undefined
    if (!asset || asset.attachTo || !Array.isArray(asset.dimensions)) continue
    const f = frame(n)
    if (f.h <= 0.05 || f.py > 0.25) continue
    const [lx, lz] = toLocal(n, point)
    if (Math.abs(lx) > f.w / 2 || Math.abs(lz) > f.d / 2) continue
    const host = { id: n.id, name: String(n.name ?? n.id), node: n, boxTop: f.py + f.h }
    if (!best || host.boxTop > best.boxTop) best = host
  }
  return best
}

export function hostOf(node: AnyNode): Host {
  const f = frame(node)
  return { id: node.id, name: String(node.name ?? node.id), node, boxTop: f.py + f.h }
}

/**
 * The height a piece of footprint [w, d] (turned by `yaw`) rests at when centred on `point` over `host`: from the
 * host's model when a height map is at hand, else the host's box top.
 */
export function restOn(host: Host, map: HeightMap | null, point: Point, [w, d]: Point, yaw: number): { top: number; from: 'model' | 'box' } {
  const f = frame(host.node)
  if (map) {
    const [lx, lz] = toLocal(host.node, point)
    const rel = yaw - f.yaw
    const hx = (Math.abs(Math.cos(rel)) * w + Math.abs(Math.sin(rel)) * d) / 2
    const hz = (Math.abs(Math.sin(rel)) * w + Math.abs(Math.cos(rel)) * d) / 2
    const sx = f.scale[0] || 1
    const sz = f.scale[2] || 1
    const height = restHeight(map, [lx / sx, lz / sz], [hx / sx, hz / sz])
    if (height !== null) return { top: Math.round((f.py + height * (f.scale[1] ?? 1)) * 1000) / 1000, from: 'model' }
  }
  return { top: Math.round(host.boxTop * 1000) / 1000, from: 'box' }
}
