// Browser verification against a running editor development server. All service requests are intercepted.
// BLUEPRINT_TEST_URL, BLUEPRINT_TEST_OUTPUT, BLUEPRINT_TEST_CHROME and PLAYWRIGHT_MODULE override local defaults.
// BLUEPRINT_TEST_ONLY optionally selects check names using a regular expression.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const localRuntime = '/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE || !existsSync(localRuntime)) throw error; playwright = require(localRuntime); }
const localChrome = '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const executablePath = process.env.BLUEPRINT_TEST_CHROME || (existsSync(localChrome) ? localChrome : undefined);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const baseURL = (process.env.BLUEPRINT_TEST_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = resolve(process.env.BLUEPRINT_TEST_OUTPUT || join(root, 'output/blueprint-test-states'));
const only = process.env.BLUEPRINT_TEST_ONLY ? new RegExp(process.env.BLUEPRINT_TEST_ONLY) : undefined;
const plan = await readFile(join(root, 'packages/designer/eval/vision-fixtures/avani-plan.png'));
const ids = ['upload', 'selected', 'reading', 'walls', 'building', 'placing', 'checking', 'complete', 'error'];
const results = { command: `${process.env.BLUEPRINT_TEST_URL ? `BLUEPRINT_TEST_URL=${baseURL} ` : ''}node apps/editor/scripts/check-blueprint-test-states.mjs`, date: new Date().toISOString(),
  baseURL, filter: process.env.BLUEPRINT_TEST_ONLY ?? null, checks: [], pageErrors: [], consoleErrors: [], failedResponses: [], serviceRequests: [], screenshots: [] };
