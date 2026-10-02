// Where a catalog model actually sits around its origin. Most catalog models stand on their origin, centred in x
// and z, but not all: Amazon's ceiling lights hang from it (y from -h to 0). A hung piece needs its back on the wall
// or its top at the ceiling, so place_product reads the model's box from the GLB's JSON (accessor min/max under the
// node transforms; no mesh decoding) and corrects the item's `asset.offset`.

export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

type Mat = number[] // column-major 4x4
type GltfNode = { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
type Gltf = {
  scene?: number
  scenes?: Array<{ nodes?: number[] }>
  nodes?: GltfNode[]
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number> }> }>
  accessors?: Array<{ min?: number[]; max?: number[] }>
}

function compose(n: GltfNode): Mat {
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

function multiply(a: Mat, b: Mat): Mat {
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
  return Number.isFinite(min[0]) ? { min, max } : null
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

/** Bounds over HTTP, cached per URL; null when the model cannot be read (place_product then assumes the usual origin). */
export function httpModelBounds({ timeoutMs = 20_000 }: { timeoutMs?: number } = {}): ModelBounds {
  const cache = new Map<string, Promise<Bounds | null>>()
  return (url) => {
    let hit = cache.get(url)
    if (!hit) {
      hit = (async () => {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
          if (!response.ok) return null
          const gltf = glbJson(new Uint8Array(await response.arrayBuffer()))
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
