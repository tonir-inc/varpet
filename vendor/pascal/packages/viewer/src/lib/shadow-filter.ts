import { add, Fn, reference, renderGroup, texture, vec2 } from 'three/tsl'

/**
 * Deterministic soft-shadow filter for the key light: a 4×4 grid of hardware-compared taps (each one a bilinear
 * 2×2 PCF with PCFShadowMap's linear depth filtering) spread over ±`shadow.radius` texels.
 *
 * three r186's PCFShadowFilter rotates 5 Vogel-disk taps per pixel by interleaved gradient noise, which only
 * resolves under TAA. Pascal has no TAA, so penumbrae showed a fixed diagonal stripe pattern on walls and floors
 * (worst in still captures). This grid has no per-pixel noise: the penumbra is a smooth ramp.
 */
export const gridShadowFilter = Fn(({ depthTexture, shadowCoord, shadow, depthLayer }: any) => {
  const depthCompare = (uv: any, compare: any) => {
    let depth: any = texture(depthTexture, uv)
    if (depthTexture.isArrayTexture) depth = depth.depth(depthLayer)
    return depth.compare(compare)
  }
  const mapSize = (reference('mapSize', 'vec2', shadow) as any).setGroup(renderGroup)
  const radius = (reference('radius', 'float', shadow) as any).setGroup(renderGroup)
  // Taps at ±radius·(1/3, 1) texels: four per axis, evenly spaced across the filter width.
  const step = vec2(1).div(mapSize).mul(radius).div(1.5)
  const taps: any[] = []
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      taps.push(depthCompare(shadowCoord.xy.add(vec2(x - 1.5, y - 1.5).mul(step)), shadowCoord.z))
    }
  }
  return (add as any)(...taps).mul(1 / taps.length)
})
