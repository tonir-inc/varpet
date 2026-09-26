/// <reference types="vite/client" />
import type {AgentProposal,CatalogAsset,DesignerAdapter,SceneDocument} from '../contracts';
import {localCatalog} from '../core/demo';
import {EditorStore} from '../core/store';

export type DesignerDoorSwing='in-left'|'in-right'|'out-left'|'out-right';
export interface DesignerHttpOptions {
  url?:string;
  request?:string;
  keep?:readonly string[];
  northDeg?:number;
  doorSwings?:Record<string,DesignerDoorSwing>;
  conversationId?:string;
  catalog?:CatalogAsset[];
  /** Explicit catalog price provenance; omitted by default. */
  catalogCurrency?:'AMD';
  onProgress?:(message:string)=>void;
  onConversationId?:(conversationId:string)=>void;
  onMetrics?:(metrics:unknown)=>void;
  fetch?:typeof globalThis.fetch;
}
export interface DesignerRequest {
  scene:SceneDocument;revision:number;request:string;conversationId?:string;
  keep?:string[];doorSwings?:Record<string,DesignerDoorSwing>;northDeg?:number;
  catalog?:CatalogAsset[];catalogCurrency?:'AMD';
}
export type DesignerReply=
  | {type:'proposal';conversationId:string;proposal:AgentProposal;metrics?:unknown}
  | {type:'question';conversationId:string;question:string;options:string[]}
  | {type:'decline';conversationId:string;message:string}
  | {type:'error';message:string};
