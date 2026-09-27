// Developer profiles: public profile, studio create/edit, upload → Build → Design → Customize → Publish → public profile
// and GET /api/bundles, unpublish; desktop + 390 px mobile, reduced motion, zero page errors.
// The architect (/flat) and designer (/designer/propose) streams are intercepted in the page; no model runs.
// The editor hook is injected into /src/main.ts exactly as proposed for integration (see HOOK below).
// Run from the repo root with the dev server on 5182: node output/developer-profiles/probe.cjs
const {chromium}=require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base=process.env.PROFILE_URL||'http://localhost:5182',out=__dirname;
const plan=fs.readFileSync('packages/designer/eval/vision-fixtures/avani-plan.png');
const glb=fs.readFileSync('apps/buyer/public/fixtures/sideboard.glb');
const HOOK=`
import { installDeveloperPublish } from '/src/portal/developer-publish.ts';
installDeveloperPublish({ scene: () => store.scene, products: () => [...catalogProducts.values()], revision: () => store.revision, notify });
`;
const results={checks:[],pageErrors:[],consoleErrors:[],realModelRequests:[],screenshots:[],started:new Date().toISOString()};
const email=`studio-${Date.now()}@example.test`,slug=`probe-homes-${Date.now().toString(36)}`;
let browser,context,page;
async function check(name,fn){await fn();results.checks.push(name);console.log('PASS '+name);}
async function settle(){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});}
async function screenshot(name){await settle();await page.waitForTimeout(250);
 // The portal scrolls inside #app: grow the viewport to the content for a full-length capture, then restore it.
 const size=page.viewportSize();
 const height=await page.evaluate(()=>{const app=document.querySelector('#app.portal-host');return app?app.scrollHeight:0;});
 if(height>size.height){await page.setViewportSize({width:size.width,height});await page.waitForTimeout(400);}
 await page.screenshot({path:out+'/'+name});
 if(height>size.height)await page.setViewportSize(size);
 results.screenshots.push(name);}
