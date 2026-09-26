// Browser-only QA: run with `node output/blueprint-prefetch-verification/probe.cjs`.
// All /flat requests are intercepted in memory; every other external/API request is blocked.
// The served stage factory is wrapped only to record callback order. App source stays untouched.
const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = __dirname;
const baseURL = process.env.BLUEPRINT_PREFETCH_QA_URL || 'http://127.0.0.1:5186';
const executablePath = process.env.BLUEPRINT_PREFETCH_QA_CHROME || '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const results = { command: 'node output/blueprint-prefetch-verification/probe.cjs', baseURL, checks: [], pageErrors: [], blockedRequests: [], screenshots: [], measurements: {} };
let browser, context, page;
let png;
async function check(name, fn) {
  try { await fn(); results.checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
  catch (error) { results.checks.push({ name, status: 'failed', error: error.stack }); throw error; }
}
async function screenshot(name) { await page.screenshot({ path: path.join(out, name), fullPage: true }); results.screenshots.push(name); }
async function fresh({ reduced = true, width = 1440, height = 1050 } = {}) {
  if (page) await page.close();
  page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.on('pageerror', error => results.pageErrors.push(error.message));
  await page.goto(baseURL);
  await page.locator('.blueprint-drop').waitFor();
  png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 90;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 120, 90);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(12, 12, 96, 66);
    ctx.beginPath(); ctx.moveTo(58, 12); ctx.lineTo(58, 78); ctx.moveTo(58, 43); ctx.lineTo(108, 43); ctx.stroke();
    return canvas.toDataURL('image/png').split(',')[1];
  });
}
async function choose(name = 'floor-plan.png', { method = 'picker', content, type = 'image/png', size, extras = [] } = {}) {
  const spec = { name, content, type, size, extras };
  if (method === 'picker') {
    await page.evaluate(() => { window.qaSelectionStarted = performance.now(); });
    await page.locator('.blueprint-file-input').setInputFiles({ name, mimeType: type, buffer: content ? Buffer.from(content) : size !== undefined ? Buffer.alloc(size) : Buffer.from(png, 'base64') });
  } else {
    await page.evaluate(({ png, spec, method }) => {
      const make = value => new File([value.content || (value.size !== undefined ? new Uint8Array(value.size) : Uint8Array.from(atob(png), c => c.charCodeAt(0)))], value.name, { type: value.type || 'image/png' });
      const dataTransfer = new DataTransfer(); dataTransfer.items.add(make(spec));
      for (const extra of spec.extras) dataTransfer.items.add(make(extra));
      window.qaSelectionStarted = performance.now();
      if (method === 'paste') window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }));
      else document.querySelector('.blueprint-board').dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true, clientX: 300, clientY: 350 }));
    }, { png, spec, method });
  }
}
async function ready(name) {
  await page.waitForFunction(name => !document.querySelector('.blueprint-build').disabled && !document.querySelector('.blueprint-next').hidden && (!name || document.querySelector('.blueprint-file strong').textContent === name), name);
}
async function requests(count) { await page.waitForFunction(count => window.qaStreams.length === count, count, { timeout: 15000 }); }
async function state() {
  return page.evaluate(() => ({
    requests: window.qaStreams.map(({ body, aborted, time, beforeSubmit, duringReveal, completed }) => ({ body, aborted, time, beforeSubmit, duringReveal, completed })),
    log: window.qaStageLog, flowHidden: document.querySelector('.blueprint-flow').hidden,
    message: document.querySelector('.blueprint-flow-message-text, .blueprint-flow-message:not(:has(.blueprint-flow-message-text))').textContent,
    completeHidden: document.querySelector('.blueprint-complete').hidden,
    errorHidden: document.querySelector('.blueprint-flow-error').hidden,
  }));
}
async function send(index, event) { await page.evaluate(({ index, event }) => window.qaSend(index, event), { index, event }); }
async function close(index) { await page.evaluate(index => window.qaStreams[index].controller.close(), index); }
async function project() { return page.evaluate(async () => (await import('/src/core/initial-scene.ts')).createInitialScene()); }
function shell(scene) { return { type: 'shell', rooms: scene.rooms, walls: scene.walls, components: scene.project.components, metadata: scene.project.metadata }; }
async function submit() {
  await page.locator('.blueprint-build').click();
  await page.locator('.blueprint-flow').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.qaStageLog.some(item => item.method === 'start'));
}
async function addPhoto(name) {
  await page.locator('.blueprint-photos input').setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
}
(async () => {
  browser = await chromium.launch({ headless: true, executablePath }); results.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/account/session') return route.fulfill({ json: { user: null } });
    if (url.pathname === '/flat' || url.origin !== baseURL || url.pathname.startsWith('/api/')) {
      results.blockedRequests.push({ url: url.toString(), method: route.request().method() }); return route.abort();
    }
    if (url.pathname === '/@vite/client') {
      const response = await route.fetch();
      const source = await response.text();
      assert.ok(source.includes('transport.connect(createHMRHandler(handleMessage));'));
      return route.fulfill({ response, body: source.replace('transport.connect(createHMRHandler(handleMessage));', '/* QA: live reload disabled for stable verification. */') });
    }
    if (url.pathname === '/src/ui/architect-stage.ts') {
      const response = await route.fetch(); const source = (await response.text()).split('//# sourceMappingURL=')[0];
      assert.ok(source.includes('export function createArchitectStage('));
      const body = source.replace('export function createArchitectStage(', 'function qaOriginalCreateArchitectStage(') + `\nexport function createArchitectStage(...args) {
        const result = qaOriginalCreateArchitectStage(...args); const id = ++window.qaStages;
        window.qaStageLog.push({stage:id, method:'create'});
        for (const method of ['start', 'event', 'progress', 'finish', 'dispose']) {
          const original = result[method]; result[method] = (...values) => {
            window.qaStageLog.push({stage:id, method, time:performance.now(), entering:document.querySelector('.blueprint-flow').classList.contains('is-entering'), value: method === 'start' ? {plan:values[0].name, photos:values[1].map(f=>f.name)} : values[0]});
            return original(...values);
          };
        }
        return result;
      }\n`;
      return route.fulfill({ response, body });
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.qaStreams = []; window.qaStageLog = []; window.qaStages = 0; window.qaIgnoreAbort = false;
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url, location.href);
      if (url.pathname !== '/flat') return original(input, init);
      let controller;
      const stream = new ReadableStream({ start(value) { controller = value; } });
      const record = {
        controller, body: JSON.parse(init.body), aborted: !!init?.signal?.aborted,
        time: performance.now() - window.qaSelectionStarted,
        beforeSubmit: document.querySelector('.blueprint-flow').hidden,
        duringReveal: document.querySelector('.blueprint-build').disabled || document.querySelector('.blueprint-next').hidden,
        ignoreAbort: window.qaIgnoreAbort,
      };
      window.qaStreams.push(record);
      const abort = () => { record.aborted = true; if (!record.ignoreAbort) controller.error(new DOMException('Aborted', 'AbortError')); };
      init?.signal?.addEventListener('abort', abort, { once: true });
      if (record.aborted && !record.ignoreAbort) throw new DOMException('Aborted', 'AbortError');
      return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
    };
    window.qaSend = (index, event) => {
      if (event.type === 'project') window.qaStreams[index].completed = true;
      window.qaStreams[index].controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + '\n'));
    };
  });

  await fresh({ reduced: false });
  await check('picker starts exactly one request before reveal ends or Submit', async () => {
    await choose('picker-plan.png'); await requests(1);
    let actual = await state(); assert.equal(actual.requests[0].beforeSubmit, true); assert.equal(actual.requests[0].duringReveal, true);
    assert.equal(actual.log.length, 0); assert.equal(actual.flowHidden, true);
    results.measurements.pickerRequestMs = actual.requests[0].time;
    await screenshot('reading-during-plan-reveal.png');
    await ready('picker-plan.png');
    results.measurements.pickerRevealReadyMs = await page.evaluate(() => performance.now() - window.qaSelectionStarted);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await submit(); actual = await state();
    assert.equal(actual.requests.length, 1); assert.equal(actual.requests[0].aborted, false);
    await screenshot('submitted-reading.png');
  });

  await fresh({ reduced: false });
  await check('normal-motion handoff completes before buffered shell replay; repeated Submit is ignored', async () => {
    await choose('handoff-plan.png'); await requests(1); await ready('handoff-plan.png');
    await send(0, shell(await project()));
    await send(0, { type: 'progress', message: 'QA buffered before normal handoff' });
    await submit();
    assert.equal((await state()).log.filter(item => ['event', 'progress'].includes(item.method)).length, 0);
    await page.evaluate(() => { for (let i = 0; i < 4; i++) { document.querySelector('.blueprint-build').click(); document.querySelector('[data-retry]').click(); } });
    await send(0, { type: 'progress', message: 'QA buffered during normal handoff' });
    await page.waitForFunction(() => window.qaStageLog.filter(item => item.method === 'progress').length === 2);
    const actual = await state();
    assert.equal(actual.requests.length, 1); assert.equal(actual.log.filter(item => item.method === 'create').length, 1);
    const callbacks = actual.log.filter(item => ['event', 'progress'].includes(item.method));
    assert.equal(callbacks.length, 3); callbacks.forEach(item => assert.equal(item.entering, false));
    results.measurements.handoffBeforeReplayMs = callbacks[0].time - actual.log.find(item => item.method === 'start').time;
    await screenshot('normal-handoff-buffered-shell.png');
  });

  await fresh({ reduced: false });
  await check('Back during normal handoff prevents queued shell and progress replay', async () => {
    await choose('interrupted-handoff-plan.png'); await requests(1); await ready('interrupted-handoff-plan.png');
    await send(0, shell(await project())); await send(0, { type: 'progress', message: 'QA discarded handoff progress' });
    await submit(); await page.locator('.blueprint-back').click();
    await page.locator('.blueprint-welcome').waitFor({ state: 'visible' });
    await page.waitForTimeout(1900);
    const actual = await state(); assert.equal(actual.requests[0].aborted, true); assert.equal(actual.flowHidden, true);
    assert.equal(actual.log.filter(item => ['event', 'progress'].includes(item.method)).length, 0);
  });

  await fresh();
  await check('drop prefetch buffers progress and shell, then replays in order on Submit', async () => {
    await choose('dropped-plan.png', { method: 'drop' }); await requests(1); await ready('dropped-plan.png');
    const scene = await project();
    await send(0, { type: 'progress', message: 'QA first buffered progress' });
    await send(0, shell(scene));
    await send(0, { type: 'progress', message: 'QA second buffered progress' });
    await page.waitForTimeout(50);
    assert.equal((await state()).log.length, 0);
    await submit();
    await page.waitForFunction(() => window.qaStageLog.filter(item => item.method === 'progress').length === 2);
    const actual = await state();
    assert.equal(actual.requests.length, 1);
    assert.deepEqual(actual.log.filter(item => ['event', 'progress'].includes(item.method)).map(item => ({ method: item.method, value: item.value })), [
      { method: 'progress', value: 'QA first buffered progress' }, { method: 'event', value: shell(scene) }, { method: 'progress', value: 'QA second buffered progress' },
    ]);
    assert.equal(actual.message, 'QA second buffered progress');
    await send(0, { type: 'progress', message: 'QA progress after Submit' });
    await page.waitForFunction(() => document.querySelector('.blueprint-flow-message-text, .blueprint-flow-message:not(:has(.blueprint-flow-message-text))').textContent === 'QA progress after Submit');
    await screenshot('buffered-shell-replayed.png');
  });

  await fresh({ width: 390, height: 844 });
  await check('pasted plan completed before Submit opens review without a second request', async () => {
    await choose('pasted-plan.png', { method: 'paste' }); await requests(1); await ready('pasted-plan.png');
    const scene = await project(); await send(0, shell(scene)); await send(0, { type: 'project', project: scene }); await close(0);
    await page.waitForTimeout(100);
    assert.equal((await state()).flowHidden, true); assert.equal((await state()).log.length, 0);
    await submit(); await page.locator('.blueprint-complete').waitFor({ state: 'visible', timeout: 30000 });
    const actual = await state(); assert.equal(actual.requests.length, 1); assert.equal(actual.requests[0].aborted, false);
    assert.equal(actual.log.filter(item => item.method === 'event' && item.value.type === 'shell').length, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await screenshot('completed-before-submit-mobile.png');
  });

  await fresh();
  await check('replacing a plan aborts old prefetch and stale events never reach new stage', async () => {
    await page.evaluate(() => { window.qaIgnoreAbort = true; });
    await choose('original-plan.png'); await requests(1); await ready('original-plan.png');
    await send(0, { type: 'progress', message: 'QA abandoned original progress' });
    await choose('replacement-plan.png'); await requests(2); await ready('replacement-plan.png');
    let actual = await state(); assert.equal(actual.requests[0].aborted, true); assert.equal(actual.requests[1].aborted, false);
    assert.equal(actual.requests[1].body.name, 'replacement-plan');
    await send(0, { type: 'progress', message: 'QA late original progress' });
    await send(0, shell(await project()));
    await send(1, { type: 'progress', message: 'QA replacement progress' });
    await submit(); await page.waitForFunction(() => document.querySelector('.blueprint-flow-message-text, .blueprint-flow-message:not(:has(.blueprint-flow-message-text))').textContent === 'QA replacement progress');
    actual = await state(); assert.equal(actual.requests.length, 2);
    assert.deepEqual(actual.log.filter(item => ['progress', 'event'].includes(item.method)).map(item => item.value), ['QA replacement progress']);
  });

  await fresh();
  await check('photo add and removal each replace prefetch using current evidence only', async () => {
    await choose('photos-plan.png'); await requests(1); await ready('photos-plan.png');
    await addPhoto('kitchen.png'); await requests(2);
    let actual = await state(); assert.equal(actual.requests[0].aborted, true); assert.equal(actual.requests[1].body.photos.length, 1);
    assert.equal(actual.requests[1].body.photos[0].name, 'room-photo-1.png');
    await addPhoto('bedroom.png'); await requests(3);
    actual = await state(); assert.equal(actual.requests[1].aborted, true); assert.equal(actual.requests[2].body.photos.length, 2);
    await page.locator('[data-remove-photo="0"]').click(); await requests(4);
    actual = await state(); assert.equal(actual.requests[2].aborted, true); assert.equal(actual.requests[3].body.photos.length, 1);
    await submit(); actual = await state(); assert.equal(actual.requests.length, 4);
    assert.deepEqual(actual.log.find(item => item.method === 'start').value, { plan: 'photos-plan.png', photos: ['bedroom.png'] });
  });

  await fresh();
  await check('multi-file drop starts one prefetch with the selected plan and all room photos', async () => {
    await choose('bedroom.png', { method: 'drop', extras: [{ name: 'blueprint.png' }, { name: 'kitchen.png' }] });
    await requests(1); await ready('blueprint.png');
    const actual = await state(); assert.equal(actual.requests[0].body.name, 'blueprint'); assert.equal(actual.requests[0].body.photos.length, 2);
    await submit(); assert.equal((await state()).requests.length, 1);
  });

  await fresh();
  await check('failed prefetch is handled before Submit; Submit and explicit retry each start fresh work', async () => {
    await choose('failure-plan.png'); await requests(1); await ready('failure-plan.png');
    await send(0, { type: 'error', message: 'QA prefetch failed' }); await page.waitForTimeout(100);
    assert.equal((await state()).flowHidden, true); assert.equal((await state()).log.length, 0);
    assert.match(await page.locator('.blueprint-build-note').innerText(), /Continue to try again/);
    await page.locator('.blueprint-build').click();
    await requests(2);
    await send(1, { type: 'error', message: 'QA submitted retry failed' });
    await page.locator('.blueprint-flow-error').waitFor({ state: 'visible' });
    assert.match(await page.locator('.blueprint-flow-error').innerText(), /QA submitted retry failed/);
    assert.equal((await state()).requests.length, 2);
    await screenshot('prefetch-failure-review.png');
    await page.locator('[data-retry]').click(); await requests(3);
    await send(2, { type: 'progress', message: 'QA retry working' });
    await page.waitForFunction(() => document.querySelector('.blueprint-flow-message-text, .blueprint-flow-message:not(:has(.blueprint-flow-message-text))').textContent === 'QA retry working');
    assert.equal((await state()).errorHidden, true);
  });

  await fresh();
  await check('invalid format, empty, oversized, and undecodable plans never start work', async () => {
    const cases = [
      ['invalid.gif', { type: 'image/gif' }, 'Choose a JPG'],
      ['empty.png', { size: 0 }, 'between 1 byte'],
      ['huge.png', { size: 2_000_001 }, 'between 1 byte'],
      ['broken.png', { content: 'not a PNG' }, 'This image could not be read'],
    ];
    for (const [name, options, expected] of cases) {
      await choose(name, options);
      await page.waitForFunction(text => !document.querySelector('.blueprint-error').hidden && document.querySelector('.blueprint-error').textContent.includes(text), expected);
      assert.equal((await state()).requests.length, 0);
    }
  });
  await check('invalid replacement or photo preserves a valid in-flight prefetch', async () => {
    await choose('retained-plan.png'); await requests(1); await ready('retained-plan.png');
    await choose('broken-replacement.png', { content: 'not a PNG' });
    await page.waitForFunction(() => document.querySelector('.blueprint-error').textContent.includes('This image could not be read'));
    await page.locator('.blueprint-photos input').setInputFiles({ name: 'invalid.gif', mimeType: 'image/gif', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => document.querySelector('.blueprint-error').textContent.includes('Choose a JPG'));
    const actual = await state(); assert.equal(actual.requests.length, 1); assert.equal(actual.requests[0].aborted, false);
    await ready('retained-plan.png');
  });

  await fresh();
  await check('Back cancels current work; late callbacks stay inert and resubmission starts fresh', async () => {
    await page.evaluate(() => { window.qaIgnoreAbort = true; });
    await choose('back-plan.png'); await requests(1); await ready('back-plan.png'); await submit();
    await send(0, { type: 'progress', message: 'QA before Back' });
    await page.waitForFunction(() => document.querySelector('.blueprint-flow-message-text, .blueprint-flow-message:not(:has(.blueprint-flow-message-text))').textContent === 'QA before Back');
    await page.locator('.blueprint-back').click();
    await page.locator('.blueprint-welcome').waitFor({ state: 'visible' });
    let actual = await state(); assert.equal(actual.requests[0].aborted, true); const oldLog = actual.log;
    await send(0, { type: 'progress', message: 'QA stale after Back' });
    await send(0, shell(await project())); await page.waitForTimeout(80);
    actual = await state(); assert.equal(actual.flowHidden, true); assert.deepEqual(actual.log, oldLog);
    assert.notEqual(actual.message, 'QA stale after Back');
    await submit(); await requests(2); await send(1, { type: 'progress', message: 'QA resubmitted' });
    await page.waitForFunction(() => document.querySelector('.blueprint-flow-message-text, .blueprint-flow-message:not(:has(.blueprint-flow-message-text))').textContent === 'QA resubmitted');
  });

  await fresh();
  await check('disposing landing aborts prefetch and late events never create a stage', async () => {
    await page.evaluate(() => { window.qaIgnoreAbort = true; });
    await choose('dispose-plan.png'); await requests(1); await ready('dispose-plan.png');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    assert.equal((await state()).requests[0].aborted, true);
    await send(0, { type: 'progress', message: 'QA after dispose' });
    await send(0, shell(await project())); await send(0, { type: 'project', project: await project() });
    await page.waitForTimeout(80);
    assert.equal((await state()).log.length, 0); assert.equal((await state()).flowHidden, true);
    await choose('ignored-paste.png', { method: 'paste' }); await page.waitForTimeout(80);
    assert.equal((await state()).requests.length, 1);
  });
  assert.deepEqual(results.pageErrors, []);
  assert.equal(results.blockedRequests.filter(item => new URL(item.url).pathname === '/flat').length, 0);
  results.status = 'passed';
})().catch(error => { results.status = 'failed'; results.failure = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ status: results.status, passed: results.checks.filter(item => item.status === 'passed').length, pageErrors: results.pageErrors.length, measurements: results.measurements }));
});
