const {chromium} = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const baseURL = 'http://127.0.0.1:60526';
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL+'/surface-selection-qa.html');
    await page.waitForTimeout(1600);
    await page.screenshot({path:'output/surface-selection-verification/floor.png'});
    await page.locator('#run').click();
    await page.waitForFunction(() => /COMPLETE|FAIL/.test(document.querySelector('#result').textContent));
    const result = await page.locator('#result').textContent();
    console.log(result);
    assert(!result.includes('FAIL'), result);
    for (const [selector, name] of [['[data-id="wall-spine"]','wall'],['#top','wall-top'],['[data-id="bed"]','furniture-top'],['#clear','clear']]) {
      await page.locator(selector).click(); await page.waitForTimeout(500);
      await page.screenshot({path:`output/surface-selection-verification/${name}.png`});
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync('output/surface-selection-verification/results.json',JSON.stringify({result,errors},null,2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode=1;});
