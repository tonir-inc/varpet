import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
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
      const failures = [], planRequests = [], editorModelRequests = [], pendingRequests = new Set();
      page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()} (${message.location().url})`); });
      page.on('pageerror', error => failures.push(`page: ${error.message}`));
      page.on('requestfailed', request => failures.push(`request: ${request.url()} ${request.failure()?.errorText}`));
      page.on('response', response => { if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`); });
      page.on('requestfinished', request => pendingRequests.delete(request.url()));
      page.on('requestfailed', request => pendingRequests.delete(request.url()));
      page.on('request', request => { pendingRequests.add(request.url()); if (new URL(request.url()).pathname.startsWith('/api/catalog/models/')) editorModelRequests.push(request.url()); if (new URL(request.url()).pathname.startsWith('/plans/')) planRequests.push(request.url()); });
      async function settled() {
        await page.waitForSelector('[data-ready="true"]');
        await page.evaluate(async () => {
          await Promise.all(Array.from(document.images, image => { image.loading = 'eager'; return image.decode().catch(() => {}); }));
        });
        try { await page.waitForLoadState('networkidle'); } catch (error) { throw new Error(`Network did not settle on ${page.url()}; pending: ${[...pendingRequests].join(', ')}`, { cause: error }); }
        assert.deepEqual(editorModelRequests, [], 'Standalone viewers must not depend on the editor model endpoint');
        assert.equal(await page.locator('.view-error').count(), 0, 'Renderer reported a failure');
        assert.deepEqual(failures, [], failures.join('\n'));
      }
      async function visibleFlat(label) {
        const canvas = page.locator('.hero-stage canvas');
        assert.equal(await canvas.count(), 1, `${label}: hero must retain a canvas`);
        const png = await canvas.screenshot();
        const pixels = await page.evaluate(async base64 => {
          const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
          const copy = document.createElement('canvas'); copy.width = image.width; copy.height = image.height;
          const context = copy.getContext('2d'); context.drawImage(image, 0, 0);
          const { data } = context.getImageData(Math.floor(copy.width * .2), Math.floor(copy.height * .2), Math.floor(copy.width * .6), Math.floor(copy.height * .6));
          let light = 0, low = 255, high = 0;
          for (let i = 0; i < data.length; i += 4) {
            const value = Math.max(data[i], data[i + 1], data[i + 2]);
            low = Math.min(low, value); high = Math.max(high, value); if (value > 65) light++;
          }
          return { light: light / (data.length / 4), range: high - low };
        }, png.toString('base64'));
        assert.ok(pixels.light > .1 && pixels.range > 35, `${label}: empty/dark hero ${JSON.stringify(pixels)}`);
      }
      await page.goto(`${base}/#residences`);
      await settled();
      const flats = await page.evaluate(() => window.__SHOWCASE__.flats);
      assert.ok(flats.length > 0);
      const delivered = scenario.startsWith('Avani') ? [] : (await readdir(join(root, '../../packages/designer/eval/komitas'))).filter(name => /^[^.]+\.scene\.json$/.test(name)).map(name => name.slice(0, -11)).sort();
      assert.deepEqual(flats.filter(flat => !flat.example && flat.shell_ready).map(flat => flat.id).sort(), delivered, 'Every delivered shell must be live');
      const drawings = scenario.startsWith('Avani') ? [] : (await readdir(join(root, '../../packages/designer/eval/komitas'))).filter(name => name.endsWith('.drawn.scene.json')).map(name => name.slice(0, -17)).sort();
      assert.deepEqual(flats.filter(flat => flat.drawn_ready).map(flat => flat.id).sort(), drawings, 'Every delivered developer layout must be live');
      const hero = flats.find(flat => flat.shell_ready || flat.furnished_ready || flat.drawn_ready);
      assert.equal(await page.locator('.hero-caption a').getAttribute('href'), `/flat/${hero.id}`);
      await visibleFlat('initial 3D');
      await page.locator('.hero-caption a').click();
      await page.waitForURL(`${base}/flat/${hero.id}`); await settled();
      await page.goBack(); await settled();
      await visibleFlat('Back navigation');
      // Browser cache restoration must preserve the renderer. This deterministic
      // event pair also covers browsers where automation disables the actual cache.
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await visibleFlat('restored 3D');
      for (const view of ['top', '3d']) {
        await page.locator(`.hero-stage button[data-view="${view}"]`).click();
        await settled(); await visibleFlat(`hero ${view}`);
      }
      t.diagnostic(`${delivered.length} published shells live; hero ${hero.id} visible in Top/3D and after cache restoration`);
      let stateClicks = 0, viewClicks = 0, drawnClicks = 0, designerClicks = 0;
      for (const flat of flats) {
        const card = page.locator(`.residence[href="/flat/${flat.id}"]`);
        assert.equal(await card.locator('.residence-tag').innerText(), flat.example ? 'Example residence' : flat.furnished_ready ? 'Designer furnished' : flat.shell_ready || flat.drawn_ready ? 'Explore in 3D' : 'Being prepared', `${flat.id}: availability label`);
        await card.click();
        await page.waitForURL(`${base}/flat/${flat.id}`);
        await settled();
        for (const [state, available] of [['shell', flat.shell_ready], ['drawn', flat.drawn_ready], ['furnished', flat.furnished_ready]]) {
          const button = page.locator(`button[data-state="${state}"]`);
          if (state === 'drawn' && !available) { assert.equal(await button.count(), 0); continue; }
          if (state === 'drawn') assert.match(await button.innerText(), /As the developer drew it/);
          if (state === 'furnished' && !flat.example) assert.match(await button.innerText(), /Furnished by the designer/);
          assert.equal(await button.isEnabled(), available, `${flat.id}: ${state} availability`);
          if (available) {
            await button.click(); stateClicks++;
            if (state === 'drawn') drawnClicks++;
            if (state === 'furnished' && !flat.example) designerClicks++;
            assert.equal(await button.getAttribute('aria-pressed'), 'true');
            assert.equal(await page.locator('.viewer').getAttribute('data-state'), state);
            await settled();
            if (flat.drawn_ready) assert.equal(await page.locator('.drawn-note').isVisible(), state === 'drawn');
            if (state === 'drawn') {
              for (const view of ['top', '3d']) { await page.locator(`button[data-view="${view}"]`).click(); viewClicks++; await settled(); }
              assert.ok(flat.drawn_audit);
              assert.match(await page.locator('.drawn-note').innerText(), new RegExp(`${flat.drawn_audit.placed} of ${flat.drawn_audit.drawn} drawn pieces shown`));
              for (const item of flat.drawn_audit.omitted) assert.ok((await page.locator('.drawn-note').innerText()).includes(item.role.replaceAll('_', ' ')));
              if (drawnClicks === 1 && process.env.SHOWCASE_SCREENSHOT_DIR) {
                await page.screenshot({ path: join(process.env.SHOWCASE_SCREENSHOT_DIR, 'showcase-drawn-desktop.png'), fullPage: true });
                await page.setViewportSize({ width: 390, height: 844 });
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No mobile horizontal overflow');
                await page.screenshot({ path: join(process.env.SHOWCASE_SCREENSHOT_DIR, 'showcase-drawn-mobile.png'), fullPage: true });
                await page.setViewportSize({ width: 1024, height: 768 });
              }
            }
          }
        }
        for (const view of ['top', '3d']) {
          const button = page.locator(`button[data-view="${view}"]`);
          if (flat.shell_ready || flat.furnished_ready || flat.drawn_ready) {
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
        if (flat.shell_ready || flat.furnished_ready || flat.drawn_ready) for (const view of ['top', '3d']) {
          await page.locator(`button[data-view="${view}"]`).click(); viewClicks++;
          assert.equal(await page.locator(`button[data-view="${view}"]`).getAttribute('aria-pressed'), 'true');
          await settled();
        }
        if (flat.drawn_ready) {
          await page.goto(`${base}/embed/${flat.id}?state=drawn`); await settled();
          assert.equal(await page.locator('.viewer').getAttribute('data-state'), 'drawn');
          const disclosure = page.locator('.embed-drawn-note');
          assert.match(await disclosure.innerText(), /Partial developer-drawn layout/);
          await disclosure.locator('summary').click();
          assert.ok((await disclosure.innerText()).includes(flat.drawn_note));
        }
        await page.goto(base); await settled();
      }
      assert.ok(stateClicks > 0 && viewClicks > 0, 'Interactive controls must actually be exercised');
      if (scenario.startsWith('Avani')) {
        assert.deepEqual(flats.map(flat => flat.id), ['avani']);
        assert.equal(stateClicks, 2);
        assert.deepEqual(planRequests, [], 'Avani must never request a developer plan');
      }
      if (!scenario.startsWith('Avani')) { assert.equal(drawnClicks, drawings.length); assert.ok(designerClicks > 0, 'Exercise recorded BENCH furnishing results'); }
      assert.deepEqual(failures, []);
      t.diagnostic(`${flats.length} flats; ${stateClicks} state clicks (${drawnClicks} drawn, ${designerClicks} designer); ${viewClicks} camera clicks; 0 console/network errors; port ${port}`);
    } finally {
      await browser?.close(); await server?.close();
      if (previousData === undefined) delete process.env.SHOWCASE_DATA_DIR; else process.env.SHOWCASE_DATA_DIR = previousData;
      if (previousPlans === undefined) delete process.env.KOMITAS_PLANS_DIR; else process.env.KOMITAS_PLANS_DIR = previousPlans;
      await rm(empty, { recursive: true });
    }
  });
}
