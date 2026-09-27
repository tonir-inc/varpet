/** Warm render daemon: the editor's own Vite dev server plus one headless Chrome page running the product viewport.
 * Started on demand by render-view.ts; exits after IDLE_MS without requests. */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderPayload, type Draft, type ViewCamera } from './document.js';
import type { Scene } from '../../../src/scene.js';
import { STATE_FILE, codeVersion } from './state.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const editorRoot = resolve(repo, 'apps/editor');
const IDLE_MS = Number(process.env.VARPET_VIEW_IDLE_MS ?? 30 * 60_000);
import { browserLaunch } from './browser-launch.js';

async function importFrom(pkgJson: string, name: string): Promise<any> {
  return import(pathToFileURL(createRequire(pkgJson).resolve(name)).href);
}

export interface RenderRequest {
  scene: Scene; draft: Draft; source?: unknown; roomId?: string; camera: ViewCamera; time?: 'day' | 'evening'; outPng: string; width: number; height: number; assetTimeoutMs: number;
}

async function main() {
  const vite = await importFrom(resolve(editorRoot, 'package.json'), 'vite');
  const playwright = await importFrom(resolve(repo, 'apps/showcase/package.json'), 'playwright');
  const chromium = playwright.chromium ?? playwright.default.chromium;
  const cwd = process.cwd(); process.chdir(editorRoot);
  const server = await vite.createServer({ configFile: resolve(editorRoot, 'vite.config.ts'), root: editorRoot, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null }, resolve: { dedupe: ['three'] } });
  await server.listen(); process.chdir(cwd);
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch(browserLaunch(process.platform, process.env.VARPET_CHROME));
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (e: Error) => { pageErrors.push(String(e)); process.stderr.write(`pageerror ${e}\n`); });
  page.on('console', (m: any) => { if (m.type() === 'error') process.stderr.write(`console ${m.text()}\n`); });
  await page.goto(`${origin}/@fs${resolve(here, 'page.html')}`, { timeout: 60_000 });
  await page.waitForFunction('window.viewReady===true', undefined, { timeout: 60_000 });

  let queue: Promise<unknown> = Promise.resolve();
  let idle = setTimeout(shutdown, IDLE_MS);
  let ownPort = 0;
  // A newer daemon may already have taken the state file (the client restarts stale daemons): only remove our own.
  async function shutdown() { if (await readFile(STATE_FILE, 'utf8').then(text => JSON.parse(text).port === ownPort, () => false)) await rm(STATE_FILE, { force: true }); await browser.close().catch(() => {}); await server.close().catch(() => {}); process.exit(0); }

  async function render(request: RenderRequest) {
    const started = Date.now(); pageErrors.length = 0;
    await page.setViewportSize({ width: request.width, height: request.height });
    const payload = await renderPayload(request.scene, request.draft, request.roomId, request.camera, request.time, request.source);
    await page.evaluate((r: unknown) => (window as any).viewRender(r), payload);
    // Assets: wait until every glTF asset in the scene has loaded or failed, then let the camera settle.
    let timedOut = false;
    try {
      await page.waitForFunction('window.viewPending===0 && window.viewExpected.every(id=>window.viewLoaded.has(id)||window.viewFailed.has(id))',
        undefined, { timeout: request.assetTimeoutMs, polling: 100 });
    } catch { timedOut = true; }
    await page.waitForTimeout(700);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await mkdir(dirname(request.outPng), { recursive: true });
    await page.screenshot({ path: request.outPng });
    const state = await page.evaluate(() => ({ errors: (window as any).viewErrors as string[], missing: ((window as any).viewExpected as string[]).filter(id => !(window as any).viewLoaded.has(id)) }));
    return { ok: true, outPng: request.outPng, ms: Date.now() - started, timedOut, missing: state.missing, errors: [...state.errors, ...pageErrors] };
  }

  const http = createServer((req, res) => {
    clearTimeout(idle); idle = setTimeout(shutdown, IDLE_MS);
    if (req.method === 'GET' && req.url === '/ping') { res.end('ok'); return; }
    if (req.method === 'POST' && req.url === '/shutdown') { res.end('bye'); void shutdown(); return; }
    if (req.method !== 'POST' || req.url !== '/render') { res.statusCode = 404; res.end(); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const job = queue.then(() => render(JSON.parse(body) as RenderRequest));
      queue = job.catch(() => {});
      job.then(result => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(result)); },
        error => { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(error?.stack ?? error) })); });
    });
  });
  http.listen(0, '127.0.0.1', async () => {
    const port = (http.address() as { port: number }).port;
    ownPort = port;
    await writeFile(STATE_FILE, JSON.stringify({ port, pid: process.pid, origin, version: codeVersion() }));
    process.stdout.write(`ready ${port}\n`);
  });
  process.on('SIGTERM', () => void shutdown());
}

main().catch(error => { console.error(error); process.exit(1); });
