import {expect,test,vi} from 'vitest';
import {createDesignerHttpAdapter,DesignerQuestionError,DesignerDeclineError} from '../../../apps/editor/src/adapters/designer-http.js';
import type {AgentProposal,CatalogAsset,SceneDocument} from '../../../apps/editor/src/contracts.js';

const catalog:CatalogAsset[]=[{id:'chair-asset',name:'Chair',category:'Seating',kind:'chair',dimensions:[.5,.8,.5],color:'#886644',price:0,source:{type:'procedural'}}];
const scene=():SceneDocument=>({format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',rooms:[{id:'room',name:'Room',polygon:[[0,0],[6,0],[6,6],[0,6]],color:'#ffffff'}],walls:[],objects:[{id:'chair',name:'Chair',assetId:'chair-asset',position:[1,0,1],rotation:0,scale:[1,1,1]}]});
const proposal=(revision=7):AgentProposal=>({id:'proposal-1',title:'Move the chair',description:'A checked furniture layout.',command:{id:'command-1',label:'Move chair',source:'designer',baseRevision:revision,operations:[{type:'update',id:'chair',patch:{position:[2,0,2]}}]}});
const line=(value:unknown)=>JSON.stringify(value)+'\n';
function response(text:string,chunkSize=11){
  const bytes=new TextEncoder().encode(text);let offset=0;
  return new Response(new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+=chunkSize));}}),{headers:{'Content-Type':'application/x-ndjson; charset=utf-8'}});
}
const reply=(p=proposal())=>line({type:'proposal',conversationId:'c1',proposal:p,metrics:{}});

