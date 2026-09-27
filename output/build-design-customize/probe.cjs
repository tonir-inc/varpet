const {chromium}=require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:5196',out=__dirname;
const plan=fs.readFileSync('packages/designer/eval/vision-fixtures/avani-plan.png');
const glb=fs.readFileSync('apps/buyer/public/fixtures/sideboard.glb');
const results={checks:[],pageErrors:[],realModelRequests:[],screenshots:[]};
let browser,context,page,scene;
async function check(name,fn){await fn();results.checks.push(name);console.log('PASS '+name);}
async function screenshot(name){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});await page.screenshot({path:out+'/'+name,fullPage:true});results.screenshots.push(name);}
async function send(kind,event,index=0){await page.evaluate(({kind,event,index})=>window.qaStreams[kind][index].controller.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n')),{kind,event,index});}
async function close(kind,index=0){await page.evaluate(({kind,index})=>window.qaStreams[kind][index].controller.close(),{kind,index});}
async function fresh({mobile=false,reduced=false}={}){
 if(page)await page.close();page=await context.newPage();page.setDefaultTimeout(25000);
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1050});
 await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 page.on('pageerror',e=>results.pageErrors.push(e.message));
 await page.goto(base);
 await page.locator('.blueprint-file-input').setInputFiles({name:'my-plan.png',mimeType:'image/png',buffer:plan});
 await page.waitForFunction(()=>window.qaStreams.flat.length===1&&!document.querySelector('.blueprint-build').disabled);
 scene=await page.evaluate(async()=>{const {demoScene}=await import('/src/core/demo.ts');return {...structuredClone(demoScene),objects:[]};});
 await page.locator('.blueprint-build').click();
 await page.waitForFunction(()=>document.querySelector('.blueprint-flow').classList.contains('is-working'));
 await page.evaluate(()=>{window.qaCanvas=document.querySelector('.bc-viewport canvas');});
}
async function built(){
 await send('flat',{type:'shell',rooms:scene.rooms,walls:scene.walls});
 await send('flat',{type:'project',project:scene});await close('flat');
 await page.locator('.design-onboarding').waitFor({state:'visible'});
}
async function ask(text='Keep the existing shell and add a warm oak sideboard.'){
 await page.locator('#design-brief-input').fill(text);
 await page.locator('.design-form [type=submit]').click();
 await page.waitForFunction(()=>window.qaStreams.design.length>0);
}
async function body(index=0){return page.evaluate(i=>window.qaStreams.design[i].body,index);}
async function proposal(index=0){
 const request=await body(index),id='custom-sideboard-'+(index+1),conversationId='sideboard';
 const asset={id,name:'Oak sideboard',category:'Custom',kind:'cabinet',dimensions:[1.6,.85,.45],color:'#a78059',price:100,source:{type:'gltf',url:`/designer/files/${conversationId}/${id}.glb`}};
 const object={id:'sideboard-'+index,assetId:id,name:'Oak sideboard',position:[-3,0,0],rotation:0,scale:[1,1,1]};
 await send('design',{type:'build',slotId:id,state:'done',glb:asset.source.url},index);
 await send('design',{type:'proposal',conversationId,assets:[asset],proposal:{id:'design-'+index,title:'A warm place to gather',description:'An oak sideboard adds storage while preserving the open floor.',command:{id:'design-command-'+index,label:'Add oak sideboard',source:'designer',baseRevision:request.revision,operations:[{type:'add',object}]}}},index);
 await close('design',index);
 await page.locator('.design-review').waitFor({state:'visible'});
}
async function customized(){await page.waitForFunction(()=>!document.body.classList.contains('editor-arriving')&&!document.querySelector('.design-onboarding'));}
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
 context=await browser.newContext();
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
  if(url.pathname==='/api/account/session')return route.fulfill({json:{user:null}});
  if(url.pathname.startsWith('/designer/files/'))return route.fulfill({contentType:'model/gltf-binary',headers:{'Access-Control-Allow-Origin':'*'},body:glb});
  if(url.pathname==='/api/catalog/search')return route.fulfill({json:{results:[],next_offset:null}});
  if(url.origin!==base||url.pathname.startsWith('/api/')){
   if(url.pathname==='/flat'||url.pathname==='/designer/propose')results.realModelRequests.push(url.href);
   return route.abort();
  }
  if(url.pathname==='/src/main.ts'){const response=await route.fetch();return route.fulfill({response,body:(await response.text())+'\nwindow.qaEditorView=editorView;\n'});}
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
   const record={controller,body:JSON.parse(init.body),aborted:false};window.qaStreams[kind].push(record);
   init?.signal?.addEventListener('abort',()=>{record.aborted=true;try{controller.error(new DOMException('Aborted','AbortError'));}catch{}},{once:true});
   return new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}});
  };
 });
 await fresh();
 await check('Build has three journey steps and completed source drawing',async()=>{
  assert.deepEqual(await page.locator('.blueprint-flow [data-journey]').evaluateAll(nodes=>nodes.map(n=>n.dataset.journey)),['build','design','customize']);
  assert.equal(await page.locator('.blueprint-flow [aria-current=step]').getAttribute('data-journey'),'build');
  assert.match(await page.locator('.blueprint-plan-done').textContent(),/Plan drawn/);
 });
 await screenshot('01-build.png');
 await built();
 await check('Build hands the same canvas to Design, with editing chrome inert',async()=>{
  assert.equal(await page.evaluate(()=>window.qaCanvas===document.querySelector('#viewport canvas')),true);
  assert.equal(await page.locator('.design-onboarding [aria-current=step]').getAttribute('data-journey'),'design');
  assert.equal(await page.locator('.app-header').evaluate(e=>e.inert),true);
 });
 await screenshot('02-design-brief.png');
 await ask();
 await check('Design uses live event request with the reconstructed scene',async()=>{
  const req=await body();assert.equal(req.events,true);assert.equal(req.scene.id,scene.id);assert.equal(req.scene.objects.length,0);
 });
 await send('design',{type:'tool',name:'search_catalog',phase:'start',summary:'Finding an oak sideboard',callId:'catalog-1'});
 await send('design',{type:'build',slotId:'custom-sideboard-1',state:'building'});
 await check('Actual build status is visible without fabricated in-room placement',async()=>{
  await page.locator('.design-construction-build').first().waitFor({state:'visible'});
  assert.equal(await page.locator('.design-construction-drawing g').count(),0);
  assert.match(await page.locator('.design-construction-builds').textContent(),/Building/);
 });
 await screenshot('03-design-building.png');
 await send('design',{type:'build',slotId:'custom-sideboard-1',state:'fixing'});
 await check('Builder refinement updates the same piece status',async()=>{await page.waitForFunction(()=>document.querySelector('.design-construction-builds')?.textContent.includes('Refining'));});
 await page.evaluate(()=>{window.qaDesignPose=window.qaEditorView.cameraPose();});
 await proposal();
 await check('Checked proposal previews with explicit Use this design',async()=>{
  assert.match(await page.locator('.design-review').textContent(),/Use this design/);
  const pose=await page.evaluate(()=>window.qaEditorView.cameraPose());
  const before=await page.evaluate(()=>window.qaDesignPose);assert.deepEqual(pose.position,before.position);assert.deepEqual(pose.target,before.target);
  assert.equal(await page.locator('#object-count').textContent(),'0');
 });
 await screenshot('04-design-review.png');
 await page.locator('.design-apply').click();await customized();
 await check('Customize applies once, reveals controls and preserves the world/conversation',async()=>{
  assert.equal(await page.locator('#object-count').textContent(),'1');
  assert.equal(await page.locator('.app-header').evaluate(e=>e.inert),false);
  assert.equal(await page.evaluate(()=>window.qaCanvas===document.querySelector('#viewport canvas')),true);
  assert.match(await page.locator('.designer-column').textContent(),/A warm place to gather/);
 });
 await screenshot('05-customize.png');
 await page.locator('#undo').click();
 await check('Initial design is one undoable edit',async()=>{await page.waitForFunction(()=>document.querySelector('#object-count').textContent==='0');});
 await fresh({mobile:true,reduced:true});await built();
 await check('Mobile reduced-motion Design keeps actions inside the viewport',async()=>{
  const rect=await page.locator('.design-skip').boundingBox();assert.ok(rect&&rect.y>=0&&rect.y+rect.height<=844);
 });
 await screenshot('06-mobile-design.png');
 await ask('Add a cabinet, keeping the shell unchanged.');
 await send('design',{type:'build',slotId:'custom-sideboard-1',state:'failed',reason:'The model needs another attempt.'});
 await send('design',{type:'error',message:'The model needs another attempt.'});await close('design');
 await check('Failure preserves the brief and makes retry/skip available',async()=>{
  await page.locator('.design-form').waitFor({state:'visible'});
  assert.equal(await page.locator('#design-brief-input').inputValue(),'Add a cabinet, keeping the shell unchanged.');
  assert.match(await page.locator('.design-response').textContent(),/another attempt/);
 });
 await screenshot('07-mobile-retry.png');
 await page.locator('.design-form [type=submit]').click();await page.waitForFunction(()=>window.qaStreams.design.length===2);
 await page.locator('.design-skip').click();await customized();
 await check('Skip during retry aborts design and opens unchanged apartment',async()=>{
  assert.equal(await page.evaluate(()=>window.qaStreams.design[1].aborted),true);
  assert.equal(await page.locator('#object-count').textContent(),'0');
 });
 await screenshot('08-mobile-customize.png');
 assert.deepEqual(results.pageErrors,[]);assert.deepEqual(results.realModelRequests,[]);
 console.log(`${results.checks.length} checks passed; zero page errors; zero live model requests`);
})().catch(async error=>{results.error=error.stack;console.error(error);try{results.body=await page.locator('body').innerText();await screenshot('failure.png');}catch{}process.exitCode=1;}).finally(async()=>{fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser?.close();});
