// Where a catalog model actually sits around its origin. Most catalog models stand on their origin, centred in x
// and z, but not all: Amazon's ceiling lights hang from it (y from -h to 0). A hung piece needs its back on the wall
// or its top at the ceiling, so place_product reads the model's box from the GLB's JSON (accessor min/max under the
// node transforms; no mesh decoding) and corrects the item's `asset.offset`.

export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
  /** A ceiling piece whose drop can be set (root extras `varpet_hang`, see catalog/blender/lights/README.md). */
  hang?: Hang
}

/**
 * The hang contract of varpet's generated lights: Y up, origin at the ceiling attachment point; nodes `canopy`
 * (y -canopy_m..0), `cord` (origin under the canopy, mesh 0..-cord_m) and `body` (origin at the cord's end, mesh
 * 0..-body_m). Drop D (ceiling to the body's bottom): cord c = clamp(D - canopy_m - body_m, cord_min_m, cord_max_m),
 * cord.scale.y = c / cord_m, body.y = -(canopy_m + c). Flush pieces: `adjustable: false` and only `drop_m`.
 */
export interface Hang {
  adjustable: boolean
  drop_m: number
  canopy_m?: number
  cord_m?: number
  body_m?: number
  cord_min_m?: number
  cord_max_m?: number
  cord_node?: string
  body_node?: string
  /** The body node's own x/z (kept when it moves down). */
  body_xz?: [number, number]
}

type Mat = number[] // column-major 4x4
type GltfNode = { name?: string; mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; extras?: Record<string, unknown> }
export type Gltf = {
  scene?: number
  scenes?: Array<{ nodes?: number[] }>
  nodes?: GltfNode[]
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number> }> }>
  accessors?: Array<{ min?: number[]; max?: number[] }>
}

export function compose(n: GltfNode): Mat {
  if (n.matrix?.length === 16) return n.matrix
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx!, ty!, tz!, 1,
  ]
}

export function multiply(a: Mat, b: Mat): Mat {
  const out = new Array<number>(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r]! * b[c * 4 + k]!
      out[c * 4 + r] = sum
    }
  }
  return out
}

/** The box of a glTF scene from its JSON alone, or null when it has no positioned mesh. */
export function gltfBounds(gltf: Gltf): Bounds | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const walk = (index: number, parent: Mat, depth: number) => {
    const node = gltf.nodes?.[index]
    if (!node || depth > 64) return
    const m = multiply(parent, compose(node))
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
        const accessor = gltf.accessors?.[primitive.attributes.POSITION ?? -1]
        if (!accessor?.min || !accessor.max) continue
        for (const x of [accessor.min[0]!, accessor.max[0]!]) {
          for (const y of [accessor.min[1]!, accessor.max[1]!]) {
            for (const z of [accessor.min[2]!, accessor.max[2]!]) {
              const p = [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!]
              for (let i = 0; i < 3; i++) {
                min[i] = Math.min(min[i]!, p[i]!)
                max[i] = Math.max(max[i]!, p[i]!)
              }
            }
          }
        }
      }
    }
    for (const child of node.children ?? []) walk(child, m, depth + 1)
  }
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? gltf.nodes?.map((_, i) => i) ?? []
  for (const root of roots) walk(root, identity, 0)
  if (!Number.isFinite(min[0])) return null
  const hang = gltfHang(gltf, roots)
  return hang ? { min, max, hang } : { min, max }
}

/** The `varpet_hang` extras on a root node, checked against the named nodes it relies on. */
export function gltfHang(gltf: Gltf, roots: number[]): Hang | null {
  for (const root of roots) {
    let raw = gltf.nodes?.[root]?.extras?.varpet_hang
    if (raw === undefined) continue
    try {
      if (typeof raw === 'string') raw = JSON.parse(raw)
    } catch {
      return null
    }
    const named = (name: string) => gltf.nodes?.find((n) => n.name === name)
    return normalizeHang(raw as Partial<Hang>, named)
  }
  return null
}

/**
 * A usable hang record, or null. Adjustable needs every length and, when the model is at hand (`named`), its cord
 * and body nodes; otherwise it is reported as fixed at `drop_m`.
 */
