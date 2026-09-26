import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile, cp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), positional = args.find(arg => !arg.startsWith('--'));
const output = resolve(positional ?? join(root, 'exports', new Date().toISOString().replace(/[:.]/g, '-')));
const includePlans = args.includes('--include-private-plans');
const port = Number(process.env.SHOWCASE_EXPORT_PORT ?? 0);
if ([5180, 5190, 8787, 8788].includes(port)) throw Error('Use a spare export port, not an active editor/service port.');
await mkdir(output, { recursive: true });
await build({ root, mode: includePlans ? 'private-plans' : 'production' });
const server = await preview({ root, preview: { host: '127.0.0.1', port, strictPort: true } });
let browser;
try {
  const chrome = process.env.SHOWCASE_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--use-angle=swiftshader', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  if (!includePlans) await page.route('**/plans/**', route => route.abort());
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const capture = async (url, path, selector) => {
    await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      // Full-page exports must settle images below the viewport as well.
      await Promise.all(Array.from(document.images, image => new Promise(resolve => {
        if (image.complete) { resolve(); return; }
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
        image.loading = 'eager';
      })));
    });
    // The shared renderer loads meshes and finishes asynchronously; allow its first settled frame.
    await page.waitForTimeout(1800);
    if (await page.locator('.view-error').count()) throw Error(`Renderer failed for ${url}: ${await page.locator('.view-error').textContent()}`);
    await (selector ? page.locator(selector) : page).screenshot({ path, ...(selector ? {} : { fullPage: true }) });
  };
  await capture('/', join(output, 'gallery.png'));
  const flats = await page.evaluate(() => window.__SHOWCASE__.flats);
  for (const [width, height] of [[1440, 900], [1280, 800], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await capture('/', join(output, `gallery-${width}.png`));
    const firstReady = flats.find(flat => flat.shell_ready || flat.furnished_ready || flat.drawn_ready) ?? flats[0];
    if (firstReady) await capture(`/flat/${firstReady.id}`, join(output, `${firstReady.id}-detail-${width}.png`));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const flat of flats) {
    await capture(`/flat/${flat.id}`, join(output, `${flat.id}-detail.png`));
    if (!flat.shell_ready && !flat.furnished_ready && !flat.drawn_ready) continue;
    if (flat.shell_ready) await capture(`/flat/${flat.id}?state=shell`, join(output, `${flat.id}-shell.png`), '.viewer');
    if (flat.drawn_ready) await capture(`/flat/${flat.id}?state=drawn`, join(output, `${flat.id}-drawn.png`));
    if (flat.furnished_ready) await capture(`/flat/${flat.id}?state=furnished`, join(output, `${flat.id}-furnished.png`), '.viewer');
    await capture(`/embed/${flat.id}`, join(output, `${flat.id}-embed.png`));
  }
  await writeFile(join(output, 'numbers.json'), JSON.stringify({ exported_at: new Date().toISOString(), private_plans_in_screenshots: includePlans, flats }, null, 2));
  const csv = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  await writeFile(join(output, 'numbers.csv'), ['id,example,area_m2,rooms,pieces,total_amd,requests,drawn_pieces,drawn_placed,drawn_note', ...flats.map(flat => [flat.id, flat.example, flat.area_m2, flat.rooms, flat.added_pieces.length, flat.total_amd, flat.requests.join(' | '), flat.drawn_audit?.drawn, flat.drawn_audit?.placed, flat.drawn_ready ? flat.drawn_note : ''].map(csv).join(','))].join('\n'));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  await writeFile(join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Varpet residences · Export</title><style>body{font:16px/1.6 system-ui;background:#f4f1ea;color:#232e29;max-width:1100px;margin:40px auto;padding:24px}img{width:100%;height:auto}article{margin:48px 0}small{color:#5c655e}</style><h1>A place to call home</h1><p>Komitas Park collection · ${flats.filter(flat => !flat.example).length} published flats${flats.some(flat => flat.example) ? ' · Avani example shown while the collection is prepared' : ''}</p><img src="gallery.png" alt="Residence gallery">${flats.map(flat => `<article><h2>${esc(flat.title)}</h2><p>${esc(flat.area_m2 ?? 'Unconfirmed')} m² · ${esc(flat.rooms ?? 'Unconfirmed')} rooms · ${flat.added_pieces.length} pieces · ${flat.total_amd === null ? 'Not quoted' : `${esc(flat.total_amd)} ֏`}</p>${flat.shell_ready || flat.furnished_ready || flat.drawn_ready ? `<img src="${flat.id}-detail.png" alt="${esc(flat.title)} plan and 3D view">` : '<p>3D view being prepared.</p>'}<p>${flat.requests.map((request, index) => `${esc(request)} — ${esc(flat.request_outcomes[index] ?? 'Recorded customer request')}`).join('<br>')}</p><small>${esc(flat.price_note)}</small>${flat.drawn_ready ? `<p>${esc(flat.drawn_note)}</p><img src="${flat.id}-drawn.png" alt="Partial developer-drawn layout and placement limitations">` : ''}</article>`).join('')}<p><a href="numbers.json">Full numbers</a> · <a href="numbers.csv">Spreadsheet</a></p>`);
  if (includePlans) await build({ root }); // Shared site always uses portable plan placeholders.
  await cp(join(root, 'dist'), join(output, 'site'), { recursive: true });
  const index = await readFile(join(root, 'dist/index.html'), 'utf8');
  for (const flat of flats) for (const route of ['flat', 'embed']) { const dir = join(output, 'site', route, flat.id); await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'index.html'), index); }
  await writeFile(join(output, 'README.txt'), 'Screenshots and numbers are ready to share. Serve site/ as the web root for the interactive pages (absolute /assets paths). Developer plan originals are never copied. Private plan screenshots are included only with --include-private-plans. Furniture prices are illustrative catalog estimates, not shop quotations. This demonstrates the experience, not a measured sales-conversion uplift.\n');
  console.log(JSON.stringify({ output, flats: flats.length, komitas: flats.filter(flat => !flat.example).length, furnished: flats.filter(flat => flat.furnished_ready).length, private_plans: includePlans }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
