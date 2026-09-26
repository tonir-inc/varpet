const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    await page.routeWebSocket(/localhost:5173/, ws => { ws.send(JSON.stringify({ type: 'connected' })); ws.onMessage(() => {}); });
    await page.goto('http://localhost:5173/blueprint-stage-qa.html');
    await page.locator('.as-canvas').waitFor();
    await page.evaluate(async () => {
      const src = await (await fetch('/src/ui/architect-stage.ts')).text();
      const T = await import(src.match(/import \* as THREE from ["']([^"']+)/)[1]);
      const original = T.Mesh.prototype.onBeforeRender;
      T.Mesh.prototype.onBeforeRender = function(renderer, scene, camera, ...args) {
        if (renderer.domElement.classList.contains('as-canvas')) window.__camera = camera;
        original.call(this, renderer, scene, camera, ...args);
      };
    });
    await page.waitForTimeout(1900);
    const snapshot = async label => {
      const data = await page.locator('.as-canvas').evaluate(el => ({ cursor: getComputedStyle(el).cursor, inline: el.style.cursor, classes: el.className, handPan: el.dataset.handPan, position: window.__camera.position.toArray(), quaternion: window.__camera.quaternion.toArray() }));
      results.push({ label, ...data }); console.log(label, JSON.stringify(data)); return data;
    };
    const drag = async button => { await page.mouse.move(630, 350); await page.mouse.down({ button }); await page.mouse.move(730, 400, { steps: 8 }); await page.mouse.up({ button }); };
    await snapshot('initial');
    await drag('right'); await snapshot('right-release');
    await page.keyboard.down('Space'); await drag('left'); await snapshot('space-held-after-release'); await page.keyboard.up('Space'); await snapshot('space-released');
    await page.keyboard.down('w'); await page.waitForTimeout(300); await page.keyboard.up('w'); await snapshot('keyboard-released');
    await page.mouse.move(630, 350); await page.mouse.down(); await page.mouse.move(720, 390, { steps: 6 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blur = await snapshot('blur');
    await page.mouse.move(20, 20); await page.mouse.up(); await page.mouse.move(740, 390); await page.waitForTimeout(100);
    const hover = await snapshot('return-hover');
    const difference = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
    const stationary = difference(blur.position, hover.position) < 1e-8 && difference(blur.quaternion, hover.quaternion) < 1e-8;
    await drag('left'); const fresh = await snapshot('fresh-drag-release');
    const releaseSnapshots = results.filter(r => ['initial', 'right-release', 'space-released', 'keyboard-released', 'fresh-drag-release'].includes(r.label));
    const checks = { initialAndReleasedCursor: releaseSnapshots.every(r => r.cursor === 'grab'), blurClearsDrag: stationary, freshDragWorks: difference(fresh.position, hover.position) > 0.1, cursorRestores: fresh.cursor === 'grab' };
    results.push({ checks }); console.log(checks);
    if (Object.values(checks).some(v => !v)) process.exitCode = 1;
  } finally { fs.writeFileSync(path.join(__dirname, 'blur-cursor.json'), JSON.stringify(results, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