test('real chunked NDJSON handles split unicode, progress, snapshot and configured extras',async()=>{
  const input=scene(),progress:string[]=[];let posted:Record<string,unknown>|undefined;
  const fetcher=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{posted=JSON.parse(init!.body as string);input.objects[0]!.position=[5,0,5];return response(line({type:'progress',message:'Checking ֏ and clearances'})+reply(),1);});
  const adapter=createDesignerHttpAdapter({catalog,request:'Move the chair',keep:[],northDeg:0,doorSwings:{},conversationId:'old',onProgress:message=>progress.push(message),fetch:fetcher});
  expect(await adapter.propose(input,7)).toEqual(proposal());
  expect(posted).toMatchObject({request:'Move the chair',revision:7,catalog,keep:[],northDeg:0,doorSwings:{},conversationId:'old'});
  expect((posted!.scene as SceneDocument).objects[0]!.position).toEqual([1,0,1]);
  expect(input.objects[0]!.position).toEqual([5,0,5]);expect(progress).toEqual(['Checking ֏ and clearances']);
  expect(fetcher.mock.calls[0]![0]).toBe('http://localhost:8787/designer/propose');
});
test('question and decline are typed terminal outcomes with continuation ids',async()=>{
  const question=createDesignerHttpAdapter({catalog,fetch:async()=>response(line({type:'question',conversationId:'c2',question:'Cozier how?',options:['Reading','Seating']}))});
  const error=await question.propose(scene(),7).catch(error=>error);
  expect(error).toBeInstanceOf(DesignerQuestionError);expect(error).toMatchObject({question:'Cozier how?',options:['Reading','Seating'],conversationId:'c2'});
  const decline=createDesignerHttpAdapter({catalog,fetch:async()=>response(line({type:'decline',conversationId:'c3',message:'I arrange furniture.'}))});
  await expect(decline.propose(scene(),7)).rejects.toBeInstanceOf(DesignerDeclineError);
});
test('malformed, truncated and multiple terminal records reject',async()=>{
  for(const body of ['{broken\n',line({type:'progress',message:'Working'}),reply()+reply(),reply()+line({type:'progress',message:'Too late'})]){
    await expect(createDesignerHttpAdapter({catalog,fetch:async()=>response(body)}).propose(scene(),7)).rejects.toThrow();
  }
});
test('stale, wrong source, unsupported operations and unsafe geometry reject without mutation',async()=>{
  const stale=proposal(6),source=proposal(),unsupported=proposal(),geometry=proposal();
  source.command.source='human';unsupported.command.operations=[{type:'replace-structure',rooms:[],walls:[]}];
  geometry.command.operations=[{type:'update',id:'chair',patch:{position:[99,0,99]}}];
  const original=scene();
  for(const invalid of [stale,source,unsupported,geometry])await expect(createDesignerHttpAdapter({catalog,fetch:async()=>response(reply(invalid))}).propose(original,7)).rejects.toThrow();
  expect(original).toEqual(scene());
});
test('abort before fetch makes no call; abort during reading cancels the body and rejects promptly',async()=>{
  const before=new AbortController();before.abort();const never=vi.fn();
  await expect(createDesignerHttpAdapter({catalog,fetch:never}).propose(scene(),7,before.signal)).rejects.toMatchObject({name:'AbortError'});expect(never).not.toHaveBeenCalled();
  const controller=new AbortController();let cancelled=false;let started!:()=>void;
  const reading=new Promise<void>(resolve=>{started=resolve;});
  const body=new ReadableStream<Uint8Array>({pull(){started();},cancel(){cancelled=true;}});
  const running=createDesignerHttpAdapter({catalog,fetch:async()=>new Response(body,{headers:{'Content-Type':'application/x-ndjson'}})}).propose(scene(),7,controller.signal);
  await reading;controller.abort();
  await expect(running).rejects.toMatchObject({name:'AbortError'});expect(cancelled).toBe(true);
});
test('payload limits, HTTP errors, invalid patches and unknown fields reject',async()=>{
  const extra=proposal() as AgentProposal&{secret:string};extra.secret='unsupported';
  const patch=proposal();patch.command.operations=[{type:'update',id:'chair',patch:{rotation:Number.NaN}}];
  for(const body of [reply(extra),reply(patch),' '.repeat(1_048_577)])await expect(createDesignerHttpAdapter({catalog,fetch:async()=>response(body,65536)}).propose(scene(),7)).rejects.toThrow();
  await expect(createDesignerHttpAdapter({catalog,fetch:async()=>new Response('down',{status:503})}).propose(scene(),7)).rejects.toThrow(/503/);
});
test('free-text questions accept empty options from the service',async()=>{
  const adapter=createDesignerHttpAdapter({catalog,fetch:async()=>response(line({type:'question',conversationId:'c4',question:'What is the crib width?',options:[]}))});
  const error=await adapter.propose(scene(),7).catch(error=>error);
  expect(error).toBeInstanceOf(DesignerQuestionError);expect(error.options).toBeUndefined();
});
test('abort while fetch is pending rejects and cancels a late response body',async()=>{
  const controller=new AbortController();let finish!:(response:Response)=>void,cancelled=false;
  const pending=new Promise<Response>(resolve=>{finish=resolve;});
  const fetcher=vi.fn((_url:RequestInfo|URL,init?:RequestInit)=>{expect(init!.signal).toBe(controller.signal);return pending;});
  const work=createDesignerHttpAdapter({catalog,fetch:fetcher}).propose(scene(),7,controller.signal);
  controller.abort();await expect(work).rejects.toMatchObject({name:'AbortError'});
  finish(new Response(new ReadableStream({cancel(){cancelled=true;}})));
  await new Promise(resolve=>setTimeout(resolve,0));expect(cancelled).toBe(true);
});
test('configured currency is explicit and add/delete commands remain reviewable previews',async()=>{
  const input=scene(),p=proposal();
  p.command.operations=[{type:'add',object:{...input.objects[0]!,id:'chair-2',position:[3,0,3]}},{type:'delete',id:'chair'}];
  let sent:Record<string,unknown>={};
  const adapter=createDesignerHttpAdapter({catalog,catalogCurrency:'AMD',fetch:async(_url,init)=>{sent=JSON.parse(init!.body as string);return response(reply(p));}});
  expect(await adapter.propose(input,7)).toEqual(p);expect(sent.catalogCurrency).toBe('AMD');expect(input).toEqual(scene());
});
test('abort after streamed progress cancels a pending reader and emits no proposal',async()=>{
  const controller=new AbortController();let ready!:()=>void,cancelled=false;
  const progress=new Promise<void>(resolve=>{ready=resolve;});
  const body=new ReadableStream<Uint8Array>({start(stream){stream.enqueue(new TextEncoder().encode(line({type:'progress',message:'Placing furniture'})));},cancel(){cancelled=true;}});
  const adapter=createDesignerHttpAdapter({catalog,onProgress:()=>ready(),fetch:async()=>new Response(body,{headers:{'Content-Type':'application/x-ndjson'}})});
  const work=adapter.propose(scene(),7,controller.signal);
  await progress;controller.abort();
  await expect(work).rejects.toMatchObject({name:'AbortError'});expect(cancelled).toBe(true);
});
