import { traceInk, type BlueprintInk } from './blueprint-ink';

/** The stage's copy of the plan: ink coverage in alpha, pen order in red. */
export function inkSheet(ink: BlueprintInk): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = ink.width; canvas.height = ink.height;
  const ctx = canvas.getContext('2d')!, image = ctx.createImageData(ink.width, ink.height);
  for (let i = 0; i < ink.alpha.length; i++) {
    const k = i * 4;
    image.data[k] = ink.order[i]! >= 0 ? Math.round(ink.order[i]! * 255) : 0; image.data[k + 3] = ink.alpha[i]!;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Trace the decoded plan at sheet resolution, cropped to its drawing. */
export function inkOf(image: HTMLImageElement): BlueprintInk {
  const fit = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * fit)), height = Math.max(1, Math.round(image.naturalHeight * fit));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
  ctx.drawImage(image, 0, 0, width, height);
  const whole = traceInk(ctx.getImageData(0, 0, width, height).data, width, height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let i = 0; i < whole.alpha.length; i++) if (whole.alpha[i]! > 96) {
    const x = i % width, y = (i - x) / width;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return whole;
  const pad = Math.round(Math.max(width, height) * .015);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  if (x1 - x0 + 1 === width && y1 - y0 + 1 === height) return whole;
  const cropped = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  return traceInk(cropped.data, cropped.width, cropped.height);
}

/** Decode the user's source without retaining its temporary object URL. */
export async function blueprintSource(plan: File): Promise<{ ink: BlueprintInk; sheet: HTMLCanvasElement }> {
  const url = URL.createObjectURL(plan), image = new Image();
  try {
    image.src = url;
    await image.decode();
    const ink = inkOf(image);
    return { ink, sheet: inkSheet(ink) };
  } finally {
    image.src = ''; URL.revokeObjectURL(url);
  }
}
