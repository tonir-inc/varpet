import {afterEach,expect,test,vi} from 'vitest';
import {askDesigner,designerHttpAdapter,type DesignerRequest} from '../../../apps/editor/src/adapters/designer-http.js';
import type {AgentProposal,CatalogAsset} from '../../../apps/editor/src/contracts.js';
import {demoScene} from '../../../apps/editor/src/core/demo.js';

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const catalog:CatalogAsset[]=[{id:'chair-asset',name:'Chair',category:'Seating',kind:'chair',dimensions:[.5,.8,.5],color:'#886644',price:0,source:{type:'procedural'}}];
const request=():DesignerRequest=>({scene:{format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',rooms:[{id:'room',name:'Room',polygon:[[0,0],[6,0],[6,6],[0,6]],color:'#ffffff'}],walls:[],objects:[{id:'chair',name:'Chair',assetId:'chair-asset',position:[1,0,1],rotation:0,scale:[1,1,1]}]},revision:7,request:'Move the chair',catalog});
const proposal=():AgentProposal=>({id:'proposal-1',title:'Move the chair',description:'A checked layout.',command:{id:'command-1',label:'Move chair',source:'designer',baseRevision:7,operations:[{type:'update',id:'chair',patch:{position:[2,0,2]}}]}});
function stream(...records:unknown[]):Response{return new Response(records.map(record=>JSON.stringify(record)+'\n').join(''),{headers:{'Content-Type':'application/x-ndjson'}});}

test('panel API returns validated proposal, conversation id, metrics and progress and forwards extras',async()=>{
  const messages:string[]=[],req={...request(),conversationId:'old',keep:[],northDeg:0,doorSwings:{},catalogCurrency:'AMD' as const};
  const fetcher=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>stream({type:'progress',message:'Checking paths'},{type:'proposal',conversationId:'next',proposal:proposal(),metrics:{cost_dram:0}}));vi.stubGlobal('fetch',fetcher);
  const result=await askDesigner(req,{baseUrl:'http://127.0.0.1:9876/',onProgress:message=>messages.push(message)});
  expect(result).toEqual({type:'proposal',conversationId:'next',proposal:proposal(),metrics:{cost_dram:0}});
  expect(messages).toEqual(['Checking paths']);
  expect(fetcher.mock.calls[0]![0]).toBe('http://127.0.0.1:9876/designer/propose');
  const init=fetcher.mock.calls[0]![1] as RequestInit;
  expect(JSON.parse(init.body as string)).toMatchObject({conversationId:'old',request:req.request,catalog,catalogCurrency:'AMD',revision:7,northDeg:0});
});
test('panel API normalizes questions, free text and declines into distinct replies',async()=>{
  for(const terminal of [
    {type:'question',conversationId:'c1',question:'Which activity?',options:['Reading','Work']},
    {type:'question',conversationId:'c1',question:'How wide?',options:[]},
    {type:'decline',conversationId:'c1',message:'I arrange furniture.'},
  ]){
    vi.stubGlobal('fetch',async()=>stream(terminal));expect(await askDesigner(request())).toEqual(terminal);
  }
});
test('service, malformed, stale and missing-conversation replies normalize as errors',async()=>{
  const stale=proposal();stale.command.baseRevision=6;
  for(const terminal of [
    {type:'error',message:'Designer unavailable'},
    {type:'proposal',proposal:proposal()},
    {type:'proposal',conversationId:'c1',proposal:stale},
    {type:'question',question:'Missing id',options:[]},
  ]){
    vi.stubGlobal('fetch',async()=>stream(terminal));expect(await askDesigner(request())).toMatchObject({type:'error',message:expect.any(String)});
  }
  vi.stubGlobal('fetch',async()=>new Response('{broken',{headers:{'Content-Type':'application/x-ndjson'}}));
  expect(await askDesigner(request())).toMatchObject({type:'error'});
});
test('panel cancellation rejects AbortError and never becomes an error reply',async()=>{
  const controller=new AbortController(),fetcher=vi.fn(()=>new Promise<Response>(()=>{}));vi.stubGlobal('fetch',fetcher);
  const work=askDesigner(request(),{signal:controller.signal});controller.abort();
  await expect(work).rejects.toMatchObject({name:'AbortError'});
});
test('default editor adapter retains DesignerAdapter and supplies a sensible request',async()=>{
  const p=proposal();p.command.operations=[{type:'update',id:'sofa',patch:{name:'Existing sofa'}}];
  const fetcher=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>stream({type:'proposal',conversationId:'c1',proposal:p}));vi.stubGlobal('fetch',fetcher);
  expect(await designerHttpAdapter.propose(demoScene,7)).toEqual(p);
  expect(fetcher.mock.calls[0]![0]).toBe('http://127.0.0.1:8787/designer/propose');
  const body=JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string);
  expect(body.request).toMatch(/rearrang|furniture/i);expect(body).not.toHaveProperty('catalogCurrency');
});
test('panel API honors the Vite service base URL without requiring Vite ambient types',async()=>{
  vi.stubEnv('VITE_DESIGNER_URL','http://127.0.0.1:9991');
  const fetcher=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>stream({type:'decline',conversationId:'c1',message:'I arrange furniture.'}));
  vi.stubGlobal('fetch',fetcher);await askDesigner(request());
  expect(fetcher.mock.calls[0]![0]).toBe('http://127.0.0.1:9991/designer/propose');
});
