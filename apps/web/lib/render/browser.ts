// The warm renderer: one headless Chrome (Playwright) with a small pool of /render pages (one per queue slot), kept
// between jobs, held on globalThis so a dev-server module reload does not leak browsers. Each page renders one job at
// a time with its own network counters and viewport, so jobs on different pages do not see each other. WebGPU where
// the GPU allows it; three.js falls back to WebGL2 on its own (the response says which backend drew).
//
// Env: VARPET_RENDER_CONCURRENCY (pages, so renders at once; default 2), VARPET_CHROME (Chrome/Chromium binary;
// default macOS Google Chrome, else Playwright's own lookup), VARPET_CHROME_ARGS (space-separated flags, replaces the
// defaults), VARPET_RENDER_PAGE_ORIGIN (where the page loads; default VARPET_PUBLIC_ORIGIN, so model URLs in graphs
// are same-origin), VARPET_RENDER_IDLE_MS (close the browser after this idle time; default 15 min),
// VARPET_RENDER_TIMEOUT_MS (per warm job; default 60 s), VARPET_RENDER_DUMP_DIR (debugging: save every image there),
// VARPET_RENDER_RECYCLE_EVERY (reopen a page after this many renders; default 20), VARPET_RENDER_RECYCLE_HEAP_MB
// (or once its JS heap passes this; default 1024). A page's renderer process otherwise grows by a few hundred MB per
// new scene (model caches, GPU buffers) to several GB.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright-core'
import type { RenderRequest } from '@varpet/contracts'
import { createRenderQueue, type DriverResult, type RenderDriver, type RenderQueue } from './queue.ts'

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

function chromeArgs(env: NodeJS.ProcessEnv) {
  if (env.VARPET_CHROME_ARGS) return env.VARPET_CHROME_ARGS.split(/\s+/).filter(Boolean)
  if (process.platform === 'darwin') return ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-webgpu']
  // Linux servers without a GPU: SwiftShader for WebGL2 (and WebGPU where Chrome's software adapter is allowed).
  return ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
}

export function renderConcurrency(env: NodeJS.ProcessEnv = process.env) {
  const n = Math.floor(Number(env.VARPET_RENDER_CONCURRENCY))
  return n >= 1 ? Math.min(n, 16) : 2
}

interface Slot {
  page: Page | null
  /** Renders on this page since it opened. */
  renders: number
  inflight: number
  lastNetwork: number
  /** The page being opened, so a warm-up and a first job share one load. */
  opening: Promise<Page> | null
}

interface BrowserState {
  browser: Browser | null
  /** The browser being launched, so pages opening at once share one launch. */
  launching: Promise<Browser> | null
  slots: Slot[]
  idleTimer: ReturnType<typeof setTimeout> | null
  queue: RenderQueue | null
}

// v2: the pool. A dev server still holding v1's single-page state keeps that browser until its idle timer closes it.
const STATE_KEY = '__varpetRendererPool'
const state: BrowserState = ((globalThis as Record<string, unknown>)[STATE_KEY] as BrowserState | undefined) ??
  ((globalThis as Record<string, unknown>)[STATE_KEY] = {
    browser: null,
    launching: null,
    slots: [],
    idleTimer: null,
    queue: null,
  } satisfies BrowserState) as BrowserState

const slotOf = (i: number): Slot => (state.slots[i] ??= { page: null, renders: 0, inflight: 0, lastNetwork: 0, opening: null })

function pageOrigin(env: NodeJS.ProcessEnv) {
  const origin = env.VARPET_RENDER_PAGE_ORIGIN ?? env.VARPET_PUBLIC_ORIGIN
  if (!origin) throw new Error('VARPET_PUBLIC_ORIGIN (or VARPET_RENDER_PAGE_ORIGIN) is not set')
  return origin.replace(/\/$/, '')
}

async function closeAll() {
  const browser = state.browser
  state.browser = null
  for (const slot of state.slots) Object.assign(slot, { page: null, inflight: 0 })
  await browser?.close().catch(() => {})
}

const warm = (i: number) => {
  const page = state.slots[i]?.page
  return Boolean(page && !page.isClosed() && state.browser?.isConnected())
}

async function ensurePage(env: NodeJS.ProcessEnv, i: number): Promise<{ page: Page; cold: boolean }> {
  const slot = slotOf(i)
  if (warm(i)) return { page: slot.page!, cold: false }
  slot.opening ??= openPage(env, slot).finally(() => {
    slot.opening = null
  })
  return { page: await slot.opening, cold: true }
}

async function ensureBrowser(env: NodeJS.ProcessEnv): Promise<Browser> {
  if (state.browser?.isConnected()) return state.browser
  state.launching ??= (async () => {
    await closeAll()
    const { chromium } = await import('playwright-core')
    const executablePath = env.VARPET_CHROME ?? (existsSync(MAC_CHROME) ? MAC_CHROME : undefined)
    state.browser = await chromium.launch({ executablePath, headless: true, args: chromeArgs(env) })
    return state.browser
  })().finally(() => {
    state.launching = null
  })
  return state.launching
}

async function openPage(env: NodeJS.ProcessEnv, slot: Slot): Promise<Page> {
  const browser = await ensureBrowser(env)
  // Its own context per page: no shared cache or storage between slots.
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('close', () => void context.close().catch(() => {}))
  slot.renders = 0
  slot.inflight = 0
  slot.lastNetwork = Date.now()
  const started = () => {
    slot.inflight++
    slot.lastNetwork = Date.now()
  }
  const ended = () => {
    slot.inflight = Math.max(0, slot.inflight - 1)
    slot.lastNetwork = Date.now()
  }
  page.on('request', started)
  page.on('requestfinished', ended)
  page.on('requestfailed', ended)
  page.on('pageerror', (error) => console.error('[render] page error:', error.message))
  await page.goto(`${pageOrigin(env)}/render`, { waitUntil: 'domcontentloaded', timeout: 150_000 })
  await page.waitForFunction(() => typeof window.__varpetRender === 'function', null, { timeout: 150_000 })
  slot.page = page
  return page
}

