// Run: node output/motion-blueprint/probe.cjs   (needs the editor dev server on :5173)
// Browser-only motion QA for the blueprint landing → 3D construction flow. Records a video and
// timed frames. The architect stream is stubbed in-page with the repo's demo shell; no model runs.
const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const out = __dirname;
const baseURL = process.env.MOTION_QA_URL || 'http://localhost:5173';
const executablePath = '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const plan = process.env.MOTION_QA_PLAN || '/@fs/Users/davitstepanyan/Documents/varpet/output/motion-blueprint/teal-plan.png';
const results = { baseURL, plan, frames: [], pageErrors: [], console: [], checks: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, recordVideo: { dir: path.join(out, 'video'), size: { width: 1280, height: 800 } } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/account/session') return route.fulfill({ json: { user: null } });
    if (url.port === '8788') return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  // Other agents edit the shared checkout; a silent HMR socket keeps this run from reloading.
  await page.routeWebSocket(/localhost:5173/, ws => { ws.send(JSON.stringify({ type: 'connected' })); ws.onMessage(() => {}); });
  page.on('pageerror', e => results.pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') results.console.push(`${m.type()}: ${m.text()}`); });
  await page.addInitScript((SHELL_MS) => {
    const real = window.fetch.bind(window);
    window.__events = [];
    window.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.endsWith('/flat')) return real(input, init);
      const { demoScene } = await import('/src/core/demo.ts');
      const enc = new TextEncoder(), t0 = performance.now();
      const lines = [[300, { type: 'progress', message: 'Reading your plan' }],
        [SHELL_MS, { type: 'shell', rooms: demoScene.rooms, walls: demoScene.walls, metadata: { 'door-entry': { role: 'entrance' } } }],
        [SHELL_MS + 16500, { type: 'project', project: { ...demoScene, objects: [] } }]];
      return new Response(new ReadableStream({ start(c) { lines.forEach(([ms, e]) => setTimeout(() => { c.enqueue(enc.encode(JSON.stringify(e) + '\n')); window.__events.push([Math.round(performance.now() - t0), e.type]); }, ms)); } }), { status: 200 });
    };
  }, Number(process.env.MOTION_QA_SHELL_MS || 3500));
  const shot = async (name) => { const file = `${String(results.frames.length).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: path.join(out, file) }); results.frames.push(file); };
  const check = (ok, message) => { results.checks.push(`${ok ? 'PASS' : 'FAIL'} ${message}`); };

  await page.goto(baseURL);
  await page.locator('.blueprint-board').waitFor();
  await sleep(450); await shot('intro-mid');
  await sleep(1800); await shot('intro-settled');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.bp-frame rect')).strokeDashoffset === '0px' || getComputedStyle(document.querySelector('.bp-frame rect')).strokeDashoffset === '0'), 'sheet frame is fully drawn after the intro');

  await page.evaluate(async (src) => {
    const blob = await (await fetch(src)).blob();
    const dt = new DataTransfer(); dt.items.add(new File([blob], src.split('/').pop(), { type: blob.type }));
    const w = document.querySelector('.blueprint-welcome');
    w.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    w.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, plan);
  await sleep(250); await shot('drag-over');
  await page.evaluate(async (src) => {
    const blob = await (await fetch(src)).blob();
    const dt = new DataTransfer(); dt.items.add(new File([blob], src.split('/').pop(), { type: blob.type }));
    // Released over the lower-left of the sheet, as a person would.
    document.querySelector('.blueprint-welcome').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 330, clientY: 610 }));
  }, plan);
  const inkCount = () => page.evaluate(() => { const c = document.querySelector('.bp-ink'); if (c.hidden || !c.width) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  const ink = [], tokenSeen = [];
  const dropAt = Date.now();
  for (const [at, name] of [[120, 'token-lift'], [330, 'token-arc'], [560, 'token-apex'], [800, 'token-descent'], [1000, 'impact'], [1250, 'ripple-ink'], [1700, 'ink-spreading'], [2400, 'ink-late'], [4200, 'plan-drawn']]) {
    await sleep(Math.max(0, at - (Date.now() - dropAt))); await shot(name);
    ink.push(await inkCount()); tokenSeen.push(await page.evaluate(() => !!document.querySelector('.bp-card-x')));
  }
  results.tokenSeen = tokenSeen;
  check(tokenSeen.some(Boolean) && !tokenSeen[tokenSeen.length - 1], 'a plan card flies in and is gone once it lands');
  check(await page.evaluate(() => !document.querySelector('.blueprint-welcome img')), 'the uploaded image itself is never shown');
  results.ink = ink;
  check(ink.some((n, i) => i > 0 && n > 0 && n < ink[ink.length - 1]), 'plan ink is drawn progressively, not all at once');
  check(await page.locator('.blueprint-next').isVisible(), 'build action appears after the plan is drawn');

  await page.evaluate(async () => {
    const src = await (await fetch('/src/ui/architect-stage.ts')).text();
    const THREE = await import(/from\s+["']([^"']*three\.js[^"']*)["']/.exec(src)[1]);
    const orig = THREE.Mesh.prototype.onBeforeRender;
    THREE.Mesh.prototype.onBeforeRender = function (...a) { if (this.name === 'source-blueprint') window.__sheet = this; return orig.apply(this, a); };
  });
  await page.locator('.blueprint-build').click();
  for (const ms of [1500, 3000, 4500]) { await sleep(1500); results['u' + ms] = await page.evaluate(() => { const u = window.__sheet?.material.uniforms; return u && { on: u.uTraceOn.value, trace: u.uTrace.value, map: !!u.uMap.value, blueprint: u.uBlueprint.value, img: u.uMap.value?.image?.width }; }); }
  for (const at of [3000, 3700, 4400, 5100, 6600, 8800, 11000]) { await sleep(at === 3000 ? 3000 : at === 6600 ? 1500 : at === 8800 || at === 11000 ? 2200 : 700); await shot('working-' + at); }
  results.working = await page.evaluate(() => ({ cls: document.querySelector('.blueprint-flow').className, elapsed: document.querySelector('.blueprint-elapsed').textContent, message: document.querySelector('.blueprint-flow-message').textContent }));
  await context.close();
  await browser.close();
  const video = fs.readdirSync(path.join(out, 'video')).map(f => path.join(out, 'video', f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (video) { fs.renameSync(video, path.join(out, 'working.webm')); results.video = 'working.webm'; }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ checks: results.checks, pageErrors: results.pageErrors, console: results.console.slice(0, 8), ink: results.ink, events: results.events }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
