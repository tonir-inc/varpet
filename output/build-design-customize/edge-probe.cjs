const {chromium}=require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:5196',out=__dirname;
const plan=fs.readFileSync('packages/designer/eval/vision-fixtures/avani-plan.png');
const glb=fs.readFileSync('apps/buyer/public/fixtures/sideboard.glb');
const results={checks:[],pageErrors:[],realModelRequests:[],screenshots:[]};
let browser,context,page,scene;
async function check(name,fn){await fn();results.checks.push(name);console.log('PASS '+name);}
async function screenshot(name){await page.screenshot({path:out+'/'+name,fullPage:true});results.screenshots.push(name);}
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
  if(url.pathname==='/src/main.ts'){const response=await route.fetch();return route.fulfill({response,body:(await response.text())+'\nwindow.qaEditorView=editorView;window.qaRefresh=refresh;window.qaScene=()=>store.scene;window.qaRevision=()=>store.revision;const qaSetScene=viewport.setScene.bind(viewport);viewport.setScene=(s,c)=>{window.qaProjectedScene=s;return qaSetScene(s,c);};\n'});}
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
 await fresh({reduced:true});await built();
 await check('Guided keyboard shortcuts cannot expose editing tools',async()=>{
  await page.mouse.click(10,160);
  for(const key of ['p','Escape','1','2','6','Meta+z','Meta+s'])await page.keyboard.press(key);
  assert.equal(await page.locator('.app-header').evaluate(e=>e.inert),true);
  assert.equal(await page.locator('.design-onboarding').count(),1);
  assert.equal(await page.locator('#object-count').textContent(),'0');
  assert.equal(await page.locator('dialog[open]').count(),0);
 });
 await ask('Help me find a style.');
 await send('design',{type:'question',conversationId:'sideboard',question:'Which style feels like home?',options:['Warm and simple','Light and minimal']});await close('design');
 await check('Designer question offers actionable choices',async()=>{await page.locator('.design-options button').first().waitFor({state:'visible'});assert.equal(await page.locator('.design-options button').count(),2);});
 await page.locator('.design-options button').first().click();await page.waitForFunction(()=>window.qaStreams.design.length===2);
 await check('A choice continues the same conversation',async()=>{const req=await body(1);assert.equal(req.conversationId,'sideboard');assert.equal(req.request,'Warm and simple');});
 for(const index of [1,2]){
  if(index===2){await page.locator('.design-form [type=submit]').click();await page.waitForFunction(()=>window.qaStreams.design.length===3);}
  await send('design',{type:'error',message:'Please try once more.'},index);await close('design',index);
  await check('Error remains readable on attempt '+index,async()=>{await page.locator('.design-response').waitFor({state:'visible'});assert.match(await page.locator('.design-response').textContent(),/try once more/);});
 }
 await page.locator('.design-form [type=submit]').click();await page.waitForFunction(()=>window.qaStreams.design.length===4);await proposal(3);
 await check('Background refresh preserves the checked preview and baseline',async()=>{
  await page.evaluate(()=>window.qaRefresh());
  assert.equal(await page.evaluate(()=>window.qaProjectedScene.objects.length),1);
  assert.equal(await page.evaluate(()=>window.qaScene().objects.length),0);
  assert.equal(await page.evaluate(()=>window.qaRevision()),0);
 });
 await page.locator('.design-edit').click();
 await check('Edit request restores the original scene without applying',async()=>{assert.equal(await page.evaluate(()=>window.qaProjectedScene.objects.length),0);assert.equal(await page.evaluate(()=>window.qaRevision()),0);await page.locator('.design-form').waitFor({state:'visible'});});
 await page.locator('.design-skip').click();await customized();
 await page.locator('#designer-request').fill('Add a custom shelf.');await page.locator('.designer-send').click();await page.waitForFunction(()=>window.qaStreams.design.length===5);
 await send('design',{type:'build',slotId:'custom-sideboard-5',state:'building'},4);
 await check('Later Customize requests reuse the live construction visuals',async()=>{await page.locator('.design-construction-build').first().waitFor({state:'visible'});assert.equal(await page.locator('.design-customize-phase').textContent(),'03 Customize');});
 await page.locator('.designer-cancel').click();
 await check('Stopping a Customize request aborts and clears its overlays',async()=>{assert.equal(await page.evaluate(()=>window.qaStreams.design[4].aborted),true);assert.equal(await page.locator('.design-construction').evaluate(e=>e.hidden),true);assert.equal(await page.evaluate(()=>window.qaRevision()),0);});
 await fresh({mobile:true,reduced:true});await built();
 await check('Mobile Design fills the viewport and both actions are directly reachable',async()=>{
  const box=await page.locator('#viewport').boundingBox();assert.ok(box.height>800,JSON.stringify(box));
  for(const selector of ['.design-skip','.design-form [type=submit]'])assert.equal(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===el||el.contains(hit);}),true,selector);
 });
 await screenshot('edge-mobile-fullscreen.png');
 assert.deepEqual(results.pageErrors,[]);assert.deepEqual(results.realModelRequests,[]);
 console.log(`${results.checks.length} edge checks passed; zero page errors; zero model requests`);
})().catch(async error=>{results.error=error.stack;console.error(error);try{results.body=await page.locator('body').innerText();await screenshot('edge-failure.png');}catch{}process.exitCode=1;}).finally(async()=>{fs.writeFileSync(out+'/edge-results.json',JSON.stringify(results,null,2));await browser?.close();});
