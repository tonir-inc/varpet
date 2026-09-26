import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url)),out=await mkdtemp(join(tmpdir(),'designer-events-'));
after(()=>rm(out,{recursive:true}));
await build({root,configFile:false,publicDir:false,logLevel:'error',plugins:[{name:'events-entry',resolveId(id){if(id.endsWith('events-entry'))return '\0events-entry';},load(id){if(id==='\0events-entry')return `export * from '${root}/src/adapters/designer-http.ts';export * from '${root}/src/adapters/designer-events.ts';export * from '${root}/src/ui/designer-panel.ts';export * from '${root}/src/core/demo.ts';`;}}],build:{ssr:'events-entry',target:'node22',outDir:out,minify:false,rolldownOptions:{output:{entryFileNames:'events.mjs'}}}});
const {createDesignerHttpAdapter,askDesigner,parseDesignerEvent,createDesignerConversation,demoScene,localCatalog}=await import(pathToFileURL(join(out,'events.mjs')));
const answer={type:'message',conversationId:'c',message:'Here are your options.'};
const tool={type:'tool',name:'search_catalog',phase:'start',callId:'call-1',summary:'Finding furniture'};
const stream=records=>new Response(records.map(JSON.stringify).join('\n')+'\n',{headers:{'Content-Type':'application/x-ndjson'}});

test('opt-in adapter streams tool/build events before final answer and sends the flag',async()=>{
 const seen=[];let body;
 const records=[tool,{type:'build',slotId:'custom-c-1',state:'building'},{type:'build',slotId:'custom-c-1',state:'failed',reason:'Try a catalog piece'},answer];
 const adapter=createDesignerHttpAdapter({events:true,onEvent:e=>seen.push(e),fetch:async(_u,o)=>{body=JSON.parse(o.body);return stream(records);}});
 await assert.rejects(adapter.propose(demoScene,0),e=>e.name==='DesignerMessageReply');
 assert.equal(body.events,true);assert.deepEqual(seen,records.slice(0,-1));
});
test('legacy request stays opt-out; malformed or unsolicited events cannot reach callbacks',async()=>{
 let body;await assert.rejects(createDesignerHttpAdapter({fetch:async(_u,o)=>{body=JSON.parse(o.body);return stream([answer]);}}).propose(demoScene,0),e=>e.name==='DesignerMessageReply');assert.equal(body.events,undefined);
 for(const event of [{...tool,phase:'invented'},{...tool,refs:{private:'secret'}},{type:'build',slotId:'custom-c-1',state:'done',glb:'file:///private/a.glb'},{type:'build',slotId:'custom-c-1',state:'failed'}, {...tool,refs:{size_wdh_m:[1,-1,1]}}]){
  const seen=[];await assert.rejects(createDesignerHttpAdapter({events:true,onEvent:e=>seen.push(e),fetch:async()=>stream([event,answer])}).propose(demoScene,0),e=>e.code==='protocol');assert.deepEqual(seen,[]);
 }
});
test('events after a terminal reply remain a protocol error',async()=>{
 await assert.rejects(createDesignerHttpAdapter({events:true,fetch:async()=>stream([answer,tool])}).propose(demoScene,0),/after its final record/);
});
test('chat opts in, shows slot state in the existing progress line and ignores late events',async()=>{
 let opts,request,finish;const pending=new Promise(r=>{finish=r;});
 const chat=createDesignerConversation({snapshot:()=>({scene:demoScene,revision:0,catalog:localCatalog}),onProposal(){},ask:(r,o)=>{request=r;opts=o;return pending;}});
 const running=chat.send('Build a cabinet');assert.equal(request.events,true);
 opts.onEvent({type:'build',slotId:'custom-c-1',state:'building'});assert.match(chat.state.progress,/Building.*custom-c-1/);
 opts.onEvent({type:'tool',name:'quote',phase:'end',summary:'Furniture quote ready',refs:{cost_dram:19500,currency:'AMD',price_source:'mock'}});assert.match(chat.state.progress,/19,500.*֏/);assert.match(chat.state.progress,/sample/i);
 opts.onEvent({type:'tool',name:'quote',phase:'end',summary:'Furniture quote ready',refs:{cost_dram:19500,currency:'AMD',price_source:'unknown'}});assert.match(chat.state.progress,/unverified/i);
 chat.cancel();const before=chat.state.progress;opts.onEvent(tool);assert.equal(chat.state.progress,before);
 finish(answer);await running;assert.equal(chat.state.busy,false);
});

