// Existing browser QA page, run unchanged against the editor's dev server.
const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.routeWebSocket(/localhost:5173/, ws => { ws.send(JSON.stringify({ type: 'connected' })); ws.onMessage(() => {}); });
    await page.goto(`${process.env.INTERACTIVE_QA_URL || 'http://localhost:5173'}/blueprint-stage-qa.html?autorun`);
    await page.waitForFunction(() => /COMPLETE|FAIL/.test(document.querySelector('#result').textContent), { timeout: 60000 });
    const output = await page.locator('#result').textContent();
    await page.screenshot({ path: path.join(__dirname, 'regression.png') });
    fs.writeFileSync(path.join(__dirname, 'regression.json'), JSON.stringify({ output, errors }, null, 2));
    console.log(output); console.log(JSON.stringify({ errors }));
    if (!output.includes('COMPLETE') || errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
