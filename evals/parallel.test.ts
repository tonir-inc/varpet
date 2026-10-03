import assert from 'node:assert/strict'
import { test } from 'node:test'
import { budgetRoom, rateLimitReset, renderStats, runPool, Semaphore } from './parallel.ts'

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms))

test('runPool runs at most `limit` items at once and every item once', async () => {
  let running = 0
  let max = 0
  const seen: number[] = []
  await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running++
    max = Math.max(max, running)
    await delay(10)
    seen.push(n)
    running--
  })
  assert.equal(max, 3)
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7])
})

test('Semaphore holds jobs past its size until one finishes', async () => {
  const gate = new Semaphore(2)
  let running = 0
  let max = 0
  await Promise.all(Array.from({ length: 5 }, () => gate.run(async () => {
    running++
    max = Math.max(max, running)
    await delay(10)
    running--
  })))
  assert.equal(max, 2)
})

test('a case starts only while its calls fit next to what started cases promised', () => {
  assert.equal(budgetRoom({ budget: 10, used: 0, promised: 0, spentSinceStart: 0 }), 10)
  // two cases promised 2 calls each and spent one: 2 still owed
  assert.equal(budgetRoom({ budget: 10, used: 2, promised: 4, spentSinceStart: 2 }), 6)
  // retries spent past the promise only count once spent
  assert.equal(budgetRoom({ budget: 6, used: 5, promised: 4, spentSinceStart: 5 }), 1)
  assert.equal(budgetRoom({ budget: 6, used: 7, promised: 4, spentSinceStart: 7 }), 0)
})

test('only a refusing rate_limit event is a rate limit', () => {
  assert.equal(rateLimitReset({ status: 'allowed', resetsAt: 1 }), undefined)
  assert.equal(rateLimitReset({ status: 'allowed_warning', resetsAt: 1 }), undefined)
  assert.equal(rateLimitReset({ status: 'rejected', resetsAt: 1790000000000 }), 1790000000000)
  assert.equal(rateLimitReset({ status: 'rejected', resetsAt: null }), null)
})

test('renderStats sums the handler log lines', () => {
  const log = 'x\n[render] slot 0 queued 0 ms render 900 ms depth 1\nnoise\n[render] slot 1 queued 400 ms render 1100 ms cold depth 2\n'
  const stats = renderStats(log)
  assert.equal(stats.count, 2)
  assert.equal(stats.slots, 2)
  assert.deepEqual(stats.queuedMs, { total: 400, mean: 200, p95: 400, max: 400 })
  assert.equal(stats.renderMs!.total, 2000)
  assert.deepEqual(renderStats(''), { count: 0 })
})
