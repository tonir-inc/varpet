import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RenderRequest } from '@varpet/contracts'
import { handleRender, handleWarm, RENDER_TOKEN_HEADER } from './handler.ts'
import { createRenderQueue, type DriverResult, type RenderDriver } from './queue.ts'

const request: RenderRequest = {
  graph: { nodes: {}, rootNodeIds: [] },
  camera: { projection: 'perspective', position: [1, 2, 3], target: [0, 0, 0], fov: 50 },
  wallMode: 'cutaway',
  width: 1024,
  height: 768,
}

const image = Buffer.from('jpeg bytes')
const ok: DriverResult = { image, backend: 'webgpu', cold: false }
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms))

function fakeDriver(render: (r: RenderRequest) => Promise<DriverResult>) {
  const calls = { renders: 0, resets: 0, running: 0, maxRunning: 0 }
  const driver: RenderDriver = {
    async render(r) {
      calls.renders++
      calls.running++
      calls.maxRunning = Math.max(calls.maxRunning, calls.running)
      try {
        return await render(r)
      } finally {
        calls.running--
      }
    },
    async reset() {
      calls.resets++
    },
  }
  return { driver, calls }
}

test('the queue runs one job at a time and reports queue wait and render time', async () => {
  const { driver, calls } = fakeDriver(async () => {
    await delay(30)
    return ok
  })
  const queue = createRenderQueue(driver)
  const results = await Promise.all([queue.render(request), queue.render(request), queue.render(request)])
  assert.equal(calls.maxRunning, 1)
  assert.equal(calls.renders, 3)
  assert.ok(results[2]!.queuedMs >= 50, `third job waited ${results[2]!.queuedMs} ms`)
  assert.ok(results.every((r) => r.renderMs >= 25 && r.image === image))
  assert.equal(queue.depth, 0)
})

test('a job that hangs times out with render_timeout, resets the renderer, and the next job runs', async () => {
  let first = true
  const { driver, calls } = fakeDriver(async () => {
    if (first) {
      first = false
      await new Promise(() => {}) // never settles
    }
    return ok
  })
  const queue = createRenderQueue(driver, { timeoutMs: 50 })
  const [hung, next] = await Promise.allSettled([queue.render(request), queue.render(request)])
  assert.equal(hung.status, 'rejected')
  assert.match(String((hung as PromiseRejectedResult).reason.message), /^render_timeout: /)
  assert.equal(calls.resets, 1)
  assert.equal(next.status, 'fulfilled')
})

test('a cold renderer gets the longer budget', async () => {
  const { driver } = fakeDriver(async () => {
    await delay(80)
    return { ...ok, cold: true }
  })
  const queue = createRenderQueue(driver, { timeoutMs: 20, coldTimeoutMs: 1000, isWarm: () => false })
  assert.equal((await queue.render(request)).cold, true)
})

test('a failing job is render_failed and resets; past maxDepth new jobs are render_busy', async () => {
  const { driver, calls } = fakeDriver(async () => {
    await delay(20)
    throw new Error('page crashed')
  })
  const queue = createRenderQueue(driver, { maxDepth: 2 })
  const jobs = [queue.render(request), queue.render(request), queue.render(request)].map((p) => p.catch((e: Error) => e.message))
  const messages = await Promise.all(jobs)
  assert.deepEqual(messages, ['render_failed: page crashed', 'render_failed: page crashed', 'render_busy: 2 renders already queued'])
  assert.equal(calls.resets, 2)
})

// ---------------------------------------------------------------------------------------------------------------
// The endpoint

const post = (body: unknown, headers: Record<string, string> = {}, url = 'http://127.0.0.1:3029/api/render') =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

const queueOf = (result: () => Promise<DriverResult>) => createRenderQueue(fakeDriver(result).driver)

test('POST /api/render answers a RenderResponse with the JPEG as base64', async () => {
  const response = await handleRender(post(request), queueOf(async () => ok), undefined)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.image, image.toString('base64'))
  assert.equal(body.mimeType, 'image/jpeg')
  assert.equal(body.backend, 'webgpu')
  assert.deepEqual([body.width, body.height, body.cold], [1024, 768, false])
  assert.equal(typeof body.renderMs, 'number')
})

test('only internal callers: loopback hosts without a token, the token header when one is set', async () => {
  const queue = queueOf(async () => ok)
  assert.equal((await handleRender(post(request, { host: 'varpet.snek.page' }, 'https://varpet.snek.page/api/render'), queue, undefined)).status, 403)
  assert.equal((await handleRender(post(request, { host: 'localhost:3029' }), queue, undefined)).status, 200)
  assert.equal((await handleRender(post(request), queue, 's3cret')).status, 403)
  assert.equal((await handleRender(post(request, { [RENDER_TOKEN_HEADER]: 's3cret' }), queue, 's3cret')).status, 200)
  const warm = await handleWarm(new Request('http://localhost:3029/api/render'), async () => ({ cold: true, ms: 1200 }), undefined)
  assert.deepEqual(await warm.json(), { ready: true, cold: true, ms: 1200 })
})

test('bad bodies are 400; timeouts 504; failures 500, each with an error line', async () => {
  const queue = queueOf(async () => ok)
  const notJson = await handleRender(post('{'), queue, undefined)
  assert.equal(notJson.status, 400)
  const tooWide = await handleRender(post({ ...request, width: 9000 }), queue, undefined)
  assert.equal(tooWide.status, 400)
  assert.match((await tooWide.json()).error, /^bad_request: width/)
  const noCamera = await handleRender(post({ ...request, camera: undefined }), queue, undefined)
  assert.match((await noCamera.json()).error, /^bad_request: camera/)

  const slow = createRenderQueue(fakeDriver(() => new Promise(() => {})).driver, { timeoutMs: 20 })
  const timedOut = await handleRender(post(request), slow, undefined)
  assert.equal(timedOut.status, 504)
  assert.match((await timedOut.json()).error, /^render_timeout: /)

  const broken = await handleRender(post(request), queueOf(async () => { throw new Error('no GPU') }), undefined)
  assert.equal(broken.status, 500)
  assert.equal((await broken.json()).error, 'render_failed: no GPU')
})
