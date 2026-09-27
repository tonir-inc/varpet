// Browser half of tools/demo_rehearse.py: drives the editor's live designer chat through one scripted turn.
//   node tools/demo_rehearse.mjs <editor-url> <flat.json> <out-dir> <brief> <follow-up>
// Prints one JSON line per milestone ({event, t, ...}) and a final {event:"done", ok, timings}. Screenshots go to out-dir.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const playwright = await import(pathToFileURL(createRequire(join(root, 'apps/showcase/package.json')).resolve('playwright')).href);
const chromium = playwright.chromium ?? playwright.default.chromium;
const [url, flat, out, brief, followUp] = process.argv.slice(2);
if (!followUp) { console.error('usage: demo_rehearse.mjs <editor-url> <flat.json> <out-dir> <brief> <follow-up>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const TURN_MS = Number(process.env.REHEARSE_TURN_MS ?? 25 * 60_000);
const started = Date.now(), timings = {};
const t = () => Math.round((Date.now() - started) / 100) / 10;
const log = (event, extra = {}) => console.log(JSON.stringify({ event, t: t(), ...extra }));
const mark = (name) => { timings[name] ??= t(); };

const browser = await chromium.launch({ executablePath: process.env.VARPET_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: process.env.REHEARSE_HEADED !== '1', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', error => log('pageerror', { message: String(error).slice(0, 300) }));
let shot = 0;
const screenshot = async (name) => { const path = join(out, `${String(++shot).padStart(2, '0')}-${name}.png`); await page.screenshot({ path }); log('screenshot', { path }); return path; };
let ok = true;
const fail = (message) => { ok = false; log('fail', { message }); };

/** One designer turn: send, watch steps/previews/partials, wait for the reply. Returns the reply kind. */
async function turn(label, text) {
  const turnStart = t();
  await page.fill('#designer-request', text);
  await page.press('#designer-request', 'Enter');
  const seen = new Set();
  let partialShot = false, previewShot = false;
  const deadline = Date.now() + TURN_MS;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => ({
      busy: document.querySelector('.designer-column')?.getAttribute('aria-busy') === 'true',
      steps: [...document.querySelectorAll('.designer-turn .designer-step-label')].map(node => node.textContent?.replace(/^(Working|Done|Failed): /, '').replace(/ · \d+:\d+$/, '') ?? ''),
      partial: document.querySelector('.designer-partial strong')?.textContent ?? '',
      preview: Boolean(document.querySelector('.designer-turn figure.designer-preview img')),
    }));
    for (const step of state.steps) if (!seen.has(step)) { seen.add(step); log('step', { turn: label, step }); if (!timings[`${label}_first_step`]) mark(`${label}_first_step`); }
    if (state.steps.some(step => step.startsWith('Designing the'))) mark(`${label}_room_line`);
    if (state.preview && !previewShot) { previewShot = true; mark(`${label}_render_preview`); await screenshot(`${label}-render-preview`); }
    if (state.partial && !partialShot) {
      partialShot = true; mark(`${label}_partial`); log('partial', { rooms: state.partial });
      const button = page.locator('.designer-partial-preview');
      if (await button.count()) { await button.first().click(); await page.waitForTimeout(2500); mark(`${label}_partial_preview`); }
      await screenshot(`${label}-partial-preview`);
    }
    if (!state.busy && t() - turnStart > 2) break;
  }
  timings[`${label}_seconds`] = Math.round((t() - turnStart) * 10) / 10;
  const last = page.locator('.designer-message-designer').last();
  const card = await last.evaluate(node => ({ proposal: node.classList.contains('designer-proposal-card'),
    text: node.textContent?.slice(0, 600) ?? '', asks: /\?\s*$/.test(node.querySelector('.designer-message-copy')?.textContent ?? ''), metrics: [...node.querySelectorAll('.designer-metrics dt')].map(dt => `${dt.textContent}: ${dt.nextElementSibling?.textContent}`) }));
  log('reply', { turn: label, ...card });
  await screenshot(`${label}-reply`);
  if (card.metrics.some(row => /Unknown/.test(row))) fail(`${label}: card shows an Unknown measurement`);
  return card;
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.designer-column', { timeout: 60_000 });
  // The service status settles within a few seconds (offline/warming/online).
  await page.waitForFunction(() => document.querySelector('.designer-column')?.dataset.designerService, null, { timeout: 30_000 });
  const service = await page.evaluate(() => document.querySelector('.designer-column')?.dataset.designerService);
  log('service', { state: service }); mark('editor_ready');
  if (service === 'offline') fail('designer service offline');
  await page.setInputFiles('#file-input', flat);
  await page.waitForTimeout(4000); mark('flat_loaded');
  await screenshot('flat');

  let first = await turn('brief', brief);
  // The designer may ask one question when the brief does not fit the flat: answer with its first option.
  if (!first.proposal && (await page.locator('.designer-options button').count() || first.asks)) {
    const option = page.locator('.designer-options button').first();
    const answer = process.env.REHEARSE_ANSWER ?? (await option.count() ? await option.textContent() : 'A, please go ahead.');
    log('question', { answer }); await screenshot('question');
    first = await turn('answer', answer);
  }
  if (!first.proposal) fail('brief: no proposal');
  else {
    const apply = page.locator('.designer-proposal-card .designer-apply').last();
    const clicked = Date.now();
    await apply.click();
    await page.waitForFunction(() => [...document.querySelectorAll('.designer-proposal-status')].some(node => node.textContent === 'Applied'), null, { timeout: 30_000 })
      .then(() => { timings.apply_seconds = Math.round((Date.now() - clicked) / 100) / 10; }, () => fail('Apply did not complete'));
    const toast = await page.locator('#toast').textContent().catch(() => '');
    log('applied', { toast });
    await page.waitForTimeout(3000);
    await screenshot('applied');

    const second = await turn('followup', followUp);
    if (!second.proposal) fail('follow-up: no proposal');
    else {
      await page.locator('.designer-proposal-card .designer-apply').last().click();
      await page.waitForTimeout(3000);
      await screenshot('followup-applied');
      const undoAt = Date.now();
      await page.click('#undo');
      await page.waitForTimeout(2500);
      timings.undo_seconds = Math.round((Date.now() - undoAt) / 100) / 10 - 2.5;
      const cards = () => page.locator('.designer-proposal-status').allTextContents();
      log('undo', { toast: await page.locator('#toast').textContent().catch(() => ''), cards: await cards() });
      await screenshot('undo');
      if (!(await cards()).at(-1)?.startsWith('Undone')) fail('follow-up card does not read Undone after Undo');
      // Undo the first design too: its card follows.
      await page.click('#undo'); await page.waitForTimeout(2500);
      const after = await cards();
      log('undo-first', { cards: after });
      await screenshot('undo-first');
      if (!after.every(text => text.startsWith('Undone'))) fail('cards do not read Undone after undoing both designs');
    }
  }
} catch (error) {
  fail(String(error).slice(0, 500));
  await screenshot('error').catch(() => {});
} finally {
  log('done', { ok, timings });
  await browser.close();
}
process.exit(ok ? 0 : 1);
