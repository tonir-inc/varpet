// A plan image redrawn as light linework on blueprint paper (v1 catalog.ts planInk/drawInk).
import { traceInk, type BlueprintInk } from './blueprint-ink'

export const BLUEPRINT_PAPER = '#155f6d'
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Trace an already decoded image, scaled to at most `max` px. */
export function inkOfImage(image: HTMLImageElement, max = 520): BlueprintInk {
  const fit = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * fit)), height = Math.max(1, Math.round(image.naturalHeight * fit))
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0, width, height)
  return traceInk(context.getImageData(0, 0, width, height).data, width, height)
}

const requests = new Map<string, Promise<BlueprintInk>>()
/** Plan ink per URL, fetched once per page. */
export function planInk(url: string): Promise<BlueprintInk> {
  let request = requests.get(url)
  if (!request) {
    request = (async () => {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
      await image.decode()
      return inkOfImage(image)
    })()
    requests.set(url, request)
    request.catch(() => requests.delete(url))
  }
  return request
}

/** Draw `ink` into `canvas`, following the pen order over `duration` ms (0 draws it at once). */
export function drawInk(canvas: HTMLCanvasElement, ink: BlueprintInk, duration: number, isAlive: () => boolean): Promise<void> {
  canvas.width = ink.width; canvas.height = ink.height
  const context = canvas.getContext('2d')!
  const image = context.createImageData(ink.width, ink.height)
  const paint = (from: number, to: number) => {
    for (let n = from; n < to; n++) {
      const i = ink.sequence[n]!, k = i * 4
      image.data[k] = 236; image.data[k + 1] = 247; image.data[k + 2] = 245; image.data[k + 3] = ink.alpha[i]!
    }
  }
  if (!duration) { paint(0, ink.sequence.length); context.putImageData(image, 0, 0); return Promise.resolve() }
  return new Promise(resolve => {
    let start = 0, done = 0
    const step = (now: number) => {
      if (!isAlive()) { resolve(); return }
      if (!start) start = now
      const t = Math.min(1, (now - start) / duration)
      // Ease out: the pen slows as it finishes the last walls.
      const next = Math.round(ink.sequence.length * (1 - Math.pow(1 - t, 2)))
      paint(done, next); done = next; context.putImageData(image, 0, 0)
      if (t < 1) requestAnimationFrame(step); else resolve()
    }
    requestAnimationFrame(step)
  })
}
