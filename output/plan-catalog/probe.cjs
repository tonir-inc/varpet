// Catalog tab and bundle → Design hand-off, in a real browser against the dev server on :5181.
// Reads the real bundle API (server/developers.mjs from portal/profile). PROBE_MOCK=1 instead serves a mock
// built from apartments/*, faithful to bundles-contract.ts (used before the API landed).
// Run from the worktree root: node output/plan-catalog/probe.cjs
const {chromium}=require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=process.env.PROBE_BASE||'http://127.0.0.1:5181',out=__dirname,realApi=process.env.PROBE_MOCK!=='1';
const bid=id=>realApi?`sample-${id}`:id;
const results={date:new Date().toISOString(),realApi,checks:[],pageErrors:[],consoleErrors:[],screenshots:[],measurements:{}};
const apartments=path.join(__dirname,'../../apartments');
let browser,context,page;
async function check(name,fn){const t=Date.now();await fn();results.checks.push({name,ms:Date.now()-t});console.log('PASS '+name);}
async function shot(name,full=false){await page.waitForTimeout(250);await page.screenshot({path:path.join(out,name),fullPage:full});results.screenshots.push(name);}

const developers=[
 {slug:'sunday-towers',name:'Sunday Towers',city:'Yerevan',tagline:'Arabkir residences',logoUrl:null},
 {slug:'orion',name:'Orion',city:'Yerevan',tagline:'Top-floor apartments',logoUrl:null},
 {slug:'m6',name:'M6 Residences',city:'',tagline:'Plan estimate',logoUrl:null},
];
const sampleSpecs=[
 {id:'sunday-b12121',dir:'sunday-b12121',developerSlug:'sunday-towers',name:'B12121 · floor 12',building:'Sunday Towers · B',bedrooms:3,area:188.6},
 {id:'orion-t7',dir:'orion-t7',developerSlug:'orion',name:'Type 7 · top floor',building:'Orion',bedrooms:3,area:134.0},
 {id:'orion-t8',dir:'orion-t8',developerSlug:'orion',name:'Type 8 · top floor',building:'Orion',bedrooms:2,area:120.6},
 {id:'m6-12-54',dir:'m6-12-54',developerSlug:'m6',name:'M6-12-54 · two balconies',building:null,bedrooms:2,area:76.1},
];
let demoCatalog=[];
function bundleOf(spec){
 const scene=JSON.parse(fs.readFileSync(path.join(apartments,spec.dir,'scene.furnished.json'),'utf8'));
 let assets=[];try{assets=JSON.parse(fs.readFileSync(path.join(apartments,spec.dir,'startup.json'),'utf8')).catalog;}catch{assets=demoCatalog;}
 const ids=new Set(scene.objects.map(o=>o.assetId));
 const catalog=assets.filter(a=>ids.has(a.id)).map(asset=>({asset,priceSource:'catalog · demo price',sizeStatus:'catalog',attribution:'Amazon Berkeley Objects, CC BY 4.0'}));
 const developer=developers.find(d=>d.slug===spec.developerSlug);
 return {id:spec.id,developerSlug:spec.developerSlug,developerName:developer.name,name:spec.name,building:spec.building,bedrooms:spec.bedrooms,area:spec.area,
  blueprintUrl:`/api/bundles/${spec.id}/blueprint`,source:'sample',furnishedPieces:scene.objects.length,updatedAt:'2026-09-27T08:00:00Z',scene,catalog};
}
const summary=({scene,catalog,...rest})=>rest;
let bundles=[];
const requests={bundle:[],designer:[]};

async function fresh({mobile=false,reduced=false,url='/?view=catalog'}={}){
 if(page)await page.close();page=await context.newPage();page.setDefaultTimeout(30000);
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});
 await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 page.on('pageerror',e=>results.pageErrors.push(`${url}: ${e.message}`));
 page.on('console',m=>{if(m.type()==='error')results.consoleErrors.push(m.text().slice(0,300));});
 await page.goto(base+url);
}
async function cardsReady(n){await page.waitForFunction(n=>document.querySelectorAll('.bundle-card.has-model.has-plan').length>=n,n,{timeout:40000});}
async function canvasHash(selector){return page.evaluate(sel=>{const c=document.querySelector(sel);const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=0,lit=0;for(let i=0;i<d.length;i+=4*37){h=(h*31+d[i]+d[i+1]*3+d[i+3]*7)|0;if(d[i+3]>0)lit++;}return {h,lit};},selector);}
async function inDesign(){await page.locator('.design-onboarding').waitFor({state:'visible',timeout:40000});}

