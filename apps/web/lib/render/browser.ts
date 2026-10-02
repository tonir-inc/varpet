// The warm renderer: one headless Chrome (Playwright) with one /render page, kept between jobs, held on globalThis
// so a dev-server module reload does not leak browsers. WebGPU where the GPU allows it; three.js falls back to
// WebGL2 on its own (the response says which backend drew).
//
// Env: VARPET_CHROME (Chrome/Chromium binary; default macOS Google Chrome, else Playwright's own lookup),
// VARPET_CHROME_ARGS (space-separated flags, replaces the defaults), VARPET_RENDER_PAGE_ORIGIN (where the page
// loads; default VARPET_PUBLIC_ORIGIN, so model URLs in graphs are same-origin), VARPET_RENDER_IDLE_MS (close the
// browser after this idle time; default 15 min), VARPET_RENDER_DUMP_DIR (debugging: save every image there).
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

interface BrowserState {
  browser: Browser | null
  page: Page | null
  inflight: number
  lastNetwork: number
  idleTimer: ReturnType<typeof setTimeout> | null
  queue: RenderQueue | null
  /** The page being opened, so a warm-up and a first job share one launch. */
  opening: Promise<Page> | null
}

const STATE_KEY = '__varpetRenderer'
const state: BrowserState = ((globalThis as Record<string, unknown>)[STATE_KEY] as BrowserState | undefined) ??
  ((globalThis as Record<string, unknown>)[STATE_KEY] = {
    browser: null,
    page: null,
    inflight: 0,
    lastNetwork: 0,
    idleTimer: null,
    queue: null,
    opening: null,
  } satisfies BrowserState) as BrowserState

function pageOrigin(env: NodeJS.ProcessEnv) {
  const origin = env.VARPET_RENDER_PAGE_ORIGIN ?? env.VARPET_PUBLIC_ORIGIN
  if (!origin) throw new Error('VARPET_PUBLIC_ORIGIN (or VARPET_RENDER_PAGE_ORIGIN) is not set')
  return origin.replace(/\/$/, '')
}

async function closeAll() {
  const browser = state.browser
  state.browser = null
  state.page = null
  state.inflight = 0
  await browser?.close().catch(() => {})
}

const warm = () => Boolean(state.page && !state.page.isClosed() && state.browser?.isConnected())

async function ensurePage(env: NodeJS.ProcessEnv): Promise<{ page: Page; cold: boolean }> {
  if (warm()) return { page: state.page!, cold: false }
  state.opening ??= openPage(env).finally(() => {
    state.opening = null
  })
  return { page: await state.opening, cold: true }
}

async function openPage(env: NodeJS.ProcessEnv): Promise<Page> {
  if (!state.browser?.isConnected()) {
    await closeAll()
    const { chromium } = await import('playwright-core')
    const executablePath = env.VARPET_CHROME ?? (existsSync(MAC_CHROME) ? MAC_CHROME : undefined)
    state.browser = await chromium.launch({ executablePath, headless: true, args: chromeArgs(env) })
  }
  const page = await state.browser!.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
  state.inflight = 0
  state.lastNetwork = Date.now()
  const started = () => {
    state.inflight++
    state.lastNetwork = Date.now()
  }
  const ended = () => {
    state.inflight = Math.max(0, state.inflight - 1)
    state.lastNetwork = Date.now()
  }
  page.on('request', started)
  page.on('requestfinished', ended)
  page.on('requestfailed', ended)
  page.on('pageerror', (error) => console.error('[render] page error:', error.message))
  await page.goto(`${pageOrigin(env)}/render`, { waitUntil: 'domcontentloaded', timeout: 150_000 })
  await page.waitForFunction(() => typeof window.__varpetRender === 'function', null, { timeout: 150_000 })
  state.page = page
  return page
}

/** Start the browser and load the page now (GET /api/render); resolves with the time it took, 0 when warm. */
export async function warmUp(env: NodeJS.ProcessEnv = process.env) {
  const started = Date.now()
  const { cold } = await ensurePage(env)
  scheduleIdleClose(env)
  return { cold, ms: cold ? Date.now() - started : 0 }
}

/** Wait until no request has been open for quietMs (late model and texture loads), at most maxMs. */
async function networkQuiet(quietMs: number, maxMs: number) {
  const until = Date.now() + maxMs
  while (Date.now() < until) {
    if (state.inflight === 0 && Date.now() - state.lastNetwork >= quietMs) return
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
    async render(request: RenderRequest): Promise<DriverResult> {
      const { page, cold } = await ensurePage(env)
      const viewport = page.viewportSize()
      if (viewport?.width !== request.width || viewport?.height !== request.height) {
        await page.setViewportSize({ width: request.width, height: request.height })
        await page.waitForTimeout(200) // the canvas resizes on a 100 ms debounce
      }
      const { backend } = await page.evaluate((r) => window.__varpetRender!(r), request)
      await networkQuiet(400, 20_000)
      await page.evaluate(() => window.__varpetFrames!(12))
      const image = await page.locator('canvas').first().screenshot({ type: 'jpeg', quality: 82 })
      if (env.VARPET_RENDER_DUMP_DIR) {
        // Debugging: keep every image the agents were shown.
        mkdirSync(env.VARPET_RENDER_DUMP_DIR, { recursive: true })
        writeFileSync(join(env.VARPET_RENDER_DUMP_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${request.wallMode}.jpg`), image)
      }
      scheduleIdleClose(env)
      return { image, backend, cold }
    },
    async reset() {
      const page = state.page
      state.page = null
      await page?.close().catch(() => {})
      if (!state.browser?.isConnected()) await closeAll()
    },
  }
}

/** The process-wide queue in front of the warm browser. */
export function renderQueue(env: NodeJS.ProcessEnv = process.env): RenderQueue {
  state.queue ??= createRenderQueue(createBrowserDriver(env), {
    timeoutMs: Number(env.VARPET_RENDER_TIMEOUT_MS) || 60_000,
    isWarm: warm,
  })
  return state.queue
}