async function send(kind,event,index=0){await page.evaluate(({kind,event,index})=>window.qaStreams[kind][index].controller.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n')),{kind,event,index});}
async function close(kind,index=0){await page.evaluate(({kind,index})=>window.qaStreams[kind][index].controller.close(),{kind,index});}
async function fresh({mobile=false,reduced=false}={}){
 if(page)await page.close();page=await context.newPage();page.setDefaultTimeout(25000);
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});
 await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 page.on('pageerror',e=>results.pageErrors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))results.consoleErrors.push(m.text());});
}
const noOverflow=()=>page.evaluate(()=>{const app=document.querySelector('#app');const main=document.querySelector('.portal-main');return {app:app.scrollWidth-app.clientWidth,main:main?main.scrollWidth-main.clientWidth:0,doc:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
const api=async path=>(await context.request.get(base+path)).json();

(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
 context=await browser.newContext({deviceScaleFactor:1});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com')return route.fulfill({contentType:'text/css',body:''});
  if(url.pathname.startsWith('/designer/files/'))return route.fulfill({contentType:'model/gltf-binary',headers:{'Access-Control-Allow-Origin':'*'},body:glb});
  if(url.pathname==='/api/catalog/search')return route.fulfill({json:{results:[],next_offset:null}});
  if(url.origin!==base){
   if(url.pathname==='/flat'||url.pathname==='/designer/propose')results.realModelRequests.push(url.href);
   // Model files for sample furniture (S3 originals) are not needed for these checks.
   return route.abort();
  }
  if(url.pathname==='/src/main.ts'){const response=await route.fetch();return route.fulfill({response,body:(await response.text())+HOOK+'\nwindow.qaEditorView=editorView;\n'});}
  if(url.pathname==='/@vite/client'){const response=await route.fetch();return route.fulfill({response,body:(await response.text()).replace('transport.connect(createHMRHandler(handleMessage));','/* QA HMR disabled */')});}
  return route.continue();
 });
 await context.addInitScript(()=>{
  window.qaStreams={flat:[],design:[]};
  const fetch=window.fetch;
  window.fetch=async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input.url,location.href);
   const kind=url.pathname==='/flat'?'flat':url.pathname==='/designer/propose'?'design':null;
   if(!kind)return fetch(input,init);
   let controller;
   const stream=new ReadableStream({start(c){controller=c;}});
   const record={controller,body:init?.body&&typeof init.body==='string'?JSON.parse(init.body):null,aborted:false};window.qaStreams[kind].push(record);
   init?.signal?.addEventListener('abort',()=>{record.aborted=true;try{controller.error(new DOMException('Aborted','AbortError'));}catch{}},{once:true});
   return new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}});
  };
 });

 // ---------------------------------------------------------------- public sample profile
 await fresh();
 await page.goto(base+'/?developer=orion');
 await check('Public profile shows the developer header and its bundles, each linking to bundleHref',async()=>{
  await page.locator('#dev-name').waitFor();
  assert.equal(await page.locator('#dev-name').textContent(),'Orion');
  assert.equal(await page.locator('.dev-card').count(),2);
  assert.deepEqual(await page.locator('.dev-card-open').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),['/?bundle=sample-orion-t7','/?bundle=sample-orion-t8']);
  assert.match(await page.locator('.dev-about').textContent(),/sample collection/i);
  assert.equal(await page.locator('.portal-nav [aria-current]').count(),0);
 });
 await check('Each card shows the original plan image and a 3D model',async()=>{
  await page.waitForFunction(()=>[...document.querySelectorAll('.dev-card-plan img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.waitForFunction(()=>document.querySelectorAll('.dev-card-3d.is-ready canvas').length===2,null,{timeout:30000});
 });
 await screenshot('01-public-orion-desktop.png');
 await page.goto(base+'/?developer=no-such-developer');
 await check('Unknown developer shows a not-found state',async()=>{await page.getByText('This developer profile isn’t here.').waitFor();});

 // ---------------------------------------------------------------- studio: signed out, create, edit
 await page.goto(base+'/?view=studio');
 await check('Studio invites a signed-out visitor to create an account',async()=>{await page.getByRole('heading',{name:'Show buyers what your plans can become.'}).waitFor();});
 const auth=await context.request.post(base+'/api/account/register',{headers:{Origin:base},data:{name:'Probe Studio',email,password:'a long private password'}});
 assert.equal(auth.status(),201);
 await page.goto(base+'/?view=studio');
 await check('Studio create form: the address follows the name and the preview updates live',async()=>{
  await page.getByRole('heading',{name:'Create your developer profile'}).waitFor();
  await page.locator('[name=name]').fill('Probe Homes');
  assert.equal(await page.locator('[name=slug]').inputValue(),'probe-homes');
  assert.equal(await page.locator('.dev-create-live .dev-name').textContent(),'Probe Homes');
  await page.locator('[name=slug]').fill(slug);
  await page.locator('[name=name]').fill('Probe Homes Ltd');
  assert.equal(await page.locator('[name=slug]').inputValue(),slug,'an edited address stops following the name');
  await page.locator('[name=city]').fill('Yerevan');
  await page.locator('[name=tagline]').fill('Bright homes near the park');
  await page.locator('[name=website]').fill('probe.example');
  await page.locator('[name=about]').fill('We build calm, bright homes with generous balconies.');
  assert.equal(await page.locator('.dev-create-live .dev-tagline').textContent(),'Bright homes near the park');
 });
 await screenshot('02-studio-create-desktop.png');
 await page.locator('.dev-profile-submit').click();
 await check('Creating the profile opens the studio with an upload action and no plans yet',async()=>{
  await page.locator('.dev-upload-button').waitFor();
  assert.equal(await page.locator('#dev-name').textContent(),'Probe Homes Ltd');
  assert.match(await page.locator('.dev-empty').textContent(),/No published plans yet/);
  assert.equal(await page.locator('.dev-meta a').getAttribute('href'),'https://probe.example/');
 });
 await page.locator('[data-edit-profile]').click();
 await check('Edit profile saves through the owner API',async()=>{
  await page.locator('.dev-edit-dialog [name=tagline]').fill('Bright homes, drawn to be lived in');
  await page.locator('.dev-edit-dialog .dev-profile-submit').click();
  await page.locator('.dev-edit-dialog').waitFor({state:'detached'});
  assert.equal(await page.locator('.dev-tagline').textContent(),'Bright homes, drawn to be lived in');
  assert.equal((await api('/api/developers/'+slug)).developer.tagline,'Bright homes, drawn to be lived in');
 });
 await screenshot('03-studio-empty-desktop.png');

 // ---------------------------------------------------------------- upload → Build → Design → Customize → Publish
 await page.locator('.dev-upload-button').click();
 await check('Upload uses the blueprint landing in developer context',async()=>{
  await page.waitForURL(/view=studio&upload/);
  await page.getByRole('heading',{name:/Add a plan to your profile/}).waitFor();
  assert.equal(await page.locator('.blueprint-samples').count(),0);
  assert.match(await page.locator('#blueprint-upload-notice').textContent(),/may publish/);
  assert.equal(await page.locator('.dev-upload-back').getAttribute('href'),'/?view=studio');
 });
 await page.locator('.blueprint-file-input').setInputFiles({name:'type-a-plan.png',mimeType:'image/png',buffer:plan});
 await page.waitForFunction(()=>window.qaStreams.flat.length===1&&!document.querySelector('.blueprint-build').disabled);
 await screenshot('04-upload-selected-desktop.png');
 const scene=await page.evaluate(async()=>{const {demoScene}=await import('/src/core/demo.ts');return {...structuredClone(demoScene),objects:[]};});
 await page.locator('.blueprint-build').click();
 await page.waitForFunction(()=>document.querySelector('.blueprint-flow').classList.contains('is-working'));
 await check('Build step is current while the architect streams',async()=>{
  assert.equal(await page.locator('.blueprint-flow [aria-current=step]').getAttribute('data-journey'),'build');
 });
 await send('flat',{type:'shell',rooms:scene.rooms,walls:scene.walls});
 await send('flat',{type:'project',project:scene});await close('flat');
 await page.locator('.design-onboarding').waitFor({state:'visible'});
 await check('Design opens after Build with the editor chrome held back',async()=>{
  assert.equal(await page.locator('.design-onboarding [aria-current=step]').getAttribute('data-journey'),'design');
  assert.equal(await page.locator('.app-header').evaluate(e=>e.inert),true);
  assert.equal(await page.locator('#developer-publish').count(),1,'the publish action is installed with the editor');
 });
 await page.locator('#design-brief-input').fill('Add a warm oak sideboard in the living room.');
 await page.locator('.design-form [type=submit]').click();
 await page.waitForFunction(()=>window.qaStreams.design.length>0);
 const request=await page.evaluate(()=>window.qaStreams.design[0].body);
 const asset={id:'custom-sideboard-1',name:'Oak sideboard',category:'Custom',kind:'cabinet',dimensions:[1.6,.85,.45],color:'#a78059',price:100,source:{type:'gltf',url:'/designer/files/sideboard/custom-sideboard-1.glb'}};
 const object={id:'sideboard-0',assetId:asset.id,name:'Oak sideboard',position:[-3,0,0],rotation:0,scale:[1,1,1]};
 await send('design',{type:'build',slotId:asset.id,state:'done',glb:asset.source.url});
 await send('design',{type:'proposal',conversationId:'sideboard',assets:[asset],proposal:{id:'design-0',title:'A warm place to gather',description:'An oak sideboard adds storage while preserving the open floor.',command:{id:'design-command-0',label:'Add oak sideboard',source:'designer',baseRevision:request.revision,operations:[{type:'add',object}]}}});
 await close('design');
 await page.locator('.design-review').waitFor({state:'visible'});
 await page.locator('.design-apply').click();
 await page.waitForFunction(()=>!document.body.classList.contains('editor-arriving')&&!document.querySelector('.design-onboarding'));
 await check('Customize reveals the editor with Publish to profile in the header',async()=>{
  assert.equal(await page.locator('#object-count').textContent(),'1');
  assert.equal(await page.locator('.app-header').evaluate(e=>e.inert),false);
  await page.locator('#developer-publish').waitFor({state:'visible'});
  assert.match(await page.locator('#developer-publish').textContent(),/Publish to profile/);
 });
 await screenshot('05-customize-publish-action-desktop.png');
 await page.locator('#developer-publish').click();
 await check('Publish dialog shows the original plan and prefilled facts from the model',async()=>{
  await page.locator('.developer-publish-dialog').waitFor();
  await page.waitForFunction(()=>document.querySelector('.developer-publish-plan img')?.naturalWidth>0);
  assert.equal(await page.locator('.developer-publish-dialog [name=bedrooms]').inputValue(),'1');
  assert.ok(Number(await page.locator('.developer-publish-dialog [name=area]').inputValue())>20);
  await page.locator('.developer-publish-dialog [name=name]').fill('Type A · 3rd floor');
  await page.locator('.developer-publish-dialog [name=building]').fill('Riverside');
 });
 await screenshot('06-publish-dialog-desktop.png');
 await page.locator('.developer-publish-submit').click();
 let published;
 await check('Publishing sends the scene, its catalog products and the plan; the bundle is listed',async()=>{
  await page.locator('.developer-publish-done').waitFor({state:'visible'});
  assert.equal(await page.locator('.developer-publish-done [data-profile]').getAttribute('href'),'/?developer='+slug);
  const {bundles}=await api('/api/bundles?developer='+slug);
  assert.equal(bundles.length,1);
  published=bundles[0];
  assert.equal(published.name,'Type A · 3rd floor');assert.equal(published.building,'Riverside');assert.equal(published.source,'published');assert.equal(published.furnishedPieces,1);
  assert.ok((await api('/api/bundles')).bundles.some(b=>b.id===published.id));
  const {bundle}=await api('/api/bundles/'+published.id);
  assert.deepEqual(bundle.catalog.map(p=>p.asset.id),['custom-sideboard-1']);
  assert.equal(bundle.scene.objects[0].assetId,'custom-sideboard-1');
  assert.ok(bundle.scene.project.sources.some(s=>s.kind==='plan'),'the plan evidence stays with the scene');
  const image=await context.request.get(base+bundle.blueprintUrl);
  assert.equal(image.headers()['content-type'],'image/png');
  const bytes=await image.body();assert.deepEqual([...bytes.subarray(0,4)],[0x89,0x50,0x4e,0x47]);
  assert.match(await page.locator('#developer-publish').textContent(),/Published/);
 });
 await screenshot('07-published-desktop.png');
 await page.locator('.developer-publish-done [data-close]').click();
 await page.locator('#undo').click();
 await check('A later edit turns the action into Update on profile, which replaces the bundle',async()=>{
  await page.waitForFunction(()=>/Update on profile/.test(document.querySelector('#developer-publish').textContent));
  await page.locator('#developer-publish').click();
  await page.locator('.developer-publish-dialog [name=name]').fill('Type A · 3rd floor · empty');
  await page.locator('.developer-publish-submit').click();
  await page.locator('.developer-publish-done').waitFor({state:'visible'});
  const {bundles}=await api('/api/bundles?developer='+slug);
  assert.equal(bundles.length,1);assert.equal(bundles[0].id,published.id);assert.equal(bundles[0].furnishedPieces,0);
  await page.locator('.developer-publish-done [data-close]').click();
  await page.locator('#redo').click();
  await page.locator('#developer-publish').click();
  await page.locator('.developer-publish-dialog [name=name]').fill('Type A · 3rd floor');
  await page.locator('.developer-publish-submit').click();
  await page.locator('.developer-publish-done').waitFor({state:'visible'});
  assert.equal((await api('/api/bundles/'+published.id)).bundle.furnishedPieces,1);
 });

 // ---------------------------------------------------------------- public profile shows it; unpublish
 await page.goto(base+'/?developer='+slug);
 await check('The published bundle appears on the public profile with plan and 3D',async()=>{
  await page.locator('.dev-card').waitFor();
  assert.equal(await page.locator('.dev-card-open').getAttribute('href'),'/?bundle='+published.id);
  await page.waitForFunction(()=>document.querySelector('.dev-card-plan img')?.naturalWidth>0);
  await page.waitForFunction(()=>document.querySelector('.dev-card-3d.is-ready canvas'),null,{timeout:30000});
  assert.match(await page.locator('.dev-hero-actions').textContent(),/Manage in studio/,'the owner sees a studio link');
 });
 await screenshot('08-public-published-desktop.png');
 await page.goto(base+'/?view=studio');
 await page.locator('.dev-card').waitFor();
 await screenshot('09-studio-with-plan-desktop.png');
 await page.locator('[data-unpublish]').click();
 await page.locator('.dev-confirm-dialog').waitFor();
 await check('Unpublish asks first, then removes the bundle from the profile and the API',async()=>{
  await page.locator('.dev-confirm-dialog [data-confirm]').click();
  await page.locator('.dev-empty').waitFor();
  assert.equal((await api('/api/bundles?developer='+slug)).bundles.length,0);
  assert.equal((await context.request.get(base+'/api/bundles/'+published.id)).status(),404);
 });

 // ---------------------------------------------------------------- mobile 390 px and reduced motion
 await fresh({mobile:true});
 await page.goto(base+'/?developer=sunday-towers');
 await check('Mobile public profile: no horizontal overflow in the page, card links hit-testable',async()=>{
  await page.locator('.dev-card').waitFor();
  await page.waitForFunction(()=>document.querySelector('.dev-card-3d.is-ready canvas'),null,{timeout:30000});
  const overflow=await noOverflow();assert.ok(overflow.main<=0&&overflow.doc<=0,JSON.stringify(overflow));
  const card=page.locator('.dev-card-open');await card.scrollIntoViewIfNeeded();
  const box=await card.boundingBox();
  const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.dev-card-open')?.getAttribute('href'),{x:box.x+box.width/2,y:box.y+60});
  assert.equal(hit,'/?bundle=sample-sunday-b12121');
 });
 await screenshot('10-public-sunday-mobile.png');
 await page.goto(base+'/?view=studio');
 await page.locator('.dev-upload-button').waitFor();
 await check('Mobile studio: upload action visible and full width',async()=>{
  const overflow=await noOverflow();assert.ok(overflow.main<=0&&overflow.doc<=0,JSON.stringify(overflow));
  const box=await page.locator('.dev-upload-button').boundingBox();assert.ok(box.width>300,String(box.width));
 });
 await screenshot('11-studio-mobile.png');
 await page.goto(base+'/?view=studio&upload');
 await page.getByRole('heading',{name:/Add a plan to your profile/}).waitFor();
 await check('Mobile upload page keeps the back link clear of the heading',async()=>{
  const back=await page.locator('.dev-upload-back').boundingBox(),heading=await page.locator('#blueprint-title').boundingBox();
  assert.ok(back.y+back.height<=heading.y,JSON.stringify({back,heading}));
 });
 await screenshot('12-upload-mobile.png');
 await fresh({mobile:true,reduced:true});
 await page.goto(base+'/?developer=orion');
 await check('Reduced motion: profile content appears without decorative animation',async()=>{
  await page.locator('.dev-card').first().waitFor();
  const running=await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.target?.closest?.('.dev-hero, .dev-card, .dev-about')&&!a.effect.target.classList.contains('developer-spinner')).length);
  assert.equal(running,0);
  assert.equal(await page.locator('.dev-hero').evaluate(e=>getComputedStyle(e).opacity),'1');
  assert.equal(await page.locator('.dev-hero-frame rect').evaluate(e=>getComputedStyle(e).strokeDashoffset),'0px');
 });
 await screenshot('13-public-orion-mobile-reduced.png');
 await fresh({reduced:true});
 await page.goto(base+'/?developer=m6');
 await page.locator('.dev-card').waitFor();
 await page.waitForFunction(()=>document.querySelector('.dev-card-3d.is-ready canvas'),null,{timeout:30000});
 await screenshot('14-public-m6-desktop-reduced.png');

 // Development test states run in the studio too: the checked Avani result opens the editor with Publish.
 await fresh();
 await page.goto(base+'/?view=studio&upload&blueprintTest=complete');
 await check('Blueprint test state "complete" from the studio opens the editor with Publish to profile',async()=>{
  await page.locator('#developer-publish').waitFor({state:'visible',timeout:40000});
  await page.waitForFunction(()=>!document.body.classList.contains('editor-arriving'));
  await page.locator('#developer-publish').click();
  await page.waitForFunction(()=>document.querySelector('.developer-publish-plan img')?.naturalWidth>0);
  assert.equal(await page.locator('.developer-publish-submit').isDisabled(),false);
  assert.match(await page.locator('.developer-publish-top').textContent(),/Probe Homes Ltd/);
  await page.locator('.developer-publish-dialog [data-close]').first().click();
  assert.equal((await api('/api/bundles?developer='+slug)).bundles.length,0,'closing the dialog publishes nothing');
 });
 await screenshot('15-test-state-editor-publish-desktop.png');

 await fresh({mobile:true});
 await page.goto(base+'/?view=studio&upload&blueprintTest=complete');
 await check('Mobile editor: the publish action fits the header and its dialog fits the screen',async()=>{
  await page.locator('#developer-publish').waitFor({state:'visible',timeout:40000});
  await page.waitForFunction(()=>!document.body.classList.contains('editor-arriving'));
  const box=await page.locator('#developer-publish').boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=390,JSON.stringify(box));
  const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('#developer-publish')!==null,{x:box.x+box.width/2,y:box.y+box.height/2});
  assert.equal(hit,true);
  await page.locator('#developer-publish').click();
  const dialog=await page.locator('.developer-publish-dialog').boundingBox();
  assert.ok(dialog.x>=0&&dialog.x+dialog.width<=390,JSON.stringify(dialog));
  await page.waitForFunction(()=>document.querySelector('.developer-publish-plan img')?.naturalWidth>0);
 });
 await settle();await page.screenshot({path:out+'/16-publish-dialog-mobile.png'});results.screenshots.push('16-publish-dialog-mobile.png');

 await check('Zero page errors and zero live model requests',async()=>{
  assert.deepEqual(results.pageErrors,[]);
  assert.deepEqual(results.realModelRequests,[]);
 });
})().catch(error=>{results.failure=String(error.stack||error);console.error(error);process.exitCode=1;}).finally(async()=>{
 results.finished=new Date().toISOString();
 fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,1));
 console.log(`${results.checks.length} checks passed; ${results.pageErrors.length} page errors; ${results.consoleErrors.length} console errors; ${results.realModelRequests.length} live model requests`);
 await browser?.close();
});
