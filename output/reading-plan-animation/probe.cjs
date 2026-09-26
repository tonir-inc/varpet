// Temporary browser verification only. Architect requests are mocked locally.
const {chromium} = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const baseURL = 'http://127.0.0.1:5173';
const executablePath = '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const out = __dirname;
const results = {checks: [], pageErrors: [], blockedServices: [], screenshots: []};
let browser;
(async () => {
  browser = await chromium.launch({headless: true, executablePath});
  const context = await browser.newContext({viewport: {width: 1440, height: 1050}});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/account/session') return route.fulfill({json: {user: null}});
    if (url.origin !== baseURL || url.pathname.startsWith('/api/')) {
      results.blockedServices.push(route.request().url()); return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => results.pageErrors.push(error.message));
  await page.routeWebSocket(/127\.0\.0\.1:5173/, ws => { ws.send(JSON.stringify({type:'connected'})); ws.onMessage(() => {}); });
  await page.goto(baseURL);
  await page.locator('.blueprint-drop').waitFor();
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    window.qaStreams = [];
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname !== '/flat') return originalFetch(input, init);
      let streamController;
      const body = new ReadableStream({start(controller) {streamController = controller;}});
      const state = {controller: streamController, aborted: false};
      init?.signal?.addEventListener('abort', () => {state.aborted = true; streamController.error(new DOMException('Aborted', 'AbortError'));});
      window.qaStreams.push(state);
      return new Response(body, {headers: {'Content-Type': 'application/x-ndjson'}});
    };
    window.qaSend = event => window.qaStreams.at(-1).controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + '\n'));
  });
  const check = async (name, fn) => {await fn(); results.checks.push(name); console.log('PASS ' + name);};
  const send = event => page.evaluate(event => window.qaSend(event), event);
  const snapshot = () => page.locator('.blueprint-flow-message').evaluate(e => {
    const text = e.querySelector('.blueprint-flow-message-text');
    const dots = e.querySelector('.blueprint-flow-dots');
    const box = text.getBoundingClientRect();
    return {text: text.textContent, textRect: [box.x,box.y,box.width,box.height], hidden: dots.hidden, count: dots.getAnimations({subtree:true}).length,
      dotStyles: [...dots.children].map(dot => ({opacity: getComputedStyle(dot).opacity, transform: getComputedStyle(dot).transform, animation: getComputedStyle(dot).animationName}))};
  });
  const screenshot = async name => {const filename = path.join(out,name); await page.screenshot({path:filename, fullPage:true}); results.screenshots.push(filename);};
  const start = async (selector = '.blueprint-build') => {
    const count = await page.evaluate(() => window.qaStreams.length);
    await page.locator(selector).click();
    await page.waitForFunction(() => window.qaStreams.length > 0 && !window.qaStreams.at(-1).aborted);
    await page.waitForFunction(() => !document.querySelector('.blueprint-flow').classList.contains('is-entering') && getComputedStyle(document.querySelector('.blueprint-flow-heading')).opacity === '1');
  };
  await page.locator('.blueprint-file-input').setInputFiles(path.resolve('apartments/m6-12-54/source.png'));
  await page.waitForFunction(() => !document.querySelector('.blueprint-build').disabled);
  await start();
  await send({type:'progress', message:'Reading the plan: rooms, walls, doors and windows…'});
  await check('desktop active dots visible with unchanged accessible status text', async () => {
    const state = await snapshot(); assert.equal(state.hidden,false); assert.equal(state.count,2);
    assert.equal(state.text,'Reading the plan');
    assert.equal(await page.locator('.blueprint-flow-dots').getAttribute('aria-hidden'),'true');
    assert.equal(await page.locator('.blueprint-flow-message').getAttribute('role'),'status');
  });
  await page.waitForTimeout(500);
  await screenshot('desktop-working.png');
  await check('active frames change opacity and keep status text fixed', async () => {
    const frames=[]; for(let i=0;i<12;i++){frames.push(await snapshot()); await page.waitForTimeout(180);}
    assert.ok(new Set(frames.map(f=>JSON.stringify(f.dotStyles))).size>2);
    for(const frame of frames) assert.deepEqual(frame.textRect,frames[0].textRect);
    results.desktopFrames=frames;
  });
  await check('live reduced motion settles visible dots without animation', async () => {
    await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForTimeout(50);
    const a=await snapshot(); await page.waitForTimeout(200); const b=await snapshot();
    assert.equal(a.hidden,false); assert.equal(a.count,0); assert.deepEqual(a.dotStyles,b.dotStyles);
    a.dotStyles.forEach(dot=>{assert.equal(dot.opacity,'1');assert.equal(dot.transform,'none');});
    await screenshot('desktop-reduced-motion.png');
  });
  await check('restoring motion restarts dots', async () => {
    await page.emulateMedia({reducedMotion:'no-preference'}); await page.waitForTimeout(80);
    assert.equal((await snapshot()).count,2);
  });
  await check('stream failure removes indicator and active animations', async () => {
    await send({type:'error', message:'Mocked connection failure for verification'});
    await page.locator('.blueprint-flow-error').waitFor({state:'visible'});
    const state=await snapshot(); assert.equal(state.hidden,true); assert.equal(state.count,0);
    assert.match(state.text,/couldn’t finish/); await screenshot('desktop-error.png');
  });
  await check('retry starts a new active indicator', async () => {
    await start('[data-retry]'); assert.equal((await snapshot()).hidden,false); assert.equal((await snapshot()).count,2);
  });
  await check('returning to plan cancels request and removes animations', async () => {
    await page.locator('.blueprint-back').click();
    await page.locator('.blueprint-welcome').waitFor({state:'visible'});
    assert.equal((await snapshot()).hidden,true); assert.equal((await snapshot()).count,0);
    assert.equal(await page.evaluate(()=>window.qaStreams.at(-1).aborted),true);
  });
  await page.setViewportSize({width:390,height:844});
  await start();
  await send({type:'progress', message:'Reading the plan: rooms, walls, doors and windows...'});
  await check('390px mobile status and dots remain visible without horizontal overflow', async () => {
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const box=await page.locator('.blueprint-flow-dots').boundingBox(); assert.ok(box.x>=0 && box.x+box.width<=390);
    const frames=[]; for(let i=0;i<8;i++){frames.push(await snapshot());await page.waitForTimeout(240);}
    assert.ok(new Set(frames.map(f=>JSON.stringify(f.dotStyles))).size>1);
    for(const frame of frames)assert.deepEqual(frame.textRect,frames[0].textRect);
    results.mobileFrames=frames; await screenshot('mobile-working.png');
  });
  await check('checking remains visibly active until completion', async () => {
    await send({type:'progress',message:'Checking your apartment before you step inside…'});
    await page.waitForFunction(()=>document.querySelector('.blueprint-flow-message-text').textContent.startsWith('Checking'));
    assert.equal((await snapshot()).hidden,false); assert.equal((await snapshot()).count,2);
  });
  const project = await page.evaluate(async()=> (await import('/src/core/initial-scene.ts')).createInitialScene());
  await send({type:'shell',rooms:project.rooms,walls:project.walls,components:project.project.components,metadata:project.project.metadata});
  await check('project validation and finish choreography keep indicator active',async()=>{
    await send({type:'project',project});
    await page.waitForTimeout(80);
    assert.equal((await snapshot()).hidden,false); assert.equal((await snapshot()).count,2);
    assert.equal(await page.locator('.blueprint-complete').isHidden(),true);
  });
  await check('finished apartment hides indicator and leaves no dot animation',async()=>{
    await page.locator('.blueprint-complete').waitFor({state:'visible',timeout:35000});
    assert.equal((await snapshot()).hidden,true); assert.equal((await snapshot()).count,0);
    assert.equal((await snapshot()).text,'Built from your blueprint. Ready for your ideas.');
    await screenshot('mobile-complete.png');
  });
  await check('reduced-motion startup keeps active indicator static',async()=>{
    await page.locator('.blueprint-back').click();
    await page.emulateMedia({reducedMotion:'reduce'});
    await start();
    const state=await snapshot();assert.equal(state.hidden,false);assert.equal(state.count,0);
    state.dotStyles.forEach(dot=>{assert.equal(dot.opacity,'1');assert.equal(dot.transform,'none');});
  });
  await check('disposal removes dot animations',async()=>{
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
    assert.equal((await snapshot()).hidden,true);assert.equal((await snapshot()).count,0);
  });
  await page.evaluate(async () => {
    const {mountBlueprintLanding} = await import('/src/portal/blueprint.ts');
    const host = document.createElement('div'); document.body.append(host);
    const dispose = mountBlueprintLanding(host, {showSample() {}, async openProject() {}});
    const flow = host.querySelector('.blueprint-flow'); document.body.append(flow);
    dispose(); flow.remove(); host.remove();
  });
  results.checks.push('disposal succeeds when the flow is reparented for editor handoff');
  assert.deepEqual(results.pageErrors,[]);
  results.status='passed';
})().catch(error=>{results.status='failed';results.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({status:results.status,checks:results.checks.length,pageErrors:results.pageErrors.length}));
});