export function normalizeHang(raw: Partial<Hang> | null | undefined, named?: (name: string) => GltfNode | undefined): Hang | null {
  if (!raw || typeof raw.drop_m !== 'number') return null
  const fixed: Hang = { adjustable: false, drop_m: raw.drop_m }
  if (!raw.adjustable) return fixed
  const numbers = [raw.canopy_m, raw.cord_m, raw.body_m, raw.cord_min_m, raw.cord_max_m]
  if (!numbers.every((v) => typeof v === 'number' && Number.isFinite(v)) || !(raw.cord_m! > 0)) return fixed
  const cordNode = raw.cord_node ?? 'cord'
  const bodyNode = raw.body_node ?? 'body'
  const body = named?.(bodyNode)
  if (named && (!named(cordNode) || !body)) return fixed
  return {
    adjustable: true,
    drop_m: raw.drop_m,
    canopy_m: raw.canopy_m,
    cord_m: raw.cord_m,
    body_m: raw.body_m,
    cord_min_m: raw.cord_min_m,
    cord_max_m: raw.cord_max_m,
    cord_node: cordNode,
    body_node: bodyNode,
    body_xz: body ? [body.translation?.[0] ?? 0, body.translation?.[2] ?? 0] : (raw.body_xz ?? [0, 0]),
  }
}

/** The drop range of an adjustable piece: [shortest, longest] from the ceiling to the body's bottom. */
export function dropRange(hang: Hang): [number, number] | null {
  if (!hang.adjustable) return null
  const fixed = hang.canopy_m! + hang.body_m!
  return [fixed + hang.cord_min_m!, fixed + hang.cord_max_m!]
}

/** The node overrides that hang an adjustable piece's body bottom `drop` below the ceiling (clamped to its cord). */
export function hangAt(hang: Hang, drop: number): { drop: number; cord: number; clamped: boolean; nodeTransforms: Record<string, { position?: [number, number, number]; scale?: [number, number, number] }> } {
  const want = drop - hang.canopy_m! - hang.body_m!
  const cord = Math.min(hang.cord_max_m!, Math.max(hang.cord_min_m!, want))
  const r = (v: number) => Math.round(v * 10000) / 10000
  const [bx, bz] = hang.body_xz ?? [0, 0]
  return {
    drop: r(hang.canopy_m! + cord + hang.body_m!),
    cord: r(cord),
    clamped: Math.abs(cord - want) > 1e-6,
    nodeTransforms: {
      [hang.cord_node!]: { scale: [1, r(cord / hang.cord_m!), 1] },
      [hang.body_node!]: { position: [bx, r(-(hang.canopy_m! + cord)), bz] },
    },
  }
}

/** The JSON chunk of a binary glTF. */
export function glbJson(bytes: Uint8Array): Gltf | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) return null
  const length = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + length > bytes.byteLength) return null
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as Gltf
}

export type ModelBounds = (url: string) => Promise<Bounds | null>

/**
 * Reads a GLB's JSON chunk off the stream and cancels the rest (the chunk comes first; a model is 1-2 MB, its JSON
 * a few kB), so annotating a page of search results stays cheap whether or not the server honours Range.
 */
async function fetchGlbJson(url: string, timeoutMs: number): Promise<Gltf | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok || !response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let need = 20
  try {
    while (size < need) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.byteLength
      if (need === 20 && size >= 20) {
        const head = concat(chunks, size)
        const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
        if (view.getUint32(0, true) !== 0x46546c67) return null
        need = 20 + view.getUint32(12, true)
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return glbJson(concat(chunks, size))
}

function concat(chunks: Uint8Array[], size: number) {
  if (chunks.length === 1) return chunks[0]!
  const out = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

/** Bounds over HTTP, cached per URL; null when the model cannot be read (place_product then assumes the usual origin). */
export function httpModelBounds({ timeoutMs = 20_000 }: { timeoutMs?: number } = {}): ModelBounds {
  const cache = new Map<string, Promise<Bounds | null>>()
  return (url) => {
    let hit = cache.get(url)
    if (!hit) {
      hit = (async () => {
        try {
          const gltf = await fetchGlbJson(url, timeoutMs)
          return gltf ? gltfBounds(gltf) : null
        } catch {
          return null
        }
      })()
      cache.set(url, hit)
      hit.then((b) => b ?? cache.delete(url))
    }
    return hit
  }
}
