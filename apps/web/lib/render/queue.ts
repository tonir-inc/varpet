// One renderer, one job at a time: jobs wait their turn, each has a hard timeout, and a failed or timed-out job
// resets the renderer so the next one starts clean. Pure (no browser), so tests drive it with a fake driver.
import type { RenderRequest } from '@varpet/contracts'

export interface DriverResult {
  image: Buffer
  backend: 'webgpu' | 'webgl'
  /** True when this job had to start the browser or load the page first. */
  cold: boolean
}

export interface RenderDriver {
  render(request: RenderRequest): Promise<DriverResult>
  /** Drop the page (and the browser if it is unhealthy); the next render starts fresh. */
  reset(): Promise<void>
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
}

export interface RenderQueue {
  render(request: RenderRequest): Promise<QueuedResult>
  /** Jobs running or waiting. */
  readonly depth: number
}

export function createRenderQueue(
  driver: RenderDriver,
  { timeoutMs = 60_000, coldTimeoutMs = 180_000, maxDepth = 8, isWarm = () => true }: {
    timeoutMs?: number
    /** Budget for a job that also starts the browser and compiles the page (first job, or after a reset). */
    coldTimeoutMs?: number
    maxDepth?: number
    isWarm?: () => boolean
  } = {},
): RenderQueue {
  let tail: Promise<unknown> = Promise.resolve()
  let depth = 0

  async function run(request: RenderRequest, enqueuedAt: number): Promise<QueuedResult> {
    const startedAt = Date.now()
    const budget = isWarm() ? timeoutMs : coldTimeoutMs
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RenderError('render_timeout', `no image after ${Math.round(budget / 1000)} s`)), budget)
    })
    try {
      const result = await Promise.race([driver.render(request), timeout])
      return { ...result, renderMs: Date.now() - startedAt, queuedMs: startedAt - enqueuedAt }
    } catch (error) {
      await driver.reset().catch(() => {})
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
    render(request) {
      if (depth >= maxDepth) return Promise.reject(new RenderError('render_busy', `${depth} renders already queued`))
      depth++
      const enqueuedAt = Date.now()
      const job = tail.then(() => run(request, enqueuedAt))
      tail = job.catch(() => {})
      return job.finally(() => {
        depth--
      })
    },
  }
}
