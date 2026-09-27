// Plays a recorded session in the editor and checks it: badge, recorded clock, room previews, the real proposal,
// Apply, and one live follow-up that continues the recorded design.
//   node tools/demo_replay_check.mjs <editor-url> <session-name> <out-dir> [follow-up]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const playwright = await import(pathToFileURL(createRequire(join(root, 'apps/showcase/package.json')).resolve('playwright')).href);
const chromium = playwright.chromium ?? playwright.default.chromium;
const [url, name, out, followUp] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const started = Date.now(), t = () => Math.round((Date.now() - started) / 100) / 10;
const log = (event, extra = {}) => console.log(JSON.stringify({ event, t: t(), ...extra }));
const browser = await chromium.launch({ executablePath: process.env.VARPET_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', error => log('pageerror', { message: String(error).slice(0, 300) }));
let shot = 0, ok = true;
const screenshot = async label => { const path = join(out, `${String(++shot).padStart(2, '0')}-${label}.png`); await page.screenshot({ path }); log('screenshot', { path }); };
const fail = message => { ok = false; log('fail', { message }); };
const busy = () => page.evaluate(() => document.querySelector('.designer-column')?.getAttribute('aria-busy') === 'true');
try {
  await page.goto(`${url}/?editor&session=${name}&speed=10`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.designer-badge', { timeout: 60_000 });
  log('badge', { text: await page.locator('.designer-badge').textContent() });
  await page.waitForFunction(() => document.querySelector('.designer-column')?.getAttribute('aria-busy') === 'true', null, { timeout: 30_000 });
  let partialShot = false;
  const playStart = t();
  // A recording may hold several turns (a question and its answer): play until its proposal has landed.
  while (await busy() || !(await page.locator('.designer-proposal-card').count())) {
    await page.waitForTimeout(1000);
    if (!partialShot && await page.locator('.designer-partial-preview').count()) {
      partialShot = true; await page.locator('.designer-partial-preview').first().click(); await page.waitForTimeout(2000);
      log('partial', { clock: await page.locator('.designer-elapsed').textContent().catch(() => '') }); await screenshot('replay-partial');
    }
  }
  const card = page.locator('.designer-proposal-card').last();
  log('replayed', { seconds: t() - playStart, summary: await card.locator('.designer-steps summary').textContent().catch(() => ''),
    metrics: await card.locator('.designer-metrics').textContent().catch(() => '') });
  await screenshot('replay-proposal');
  await card.locator('.designer-apply').click(); await page.waitForTimeout(4000);
  log('applied', { status: await card.locator('.designer-proposal-status').textContent() }); await screenshot('replay-applied');
  if (followUp) {
    await page.fill('#designer-request', followUp); await page.press('#designer-request', 'Enter');
    await page.waitForTimeout(2000);
    log('live', { badge: await page.locator('.designer-badge').textContent().catch(() => '') });
    const deadline = Date.now() + 20 * 60_000;
    while (Date.now() < deadline && await busy()) await page.waitForTimeout(2000);
    const last = page.locator('.designer-message-designer').last();
    const proposal = await last.evaluate(node => node.classList.contains('designer-proposal-card'));
    log('followup', { proposal, text: (await last.textContent()).slice(0, 400) });
    await screenshot('live-followup');
    if (!proposal) fail('live follow-up did not return a proposal');
    else {
      await last.locator('.designer-apply').click(); await page.waitForTimeout(3000); await screenshot('live-followup-applied');
      const undoAt = t(); await page.click('#undo'); await page.waitForTimeout(2000);
      const cards = await page.locator('.designer-proposal-status').allTextContents();
      log('undo', { seconds: Math.round((t() - undoAt) * 10) / 10, cards }); await screenshot('undo');
      if (!cards.at(-1)?.startsWith('Undone') || !cards.at(-2)?.startsWith('Applied')) fail('after Undo the follow-up should read Undone and the recorded design Applied');
    }
  }
} catch (error) { fail(String(error).slice(0, 400)); await screenshot('error').catch(() => {}); }
finally { log('done', { ok }); await browser.close(); }
process.exit(ok ? 0 : 1);