export interface AskDesignerOptions {baseUrl?:string;onProgress?:(message:string)=>void;signal?:AbortSignal}
export class DesignerServiceError extends Error {
  readonly name='DesignerServiceError';
  constructor(message:string,readonly code:'http'|'protocol'|'validation'|'service',readonly status?:number){super(message);}
}
export class DesignerQuestionError extends Error {
  readonly name='DesignerQuestionError';
  readonly type='question';
  constructor(readonly question:string,readonly options:string[]|undefined,readonly conversationId?:string){super(question);}
}
export class DesignerDeclineError extends Error {
  readonly name='DesignerDeclineError';
  readonly type='decline';
  constructor(message:string,readonly conversationId?:string){super(message);}
}
const MAX_BYTES=4_000_000,MAX_LINE=1_048_576;
type Json=Record<string,unknown>;
function fail(message:string,code:'protocol'|'validation'='protocol'):never{throw new DesignerServiceError(message,code);}
function record(value:unknown,label:string):Json{
  if(value===null||typeof value!=='object'||Array.isArray(value))fail(`${label} must be an object.`);
  return value as Json;
}
function keys(value:Json,allowed:string[],label:string):void{
  if(Object.keys(value).some(key=>!allowed.includes(key)))fail(`${label} contains unsupported fields.`);
}
function text(value:unknown,label:string,max:number):string{
  if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} must be nonempty text of at most ${max} characters.`);
  return value;
}
const abortError=()=>new DOMException('Designer request cancelled.','AbortError');
function checkAbort(signal?:AbortSignal):void{if(signal?.aborted)throw abortError();}
function abortable<T>(work:Promise<T>,signal?:AbortSignal,onAbort?:()=>void):Promise<T>{
  if(!signal)return work;
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>{onAbort?.();reject(abortError());};
    signal.addEventListener('abort',abort,{once:true});
    work.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
    if(signal.aborted)abort();
  });
}
function proposalFrom(value:unknown,revision:number,snapshot:SceneDocument,catalog:CatalogAsset[]):AgentProposal{
  const proposal=record(value,'Proposal');keys(proposal,['id','title','description','command'],'Proposal');
  text(proposal.id,'Proposal ID',120);text(proposal.title,'Proposal title',160);text(proposal.description,'Proposal description',4000);
  const command=record(proposal.command,'Command');keys(command,['id','label','source','baseRevision','operations'],'Command');
  text(command.id,'Command ID',120);text(command.label,'Command label',160);
  if(command.source!=='designer')fail('Proposal command source must be designer.','validation');
  if(command.baseRevision!==revision)fail('Designer proposal is stale or has a different base revision.','validation');
  if(!Array.isArray(command.operations)||command.operations.length<1||command.operations.length>100)fail('A proposal needs 1–100 furniture operations.','validation');
  for(const value of command.operations){
    const operation=record(value,'Operation');
    if(operation.type==='add')keys(operation,['type','object'],'Add operation');
    else if(operation.type==='delete')keys(operation,['type','id'],'Delete operation');
    else if(operation.type==='update'){
      keys(operation,['type','id','patch'],'Update operation');
      keys(record(operation.patch,'Object patch'),['name','position','rotation','scale','color'],'Object patch');
    }else fail('Designer supports only add, update and delete furniture operations.','validation');
  }
  const result=structuredClone(proposal) as unknown as AgentProposal;
  // This disposable store validates atomic editor semantics, including grouped moves.
  // Its revision is zero; the returned command retains the actual captured revision.
  const preview=new EditorStore(snapshot,catalog);
  const checked=preview.execute({...result.command,baseRevision:preview.revision},true);
  if(!checked.ok)fail(`Invalid designer proposal: ${checked.errors.join(' ')}`,'validation');
  return result;
}

/** Network boundary only: returns a preview; application and approval remain with the editor. */
export function createDesignerHttpAdapter(options:DesignerHttpOptions={}):DesignerAdapter{
  const configured={
    url:options.url??'http://localhost:8787/designer/propose',
    request:options.request??'Make the room feel bigger by rearranging the furniture I already own at zero cost.',
    keep:options.keep===undefined?undefined:structuredClone(options.keep),
    northDeg:options.northDeg,doorSwings:options.doorSwings===undefined?undefined:structuredClone(options.doorSwings),
    conversationId:options.conversationId,catalog:options.catalog===undefined?undefined:structuredClone(options.catalog),
    catalogCurrency:options.catalogCurrency,onProgress:options.onProgress,onConversationId:options.onConversationId,onMetrics:options.onMetrics,
    fetch:options.fetch??globalThis.fetch.bind(globalThis),
  };
  return {async propose(scene,revision,signal){
    checkAbort(signal);
    if(!Number.isSafeInteger(revision)||revision<0)fail('A nonnegative integer scene revision is required.','validation');
    const snapshot=structuredClone(scene),catalog=structuredClone(configured.catalog??localCatalog);
    // The store checks the original snapshot before anything is uploaded.
    try{new EditorStore(snapshot,catalog);}catch(error){fail(error instanceof Error?error.message:'Invalid editor scene.','validation');}
    text(configured.request,'Customer request',20_000);
    if(configured.conversationId!==undefined)text(configured.conversationId,'Conversation ID',200);
    if(configured.northDeg!==undefined&&(!Number.isFinite(configured.northDeg)||configured.northDeg<0||configured.northDeg>=360))fail('northDeg must be between 0 and 360 degrees.','validation');
    if(configured.catalogCurrency!==undefined&&configured.catalogCurrency!=='AMD')fail('Only explicitly confirmed AMD catalog prices are supported.','validation');
    if(configured.keep!==undefined){
      if(!Array.isArray(configured.keep)||configured.keep.length>400||configured.keep.some(id=>typeof id!=='string'||!snapshot.objects.some(object=>object.id===id)))fail('Kept IDs must identify existing furniture.','validation');
    }
    if(configured.doorSwings!==undefined){
      const swings=record(configured.doorSwings,'Door swings'),doorIds=new Set(snapshot.walls.flatMap(wall=>wall.openings.filter(opening=>opening.kind==='door').map(opening=>opening.id)));
      if(Object.entries(swings).some(([id,swing])=>!doorIds.has(id)||!['in-left','in-right','out-left','out-right'].includes(String(swing))))fail('Door swings must identify existing doors and supported swing directions.','validation');
    }
    const body=JSON.stringify({scene:snapshot,revision,request:configured.request,
      ...(configured.keep===undefined?{}:{keep:configured.keep}),...(configured.northDeg===undefined?{}:{northDeg:configured.northDeg}),
      ...(configured.doorSwings===undefined?{}:{doorSwings:configured.doorSwings}),...(configured.conversationId===undefined?{}:{conversationId:configured.conversationId}),
      ...(configured.catalog===undefined?{}:{catalog:configured.catalog}),...(configured.catalogCurrency===undefined?{}:{catalogCurrency:configured.catalogCurrency})});
    if(new TextEncoder().encode(body).byteLength>MAX_BYTES)fail('Designer request exceeds the 4 MB payload limit.','validation');
    let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,response:Response|undefined;
    try{
      const fetching=configured.fetch(configured.url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/x-ndjson'},body,signal}).then(result=>{
        response=result;
        // Native fetch honors the signal. Also clean up late responses from transport wrappers.
        if(signal?.aborted){if(result.body)void result.body.cancel().catch(()=>{});throw abortError();}
        return result;
      });
      response=await abortable(fetching,signal);
      checkAbort(signal);
      if(!response.ok)throw new DesignerServiceError(`Designer service returned HTTP ${response.status}.`,'http',response.status);
      if(response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()!=='application/x-ndjson')fail('Designer service must return application/x-ndjson.');
      if(!response.body)fail('Designer service returned no response stream.');
      reader=response.body.getReader();
      const decoder=new TextDecoder('utf-8',{fatal:true});let pending='',bytes=0,terminal:Json|undefined;
      const consume=(line:string)=>{
        if(line.length>MAX_LINE)fail('Designer response line exceeds the 1 MB limit.');
        if(!line.trim())return;
        if(terminal)fail('Designer response contains content after its final record.');
        let value:unknown;
        try{value=JSON.parse(line);}catch{fail('Designer response contains malformed JSON.');}
        const entry=record(value,'Designer response');
        if(entry.type==='progress'){
          keys(entry,['type','message'],'Progress');configured.onProgress?.(text(entry.message,'Progress message',2000));return;
        }
        if(!['proposal','question','decline','error'].includes(String(entry.type)))fail('Designer response has an unknown record type.');
        terminal=entry;
      };
      while(true){
        const current=reader;
        const chunk=await abortable(current.read(),signal,()=>{void current.cancel().catch(()=>{});});
        checkAbort(signal);
        if(chunk.done){pending+=decoder.decode();break;}
        bytes+=chunk.value.byteLength;if(bytes>MAX_BYTES)fail('Designer response exceeds the 4 MB payload limit.');
        pending+=decoder.decode(chunk.value,{stream:true});
        let newline:number;
        while((newline=pending.indexOf('\n'))>=0){consume(pending.slice(0,newline));pending=pending.slice(newline+1);}
        if(pending.length>MAX_LINE)fail('Designer response line exceeds the 1 MB limit.');
      }
      if(pending)consume(pending);
      if(!terminal)fail('Designer response ended without a final record.');
      const final:Json=terminal;
      const conversationId=final.conversationId===undefined?undefined:text(final.conversationId,'Conversation ID',200);
      let proposal:AgentProposal|undefined,question:string|undefined,choices:string[]|undefined,message:string|undefined;
      if(final.type==='proposal'){
        keys(final,['type','conversationId','proposal','metrics'],'Proposal response');
        if(final.metrics!==undefined)record(final.metrics,'Metrics');
        proposal=proposalFrom(final.proposal,revision,snapshot,catalog);
      }else if(final.type==='question'){
        keys(final,['type','conversationId','question','options'],'Question response');question=text(final.question,'Question',1000);
        if(final.options!==undefined){
          if(!Array.isArray(final.options)||final.options.length===1||final.options.length>4)fail('A question must have zero or two to four options when supplied.');
          if(final.options.length)choices=final.options.map(value=>text(value,'Question option',300));
        }
      }else{
        keys(final,['type','conversationId','message'],'Terminal response');message=text(final.message,'Designer message',4000);
      }
      checkAbort(signal);
      if(conversationId)configured.onConversationId?.(conversationId);
      if(proposal){if(final.metrics!==undefined)configured.onMetrics?.(structuredClone(final.metrics));return proposal;}
      if(final.type==='question')throw new DesignerQuestionError(question!,choices,conversationId);
      if(final.type==='decline')throw new DesignerDeclineError(message!,conversationId);
      throw new DesignerServiceError(message!,'service');
    }catch(error){
      if(signal?.aborted)throw abortError();
      if(error instanceof DesignerServiceError||error instanceof DesignerQuestionError||error instanceof DesignerDeclineError)throw error;
      throw new DesignerServiceError(error instanceof Error?error.message:'Designer request failed.','protocol');
    }finally{
      if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}
      else if(response?.body)void response.body.cancel().catch(()=>{});
    }
  }};
}

function serviceUrl(baseUrl?:string):string{
  const env=import.meta.env as {VITE_DESIGNER_URL?:string}|undefined;
  return (baseUrl??env?.VITE_DESIGNER_URL??'http://127.0.0.1:8787').replace(/\/+$/,'')+'/designer/propose';
}

/** Chat-facing wrapper; a canceled request rejects instead of becoming a chat error. */
export async function askDesigner(req:DesignerRequest,opts:AskDesignerOptions={}):Promise<DesignerReply>{
  let conversationId:string|undefined,metrics:unknown;
  try{
    checkAbort(opts.signal);
    const adapter=createDesignerHttpAdapter({
      url:serviceUrl(opts.baseUrl),request:req.request,conversationId:req.conversationId,
      keep:req.keep,doorSwings:req.doorSwings,northDeg:req.northDeg,catalog:req.catalog,catalogCurrency:req.catalogCurrency,
      onProgress:opts.onProgress,onConversationId:id=>{conversationId=id;},onMetrics:value=>{metrics=value;},
    });
    const proposal=await adapter.propose(req.scene,req.revision,opts.signal);
    if(!conversationId)return {type:'error',message:'Designer response is missing its conversation ID.'};
    return {type:'proposal',conversationId,proposal,...(metrics===undefined?{}:{metrics})};
  }catch(error){
    if(opts.signal?.aborted||(error instanceof Error&&error.name==='AbortError'))throw abortError();
    if(error instanceof DesignerQuestionError){
      if(!error.conversationId)return {type:'error',message:'Designer question is missing its conversation ID.'};
      return {type:'question',conversationId:error.conversationId,question:error.question,options:error.options??[]};
    }
    if(error instanceof DesignerDeclineError){
      if(!error.conversationId)return {type:'error',message:'Designer decline is missing its conversation ID.'};
      return {type:'decline',conversationId:error.conversationId,message:error.message};
    }
    return {type:'error',message:error instanceof Error?error.message:'Designer request failed.'};
  }
}

/** Existing Suggest workflow: a validated proposal with the default layout request. */
export const designerHttpAdapter:DesignerAdapter={
  async propose(scene,revision,signal){
    return createDesignerHttpAdapter({url:serviceUrl()}).propose(scene,revision,signal);
  },
};
