const {chromium} = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const executablePath = '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const baseURL = 'http://127.0.0.1:5173';
const results = { checks: [], pageErrors: [] };
(async () => {
  const browser = await chromium.launch({headless: true, executablePath});
  try {
    const page = await browser.newPage({viewport: {width: 1000, height: 720}});
    page.on('pageerror', error => results.pageErrors.push(error.message));
    await page.route('**/__construction-probe', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><html><head><style>body{margin:0;background:#104349}#host{position:relative;width:100vw;height:100vh}</style></head><body><div id="host"></div></body></html>'}));
    await page.goto(`${baseURL}/__construction-probe`);
    await page.evaluate(async () => {
      const {createDesignConstruction} = await import('/src/ui/design-construction.ts');
      window.qa = {calls: [], frame: null, loading: false, camera: 0, frames: 0};
      const originalRAF = requestAnimationFrame;
      window.requestAnimationFrame = callback => {window.qa.frames++; return originalRAF(callback);};
      const viewport = {
        onFrame(callback) {window.qa.frame = callback; return () => {window.qa.frame = null;};},
        project([x, y, z]) {return {x: 480 + (x - z) * 60 + window.qa.camera, y: 380 + (x + z) * 25 - y * 70, visible: true};},
        loading() {return window.qa.loading;},
        animateAssembly(id) {window.qa.calls.push(['assembly', id]);},
        animatePlacement(id) {window.qa.calls.push(['placement', id]);},
      };
      window.qa.overlay = createDesignConstruction(document.querySelector('#host'), viewport);
      window.qa.scene = {format:'varpet.editor', version:1, id:'qa', name:'QA', units:'m', upAxis:'Y',rooms:[], walls:[], objects:[
        {id:'sofa', assetId:'abo-sofa', name:'Sofa', position:[-2,0,0], rotation:0, scale:[1,1,1]},
        {id:'desk', assetId:'custom-desk-1', name:'Built-in desk', position:[2,0,0], rotation:.2, scale:[1,1,1]},
      ]};
      window.qa.catalog = [
        {id:'abo-sofa', name:'Sofa', kind:'sofa', dimensions:[2,1,1], category:'Sofa', color:'#aaaaaa',price:0,source:{type:'gltf',url:'/sofa.glb'}},
        {id:'custom-desk-1', name:'Built-in desk', kind:'desk', dimensions:[1.5,1,1], category:'Desk', color:'#bbbbbb',price:0,source:{type:'gltf',url:'/designer/files/qa/custom-desk-1.glb'}},
      ];
      window.qa.original = JSON.stringify(window.qa.scene);
    });
    const check = async (label, fn) => {await fn(); results.checks.push(label); console.log('PASS '+label);};
    await check('empty overlay hidden and no animation frame scheduled', async () => {
      assert.equal(await page.locator('.design-construction').getAttribute('hidden'), '');
      assert.equal(await page.evaluate(() => qa.frames),0);
    });
    await check('truthful build states update one named card without fake placement', async () => {
      await page.evaluate(() => {for (const state of ['queued','building','fixing','building']) qa.overlay.event({type:'build',slotId:'custom-desk-1',state});});
      assert.equal(await page.locator('.design-construction-build').count(),1);
      assert.match(await page.locator('.design-construction-build').textContent(),/DeskBuilding/);
      assert.equal(await page.locator('.design-construction-drawing g').count(),0);
      assert.equal(await page.evaluate(() => qa.calls.length),0);
      assert.doesNotMatch(await page.locator('.design-construction').textContent(),/%|left|\d+:\d+/);
    });
    await check('failure reason survives a later tool activity', async () => {
      await page.evaluate(() => {
        qa.overlay.event({type:'build',slotId:'custom-cabinet-2',state:'failed',reason:'Door clearance needs another measurement.'});
        qa.overlay.event({type:'tool',name:'search_catalog',phase:'end',summary:'Found two sofas',refs:{results:['one','two']}});
      });
      assert.match(await page.locator('.design-construction-build[data-state=failed]').textContent(),/Door clearance needs another measurement/);
      assert.match(await page.locator('.design-construction-activity').textContent(),/2 results/);
    });
    await check('guided arrival keeps construction visible below the phase journey', async () => {
      await page.evaluate(async () => {
        await import('/src/ui/arrival.css');
        document.querySelector('#host').classList.add('viewport-shell');
        document.body.classList.add('editor-arriving');
      });
      assert.deepEqual(await page.locator('.design-construction').evaluate(node => [getComputedStyle(node).opacity, getComputedStyle(node).transform]), ['1', 'none']);
      assert.equal(await page.locator('.design-construction-activity').evaluate(node => getComputedStyle(node).top),'116px');
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.locator('.design-construction-activity').evaluate(node => getComputedStyle(node).top),'102px');
      await page.setViewportSize({width:1000,height:720});
      await page.evaluate(() => document.body.classList.remove('editor-arriving'));
    });
    await check('checked preview animates catalog placement and custom assembly once', async () => {
      await page.evaluate(() => {
        qa.loading = true;
        qa.overlay.event({type:'build',slotId:'custom-desk-1',state:'done',glb:'/designer/files/qa/custom-desk-1.glb'});
        qa.overlay.preview(qa.scene,qa.catalog,['sofa','desk']);
        qa.overlay.preview(qa.scene,qa.catalog,['sofa','desk']);
        qa.pin = document.querySelector('.design-construction-pin');
      });
      assert.deepEqual(await page.evaluate(() => qa.calls),[['placement','sofa'],['assembly','desk']]);
      assert.equal(await page.locator('.design-construction-footprint').count(),2);
      assert.equal(await page.locator('.design-construction-wire').count(),2);
      assert.equal(await page.locator('.design-construction-build[data-state=done]').count(),0);
      assert.equal(await page.locator('.design-construction-build[data-state=failed]').count(),1);
    });
    await check('camera frame repositions existing DOM and leaves scene untouched', async () => {
      const before = await page.locator('.design-construction-pin').first().getAttribute('style');
      await page.evaluate(() => {qa.camera = 50; qa.frame();});
      assert.notEqual(await page.locator('.design-construction-pin').first().getAttribute('style'), before);
      assert.equal(await page.evaluate(() => qa.pin === document.querySelector('.design-construction-pin')), true);
      assert.equal(await page.evaluate(() => JSON.stringify(qa.scene) === qa.original),true);
      assert.equal(await page.evaluate(() => qa.frames),0);
    });
    await page.screenshot({path:path.join(__dirname,'checked-preview.png')});
    await check('marks wait for model loading then fade after assembly settles', async () => {
      await page.waitForTimeout(2200);
      assert.equal(await page.locator('.design-construction-pin').count(),2);
      await page.evaluate(() => {qa.loading = false; qa.frame();});
      await page.waitForTimeout(1500);
      assert.equal(await page.locator('.design-construction-pin').count(),2);
      await page.waitForTimeout(900);
      assert.equal(await page.locator('.design-construction-pin').count(),0);
      assert.equal(await page.locator('.design-construction-build[data-state=failed]').count(),1);
      assert.equal(await page.evaluate(() => qa.frames),0);
    });
    await check('repeated settled preview does not replay arrival', async () => {
      await page.evaluate(() => qa.overlay.preview(qa.scene,qa.catalog,['sofa','desk']));
      assert.equal(await page.evaluate(() => qa.calls.length),2);
      assert.equal(await page.locator('.design-construction-pin').count(),0);
    });
    await check('clear removes failure and lets a new turn animate its proposal', async () => {
      await page.evaluate(() => {qa.overlay.clear(); qa.overlay.preview(qa.scene,qa.catalog,['desk']);});
      assert.equal(await page.locator('.design-construction-build').count(),0);
      assert.equal(await page.evaluate(() => qa.calls.length),3);
    });
    await check('live reduced motion settles visible marks immediately', async () => {
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.design-construction-pin').count(),0);
      await page.evaluate(() => {qa.overlay.clear(); qa.overlay.preview(qa.scene,qa.catalog,['sofa','desk']);});
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => qa.calls.length),3);
      assert.equal(await page.locator('.design-construction-pin').count(),0);
    });
    await check('dispose cancels pending work, unsubscribes and removes all nodes', async () => {
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.evaluate(() => {qa.overlay.clear(); qa.overlay.preview(qa.scene,qa.catalog,['desk']); qa.overlay.dispose();});
      assert.equal(await page.locator('.design-construction').count(),0);
      assert.equal(await page.evaluate(() => qa.frame),null);
      await page.waitForTimeout(2500);
      assert.equal(await page.locator('.design-construction').count(),0);
      assert.equal(await page.evaluate(() => qa.frames),0);
    });
    assert.deepEqual(results.pageErrors,[]);
    fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify({status:'passed',checks:results.checks.length,pageErrors:results.pageErrors.length}));
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
