// Run: node output/interactive-blueprint/probe.cjs (editor Vite server on :5173).
// Native browser input against the actual blueprint flow. Architect stream is stubbed;
// camera telemetry comes from rendered meshes, without adding production debug hooks.
const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const out = __dirname;
const baseURL = process.env.INTERACTIVE_QA_URL || 'http://localhost:5173';
const executablePath = '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const plan = path.resolve(out, '../motion-blueprint/teal-plan.png');
const results = { baseURL, checks: [], cases: {}, pageErrors: [], console: [] };
const save = () => fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const poseDelta = (a, b) => Math.max(distance(a.position, b.position), distance(a.quaternion, b.quaternion));
const check = (label, pass, detail) => {
  results.checks.push({ label, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
  save();
};

async function runCase(browser, reducedMotion) {
  const name = reducedMotion === 'reduce' ? 'reduced' : 'normal';
  const data = results.cases[name] = { screenshots: [], poses: {} };
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on('pageerror', error => results.pageErrors.push({ name, message: error.message }));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) results.console.push({ name, type: message.type(), message: message.text() }); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/account/session') return route.fulfill({ json: { user: null } });
    if (url.pathname.startsWith('/api/catalog/')) return route.fulfill({ json: { results: [], next_offset: null } });
    if (url.port === '8788') return route.abort();
    return route.continue();
  });
  await page.routeWebSocket(new RegExp(new URL(baseURL).host.replaceAll('.', '\\.')), ws => { ws.send(JSON.stringify({ type: 'connected' })); ws.onMessage(() => {}); });
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.__streamEvents = [];
    window.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.endsWith('/flat')) return realFetch(input, init);
      const { demoScene } = await import('/src/core/demo.ts');
      window.__demoScene = demoScene;
      return new Response(new ReadableStream({ start(controller) {
        const encoder = new TextEncoder();
        window.__stream = event => {
          window.__streamEvents.push({ type: event.type, at: performance.now() });
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        window.__stream({ type: 'progress', message: 'Reading your plan' });
      } }), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    };
  });
  const pause = ms => page.waitForTimeout(ms);
  const shot = async label => { const file = `${name}-${label}.png`; await page.screenshot({ path: path.join(out, file) }); data.screenshots.push(file); };
  const pose = async label => {
    const p = await page.evaluate(() => {
      const { camera, count } = window.__qa;
      return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov, aspect: camera.aspect, count };
    });
    if (label) data.poses[label] = p;
    return p;
  };
  const drag = async (x, y, dx, dy, button = 'left') => {
    await page.mouse.move(x, y); await page.mouse.down({ button });
    await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up({ button }); await pause(180);
  };
  const reset = async () => {
    data.lastResetTarget = await page.locator('.as-navigation').evaluate(el => ({ rect: el.getBoundingClientRect().toJSON(), position: getComputedStyle(el).position, bottom: getComputedStyle(el).bottom, text: el.textContent }));
    save();
    await page.getByRole('button', { name: /reset view|fit apartment|frame apartment/i }).click();
    await pause(reducedMotion === 'reduce' ? 200 : 1800);
  };
  const pressed = () => page.locator('.as-opening-actions button[aria-pressed="true"]').count();
  const navigationClear = async label => {
    const layout = await page.evaluate(() => {
      const nav = document.querySelector('.as-navigation').getBoundingClientRect();
      const footer = document.querySelector('.blueprint-complete:not([hidden]), .blueprint-flow-bottom:not([hidden])').getBoundingClientRect();
      return { nav: nav.toJSON(), footer: footer.toJSON(), width: innerWidth, height: innerHeight };
    });
    data[`${label}Layout`] = layout;
    check(`${name}: ${label} navigation stays inside the viewport and clear of footer`, layout.nav.left >= 0 && layout.nav.right <= layout.width && layout.nav.top >= 0 && layout.nav.bottom <= layout.footer.top - 4, layout);
  };

  await page.goto(baseURL);
  await page.locator('.blueprint-board').waitFor();
  await page.evaluate(async () => {
    const source = await (await fetch('/src/ui/architect-stage.ts')).text();
    const url = source.match(/import \* as THREE from ["']([^"']+)/)[1];
    const THREE = await import(url);
    window.__THREE = THREE;
    const original = THREE.Object3D.prototype.onBeforeRender;
    THREE.Object3D.prototype.onBeforeRender = function(renderer, scene, camera, ...args) {
      if (renderer.domElement.classList.contains('as-canvas')) {
        const qa = window.__qa ||= { count: 0, frame: -1 };
        if (qa.frame !== renderer.info.render.frame) { qa.frame = renderer.info.render.frame; qa.count++; }
        Object.assign(qa, { renderer, scene, camera });
      }
      return original.call(this, renderer, scene, camera, ...args);
    };
  });
  await page.locator('.blueprint-file-input').setInputFiles(plan);
  await page.locator('.blueprint-build').waitFor({ state: 'visible' });
  await page.locator('.blueprint-build').click();
  await page.waitForFunction(() => !!window.__stream && !!window.__qa);
  await page.locator('.as-navigation').waitFor({ state: 'visible' });
  await pause(100);
  await page.evaluate(() => {
    document.addEventListener('pointerdown', () => {
      const camera = window.__qa.camera;
      window.__beforeDown = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() };
    }, { capture: true, once: true });
  });
  await page.mouse.move(630, 490); await page.mouse.down(); await pause(140);
  const capturedBeforeDown = await page.evaluate(() => window.__beforeDown), heldDown = await pose();
  check(`${name}: taking control during the entry tilt preserves the displayed camera`, poseDelta(capturedBeforeDown, heldDown) < 0.001, poseDelta(capturedBeforeDown, heldDown));
  await page.mouse.up();
  await shot('reading');
  const reading = await pose('reading');
  await drag(630, 490, 180, -50);
  const orbit = await pose('reading-orbit');
  check(`${name}: drag orbits the uploaded plan while the architect is reading`, distance(reading.quaternion, orbit.quaternion) > 0.01, poseDelta(reading, orbit));
  check(`${name}: canvas is keyboard focusable and names its controls`, await page.locator('.as-canvas').evaluate(el => el.tabIndex >= 0 && !!el.getAttribute('aria-label')));

  await page.evaluate(() => window.__stream({ type: 'shell', rooms: window.__demoScene.rooms, walls: window.__demoScene.walls, metadata: { 'door-entry': { role: 'entrance' } } }));
  await pause(reducedMotion === 'reduce' ? 500 : 8600);
  const afterShell = await pose('after-shell');
  check(`${name}: shell arrival preserves the manually chosen camera`, poseDelta(orbit, afterShell) < 0.001, poseDelta(orbit, afterShell));
  await reset();
  const resetShell = await pose('shell-reset');
  check(`${name}: Reset view reframes the streamed apartment`, poseDelta(afterShell, resetShell) > 0.1, poseDelta(afterShell, resetShell));
  await shot('shell-reset');
  await navigationClear('build');

  await page.mouse.move(640, 490); await page.mouse.wheel(0, -350); await pause(300);
  const zoom = await pose('zoom');
  check(`${name}: wheel zoom changes camera distance`, distance(zoom.position, resetShell.position) > 0.1, distance(zoom.position, resetShell.position));
  await drag(640, 490, 130, 30, 'right');
  const pan = await pose('right-pan');
  check(`${name}: right drag pans without rotating`, distance(pan.position, zoom.position) > 0.1 && distance(pan.quaternion, zoom.quaternion) < 0.001);
  await page.keyboard.down('Space'); await drag(640, 490, -110, 50); await page.keyboard.up('Space');
  const space = await pose('space-pan');
  check(`${name}: Space drag pans without rotating`, distance(space.position, pan.position) > 0.1 && distance(space.quaternion, pan.quaternion) < 0.001);
  await page.locator('.as-canvas').focus();
  const keyboardStart = await pose();
  await page.keyboard.down('w'); await pause(800); await page.keyboard.up('w');
  const keyboardEnd = await pose('keyboard-forward');
  check(`${name}: held W moves continuously through the 3D world`, distance(keyboardStart.position, keyboardEnd.position) > 1, distance(keyboardStart.position, keyboardEnd.position));
  await pause(220); const release = await pose('keyboard-release');
  check(`${name}: movement stops immediately after key release`, poseDelta(keyboardEnd, release) < 0.001);
  check(`${name}: released navigation restores the grab cursor`, await page.locator('.as-canvas').evaluate(el => getComputedStyle(el).cursor === 'grab'));
  await page.keyboard.down('ArrowRight'); await pause(450); await page.keyboard.up('ArrowRight');
  const arrow = await pose('arrow-right');
  check(`${name}: arrow keys navigate too`, distance(arrow.position, release.position) > 0.5);

  await page.setViewportSize({ width: 1100, height: 740 }); await pause(600);
  const resize = await pose('resize');
  check(`${name}: resize preserves the navigated camera pose`, poseDelta(arrow, resize) < 0.001, poseDelta(arrow, resize));
  check(`${name}: resize updates the projection`, Math.abs(resize.aspect - 1100 / 740) < 0.005, resize.aspect);
  await page.setViewportSize({ width: 1280, height: 800 }); await pause(350);

  // Moving far away must not alter the size used by Reset view.
  await page.locator('.as-canvas').focus();
  await page.keyboard.down('s'); await pause(3800); await page.keyboard.up('s');
  const far = await pose('far-away');
  await reset(); const resetFar = await pose('reset-from-far');
  check(`${name}: Reset view recovers after moving far away`, distance(far.position, resetFar.position) > 5 && poseDelta(resetFar, resetShell) < 0.01, { travel: distance(far.position, resetFar.position), resetError: poseDelta(resetFar, resetShell) });

  // Locate an actually visible door/window surface using the same first-hit occlusion rule.
  const openingPoint = await page.evaluate(() => {
    const T = window.__THREE, { scene, camera, renderer } = window.__qa;
    const shell = scene.getObjectByName('architect-shell'), rect = renderer.domElement.getBoundingClientRect();
    const ray = new T.Raycaster(); scene.updateMatrixWorld(true);
    for (let y = 250; y < rect.height - 150; y += 5) for (let x = 220; x < rect.width - 220; x += 5) {
      if (document.elementFromPoint(rect.left + x, rect.top + y) !== renderer.domElement) continue;
      ray.setFromCamera(new T.Vector2(x / rect.width * 2 - 1, 1 - y / rect.height * 2), camera);
      for (const hit of ray.intersectObjects(shell.children, true)) {
        if (!hit.object.isMesh || hit.object.isLineSegments2 || hit.object.isLine2) continue;
        let visible = true, id;
        for (let object = hit.object; object; object = object.parent) { visible &&= object.visible; id ??= object.userData.entityId; }
        if (!visible) continue;
        if (/^(door|window)-/.test(id || '')) return { x: rect.left + x, y: rect.top + y, id };
        break;
      }
    }
    return null;
  });
  data.openingPoint = openingPoint;
  check(`${name}: a real rendered opening can be picked`, !!openingPoint, openingPoint);
  if (openingPoint) {
    const before = await pressed();
    await page.mouse.click(openingPoint.x, openingPoint.y); await pause(450);
    check(`${name}: clicking an opening toggles its preview`, await pressed() === before + 1);
    const clicked = await pressed();
    await drag(openingPoint.x, openingPoint.y, 90, 0);
    check(`${name}: orbit drag starting on an opening does not toggle it`, await pressed() === clicked);
  }
  await reset();

  const touchBefore = await pose();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 630, y: 470, id: 1 }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 630 + i * 12, y: 470 + i * 2, id: 1 }] }); await pause(18); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause(250);
  const touchOrbit = await pose('touch-orbit');
  check(`${name}: one-finger touch drag orbits`, distance(touchBefore.quaternion, touchOrbit.quaternion) > 0.01);
  const pressedBeforePinch = await pressed();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 560, y: 470, id: 1 }, { x: 720, y: 470, id: 2 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 560 - i * 7, y: 470 + i * 3, id: 1 }, { x: 720 + i * 7, y: 470 + i * 3, id: 2 }] }); await pause(18); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause(250);
  const pinch = await pose('touch-pinch');
  check(`${name}: two-finger pinch/pan moves the camera`, distance(pinch.position, touchOrbit.position) > 0.1);
  check(`${name}: multi-touch gestures do not toggle openings`, await pressed() === pressedBeforePinch);
  check(`${name}: touch release restores the grab cursor`, await page.locator('.as-canvas').evaluate(el => getComputedStyle(el).cursor === 'grab'));
  await shot('navigated');

  await page.evaluate(() => window.__stream({ type: 'project', project: { ...window.__demoScene, objects: [] } }));
  await page.locator('.blueprint-complete').waitFor({ state: 'visible', timeout: 20000 });
  await pause(500);
  const completed = await pose('completed');
  check(`${name}: completion preserves the navigated camera`, poseDelta(completed, pinch) < 0.001, poseDelta(completed, pinch));
  const idleStart = completed.count; await pause(550); const idle = await pose();
  check(`${name}: finished world returns to idle rendering`, idle.count - idleStart <= 1, idle.count - idleStart);
  await reset(); await shot('complete'); await navigationClear('completion');
  await page.setViewportSize({ width: 390, height: 844 }); await pause(reducedMotion === 'reduce' ? 350 : 1800);
  await shot('mobile-complete'); await navigationClear('mobile completion');
  await page.setViewportSize({ width: 1280, height: 800 }); await pause(reducedMotion === 'reduce' ? 350 : 1800);
  await page.locator('[data-open]').click();
  await page.locator('.blueprint-flow').waitFor({ state: 'detached', timeout: 12000 });
  await page.locator('#viewport canvas').waitFor({ state: 'visible' });
  await pause(500); await shot('editor-handoff');
  check(`${name}: Open my apartment hands the real shell to the editor`, await page.evaluate(async () => !!(await import('/src/main.ts')).editorView.cameraPose()));
  const disposed = await pose('disposed');
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    window.__qa.renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
  });
  await pause(300); const afterDispose = await pose();
  check(`${name}: disposed stage removes its canvas and stops responding/rendering`, await page.locator('.as-canvas').count() === 0 && afterDispose.count === disposed.count && poseDelta(disposed, afterDispose) < 0.001);
  data.streamEvents = await page.evaluate(() => window.__streamEvents);
  await context.close(); save();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    await runCase(browser, 'no-preference');
    await runCase(browser, 'reduce');
    check('No browser page errors', results.pageErrors.length === 0, results.pageErrors);
  } finally { await browser.close(); save(); }
  console.log(`${results.checks.filter(c => c.pass).length}/${results.checks.length} interactive blueprint checks passed`);
  if (results.checks.some(c => !c.pass)) process.exitCode = 1;
})().catch(error => { results.failure = error.stack; save(); console.error(error); process.exitCode = 1; });
