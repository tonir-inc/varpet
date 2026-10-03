// A small pool of renderers: up to `concurrency` jobs at once, each on its own slot (one page in the warm browser),
// the rest wait their turn in order. Each job has a hard timeout, and a failed or timed-out job resets only its slot
// so the next job there starts clean. Pure (no browser), so tests drive it with a fake driver.
import type { RenderRequest } from '@varpet/contracts'

export interface DriverResult {
  image: Buffer
  backend: 'webgpu' | 'webgl'
  /** True when this job had to start the browser or load the page first. */
  cold: boolean
}

export interface RenderDriver {
  /** Render on one slot (0 .. concurrency-1); a slot runs one job at a time. */
  render(request: RenderRequest, slot?: number): Promise<DriverResult>
  /** Drop the slot's page (and the browser if it is unhealthy); the slot's next render starts fresh. */
  reset(slot?: number): Promise<void>
}

export type RenderErrorCode = 'render_timeout' | 'render_busy' | 'render_failed'

export class RenderError extends Error {
  readonly code: RenderErrorCode
  constructor(code: RenderErrorCode, message: string) {
    super(`${code}: ${message}`)
    this.code = code
  }
}

export interface QueuedResult extends DriverResult {
  renderMs: number
  queuedMs: number
  /** The slot that drew it. */
  slot: number
}

export interface RenderQueue {
  render(request: RenderRequest): Promise<QueuedResult>
  /** Jobs running or waiting. */
  readonly depth: number
  readonly concurrency: number
}

export function createRenderQueue(
  driver: RenderDriver,
  { timeoutMs = 60_000, coldTimeoutMs = 180_000, maxDepth = 8, concurrency = 1, isWarm = () => true }: {
    timeoutMs?: number
    /** Budget for a job that also starts the browser and compiles the page (first job on a slot, or after a reset). */
    coldTimeoutMs?: number
    /** Jobs running plus waiting; past it new jobs are render_busy. */
    maxDepth?: number
    /** Jobs at once, one per slot. */
    concurrency?: number
    isWarm?: (slot: number) => boolean
  } = {},
): RenderQueue {
  const slots = Math.max(1, Math.floor(concurrency))
  const free = Array.from({ length: slots }, (_, i) => i)
  const waiting: Array<(slot: number) => void> = []
  let depth = 0

  const take = () => new Promise<number>((done) => (free.length ? done(free.shift()!) : waiting.push(done)))
  const give = (slot: number) => {
    const next = waiting.shift()
    if (next) next(slot)
    else free.push(slot)
  }

  async function run(request: RenderRequest, slot: number, enqueuedAt: number): Promise<QueuedResult> {
    const startedAt = Date.now()
    const budget = isWarm(slot) ? timeoutMs : coldTimeoutMs
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RenderError('render_timeout', `no image after ${Math.round(budget / 1000)} s`)), budget)
    })
    try {
      const result = await Promise.race([driver.render(request, slot), timeout])
      return { ...result, renderMs: Date.now() - startedAt, queuedMs: startedAt - enqueuedAt, slot }
    } catch (error) {
      await driver.reset(slot).catch(() => {})
      if (error instanceof RenderError) throw error
      throw new RenderError('render_failed', error instanceof Error ? error.message : String(error))
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    get depth() {
      return depth
    },
    concurrency: slots,
    async render(request) {
      if (depth >= maxDepth) throw new RenderError('render_busy', `${depth} renders already queued`)
      depth++
      const enqueuedAt = Date.now()
      try {
        const slot = await take()
        try {
          return await run(request, slot, enqueuedAt)
        } finally {
          give(slot)
        }
      } finally {
        depth--
      }
    },
  }
}
