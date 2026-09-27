const { chromium } = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:5173';
const out = __dirname;
const results = {checks: [], errors: [], requests: 0};
const png = fs.readFileSync('packages/designer/eval/vision-fixtures/avani-plan.png');
let browser, context, page;
async function check(name, fn) { await fn(); results.checks.push(name); console.log('PASS ' + name); }
async function phase(expected) { await page.waitForFunction(value => document.querySelector('.blueprint-flow [aria-current="step"]')?.dataset.phase === value, expected); }
async function send(event, index = 0) { await page.evaluate(({event,index}) => window.qaStreams[index].enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n')), {event,index}); }
async function fresh(reduced) {
  if (page) await page.close();
  page = await context.newPage();
  page.on('pageerror', error => results.errors.push(error.message));
  await page.emulateMedia({reducedMotion: reduced ? 'reduce' : 'no-preference'});
  await page.goto(base);
  await page.locator('.blueprint-file-input').setInputFiles({name:'plan.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(() => window.qaStreams.length === 1 && !document.querySelector('.blueprint-build').disabled);
}
async function submit() {
  await page.locator('.blueprint-build').click();
  await page.waitForFunction(() => document.querySelector('.blueprint-flow').classList.contains('is-working'));
}
(async () => {
  browser = await chromium.launch({headless:true,executablePath:'/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
  context = await browser.newContext({viewport:{width:1440,height:1050}});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({contentType:'text/css',body:''});
    if (url.pathname === '/api/account/session') return route.fulfill({json:{user:null}});
    if (url.origin !== base || url.pathname.startsWith('/api/') || url.pathname === '/flat') {
      if (url.pathname === '/flat') results.requests++;
      return route.abort();
    }
    if (url.pathname === '/@vite/client') {
      const response = await route.fetch();
      return route.fulfill({response,body:(await response.text()).replace('transport.connect(createHMRHandler(handleMessage));','/* QA HMR disabled. */')});
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.qaStreams=[];
    const original=window.fetch;
    window.fetch=async (input,init) => {
      if (new URL(typeof input === 'string' ? input : input.url,location.href).pathname !== '/flat') return original(input,init);
      const stream=new ReadableStream({start(controller){window.qaStreams.push(controller);init?.signal?.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});}});
      return new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}});
    };
  });
  for (const reduced of [false,true]) {
    const label=reduced?'reduced motion':'normal motion';
    await fresh(reduced);
    await send({type:'progress',message:'Reading the plan: rooms, walls, doors and windows'});
    await submit();
    await check(label+': opens on Build with Read and Draw completed',async()=>{
      await phase('building');
      assert.deepEqual(await page.locator('.blueprint-flow [data-phase].is-done').evaluateAll(nodes=>nodes.map(node=>node.dataset.phase)),['reading','walls']);
      assert.equal(await page.locator('.blueprint-flow-message-text').textContent(),'Building your apartment');
    });
    await check(label+': input validation stays Build',async()=>{
      await send({type:'progress',message:'Checking the plan'});
      await page.waitForFunction(()=>document.querySelector('.blueprint-flow-message-text').textContent==='Checking the plan');
      await phase('building');
    });
    const scene=await page.evaluate(async()=> (await import('/src/core/initial-scene.ts')).createInitialScene());
    await check(label+': shell arrival stays Build',async()=>{
      await send({type:'shell',rooms:scene.rooms,walls:scene.walls});
      await send({type:'progress',message:'Building furniture from the photos'});
      await page.waitForFunction(()=>document.querySelector('.blueprint-flow-message-text').textContent==='Building furniture from the photos');
      await phase('building');
    });
    await check(label+': individual furniture checks stay Build',async()=>{
      await send({type:'progress',message:'Checking dining chair'});
      await page.waitForFunction(()=>document.querySelector('.blueprint-flow-message-text').textContent==='Checking dining chair');
      await phase('building');
    });
    if (!reduced) await page.screenshot({path:out+'/build-desktop.png',fullPage:true});
    await check(label+': Place advances before placements arrive',async()=>{await send({type:'progress',message:'Placing the furniture where the photos show it'});await phase('placing');});
    await check(label+': late shell events cannot regress Place',async()=>{await send({type:'shell',rooms:scene.rooms,walls:scene.walls});await send({type:'pieces',pieces:[]});await phase('placing');});
    await check(label+': Review advances before the final result',async()=>{await send({type:'progress',message:'Checking the result against the photos'});await phase('checking');});
    await check(label+': retry starts a fresh Build',async()=>{
      await send({type:'error',message:'Simulated retry check'});
      await page.locator('.blueprint-flow-error').waitFor({state:'visible'});
      await page.locator('[data-retry]').click();
      await page.waitForFunction(()=>window.qaStreams.length===2 && document.querySelector('.blueprint-flow').classList.contains('is-working'));
      await phase('building');
    });
  }
  await page.setViewportSize({width:390,height:844});
  await check('mobile Build marks only Read and Draw completed',async()=>{await phase('building');assert.equal(await page.locator('.blueprint-flow [data-phase].is-done').count(),2);});
  await page.screenshot({path:out+'/build-mobile.png',fullPage:true});
  for (const preview of ['reading','walls']) await check('explicit '+preview+' checkpoint remains available',async()=>{
    await page.goto(base+'/?blueprintTest='+preview);await phase(preview);
  });
  assert.deepEqual(results.errors,[]);assert.equal(results.requests,0);
  console.log(`${results.checks.length} checks passed; 0 page errors; 0 real architect requests`);
})().catch(error=>{results.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser?.close();});
