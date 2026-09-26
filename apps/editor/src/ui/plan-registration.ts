/**
 * Where the returned walls sit on the person's plan image, so the blueprint shown under the
 * construction is sized and placed to match them. Pure pixel work, no DOM.
 *
 * The search looks for one uniform scale and offset (no rotation) at which wall centrelines
 * land on ink and the space just beside each wall lands on paper. Presentation only: the
 * checked shell geometry stays authoritative, and a weak match returns null.
 */

type Vec2 = [number, number];
export interface RegistrationWall { start: Vec2; end: Vec2; thickness: number }
/** Image pixels per metre, and the pixel where the walls' minimum x/z corner lands. */
export interface PlanRegistration { scale: number; x: number; y: number; score: number }

interface Level { width: number; height: number; factor: number; ink: Float32Array }
interface Samples { x: Float32Array; z: Float32Array; wall: number }

const MIN_WALL_INK = 0.3, MIN_CONTRAST = 0.18;

export function registerPlan(alpha: ArrayLike<number>, width: number, height: number, walls: RegistrationWall[]): PlanRegistration | null {
  const usable = walls.filter(w => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) > 0.05);
  if (!usable.length || width < 8 || height < 8) return null;
  const x0 = Math.min(...usable.flatMap(w => [w.start[0], w.end[0]])), z0 = Math.min(...usable.flatMap(w => [w.start[1], w.end[1]]));
  const spanX = Math.max(...usable.flatMap(w => [w.start[0], w.end[0]])) - x0, spanZ = Math.max(...usable.flatMap(w => [w.start[1], w.end[1]])) - z0;
  if (Math.max(spanX, spanZ) < 0.5) return null;

  // 1. Coarse: every scale that keeps the walls on the page, every offset, on a small image.
  const coarse = level(alpha, width, height, 72, 1);
  const coarseSamples = samples(usable, x0, z0, Math.max(spanX, spanZ) / 40);
  const sMax = Math.min((coarse.width * 1.04) / Math.max(spanX, 1e-3), (coarse.height * 1.04) / Math.max(spanZ, 1e-3));
  let best = { scale: 0, x: 0, y: 0, score: -Infinity };
  for (let i = 0; i < 28; i++) {
    const s = sMax * Math.pow(0.3, i / 27);
    const margin = 0.03 * coarse.width;
    for (let x = -margin; x <= coarse.width - spanX * s + margin; x += 1) {
      for (let y = -margin; y <= coarse.height - spanZ * s + margin; y += 1) {
        const score = evaluate(coarse, coarseSamples, s, x, y).score;
        if (score > best.score) best = { scale: s, x, y, score };
      }
    }
  }
  if (!best.scale) return null;

  // 2. Fine: refine around the coarse answer on a sharper image.
  const fine = level(alpha, width, height, 320, 1);
  const k = fine.factor / coarse.factor;
  const fineSamples = samples(usable, x0, z0, Math.max(spanX, spanZ) / 160);
  let refined = { scale: best.scale * k, x: best.x * k, y: best.y * k, wall: 0, off: 0, score: -Infinity };
  for (const [range, steps] of [[0.06, 13], [0.015, 9]] as const) {
    const centre = { ...refined }, reach = Math.max(2, k * (range > 0.05 ? 1.5 : 0.6));
    for (let i = 0; i < steps; i++) {
      const s = centre.scale * (1 - range + (2 * range * i) / (steps - 1));
      for (let dx = -reach; dx <= reach; dx += reach / 4) for (let dy = -reach; dy <= reach; dy += reach / 4) {
        const r = evaluate(fine, fineSamples, s, centre.x + dx, centre.y + dy);
        if (r.score > refined.score) refined = { scale: s, x: centre.x + dx, y: centre.y + dy, ...r };
      }
    }
  }
  if (refined.wall < MIN_WALL_INK || refined.wall - refined.off < MIN_CONTRAST) return null;
  return { scale: refined.scale / fine.factor, x: refined.x / fine.factor, y: refined.y / fine.factor, score: refined.score };
}

/** Ink averaged into a small grid, then softened so near misses still score. */
function level(alpha: ArrayLike<number>, width: number, height: number, size: number, blur: number): Level {
  const factor = Math.min(1, size / Math.max(width, height));
  const w = Math.max(1, Math.round(width * factor)), h = Math.max(1, Math.round(height * factor));
  const sum = new Float32Array(w * h), count = new Float32Array(w * h);
  for (let y = 0; y < height; y++) {
    const ty = Math.min(h - 1, Math.floor(y * factor));
    for (let x = 0; x < width; x++) {
      const t = ty * w + Math.min(w - 1, Math.floor(x * factor));
      sum[t] = sum[t]! + alpha[y * width + x]! / 255; count[t] = count[t]! + 1;
    }
  }
  let ink: Float32Array = sum.map((v, i) => v / Math.max(1, count[i]!));
  // Coarse cells average thin strokes away; normalise so the strongest cells read as full ink.
  let top = 0; for (const v of ink) top = Math.max(top, v);
  if (top > 0) ink = ink.map(v => Math.min(1, v / (top * 0.6)));
  for (let pass = 0; pass < blur; pass++) ink = boxBlur(ink, w, h);
  return { width: w, height: h, factor, ink };
}

function boxBlur(src: Float32Array, w: number, h: number): Float32Array<ArrayBuffer> {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -1; d <= 1; d++) { const xx = x + d; if (xx >= 0 && xx < w) { s += src[y * w + xx]!; n++; } }
    tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -1; d <= 1; d++) { const yy = y + d; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]!; n++; } }
    // Keep the peak: a blurred stroke should still read as ink where it actually is.
    out[y * w + x] = Math.max(src[y * w + x]!, s / n);
  }
  return out;
}

/** Points along each wall centreline, then points just beside each wall, in metres from (x0, z0). */
function samples(walls: RegistrationWall[], x0: number, z0: number, step: number): Samples {
  const onX: number[] = [], onZ: number[] = [], offX: number[] = [], offZ: number[] = [];
  for (const w of walls) {
    const dx = w.end[0] - w.start[0], dz = w.end[1] - w.start[1], L = Math.hypot(dx, dz);
    const nx = -dz / L, nz = dx / L, beside = Math.max(0.05, w.thickness) / 2 + 0.4;
    const n = Math.max(2, Math.ceil(L / step));
    for (let i = 0; i <= n; i++) {
      const f = i / n, px = w.start[0] + dx * f - x0, pz = w.start[1] + dz * f - z0;
      onX.push(px); onZ.push(pz);
      // Ends run into other walls; only the middle of a wall has clear space beside it.
      if (f > 0.15 && f < 0.85) for (const side of [1, -1]) { offX.push(px + nx * beside * side); offZ.push(pz + nz * beside * side); }
    }
  }
  return { x: Float32Array.from([...onX, ...offX]), z: Float32Array.from([...onZ, ...offZ]), wall: onX.length };
}

function evaluate(l: Level, p: Samples, scale: number, x: number, y: number): { score: number; wall: number; off: number } {
  let wall = 0, off = 0;
  for (let i = 0; i < p.x.length; i++) {
    const u = Math.round(x + p.x[i]! * scale), v = Math.round(y + p.z[i]! * scale);
    const ink = u >= 0 && v >= 0 && u < l.width && v < l.height ? l.ink[v * l.width + u]! : 0;
    if (i < p.wall) wall += ink; else off += ink;
  }
  wall /= p.wall; off /= Math.max(1, p.x.length - p.wall);
  return { score: wall - 0.6 * off, wall, off };
}
