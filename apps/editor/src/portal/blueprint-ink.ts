/**
 * The person's plan redrawn as light ink for the landing sheet. Pure pixel work, no DOM:
 * the ink is the plan's own strokes (measured against its paper tone), and the pen order is a
 * geodesic walk along those strokes so connected walls are drawn as continuous lines.
 * Presentation only; the uploaded original stays the evidence.
 */

export interface BlueprintInk {
  width: number;
  height: number;
  /** Ink coverage per pixel, 0..255. */
  alpha: Uint8ClampedArray;
  /** When each inked pixel is drawn, 0..1; -1 where there is no ink. */
  order: Float32Array;
  /** Inked pixel indices sorted by `order`, for incremental drawing. */
  sequence: Uint32Array;
}

/** Paper is the most common tone; ink is the far side of it, measured at a robust percentile. */
export function inkTones(lum: ArrayLike<number>): { paper: number; ink: number; dark: boolean } {
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) hist[lum[i]!]!++;
  let paper = 0;
  for (let t = 1; t < 256; t++) if (hist[t]! > hist[paper]!) paper = t;
  let darker = 0, lighter = 0;
  for (let t = 0; t < 256; t++) if (t < paper - 40) darker += hist[t]!; else if (t > paper + 40) lighter += hist[t]!;
  const dark = darker >= lighter;
  // The strongest 2% of off-paper pixels define full ink, so a few specks cannot set the scale.
  const target = Math.max(1, Math.round((dark ? darker : lighter) * 0.02));
  let seen = 0, ink = dark ? 0 : 255;
  if (dark) { for (let t = 0; t < paper; t++) if ((seen += hist[t]!) >= target) { ink = t; break; } }
  else for (let t = 255; t > paper; t--) if ((seen += hist[t]!) >= target) { ink = t; break; }
  return { paper, ink, dark };
}

/**
 * Extract ink from RGBA pixels (transparent pixels count as paper) and give it a pen order.
 * Coverage ramps from paper to ink, so tinted room fills become faint shading and strokes
 * read at full strength. Light-on-dark blueprints are read the same way.
 */
export function traceInk(rgba: ArrayLike<number>, width: number, height: number): BlueprintInk {
  const n = width * height;
  const lum = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3]! / 255;
    const l = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
    lum[i] = Math.round(l * a + 255 * (1 - a));
  }
  const { paper, ink } = inkTones(lum);
  const span = ink - paper || 1;
  const alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const v = (lum[i]! - paper) / span;
    const k = Math.min(1, Math.max(0, (v - 0.22) / 0.5));
    alpha[i] = Math.round(k * k * (3 - 2 * k) * 255);
  }
  const { order, sequence } = penOrder(alpha, width, height);
  return { width, height, alpha, order, sequence };
}

/**
 * Breadth-first distance along each connected stroke network, from the stroke point nearest
 * the sheet's top-left. Separate marks start as the sweep reaches them.
 */
export function penOrder(alpha: Uint8ClampedArray, width: number, height: number): { order: Float32Array; sequence: Uint32Array } {
  const n = width * height;
  const order = new Float32Array(n).fill(-1);
  const dist = new Int32Array(n).fill(-1);
  const component = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const starts: number[] = [], lengths: number[] = [], sizes: number[] = [];
  // Seeds in sweep order: each unvisited ink pixel first reached along the diagonals.
  for (let s = 0; s <= width + height - 2; s++) for (let y = Math.max(0, s - width + 1); y <= Math.min(height - 1, s); y++) {
    const seed = y * width + s - y;
    if (alpha[seed]! === 0 || component[seed]! >= 0) continue;
    const id = starts.length;
    let head = 0, tail = 0, far = 0;
    queue[tail++] = seed; component[seed] = id; dist[seed] = 0;
    while (head < tail) {
      const p = queue[head++]!, x = p % width, y = (p - x) / width, d = dist[p]! + 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (alpha[q]! === 0 || component[q]! >= 0) continue;
        component[q] = id; dist[q] = d; far = Math.max(far, d); queue[tail++] = q;
      }
    }
    starts.push((seed % width + Math.floor(seed / width)) / Math.max(1, width + height - 2));
    lengths.push(far); sizes.push(tail);
  }
  if (!starts.length) return { order, sequence: new Uint32Array(0) };
  // The largest stroke network is the plan itself; its walk sets the pen speed.
  let main = 0;
  for (let c = 1; c < sizes.length; c++) if (sizes[c]! > sizes[main]!) main = c;
  const speed = Math.max(1, lengths[main]!);
  let latest = 0;
  for (let i = 0; i < n; i++) {
    const c = component[i]!;
    if (c < 0) continue;
    const t = (c === main ? 0 : 0.55 * starts[c]!) + 0.8 * dist[i]! / speed;
    order[i] = t; latest = Math.max(latest, t);
  }
  const buckets = 2048, counts = new Uint32Array(buckets + 1);
  const scale = latest > 0 ? 1 / latest : 0;
  for (let i = 0; i < n; i++) if (order[i]! >= 0) { order[i] = order[i]! * scale; counts[Math.min(buckets - 1, Math.floor(order[i]! * buckets)) + 1]!++; }
  for (let b = 1; b <= buckets; b++) counts[b] = counts[b]! + counts[b - 1]!;
  const sequence = new Uint32Array(counts[buckets]!);
  for (let i = 0; i < n; i++) if (order[i]! >= 0) sequence[counts[Math.min(buckets - 1, Math.floor(order[i]! * buckets))]!++] = i;
  return { order, sequence };
}