test('custom assets validate together with the proposal before delivery; source URL uses the service origin',async()=>{
 const asset={id:'custom-c-1',name:'Custom cabinet',kind:'cabinet',category:'Custom',dimensions:[.4,.6,.3],color:'#9299a3',price:10000,source:{type:'gltf',url:'/designer/files/c/custom-c-1.glb'}};
 const scene={...structuredClone(demoScene),objects:[]};
 const proposal={id:'p',title:'One cabinet',description:'A small cabinet.',command:{id:'cmd',label:'Add cabinet',source:'designer',baseRevision:0,operations:[{type:'add',object:{id:'custom-object',name:'Cabinet',assetId:asset.id,position:[-3,0,0],rotation:0,scale:[1,1,1]}}]}};
 const seen=[];const adapter=createDesignerHttpAdapter({url:'http://127.0.0.1:5355/designer/propose',onAssets:a=>seen.push(a),fetch:async()=>stream([{type:'proposal',conversationId:'c',proposal,assets:[asset]}])});
 const result=await adapter.propose(scene,0);assert.equal(result.id,'p');assert.equal(seen.length,1);assert.equal(seen[0][0].source.url,'http://127.0.0.1:5355/designer/files/c/custom-c-1.glb');assert.deepEqual(scene.objects,[]);
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>stream([{type:'proposal',conversationId:'c',proposal,assets:[asset]}]);
  const reply=await askDesigner({scene,revision:0,request:'Build a cabinet'},{baseUrl:'http://127.0.0.1:5355'});
  assert.equal(reply.type,'proposal');assert.equal(reply.assets[0].source.url,'http://127.0.0.1:5355/designer/files/c/custom-c-1.glb');
 } finally {globalThis.fetch=original;}
 for(const invalid of [{...asset,source:{type:'gltf',url:'file:///etc/passwd'}},{...asset,id:localCatalog[0].id},{...asset,dimensions:[-.4,.6,.3]}]){
  const got=[];await assert.rejects(createDesignerHttpAdapter({onAssets:a=>got.push(a),fetch:async()=>stream([{type:'proposal',conversationId:'c',proposal,assets:[invalid]}])}).propose(scene,0));assert.deepEqual(got,[]);
 }
});


test('chat HTTP wrapper opts in and delivers events before the final network chunk',async()=>{
 const original=globalThis.fetch,encoder=new TextEncoder();let body,wire,observed;
 const observedPromise=new Promise(resolve=>{observed=resolve;});
 globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return new Response(new ReadableStream({start(controller){wire=controller;}}),{headers:{'Content-Type':'application/x-ndjson'}});};
 try {
  const pending=askDesigner({scene:demoScene,revision:0,request:'Find furniture',events:true},{onEvent:observed});
  await new Promise(resolve=>setImmediate(resolve));
  wire.enqueue(encoder.encode(JSON.stringify(tool).slice(0,15)));
  wire.enqueue(encoder.encode(JSON.stringify(tool).slice(15)+'\n'));
  const event=await Promise.race([observedPromise,new Promise(resolve=>setTimeout(()=>resolve(null),300))]);
  wire.enqueue(encoder.encode(JSON.stringify(answer)+'\n'));wire.close();
  const reply=await pending;
  assert.equal(body.events,true);assert.deepEqual(event,tool);assert.equal(reply.type,'message');
 } finally {globalThis.fetch=original;}
});
test('opt-in records are validated even without an event callback',async()=>{
 await assert.rejects(createDesignerHttpAdapter({events:true,fetch:async()=>stream([{...tool,phase:'invalid'},answer])}).propose(demoScene,0),/Invalid tool event/);
});
test('published recorded event sample conforms to the adapter contract',async()=>{
 const sample=await readFile(new URL('../../../packages/designer/eval/event-stream-sample.ndjson',import.meta.url),'utf8');
 const records=sample.trim().split('\n').map(JSON.parse);
 for(const event of records.filter(r=>r.type==='tool'||r.type==='build'))assert.deepEqual(parseDesignerEvent(event),event);
 assert.equal(records.filter(r=>['proposal','message','question','decline','error'].includes(r.type)).length,1);
 assert.equal(records.at(-1).type,'proposal');
});
