import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../..', import.meta.url));
const reserved = [5180, 5190, 8787, 8788];

for (const scenario of ['published collection', 'Avani without developer plans']) {
  test(`click through ${scenario} without console errors or failed requests`, { timeout: 600_000 }, async t => {
    const empty = await mkdtemp(join(tmpdir(), 'showcase-browser-'));
    const previousData = process.env.SHOWCASE_DATA_DIR, previousPlans = process.env.KOMITAS_PLANS_DIR;
    let server, browser;
    try {
      if (scenario.startsWith('Avani')) {
        process.env.SHOWCASE_DATA_DIR = empty;
        process.env.KOMITAS_PLANS_DIR = empty;
      }
      server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
      await server.listen();
      const port = server.httpServer.address().port;
      assert.ok(!reserved.includes(port), `Reserved port ${port}`);
      const base = `http://127.0.0.1:${port}`;
      const chrome = process.env.SHOWCASE_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--use-angle=swiftshader', '--enable-webgl'] });
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
      const failures = [], planRequests = [];
      page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()} (${message.location().url})`); });
      page.on('pageerror', error => failures.push(`page: ${error.message}`));
      page.on('requestfailed', request => failures.push(`request: ${request.url()} ${request.failure()?.errorText}`));
      page.on('response', response => { if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`); });
      page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/plans/')) planRequests.push(request.url()); });
      async function settled() {
        await page.waitForSelector('[data-ready="true"]');
        await page.evaluate(async () => {
          await Promise.all(Array.from(document.images, image => { image.loading = 'eager'; return image.decode().catch(() => {}); }));
        });
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('.view-error').count(), 0, 'Renderer reported a failure');
        assert.deepEqual(failures, [], failures.join('\n'));
      }
      await page.goto(base);
      await settled();
      const flats = await page.evaluate(() => window.__SHOWCASE__.flats);
      assert.ok(flats.length > 0);
      let stateClicks = 0, viewClicks = 0;
      for (const flat of flats) {
        const card = page.locator(`.residence[href="/flat/${flat.id}"]`);
        if (!flat.example && !flat.shell_ready && !flat.furnished_ready) assert.equal(await card.locator('.residence-tag').innerText(), 'Being prepared');
        await card.click();
        await page.waitForURL(`${base}/flat/${flat.id}`);
        await settled();
        for (const [state, available] of [['shell', flat.shell_ready], ['furnished', flat.furnished_ready]]) {
          const button = page.locator(`button[data-state="${state}"]`);
          assert.equal(await button.isEnabled(), available, `${flat.id}: ${state} availability`);
          if (available) {
            await button.click(); stateClicks++;
            assert.equal(await button.getAttribute('aria-pressed'), 'true');
            assert.equal(await page.locator('.viewer').getAttribute('data-state'), state);
            await settled();
          }
        }
        for (const view of ['top', '3d']) {
          const button = page.locator(`button[data-view="${view}"]`);
          if (flat.shell_ready || flat.furnished_ready) {
            await button.click(); viewClicks++;
            assert.equal(await button.getAttribute('aria-pressed'), 'true');
            await settled();
          } else assert.equal(await button.isVisible(), false);
        }
        await page.getByRole('link', { name: 'Open the embedded view' }).click();
        await page.waitForURL(`${base}/embed/${flat.id}`);
        await settled();
        assert.equal(await page.locator('body.embed').count(), 1);
        assert.equal(await page.getByRole('link', { name: 'Furnish it with the designer' }).count(), 1);
        if (flat.shell_ready || flat.furnished_ready) for (const view of ['top', '3d']) {
          await page.locator(`button[data-view="${view}"]`).click(); viewClicks++;
          assert.equal(await page.locator(`button[data-view="${view}"]`).getAttribute('aria-pressed'), 'true');
          await settled();
        }
        await page.goto(base); await settled();
      }
      assert.ok(stateClicks > 0 && viewClicks > 0, 'Interactive controls must actually be exercised');
      if (scenario.startsWith('Avani')) {
        assert.deepEqual(flats.map(flat => flat.id), ['avani']);
        assert.equal(stateClicks, 2);
        assert.deepEqual(planRequests, [], 'Avani must never request a developer plan');
      }
      assert.deepEqual(failures, []);
      t.diagnostic(`${flats.length} flats; ${stateClicks} state clicks; ${viewClicks} camera clicks; 0 console/network errors; port ${port}`);
    } finally {
      await browser?.close(); await server?.close();
      if (previousData === undefined) delete process.env.SHOWCASE_DATA_DIR; else process.env.SHOWCASE_DATA_DIR = previousData;
      if (previousPlans === undefined) delete process.env.KOMITAS_PLANS_DIR; else process.env.KOMITAS_PLANS_DIR = previousPlans;
      await rm(empty, { recursive: true });
    }
  });
}
