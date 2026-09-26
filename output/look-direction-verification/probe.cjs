const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const browser = await chromium.launch({ headless: false, executablePath });
  const results = [];
  try {
    for (const pageName of ['keyboard-navigation-qa', 'walkthrough-qa', 'interior-experience-qa']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:5178/${pageName}.html`);
      await page.locator('#run').click();
      await page.waitForFunction(() => /COMPLETE|FAIL/.test(document.querySelector('#result')?.textContent ?? ''), null, { timeout: 60000 });
      const output = await page.locator('#result').textContent();
      fs.writeFileSync(path.join(__dirname, `${pageName}.txt`), output);
      await page.screenshot({ path: path.join(__dirname, `${pageName}.png`) });
      results.push({ page: pageName, output, errors });
      console.log(JSON.stringify({ page: pageName, result: output.split('\n').at(-1), errors }));
      await page.close();
      if (!output.includes('COMPLETE') || errors.length) process.exitCode = 1;
    }
    fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
