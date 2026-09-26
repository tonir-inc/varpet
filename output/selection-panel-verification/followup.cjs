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
    await click('.designer-collapse');
    await menu('scene'); await click('[data-object="sofa"]'); await click('#close-inspector');
    await click('[data-folio="add"]'); await click('[data-folio="ask"]');
    await check('Ask designer restores and expands Designer from a tool panel',async()=>{
      assert.equal(await page.locator('.left-panel').isVisible(),false);
      assert.equal(await page.locator('.designer-workspace > section').isVisible(),true);
      assert.equal(await page.locator('.designer-collapse').getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('.designer-about').isVisible(),true);
    });
    await page.getByRole('button',{name:'Move the table',exact:true}).click();
    await page.locator('.designer-chat-scroll #proposal .proposal').waitFor();
    await check('recorded proposal stays visible in Designer',async()=>{
      assert.equal(await page.locator('.designer-chat-scroll #proposal .proposal').isVisible(),true);
      assert.equal(await page.locator('.left-panel').isVisible(),false);
    });
    await menu('assistant');
    await check('explicit Assistant keeps existing proposal review reachable',async()=>assert.equal(await page.locator('#assistant-panel #apply-proposal').isVisible(),true));
    await click('#collapse-panel');
    await check('returning to Designer restores recorded proposal actions',async()=>assert.equal(await page.locator('.designer-chat-scroll #apply-proposal').isVisible(),true));
    await click('#reject-proposal');
    await menu('scene'); await click('[data-object="sofa"]');
    await page.locator('[data-object="coffee-table"]').click({modifiers:['Shift']});
    await check('multi-selection uses the same single panel',async()=>{
      assert.equal(await visible(),true);
      assert.equal(await page.locator('#inspector h2').textContent(),'2 objects');
      assert.equal(await page.locator('[data-folio="inspect"]').count(),1);
    });
    await click('#close-inspector'); await click('#collapse-panel'); await click('#plan-view');
    await click('[data-folio="inspect"]');
    await check('Properties toggle works in Plan view',async()=>assert.equal(await visible(),true));
    await click('#perspective'); await click('#preview');
    await check('preview hides editing properties',async()=>assert.equal(await visible(),false));
    await click('#preview');
    await check('preview clears selection without restoring stale properties',async()=>{assert.equal(await visible(),false);assert.equal(await page.locator('[data-folio="inspect"]').isDisabled(),true);});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(__dirname+'/followup-results.json',JSON.stringify({checks,pageErrors:errors},null,2));
    console.log(JSON.stringify({passed:checks.length,pageErrors:errors.length}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
