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
  await page.addInitScript(() => {
    const real = window.fetch.bind(window);
    window.__events = [];
    window.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.endsWith('/flat')) return real(input, init);
      const { demoScene } = await import('/src/core/demo.ts');
      const enc = new TextEncoder(), t0 = performance.now();
      const lines = [[300, { type: 'progress', message: 'Reading your plan' }],
        [3500, { type: 'shell', rooms: demoScene.rooms, walls: demoScene.walls, metadata: { 'door-entry': { role: 'entrance' } } }],
        [20000, { type: 'project', project: { ...demoScene, objects: [] } }]];
      return new Response(new ReadableStream({ start(c) { lines.forEach(([ms, e]) => setTimeout(() => { c.enqueue(enc.encode(JSON.stringify(e) + '\n')); window.__events.push([Math.round(performance.now() - t0), e.type]); }, ms)); } }), { status: 200 });
    };
  });
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

  await page.locator('.blueprint-build').click();
  const t0 = Date.now();
  for (const [at, name] of [[250, 'handoff-grow'], [650, 'handoff-flood'], [1150, 'handoff-land'], [1600, 'tilt-start'], [2600, 'tilt-mid'], [3400, 'tilted'], [5200, 'shell-traced'], [6400, 'main-walls-rising'], [7300, 'main-walls-up'], [8200, 'partitions-rising'], [9200, 'openings'], [11500, 'shell-complete']]) {
    await sleep(Math.max(0, at - (Date.now() - t0))); await shot(name);
  }
  check(await page.evaluate(() => !document.querySelector('.bp-ghost') && document.querySelector('.blueprint-welcome').hidden), 'the 2D sheet hands over to the 3D stage and is removed');
  await page.locator('.blueprint-complete').waitFor({ state: 'visible', timeout: 30000 });
  await sleep(600); await shot('complete');
  check(await page.evaluate(() => document.querySelector('.blueprint-flow h2').textContent === 'A plan. Now a place.'), 'completion heading shown');
  results.events = await page.evaluate(() => window.__events);
  await page.locator('[data-open]').click();
  const t1 = Date.now();
  for (const [at, name] of [[200, 'handover-text-out'], [700, 'handover-glide-early'], [1300, 'handover-glide-mid'], [2000, 'handover-glide-late'], [2500, 'handover-crossfade'], [3600, 'editor']]) {
    await sleep(Math.max(0, at - (Date.now() - t1))); await shot(name);
  }
  check(await page.evaluate(() => !document.querySelector('.blueprint-flow') && !!document.querySelector('#viewport canvas')), 'construction view hands over to the editor and is removed');
  results.editorPose = await page.evaluate(async () => (await import('/src/main.ts')).editorView.cameraPose());
  await context.close();
  await browser.close();
  const video = fs.readdirSync(path.join(out, 'video')).map(f => path.join(out, 'video', f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (video) { fs.renameSync(video, path.join(out, 'flow.webm')); results.video = 'flow.webm'; }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ checks: results.checks, pageErrors: results.pageErrors, console: results.console.slice(0, 8), ink: results.ink, events: results.events }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