/**
 * Start the browser and load every slot's page now (GET /api/render): the first alone (it compiles the page), the
 * rest together. Resolves with the time it took, 0 when warm.
 */
export async function warmUp(env: NodeJS.ProcessEnv = process.env) {
  const started = Date.now()
  const { cold } = await ensurePage(env, 0)
  const rest = await Promise.all(Array.from({ length: renderConcurrency(env) - 1 }, (_, i) => ensurePage(env, i + 1)))
  scheduleIdleClose(env)
  const anyCold = cold || rest.some((r) => r.cold)
  return { cold: anyCold, ms: anyCold ? Date.now() - started : 0 }
}

/** Whether a page that has drawn `renders` jobs and holds `heapBytes` of JS heap should be closed and reopened. */
export function shouldRecycle(renders: number, heapBytes: number, env: Record<string, string | undefined> = process.env) {
  const every = Math.floor(Number(env.VARPET_RENDER_RECYCLE_EVERY)) || 20
  const heapMb = Number(env.VARPET_RENDER_RECYCLE_HEAP_MB) || 1024
  return renders >= every || heapBytes >= heapMb * 1024 * 1024
}

/**
 * Close the slot's page (its context and renderer process go with it) and open a fresh one in the background, so the
 * next job waits for a page load rather than a full cold start.
 */
function recycle(env: NodeJS.ProcessEnv, i: number) {
  const slot = slotOf(i)
  const page = slot.page
  slot.page = null
  slot.renders = 0
  void (async () => {
    await page?.close().catch(() => {})
    if (slot.page || slot.opening) return
    slot.opening = openPage(env, slot).finally(() => {
      slot.opening = null
    })
    await slot.opening
  })().catch((error) => console.error('[render] reopening a recycled page failed:', error instanceof Error ? error.message : error))
}

/** Wait until no request of the slot's page has been open for quietMs (late model and texture loads), at most maxMs. */
async function networkQuiet(slot: Slot, quietMs: number, maxMs: number) {
  const until = Date.now() + maxMs
  while (Date.now() < until) {
    if (slot.inflight === 0 && Date.now() - slot.lastNetwork >= quietMs) return
    await new Promise((done) => setTimeout(done, 100))
  }
}

function scheduleIdleClose(env: NodeJS.ProcessEnv) {
  if (state.idleTimer) clearTimeout(state.idleTimer)
  const idleMs = Number(env.VARPET_RENDER_IDLE_MS) || 15 * 60_000
  state.idleTimer = setTimeout(() => void closeAll(), idleMs)
  state.idleTimer.unref?.()
}

export function createBrowserDriver(env: NodeJS.ProcessEnv = process.env): RenderDriver {
  return {
    async render(request: RenderRequest, i = 0): Promise<DriverResult> {
      const { page, cold } = await ensurePage(env, i)
      const viewport = page.viewportSize()
      if (viewport?.width !== request.width || viewport?.height !== request.height) {
        await page.setViewportSize({ width: request.width, height: request.height })
        await page.waitForTimeout(200) // the canvas resizes on a 100 ms debounce
      }
      const { backend } = await page.evaluate((r) => window.__varpetRender!(r), request)
      await networkQuiet(slotOf(i), 400, 20_000)
      await page.evaluate(() => window.__varpetFrames!(12))
      const image = await page.locator('canvas').first().screenshot({ type: 'jpeg', quality: 82 })
      if (env.VARPET_RENDER_DUMP_DIR) {
        // Debugging: keep every image the agents were shown.
        mkdirSync(env.VARPET_RENDER_DUMP_DIR, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        writeFileSync(join(env.VARPET_RENDER_DUMP_DIR, `${stamp}-s${i}-${request.wallMode}.jpg`), image)
      }
      const slot = slotOf(i)
      slot.renders++
      const info = await page.evaluate(() => window.__varpetInfo?.()).catch(() => undefined)
      const heapMb = info?.heapMb ?? 0
      console.log(`[render] slot ${i} page render ${slot.renders}: JS heap ${heapMb} MB, ${info?.geometries ?? '?'} geometries, ${info?.textures ?? '?'} textures on the GPU`)
      if (shouldRecycle(slot.renders, heapMb * 2 ** 20, env)) {
        console.log(`[render] slot ${i} recycled after ${slot.renders} renders (JS heap ${heapMb} MB)`)
        recycle(env, i)
      }
      scheduleIdleClose(env)
      return { image, backend, cold }
    },
    async reset(i = 0) {
      const slot = slotOf(i)
      const page = slot.page
      slot.page = null
      slot.renders = 0
      await page?.close().catch(() => {})
      if (!state.browser?.isConnected()) await closeAll()
    },
  }
}

/** The process-wide queue in front of the warm browser's pages. */
export function renderQueue(env: NodeJS.ProcessEnv = process.env): RenderQueue {
  const concurrency = renderConcurrency(env)
  state.queue ??= createRenderQueue(createBrowserDriver(env), {
    timeoutMs: Number(env.VARPET_RENDER_TIMEOUT_MS) || 60_000,
    concurrency,
    maxDepth: Math.max(8, concurrency * 6),
    isWarm: warm,
  })
  return state.queue
}