await mkdir(output, { recursive: true });
let browser, context, page, allowLiveProbe = false, editorOpened = false;
async function check(name, fn) {
  if (only && !only.test(name)) return;
  try { await fn(); results.checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
  catch (error) { results.checks.push({ name, status: 'failed', error: error.stack }); throw error; }
}
async function screenshot(name) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({ path: join(output, name), fullPage: true }); results.screenshots.push(name);
}
async function fresh(state, { reduced = false, mobile = false } = {}) {
  if (page) await page.close();
  page = await context.newPage(); editorOpened = false;
  page.setDefaultTimeout(20000);
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 });
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.on('pageerror', error => results.pageErrors.push({ url: page.url(), message: error.message }));
  page.on('console', message => { if (message.type() === 'error') results.consoleErrors.push({ url: page.url(), message: message.text() }); });
  page.on('response', response => { if (response.status() >= 400) results.failedResponses.push({ url: response.url(), status: response.status() }); });
  await page.goto(`${baseURL}/${state === undefined ? '' : `?blueprintTest=${state}`}`);
  await page.locator('.blueprint-test-tools').waitFor();
  await ready(state === undefined || ids.includes(state) ? state : 'upload');
}
async function ready(state) {
  await page.waitForFunction(expected => {
    const host = document.querySelector('.blueprint-test-tools');
    if (!host || !host.querySelector('.blueprint-test-status')?.textContent.includes(expected === null ? 'Live upload' : 'Test mode')) return false;
    const welcome = document.querySelector('.blueprint-welcome'), flow = document.querySelector('.blueprint-flow');
    if (!welcome || !flow) return false;
    if (expected === null || expected === 'upload') return !welcome.hidden && !document.querySelector('.blueprint-drop').hidden;
    if (expected === 'selected') return !welcome.hidden && !document.querySelector('.blueprint-next').hidden && !document.querySelector('.blueprint-build').disabled;
    if (expected === 'error') return !flow.hidden && !document.querySelector('.blueprint-flow-error').hidden;
    if (expected === 'complete') return !flow.hidden && !document.querySelector('.blueprint-complete').hidden;
    const stage = document.querySelector('.as-stage');
    return !flow.hidden && stage && stage.style.visibility !== 'hidden'
      && document.querySelector('.blueprint-flow [aria-current="step"]')?.getAttribute('data-phase') === expected;
  }, state ?? null);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function choose(state) {
  await page.locator('.blueprint-test-tools').evaluate(panel => { panel.open = true; });
  await page.getByLabel('Blueprint test state', { exact: true }).selectOption(state);
  await ready(state);
  await page.locator('.blueprint-test-tools').evaluate(panel => { panel.open = false; });
}
async function phase() { return page.locator('.blueprint-flow [aria-current="step"]').getAttribute('data-phase'); }

try {
  browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  results.browser = browser.version();
  context = await browser.newContext();
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.pathname === '/api/account/session') return route.fulfill({ json: { user: null } });
    if (url.pathname === '/@vite/client') {
      // Other lanes may edit the shared checkout. Keep each navigation's observed module graph stable.
      const response = await route.fetch(), source = await response.text();
      return route.fulfill({ response, body: source.replace('transport.connect(createHMRHandler(handleMessage));', '/* Browser QA: HMR disabled. */') });
    }
    if (url.origin !== baseURL || url.pathname.startsWith('/api/') || ['/flat', '/runs', '/assets'].includes(url.pathname)) {
      const record = { url: url.href, method: request.method(), liveProbe: allowLiveProbe, editorOpened };
      results.serviceRequests.push(record);
      if (url.pathname === '/flat' && allowLiveProbe) {
        record.body = JSON.parse(request.postData());
        return route.fulfill({ contentType: 'application/x-ndjson', body: '{"type":"progress","message":"Reading the plan"}\n{"type":"error","message":"Browser QA intercepted the live architect request."}\n' });
      }
      if (url.pathname === '/api/catalog/search' && editorOpened) return route.fulfill({ json: { results: [], next_offset: null } });
      return route.abort();
    }
    return route.continue();
  });

  for (const state of ids) await check(`normal motion desktop deep link: ${state}`, async () => {
    await fresh(state);
    assert.equal(new URL(page.url()).searchParams.get('blueprintTest'), state);
    assert.equal(await page.getByLabel('Blueprint test state', { exact: true }).inputValue(), state);
    if (!['upload', 'selected', 'error'].includes(state)) assert.equal(await page.locator('.as-stage canvas').count(), 1);
    if (state === 'error') assert.match(await page.locator('.blueprint-flow-error p').textContent(), /simulated/);
    await screenshot(`desktop-${state}.png`);
  });

  await check('reload retains the selected checkpoint and its settled phase', async () => {
    await fresh('placing'); await page.reload(); await ready('placing');
    assert.equal(await phase(), 'placing');
    await page.locator('.blueprint-test-tools').evaluate(panel => { panel.open = true; });
    await page.locator('[data-reload]').click(); await ready('placing');
    assert.equal(await phase(), 'placing');
  });
  await check('dropdown moves forward and backward, and the last rapid selection wins', async () => {
    await fresh('reading'); await choose('checking'); assert.equal(await phase(), 'checking');
    await choose('walls'); assert.equal(await phase(), 'walls');
    await page.locator('.blueprint-test-tools').evaluate(panel => { panel.open = true; });
    await screenshot('desktop-picker-expanded.png');
    await page.locator('[data-next]').click(); await ready('building');
    await page.evaluate(() => {
      const select = document.querySelector('.blueprint-test-tools select');
      for (const state of ['complete', 'walls', 'placing', 'error', 'reading']) {
        select.value = state; select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await ready('reading');
    assert.equal(await page.locator('.blueprint-flow').count(), 1);
    assert.equal(await page.locator('.as-stage').count(), 1);
    assert.equal(await phase(), 'reading');
    assert.equal(new URL(page.url()).searchParams.get('blueprintTest'), 'reading');
  });
  await check('Back retains the selected plan and rebuilding restores the checkpoint', async () => {
    await fresh('walls'); await page.locator('.blueprint-back').click();
    await page.locator('.blueprint-welcome').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.blueprint-file strong').textContent(), 'Avani sample blueprint.png');
    assert.equal(await page.locator('.blueprint-build').isEnabled(), true);
    assert.equal(await page.locator('.as-stage').count(), 0);
    await page.locator('.blueprint-build').click(); await ready('walls');
  });
  await check('simulated error can retry and return to the preserved plan', async () => {
    await fresh('error'); await page.locator('[data-retry]').click();
    await ready('error');
    assert.match(await page.locator('.blueprint-flow-error p').textContent(), /simulated/);
    await page.locator('[data-return]').click();
    await page.locator('.blueprint-welcome').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.blueprint-file strong').textContent(), 'Avani sample blueprint.png');
  });
  await check('complete opens the real editor with both furniture models and original evidence', async () => {
    await fresh('complete');
    let release;
    const delay = new Promise(resolve => { release = resolve; });
    await page.route('**/src/main.ts', async route => { await delay; await route.continue(); });
    await page.locator('.blueprint-test-tools').evaluate(panel => { panel.open = true; });
    editorOpened = true;
    await page.locator('[data-open]').click();
    assert.equal(await page.getByLabel('Blueprint test state', { exact: true }).isDisabled(), true);
    assert.equal(await page.locator('[data-reload]').isDisabled(), true);
    await screenshot('desktop-opening-picker-locked.png');
    release();
    await page.waitForFunction(() => document.querySelector('#viewport canvas') || document.querySelector('[data-open]')?.textContent.includes('Reload and open'));
    if (await page.locator('[data-open]').count() && await page.locator('[data-open]').textContent().then(text => text.includes('Reload and open'))) {
      results.editorRecovery = await page.locator('.blueprint-complete p').textContent();
      assert.equal(await page.getByLabel('Blueprint test state', { exact: true }).isEnabled(), true);
      await screenshot('desktop-editor-recovery.png');
      await page.unroute('**/src/main.ts');
      await page.locator('[data-open]').click();
    }
    await page.locator('#viewport canvas').waitFor();
    await page.waitForURL(url => url.searchParams.has('editor'));
    await page.locator('.blueprint-flow').waitFor({ state: 'detached' });
    const session = await page.evaluate(async () => (await import('/src/portal/session.ts')).editorSession);
    assert.equal(session.scene.id, 'blueprint-test-avani');
    assert.equal(session.scene.objects.length, 2);
    assert.equal(session.catalog.length, 2);
    const source = session.scene.project.sources.find(source => source.kind === 'plan');
    assert.equal(source.name, 'Avani sample blueprint.png');
    assert.deepEqual(Buffer.from(source.dataUrl.split(',')[1], 'base64'), plan);
    assert.equal(await page.locator('.blueprint-test-tools').count(), 0);
    await page.getByRole('button', { name: 'More tools', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Files', exact: true }).click();
    const downloaded = page.waitForEvent('download');
    await page.locator('#export-json').click();
    const artifact = await downloaded;
    const exported = JSON.parse(await readFile(await artifact.path(), 'utf8'));
    assert.equal(exported.objects.length, 2);
    assert.equal(exported.project.sources.find(source => source.kind === 'plan').dataUrl, source.dataUrl);
    await page.keyboard.press('Escape');
    await screenshot('desktop-editor.png');
  });
  for (const state of ids) await check(`reduced motion mobile deep link: ${state}`, async () => {
    await fresh(state, { reduced: true, mobile: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
    if (state === 'complete') assert.equal(await page.locator('[data-open]').evaluate(button => {
      const rect = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    }), true, 'the completion button remains reachable beneath the test tools');
    if (['upload', 'selected', 'building', 'complete', 'error'].includes(state)) await screenshot(`mobile-${state}.png`);
    if (state === 'selected') {
      await page.locator('.blueprint-test-tools').evaluate(panel => { panel.open = true; });
      await screenshot('mobile-picker-expanded.png');
    }
  });
  await check('normal motion mobile opens the selected construction state directly', async () => {
    await fresh('placing', { mobile: true });
    assert.equal(await phase(), 'placing');
    await screenshot('mobile-normal-placing.png');
  });
  await check('unknown checkpoint stays in isolated sample mode', async () => {
    await fresh('unknown');
    assert.equal(new URL(page.url()).searchParams.get('blueprintTest'), 'upload');
    assert.equal(await page.getByLabel('Blueprint test state', { exact: true }).inputValue(), 'upload');
  });
  await check('sample checkpoints never request architect or catalog hydration services', async () => {
    assert.deepEqual(results.serviceRequests.filter(request => !request.liveProbe && !new URL(request.url).pathname.startsWith('/api/catalog/search')), []);
  });
  await check('ordinary upload keeps its live transport, intercepted before any real request', async () => {
    await fresh(undefined, { reduced: true }); allowLiveProbe = true;
    await page.locator('.blueprint-file-input').setInputFiles({ name: 'Live route QA plan.png', mimeType: 'image/png', buffer: plan });
    await page.waitForFunction(() => document.querySelector('.blueprint-build-note').textContent.includes('Continue to try again'));
    const calls = results.serviceRequests.filter(request => new URL(request.url).pathname === '/flat');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.name, 'Live route QA plan');
    assert.equal(new URL(page.url()).searchParams.has('blueprintTest'), false);
    assert.equal(await page.locator('.blueprint-build').isEnabled(), true);
    allowLiveProbe = false;
  });
  await check('all scenarios finish without uncaught browser errors', async () => { assert.deepEqual(results.pageErrors, []); });
} catch (error) {
  console.error(error);
  if (page && !page.isClosed()) await screenshot('failure.png').catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  await browser?.close();
  console.log(`${results.checks.filter(check => check.status === 'passed').length}/${results.checks.length} checks passed; ${results.pageErrors.length} uncaught browser errors. Results: ${output}`);
}
