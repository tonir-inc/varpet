const {chromium} = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const baseURL = 'http://127.0.0.1:60517';
const executablePath = '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
(async () => {
  const browser = await chromium.launch({headless:true, executablePath});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const errors = [], checks = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL || url.pathname.startsWith('/api/')) return route.abort();
    if (url.pathname === '/') return route.fulfill({contentType:'text/html', body:`<!doctype html><html><head><title>Selection panel verification</title></head><body><div id="app"></div><script type="module">
      import {demoScene,localCatalog} from '/src/core/demo.ts';
      import {setEditorSession} from '/src/portal/session.ts';
      import {databaseCatalog} from '/src/adapters/database-catalog.ts';
      databaseCatalog.search = async () => ({products:[],excluded:0,nextOffset:null});
      databaseCatalog.resolve = async () => [];
      setEditorSession({scene:structuredClone(demoScene),catalog:localCatalog.map(asset=>({asset,priceSource:'QA',sizeStatus:'QA',attribution:'QA'})),user:null,apartment:null,templateId:null});
      window.qaScene=demoScene;
      await import('/src/main.ts');
    </script></body></html>`});
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const check = async (name, fn) => {await fn(); checks.push(name); console.log('PASS '+name);};
  const click = selector => page.locator(selector).click();
  const menu = async action => {await click('[data-folio="more"]'); await click(`[data-folio="panel:${action}"]`);};
  const selectedName = () => page.locator('#selected-name').textContent();
  const visible = () => page.locator('.right-panel').isVisible();
  const selectEntity = async id => {
    await menu('renovation');
    await page.locator(`[data-action="select"][data-id="${id}"]`).first().click();
  };
  try {
    await page.goto(baseURL);
    await page.locator('.folio-edit-tools').waitFor();
    await check('one Properties toggle, initially disabled with no selection', async()=>{
      assert.equal(await page.locator('[data-folio="inspect"]').count(),1);
      assert.equal(await page.locator('[data-folio="inspect"]').isDisabled(),true);
      assert.equal(await visible(),false);
    });
    await menu('scene');
    await check('general tools use the left workspace', async()=>{
      const rect = await page.locator('.left-panel').boundingBox();
      const viewport = await page.locator('.viewport-shell').boundingBox();
      assert(rect.x + rect.width <= viewport.x + 1);
      assert.equal(await page.locator('.designer-workspace > section').isVisible(),false);
    });
    await click('[data-object="sofa"]');
    await check('single furniture selection opens current properties alongside left tools',async()=>{
      assert.equal(await visible(),true);
      assert.equal(await page.locator('#object-name').inputValue(),await selectedName());
      assert.equal(await page.locator('[data-folio="inspect"]').count(),1);
    });
    await click('[data-folio="inspect"]');
    await check('toggle closes without deselecting; repeated selection respects closing',async()=>{
      assert.equal(await visible(),false);
      assert((await selectedName()).includes('sofa'));
      await click('[data-object="sofa"]');
      assert.equal(await visible(),false);
      assert.equal(await page.locator('[data-folio="inspect"]').getAttribute('aria-expanded'),'false');
    });
    await click('[data-folio="inspect"]');
    await check('toggle reopens current selection and close button preserves it',async()=>{
      assert.equal(await visible(),true);
      await click('#close-inspector');
      assert.equal(await visible(),false);
      assert.equal(await page.locator('[data-folio="inspect"]').evaluate(e=>e===document.activeElement),true);
      assert((await selectedName()).includes('sofa'));
    });
    await click('[data-object="coffee-table"]');
    await check('new selection replaces and reopens properties',async()=>{
      assert.equal(await visible(),true);
      assert.equal(await page.locator('#object-name').inputValue(),await selectedName());
      assert(!(await selectedName()).includes('sofa'));
    });
    const info = await page.evaluate(()=>({room:qaScene.rooms[0],wall:qaScene.walls.find(w=>w.openings.some(o=>o.kind==='window')),otherRoom:qaScene.rooms[1]}));
    await selectEntity(info.room.id);
    await click('#collapse-panel');
    await check('room properties contain no unselected openings',async()=>{
      assert.equal(await visible(),true);
      assert.equal(await page.locator('#inspector h2').textContent(),info.room.name);
      assert.equal(await page.locator('[data-select-opening]').count(),0);
      assert.equal(await page.locator('.designer-workspace > section').isVisible(),true);
    });
    await page.screenshot({path:__dirname+'/room-properties.png'});
    const opening = info.wall.openings.find(o=>o.kind==='window');
    await selectEntity(opening.id);
    await check('window properties replace room controls and omit other-window batch actions',async()=>{
      assert.equal(await visible(),true);
      assert.equal(await page.locator('#inspector-opening').count(),1);
      assert.equal(await page.locator('[data-window-match]').count(),0);
      assert.equal(await page.locator('#inspector [data-finish]').count(),0);
    });
    await click('#collapse-panel');
    await click('[data-folio="quote"]');
    await check('costs use one centered native modal with focus containment',async()=>{
      assert.equal(await page.locator('#folio-costs').evaluate(e=>e.matches(':modal')),true);
      const r = await page.locator('#folio-costs').boundingBox(); assert(Math.abs(r.x+r.width/2-720)<2);
      assert.equal(await page.locator('#folio-costs').evaluate(e=>e.contains(document.activeElement)),true);
    });
    const nameBeforeEscape = await selectedName();
    await page.keyboard.press('Escape');
    await check('closing costs with Escape preserves selection and properties',async()=>{
      assert.equal(await page.locator('#folio-costs').isVisible(),false);
      assert.equal(await selectedName(),nameBeforeEscape); assert.equal(await visible(),true);
      assert.equal(await page.locator('.folio-quote').evaluate(e=>e===document.activeElement),true);
    });
    await menu('scene');
    await click('[data-object="coffee-table"]');
    await page.locator('#object-name').fill('QA table'); await page.locator('#object-name').press('Tab');
    await click('#close-inspector'); await click('#undo');
    await check('undo refresh does not reopen closed properties',async()=>assert.equal(await visible(),false));
    await click('[data-folio="inspect"]'); await click('#delete');
    await check('deleting selected object clears properties and disables toggle',async()=>{
      assert.equal(await visible(),false); assert.equal(await page.locator('#inspector').textContent(),'');
      assert.equal(await page.locator('[data-folio="inspect"]').isDisabled(),true);
    });
    await selectEntity(info.room.id); await click('#collapse-panel');
    await page.emulateMedia({reducedMotion:'reduce'});
    await click('[data-folio="inspect"]'); await click('[data-folio="inspect"]');
    await check('reduced motion preserves toggle and selection',async()=>assert.equal(await visible(),true));
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:__dirname+'/mobile-properties.png'});
    await check('narrow screen properties and close control stay within viewport',async()=>{
      const r = await page.locator('.right-panel').boundingBox(); assert(r.x>=0 && r.x+r.width<=390 && r.y>=0 && r.y+r.height<=844);
      assert.equal(await page.locator('#close-inspector').isVisible(),true);
    });
    await page.keyboard.press('Escape');
    await check('Escape clears selection and stale panel content',async()=>{
      assert.equal(await visible(),false); assert.equal(await page.locator('#inspector').textContent(),'');
    });
    assert.deepEqual(errors,[]);
    fs.writeFileSync(__dirname+'/results.json',JSON.stringify({checks,pageErrors:errors},null,2));
    console.log(JSON.stringify({passed:checks.length,pageErrors:errors.length}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