(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 context=await browser.newContext();
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com')return route.fulfill({contentType:'text/css',body:''});
  if(url.pathname==='/designer/propose'){
   requests.designer.push(JSON.parse(route.request().postData()||'{}'));
   return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/x-ndjson'},body:JSON.stringify({type:'question',conversationId:'probe',question:'Which bedroom should get the desk?',options:['The small bedroom','The main bedroom']})+'\n'});
  }
  // Real catalog models (ABO originals) load when the network allows; everything else off-site is blocked.
  if(url.hostname==='amazon-berkeley-objects.s3.amazonaws.com')return route.continue();
  if(url.origin!==base)return route.abort();
  if(url.pathname==='/api/account/session')return route.fulfill({json:{user:null}});
  if(url.pathname.startsWith('/api/catalog/'))return route.fulfill({status:502,json:{error:'catalog offline in probe'}});
  if(!realApi){
   if(url.pathname==='/api/developers')return route.fulfill({json:{developers:developers.map(d=>({...d,bundleCount:bundles.filter(b=>b.developerSlug===d.slug).length}))}});
   if(url.pathname==='/api/bundles')return route.fulfill({json:{bundles:bundles.map(summary)}});
   const blueprint=/^\/api\/bundles\/([^/]+)\/blueprint$/.exec(url.pathname);
   if(blueprint){const spec=sampleSpecs.find(s=>s.id===decodeURIComponent(blueprint[1]));return spec?route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(apartments,spec.dir,'source.png'))}):route.fulfill({status:404,json:{error:'No such plan',code:'not_found'}});}
   const one=/^\/api\/bundles\/([^/]+)$/.exec(url.pathname);
   if(one){const id=decodeURIComponent(one[1]);requests.bundle.push(id);const b=bundles.find(x=>x.id===id);return b?route.fulfill({json:{bundle:b}}):route.fulfill({status:404,json:{error:'This plan is no longer in the catalog.',code:'not_found'}});}
  }
  if(url.pathname==='/@vite/client'){const response=await route.fetch();return route.fulfill({response,body:(await response.text()).replace('transport.connect(createHMRHandler(handleMessage));','/* QA HMR disabled */')});}
  return route.continue();
 });

 // The M6 sample uses the editor's demo catalog; read it through the dev server like the app does.
 await fresh({url:'/?view=apartments'});
 demoCatalog=await page.evaluate(async()=>(await import('/src/core/demo.ts')).localCatalog);
 bundles=sampleSpecs.map(bundleOf);

 await fresh();
 await check('Catalog tab is in the shared portal header and marked current',async()=>{
  await page.locator('.portal-nav a').first().waitFor();
  const tabs=await page.locator('.portal-nav a').allTextContents();
  assert.deepEqual(tabs,['Start with a plan','Catalog','Sandbox','Saved apartments']);
  assert.equal(await page.locator('.portal-nav a[aria-current="page"]').textContent(),'Catalog');
 });
 await check('One shelf per developer, each linking to its profile page',async()=>{
  await page.locator('.developer-shelf h2').first().waitFor();
  const shelves=await page.locator('.developer-shelf').evaluateAll(n=>n.map(s=>({name:s.querySelector('h2').textContent,cards:s.querySelectorAll('.bundle-card').length,href:s.querySelector('.developer-profile-link').getAttribute('href')})));
  results.measurements.shelves=shelves;
  assert.equal(shelves.length,3);
  assert.deepEqual(shelves.map(s=>s.href).sort(),['/?developer=m6','/?developer=orion','/?developer=sunday-towers']);
  assert.equal(shelves.find(s=>s.name==='Orion').cards,2);
 });
 await check('Cards draw the plan and the furnished 3D model, with one GL context',async()=>{
  const t=Date.now();await cardsReady(1);results.measurements.firstCardReadyMs=Date.now()-t;
  await page.waitForTimeout(1800);
  const frame=await canvasHash('.bundle-card .furnished-preview-frame');
  assert.ok(frame.lit>200,'model frame has pixels');
  const ink=await canvasHash('.bundle-card .bundle-ink');
  assert.ok(ink.lit>50,'plan ink drawn');
  const stats=await page.evaluate(async()=>(await import('/src/portal/preview.ts')).furnishedPreviewStats());
  results.measurements.desktopPreviewStats=stats;
  assert.ok(stats.contexts<=1&&stats.liveScenes<=6,JSON.stringify(stats));
  assert.equal(await page.evaluate(()=>document.querySelectorAll('canvas').length-document.querySelectorAll('canvas.furnished-preview-frame, canvas.bundle-ink').length),0,'no stray WebGL canvases in the page');
  const count=await page.locator('.bundle-card .portal-card-facts').first().textContent();
  assert.match(count,/bedroom/);
 });
 await shot('01-catalog-desktop.png');
 await check('Hover brings the model to life (slow orbit) and settles on leave',async()=>{
  const card=page.locator('.bundle-card').nth(1);
  await card.scrollIntoViewIfNeeded();await page.waitForTimeout(1500);
  const sel='.bundle-card:nth-of-type(2) .furnished-preview-frame';
  const before=await page.evaluate(()=>{const c=document.querySelectorAll('.furnished-preview-frame')[1];return c.toDataURL().length+':'+c.toDataURL().slice(-200);});
  await card.hover();await page.waitForTimeout(1600);
  assert.ok(await card.evaluate(n=>n.classList.contains('is-active')));
  const during=await page.evaluate(()=>{const c=document.querySelectorAll('.furnished-preview-frame')[1];return c.toDataURL().length+':'+c.toDataURL().slice(-200);});
  assert.notEqual(during,before,'orbit changed the frame');
  await shot('02-catalog-hover.png');
  await page.mouse.move(5,5);await page.waitForTimeout(300);
  assert.ok(!(await card.evaluate(n=>n.classList.contains('is-active'))));
 });
 await check('Bedroom and developer filters, reflected in the URL',async()=>{
  await page.locator('[data-filter="bedrooms"] button',{hasText:'2 bedrooms'}).click();
  assert.equal(await page.locator('.bundle-card').count(),2);
  assert.match(page.url(),/bedrooms=2/);
  assert.match(await page.locator('.catalog-toolbar .portal-result-count').textContent(),/2 plans from 2 developers/);
  await page.locator('[data-filter="developer"] button',{hasText:'Orion'}).click();
  assert.equal(await page.locator('.bundle-card').count(),1);
  assert.match(page.url(),/developer=orion/);
  await page.locator('[data-filter="bedrooms"] button',{hasText:'Studio'}).click();
  await page.locator('.portal-filter-empty').waitFor();
  await page.locator('[data-clear]').click();
  assert.equal(await page.locator('.bundle-card').count(),4);
 });
 await check('Opening a card lands in Design with the developer design, furniture and designer chat',async()=>{
  await page.evaluate(id=>document.querySelector(`.bundle-card[data-bundle-id="${id}"]`).scrollIntoView({block:'center'}),bid('orion-t7'));
  await page.waitForTimeout(1500);
  const t=Date.now();
  await page.locator(`.bundle-card[data-bundle-id="${bid('orion-t7')}"] .bundle-stage`).click();
  await page.locator('.bundle-launch').waitFor({state:'attached'});
  await page.waitForTimeout(180);await shot('03-opening-sheet.png');
  await inDesign();results.measurements.clickToDesignMs=Date.now()-t;
  assert.ok(page.url().endsWith('?bundle='+bid('orion-t7')),page.url());
  assert.equal(await page.locator('#design-heading').textContent(),'Type 7 · top floor');
  assert.match(await page.locator('.design-plan-done').textContent(),/Built by Orion/);
  assert.equal(await page.locator('.design-bundle-plan a').getAttribute('href'),'/?developer=orion');
  assert.ok(await page.evaluate(()=>document.body.classList.contains('editor-arriving')),'tools held back during Design');
  assert.equal(await page.locator('.bundle-launch').count(),0,'sheet removed');
  assert.match(await page.locator('#object-count').textContent(),/^30$/);
  await page.waitForTimeout(1200);
  await shot('04-design-from-bundle.png');
 });
 await check('Designer conversation starts from the bundle design (30 pieces kept) and shows its question',async()=>{
  await page.locator('#design-brief-input').fill('Put a desk in one of the bedrooms.');
  await page.locator('.design-form [type=submit]').click();
  await page.locator('.design-options button',{hasText:'The small bedroom'}).waitFor();
  const request=requests.designer.at(-1);
  assert.equal(request.scene.objects.length,30);
  assert.match(JSON.stringify(request),/desk/);
  await shot('05-design-question.png');
 });
 await check('Customize reveals the full tools with the same scene',async()=>{
  await page.locator('.design-skip').click();
  await page.waitForFunction(()=>!document.body.classList.contains('editor-arriving')&&!document.querySelector('.design-onboarding'));
  await page.waitForTimeout(1900);
  assert.match(await page.locator('#object-count').textContent(),/^30$/);
  await shot('06-customize.png');
 });

 await fresh({url:'/?bundle='+bid('sunday-b12121')});
 await check('Direct /?bundle= route opens in Design',async()=>{
  await inDesign();
  assert.equal(await page.locator('#design-heading').textContent(),'B12121 · floor 12');
  assert.match(await page.locator('#object-count').textContent(),/^54$/);
 });
 await fresh({url:'/?bundle=no-such-plan'});
 await check('A missing bundle shows a retry and a way back, not a blank page',async()=>{
  await page.locator('.bundle-launch.is-error').waitFor();
  assert.match(await page.locator('.bundle-launch-note').textContent(),/no longer in the catalog|could not be found/);
  assert.equal(await page.locator('.bundle-launch-back').getAttribute('href'),'/?view=catalog');
  await shot('07-missing-bundle.png');
 });

 await fresh({mobile:true});
 await check('390 px catalog: no sideways page scroll, cards side by side',async()=>{
  await page.locator('.bundle-card').first().waitFor();
  await page.evaluate(()=>document.querySelector('.bundle-card').scrollIntoView({block:'center'}));
  await cardsReady(1);await page.waitForTimeout(1800);
  const overflow=await page.evaluate(()=>{const h=document.querySelector('#app');return {scroll:h.scrollWidth,client:h.clientWidth,doc:document.documentElement.scrollWidth};});
  results.measurements.mobileOverflow=overflow;
  assert.ok(overflow.scroll<=overflow.client+1&&overflow.doc<=391,JSON.stringify(overflow));
  const panes=await page.locator('.bundle-card').first().locator('.bundle-pane').evaluateAll(n=>n.map(p=>p.getBoundingClientRect().width));
  assert.ok(panes[0]>150&&panes[1]>150,JSON.stringify(panes));
 });
 await shot('08-catalog-mobile.png');
 await page.evaluate(()=>document.querySelector('#app').scrollTo(0,0));await page.waitForTimeout(400);
 await shot('08a-catalog-mobile-top.png');
 await page.evaluate(()=>document.querySelector('#app').scrollTo(0,700));await page.waitForTimeout(1600);
 await shot('09-catalog-mobile-scrolled.png');
 await check('390 px: opening a bundle lands in Design',async()=>{
  await page.evaluate(id=>document.querySelector(`.bundle-card[data-bundle-id="${id}"]`).scrollIntoView({block:'center'}),bid('orion-t8'));
  await page.waitForTimeout(800);
  await page.locator(`.bundle-card[data-bundle-id="${bid('orion-t8')}"] .bundle-open`).click();
  await inDesign();await page.waitForTimeout(1200);
  const brief=await page.locator('.design-brief').boundingBox();
  assert.ok(brief.x>=0&&brief.x+brief.width<=390,JSON.stringify(brief));
  await shot('10-design-mobile.png');
 });

 await fresh({reduced:true});
 await check('Reduced motion: cards appear settled, no sweep, no orbit on hover',async()=>{
  await cardsReady(1);
  const state=await page.locator('.bundle-card').first().evaluate(n=>({opacity:getComputedStyle(n).opacity,swept:n.classList.contains('is-swept'),sweep:getComputedStyle(n.querySelector('.bundle-sweep')).animationName}));
  assert.equal(state.opacity,'1');assert.ok(state.swept);assert.equal(state.sweep,'none');
  await page.waitForTimeout(500);
  const before=await canvasHash('.furnished-preview-frame');
  await page.locator('.bundle-card').first().hover();await page.waitForTimeout(1200);
  assert.deepEqual(await canvasHash('.furnished-preview-frame'),before,'no orbit');
 });
 await shot('11-catalog-reduced-motion.png');
 await check('Reduced motion: opening still lands in Design',async()=>{
  await page.locator('.bundle-card .bundle-open').first().click();
  await inDesign();
 });

 await check('Zero page errors across the run',async()=>{assert.deepEqual(results.pageErrors,[]);});
 results.requests={bundles:requests.bundle.length,designer:requests.designer.length};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 console.log(`${results.checks.length} checks passed; ${results.pageErrors.length} page errors`);
 console.log(JSON.stringify(results.measurements));
 await browser.close();
})().catch(async error=>{
 console.error('FAIL',error);
 try{if(page)await page.screenshot({path:path.join(out,'failure.png')});}catch{}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({...results,failure:String(error&&error.stack||error)},null,2));
 await browser?.close();process.exit(1);
});
