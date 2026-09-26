// Run: node output/motion-blueprint/stage-qa.cjs — the repository's construction QA page, headless.
const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.routeWebSocket(/localhost:5173/, ws => { ws.send(JSON.stringify({ type: 'connected' })); ws.onMessage(() => {}); });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Headless SwiftShader stalls ~1 s compiling shaders on the first frame; warm them before timing checks.
  await page.goto('http://localhost:5173/blueprint-stage-qa.html');
  await page.click('#restart'); await page.waitForTimeout(9000);
  await page.click('#run');
  await page.waitForFunction(() => /COMPLETE|FAIL/.test(document.querySelector('#result').textContent), null, { timeout: 90000 });
  console.log(await page.locator('#result').textContent()); console.log('pageErrors', errors);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
