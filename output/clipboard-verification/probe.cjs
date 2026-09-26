// Run: node output/clipboard-verification/probe.cjs
// Browser-only QA. Does not modify app code or fixtures. All service requests are intercepted.
const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = __dirname;
const baseURL = process.env.CLIPBOARD_QA_URL || 'http://127.0.0.1:5173';
const executablePath = process.env.CLIPBOARD_QA_CHROME || '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
let png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const results = { command: 'node output/clipboard-verification/probe.cjs', baseURL, executablePath, checks: [], pageErrors: [], blockedServices: [] };
let browser;
(async () => {
  browser = await chromium.launch({ headless: true, executablePath });
  results.browser = await browser.version();
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1440, height: 1050 } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/account/session') return route.fulfill({ json: { user: null } });
    if (url.origin !== baseURL || url.pathname.startsWith('/api/')) {
      results.blockedServices.push({ url: route.request().url(), method: route.request().method() });
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => results.pageErrors.push(error.message));
  await page.goto(baseURL);
  await page.locator('.blueprint-drop').waitFor();
  png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1; canvas.getContext('2d').fillRect(0, 0, 1, 1); return canvas.toDataURL('image/png').split(',')[1]; });
  async function check(name, fn) { await fn(); results.checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
  async function selected() { return page.locator('.blueprint-file strong').innerText(); }
  async function waitSelected(name) { await page.waitForFunction(name => document.querySelector('.blueprint-file strong')?.textContent === name && !document.querySelector('.blueprint-build').disabled, name); }
  async function errorIncludes(text) { await page.waitForFunction(text => { const e = document.querySelector('.blueprint-error'); return !e.hidden && e.textContent.includes(text); }, text); }
  async function paste(spec = {}) {
    return page.evaluate(({ png, spec }) => {
      const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
      const file = new File([spec.content === 'invalid' ? 'not an image' : spec.size ? new Uint8Array(spec.size) : bytes], spec.name || 'pasted-plan.png', { type: spec.type || 'image/png' });
      const transfer = new DataTransfer();
      if (spec.text !== undefined) transfer.setData('text/plain', spec.text);
      if (!spec.textOnly) transfer.items.add(file);
      const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true, composed: true });
      if (spec.fallback) Object.defineProperty(event, 'clipboardData', { value: { files: [], items: Array.from(transfer.items) } });
      if (spec.prevented) event.preventDefault();
      const target = spec.target ? document.querySelector(spec.target) : document.body;
      target.dispatchEvent(event);
      return { prevented: event.defaultPrevented, name: file.name };
    }, { png, spec });
  }
  await check('desktop paste hint visible', async () => {
    assert.match(await page.locator('.blueprint-drop').innerText(), /Paste an image with ⌘V/);
    await page.screenshot({ path: path.join(out, 'desktop-paste-hint.png'), fullPage: true });
  });
  await check('actual ClipboardItem image write and keyboard Meta+V selects plan', async () => {
    await page.evaluate(async png => {
      const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
    }, png);
    await page.keyboard.press('Meta+V');
    await page.locator('.blueprint-picked').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('.blueprint-build').disabled);
    assert.match(await selected(), /\.png$/);
    assert.equal(await page.locator('.blueprint-source').evaluate(i => i.complete && i.naturalWidth === 1), true);
    await page.screenshot({ path: path.join(out, 'clipboard-plan-selected.png'), fullPage: true });
  });
  await check('items fallback replaces selected plan', async () => { assert.equal((await paste({ name: 'fallback-plan.png', fallback: true })).prevented, true); await waitSelected('fallback-plan.png'); });
  await check('ordinary text paste is untouched', async () => { assert.equal((await paste({ text: 'ordinary text', textOnly: true })).prevented, false); assert.equal(await selected(), 'fallback-plan.png'); });
  await check('unsupported image MIME uses existing validation and retains plan', async () => { await paste({ name: 'unsupported.gif', type: 'image/gif' }); await errorIncludes('Choose a JPG, PNG or WebP'); assert.equal(await selected(), 'fallback-plan.png'); assert.equal(await page.locator('.blueprint-build').isEnabled(), true); });
  await check('oversized clipboard image uses existing 2 MB validation', async () => { await paste({ name: 'large.png', size: 2_000_001 }); await errorIncludes('between 1 byte and 2 MB'); assert.equal(await selected(), 'fallback-plan.png'); });
  await check('undecodable clipboard image reports error and retains plan', async () => { await paste({ name: 'broken.png', content: 'invalid' }); await errorIncludes('This image could not be read'); assert.equal(await selected(), 'fallback-plan.png'); });
  await check('valid replacement clears previous errors', async () => { await paste({ name: 'replacement-plan.png' }); await waitSelected('replacement-plan.png'); assert.equal(await page.locator('.blueprint-error').isHidden(), true); });
  await check('already-handled image paste is untouched', async () => { await paste({ name: 'handled.png', prevented: true }); assert.equal(await selected(), 'replacement-plan.png'); });
  await page.evaluate(() => {
    const holder = document.createElement('div'); holder.id = 'qa-editables';
    holder.innerHTML = '<input id="qa-input"><textarea id="qa-textarea"></textarea><select id="qa-select"><option>One</option></select><div contenteditable="true" id="qa-editable"><span id="qa-editable-child">Text</span></div>';
    document.body.append(holder);
  });
  for (const id of ['qa-input', 'qa-textarea', 'qa-select', 'qa-editable-child']) {
    await check(`${id} image paste is untouched`, async () => { assert.equal((await paste({ name: `${id}.png`, target: `#${id}` })).prevented, false); assert.equal(await selected(), 'replacement-plan.png'); });
  }
  await check('actual text clipboard still pastes into input', async () => { await page.evaluate(() => navigator.clipboard.writeText('normal clipboard text')); await page.locator('#qa-input').focus(); await page.keyboard.press('Meta+V'); assert.equal(await page.locator('#qa-input').inputValue(), 'normal clipboard text'); assert.equal(await selected(), 'replacement-plan.png'); });
  await page.locator('#qa-editables').evaluate(e => e.remove());
  await check('open account modal blocks background image paste', async () => {
    await page.locator('[data-login]').click(); await page.locator('dialog[open]').waitFor();
    assert.equal((await paste({ name: 'modal.png' })).prevented, false); assert.equal(await selected(), 'replacement-plan.png');
    await page.locator('[data-auth-close]').click();
  });
  await check('browse files still selects a plan', async () => { const chooser = page.waitForEvent('filechooser'); await page.locator('[data-change]').click(); await (await chooser).setFiles({ name: 'browse-plan.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await waitSelected('browse-plan.png'); });
  await check('drag and drop still selects a plan', async () => {
    await page.evaluate(png => {
      const transfer = new DataTransfer(); transfer.items.add(new File([Uint8Array.from(atob(png), c => c.charCodeAt(0))], 'dropped-plan.png', { type: 'image/png' }));
      document.querySelector('.blueprint-board').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, png); await waitSelected('dropped-plan.png');
  });
  await check('build screen blocks clipboard plan replacement', async () => {
    await page.locator('.blueprint-build').click(); await page.locator('.blueprint-flow').waitFor({ state: 'visible' });
    assert.equal((await paste({ name: 'during-build.png' })).prevented, false); assert.equal(await selected(), 'dropped-plan.png');
    await page.locator('.blueprint-back').click(); await page.locator('.blueprint-welcome').waitFor({ state: 'visible' });
  });
  await check('returning from build re-enables clipboard replacement', async () => { await paste({ name: 'after-build-plan.png' }); await waitSelected('after-build-plan.png'); });
  await check('390px mobile hint fits without horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.locator('.blueprint-drop').waitFor();
    assert.equal(await page.locator('.blueprint-drop kbd').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, 'mobile-paste-hint.png'), fullPage: true });
  });
  await check('detached landing ignores image paste', async () => {
    await page.evaluate(() => { window.detachedLanding = document.querySelector('.portal-main'); window.detachedLanding.remove(); });
    assert.equal((await paste({ name: 'detached.png' })).prevented, false);
    assert.equal(await page.evaluate(() => window.detachedLanding.querySelector('.blueprint-picked').hidden), true);
    await page.evaluate(() => document.querySelector('.portal').append(window.detachedLanding));
  });
  await check('disposed landing removes its global paste listener', async () => {
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    assert.equal((await paste({ name: 'disposed.png' })).prevented, false);
    assert.equal(await page.locator('.blueprint-picked').isHidden(), true);
  });
  assert.deepEqual(results.pageErrors, []);
  results.status = 'passed'; results.passed = results.checks.length;
})().catch(error => { results.status = 'failed'; results.failure = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ status: results.status, passed: results.checks.length, pageErrors: results.pageErrors.length, blockedServices: results.blockedServices.length })); });
