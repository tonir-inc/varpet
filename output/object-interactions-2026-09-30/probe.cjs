const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const checks = [], errors = [];
const assert = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // The older QA page samples the committed-transform offset group. Placement
    // lives one child deeper; correct only this disposable page's probe accessor.
    await page.route('**/placement-motion-qa.html*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replaceAll('root.children[0]', 'root.children[0].children[0]').replace('root=controls.object;', 'root=controls.object;window.__root=root;window.__show=show;window.__controls=controls;window.__viewport=viewport;') });
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5191/placement-motion-qa.html');
    await page.waitForFunction(() => document.querySelector('#result').textContent.startsWith('{'));
    const read = async () => { await page.evaluate(() => window.__show()); return page.locator('#result').evaluate(element => JSON.parse(element.textContent)); };
    await page.waitForTimeout(700);
    const originalPosition = (await read()).position;
    await page.locator('#move').click();
    await page.waitForTimeout(130);
    let state = await read();
    assert(state.revision === 0 && state.unchanged, 'preview leaves document and history unchanged');
    assert(state.visual[1] > 0 && state.visual[1] <= .04001, `held move lifts no more than four centimetres (${JSON.stringify(state)})`);
    assert(await page.locator('.placement-measurement').first().isVisible(), 'live measurements are visible during movement');
    assert((await page.locator('.placement-measurement').first().textContent()).includes('0.50 m moved'), 'movement HUD reports the actual half metre displacement');
    await page.screenshot({ path: path.join(__dirname, 'move-preview.png') });
    await page.locator('#release').click();
    await page.waitForTimeout(350);
    state = await read();
    assert(state.revision === 1, 'one release creates exactly one history entry');
    assert(!state.belowFloor && !state.rootMovedVertically, 'landing stays above ground without changing checked root height');
    assert(!await page.locator('.placement-measurement').first().isVisible(), 'release removes measurements');
    await page.locator('#undo').click(); await page.waitForTimeout(330);
    assert((await read()).position[2] === originalPosition[2], 'one undo restores original position');
    await page.locator('#invalid').click(); await page.waitForTimeout(140);
    assert(await page.getByText('Placement conflict:', { exact: false }).isVisible(), 'invalid move shows named conflict alongside dimensions');
    const conflictBox = await page.getByText('Placement conflict:', { exact: false }).boundingBox();
    const measurementBox = await page.locator('.placement-measurement').first().boundingBox();
    assert(conflictBox.y + conflictBox.height <= measurementBox.y, 'conflict and measurement surfaces do not overlap');
    await page.screenshot({ path: path.join(__dirname, 'invalid-preview.png') });
    await page.locator('#cancel').click(); await page.waitForTimeout(250);
    assert((await read()).revision === 2 && !await page.locator('.placement-measurement').first().isVisible(), 'cancel clears feedback without a history entry');
    await page.evaluate(() => {
      window.__viewport.setTool('scale'); window.__controls.dispatchEvent({ type: 'mouseDown', mode: 'scale' });
      window.__root.scale.set(2, 1.5, 1.25); window.__controls.dispatchEvent({ type: 'objectChange' });
    });
    const sizeText = await page.locator('.placement-measurement').first().textContent();
    assert(sizeText.includes('Resize Walnut') && sizeText.includes('W 2.24') && sizeText.includes('D 0.81') && sizeText.includes('H 0.57'), 'resize measurements reflect independent physical dimensions');
    assert((await read()).revision === 2, 'resize preview leaves history untouched');
    await page.evaluate(() => {
      window.__viewport.cancelInteraction(); window.__viewport.setTool('rotate');
      window.__controls.dispatchEvent({ type: 'mouseDown', mode: 'rotate' });
      window.__root.rotation.y = Math.PI / 2; window.__controls.dispatchEvent({ type: 'objectChange' });
    });
    assert((await page.locator('.placement-measurement').first().textContent()).includes('90.0°'), 'rotation measurements report the exact candidate yaw');
    await page.evaluate(() => { window.__viewport.cancelInteraction(); window.__viewport.setTool('move'); });
    await page.locator('#reduced').click(); await page.locator('#move').click(); await page.waitForTimeout(130);
    assert((await read()).maxLift === 0, 'reduced motion keeps direct movement without decorative lift');
    await page.locator('#cancel').click();
    const modelChecks = await page.evaluate(async () => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const { PlacementMotion } = await import('/src/render/placement-motion.ts');
      const parent = new THREE.Group(), root = new THREE.Group(), visual = new THREE.Group();
      parent.add(root); root.add(visual);
      const motion = new PlacementMotion(parent, () => {});
      // Override the test page's reduced preference, then inspect deterministic samples.
      const original = window.matchMedia; window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      motion.dispose(); const normal = new PlacementMotion(parent, () => {}); window.matchMedia = original;
      visual.position.y = .04; normal.land('object', visual, [1, 1, 1]);
      const start = performance.now(), heights = [], scales = [];
      for (const elapsed of [0, 30, 60, 90, 120, 150, 200]) { normal.update(start + elapsed); heights.push(visual.position.y); scales.push(visual.scale.toArray()); }
      const idle = !normal.update(start + 300); normal.dispose();
      return { heights, scales, idle };
    });
    assert(modelChecks.heights.every((y, i, ys) => y >= 0 && (!i || y <= ys[i - 1] + 1e-8)), 'landing descends monotonically without rebound');
    assert(modelChecks.scales.every(scale => scale.every(value => value === 1)), 'precision landing never squashes furniture dimensions');
    assert(modelChecks.heights.at(-1) === 0 && modelChecks.idle, 'landing finishes exactly at floor and returns to idle');
    assert(errors.length === 0, 'no browser page errors');
    fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ checks, errors, modelChecks }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
