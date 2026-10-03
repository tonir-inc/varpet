// The eval runner's parallel plumbing, pure so it is tested without a run: a worker pool over the cases, a semaphore,
// the call budget's room, rate-limit events, and the render queue numbers from the dev server's log.

/** Run `work` over the items, at most `limit` at once, in order of the items; resolves when all have settled. */
export async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await work(items[next++]!)
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
}

export class Semaphore {
  private free: number
  private waiting: Array<() => void> = []
  constructor(size: number) {
    this.free = Math.max(1, size)
  }
  async run<T>(job: () => Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      return await job()
    } finally {
      release()
    }
  }
  /** Wait for a place; resolves with its release (calling it twice releases once). */
  async acquire(): Promise<() => void> {
    if (this.free > 0) this.free--
    else await new Promise<void>((done) => this.waiting.push(done))
    let held = true
    return () => {
      if (!held) return
      held = false
      const next = this.waiting.shift()
      if (next) next()
      else this.free++
    }
  }
}

/**
 * Calls a new case may still promise itself: the budget minus the calls spent, minus what started cases promised and
 * have not spent yet (their retries count once spent).
 */
export function budgetRoom({ budget, used, promised, spentSinceStart }: { budget: number; used: number; promised: number; spentSinceStart: number }) {
  return Math.max(0, budget - used - Math.max(0, promised - spentSinceStart))
}

/** The subscription said no: the case backs off until `resetsAt` (epoch ms; null when unknown) and retries once. */
export class RateLimited extends Error {
  readonly resetsAt: number | null
  constructor(message: string, resetsAt: number | null) {
    super(message)
    this.resetsAt = resetsAt
  }
}

/** A rate_limit event's reset when it refuses calls (null: refused, reset unknown); undefined when calls are allowed. */
export function rateLimitReset(event: { status: string; resetsAt: number | null }): number | null | undefined {
  if (event.status === 'allowed' || event.status === 'allowed_warning') return undefined
  return event.resetsAt
}

/** Totals over the render handler's `[render] slot S queued Q ms render R ms` lines. */
export function renderStats(log: string) {
  const lines = [...log.matchAll(/\[render\] slot (\d+) queued (\d+) ms render (\d+) ms/g)]
  if (!lines.length) return { count: 0 }
  const queued = lines.map((m) => Number(m[2]))
  const drawn = lines.map((m) => Number(m[3]))
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]!
  return {
    count: lines.length,
    slots: new Set(lines.map((m) => m[1])).size,
    queuedMs: { total: sum(queued), mean: Math.round(sum(queued) / queued.length), p95: p95(queued), max: Math.max(...queued) },
    renderMs: { total: sum(drawn), mean: Math.round(sum(drawn) / drawn.length), p95: p95(drawn), max: Math.max(...drawn) },
  }
}
