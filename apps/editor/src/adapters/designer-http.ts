/// <reference types="vite/client" />
import type {AgentProposal,CatalogAsset,DesignerAdapter,SceneDocument} from '../contracts';
import {parseDesignerEvent, type DesignerEvent} from './designer-events';
export type {DesignerEvent} from './designer-events';
import {validateDesignerImage,type DesignerImage} from './designer-inspiration';
export type {DesignerImage} from './designer-inspiration';
import {localCatalog} from '../core/demo';
import {EditorStore} from '../core/store';
import {requestVision,type DesignerVision,type VisionCaptureOptions} from './designer-vision';

export type DesignerDoorSwing='in-left'|'in-right'|'out-left'|'out-right';
export interface DesignerHttpOptions {
  image?:DesignerImage;
  events?:boolean;
  onEvent?:(event:DesignerEvent)=>void;
  onAssets?:(assets:CatalogAsset[])=>void;
  vision?:DesignerVision;
  url?:string;
  request?:string;
  keep?:readonly string[];
  northDeg?:number;
  doorSwings?:Record<string,DesignerDoorSwing>;
  conversationId?:string;
  design?:DesignerRequest['design'];
  catalog?:CatalogAsset[];
  /** Explicit catalog price provenance; omitted by default. */
  catalogCurrency?:'AMD';
  /** Requests carry only the scene's products; purchases the designer found in the catalog are looked up by id. */
  resolveAssets?:(ids:string[],signal?:AbortSignal)=>Promise<CatalogAsset[]>;
  onProgress?:(message:string)=>void;
  onMessageDelta?:(delta:string)=>void;
  onConversationId?:(conversationId:string)=>void;
  onMetrics?:(metrics:unknown)=>void;
  onNotes?:(notes:string)=>void;
  /** A small picture of the design in progress (the designer's own render), nonterminal. */
  onPreview?:(preview:DesignerPreview)=>void;
  /** A checked proposal of the rooms finished so far while the designer works on the rest: preview only, nonterminal. */
  onPartial?:(partial:DesignerPartial)=>void;
  fetch?:typeof globalThis.fetch;
}
export interface DesignerPreview {image:string;caption?:string}
export interface DesignerPartial {proposal:AgentProposal;rooms:string[];metrics?:unknown}
/** GET /designer/health: reachable, and what the service has warmed (spike engine). */
export interface DesignerHealth {ok:boolean;engine?:string;warm?:{renderer?:string;codex?:string}}
export interface DesignerRequest {
  image?:DesignerImage;
  vision?:DesignerVision;
  scene:SceneDocument;revision:number;request:string;conversationId?:string;
  keep?:string[];doorSwings?:Record<string,DesignerDoorSwing>;northDeg?:number;
  catalog?:CatalogAsset[];catalogCurrency?:'AMD';events?:boolean;
  /** Continue a recorded design live (new conversation only): its draft, owned ids and the customer's words. */
  design?:{draft:Record<string,unknown>;owned:string[];requests:string[]};
}
export type DesignerReply=
  | {type:'proposal';conversationId:string;proposal:AgentProposal;metrics?:unknown;notes?:string;assets?:CatalogAsset[]}
  | {type:'question';conversationId:string;question:string;options:string[]}
  | {type:'message';conversationId:string;message:string;suggestions?:string[]}
  | {type:'decline';conversationId:string;message:string}
  | {type:'error';message:string};
export interface AskDesignerOptions {fetch?:typeof globalThis.fetch;onPartial?:(partial:DesignerPartial)=>void;onPreview?:(preview:DesignerPreview)=>void;onEvent?:(event:DesignerEvent)=>void;vision?:VisionCaptureOptions;baseUrl?:string;onProgress?:(message:string)=>void;onMessageDelta?:(delta:string)=>void;signal?:AbortSignal;resolveAssets?:DesignerHttpOptions['resolveAssets']}
export class DesignerServiceError extends Error {
  readonly name='DesignerServiceError';
  constructor(message:string,readonly code:'http'|'protocol'|'validation'|'service',readonly status?:number){super(message);}
}
export class DesignerQuestionError extends Error {
  readonly name='DesignerQuestionError';
  readonly type='question';
  constructor(readonly question:string,readonly options:string[]|undefined,readonly conversationId?:string){super(question);}
}
export class DesignerMessageReply extends Error {
  readonly name='DesignerMessageReply';
  constructor(message:string,readonly suggestions:string[]|undefined,readonly conversationId?:string){super(message);}
}
export class DesignerDeclineError extends Error {
  readonly name='DesignerDeclineError';
  readonly type='decline';
  constructor(message:string,readonly conversationId?:string){super(message);}
}
// Requests stay at 4 MB; a response may carry previews and room-by-room partial proposals as well as the final one.
const MAX_BYTES=4_000_000,MAX_RESPONSE_BYTES=16_000_000,MAX_LINE=1_048_576;
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
function appearanceWall(snapshot:SceneDocument,id:unknown):string{
  const wallId=text(id,'Wall ID',100),metadata=snapshot.project?.metadata[wallId];
  if(!snapshot.walls.some(wall=>wall.id===wallId))fail('Wall appearance must target an existing wall.','validation');
  if(metadata?.locked||['retain','remove','replace'].includes(metadata?.phase??''))fail('Wall appearance cannot change a locked, retained, removed or replaced wall.','validation');
  return wallId;
}
/** The designer's own records: finishes `spike:<entity>:<surface>` and materials `spike-finish:...`. */
const DESIGN_FINISH='spike:',DESIGN_MATERIAL='spike-finish:';
function designMaterial(value:unknown):Json{
  const material=record(value,'Design material');
  keys(material,['id','name','color','unit','unitCost','thickness','wastePercent','notes'],'Design material');
  if(!text(material.id,'Material ID',100).startsWith(DESIGN_MATERIAL))fail('Design materials use the designer prefix.','validation');
  text(material.name,'Material name',200);
  if(typeof material.color!=='string'||!/^#[0-9a-f]{6}$/i.test(material.color))fail('Design material colour must be a six-digit hex value.','validation');
  if(material.unit!=='m2'||material.unitCost!==0||material.wastePercent!==0||typeof material.thickness!=='number'||!(material.thickness>0&&material.thickness<=.1))fail('Design materials are unquoted surface finishes.','validation');
  return material;
}
function designRoom(snapshot:SceneDocument,id:unknown):string{
  const roomId=text(id,'Room ID',100),metadata=snapshot.project?.metadata[roomId];
  if(!snapshot.rooms.some(room=>room.id===roomId))fail('Room finishes must target an existing room.','validation');
  if(metadata?.locked||metadata?.phase==='remove')fail('Room finishes cannot change a locked or removed room.','validation');
  return roomId;
}
function appearanceMaterial(value:unknown):Json{
  const material=record(value,'Appearance material');
  keys(material,['id','name','color','unit','unitCost','thickness','wastePercent','notes'],'Appearance material');
  text(material.id,'Material ID',100);
  if(material.unit!=='m2'||material.unitCost!==0||material.thickness!==.0002||material.wastePercent!==0)fail('Designer wall finishes require a conceptual paint material without a quoted cost.','validation');
  return material;
}
async function proposedCatalog(value:unknown,catalog:CatalogAsset[],resolve:DesignerHttpOptions['resolveAssets'],signal?:AbortSignal):Promise<CatalogAsset[]>{
  const plain=(item:unknown):item is Record<string,unknown>=>item!==null&&typeof item==='object'&&!Array.isArray(item);
  const operations=plain(value)&&plain(value.command)&&Array.isArray(value.command.operations)?value.command.operations:[];
  const known=new Set(catalog.map(asset=>asset.id));
  const missing=[...new Set(operations.flatMap(op=>plain(op)&&op.type==='add'&&plain(op.object)&&typeof op.object.assetId==='string'&&!known.has(op.object.assetId)?[op.object.assetId]:[]))];
  if(!missing.length||!resolve)return catalog;
  let assets:CatalogAsset[];
  try{assets=await resolve(missing,signal);}
  catch(error){if(signal?.aborted)throw error;throw new DesignerServiceError('The proposed furniture could not be loaded from the catalog. Try again.','service');}
  return [...catalog,...assets.filter(asset=>missing.includes(asset.id))];
}
function proposalFrom(value:unknown,revision:number,snapshot:SceneDocument,catalog:CatalogAsset[],keep:readonly string[]=[]):AgentProposal{
  const proposal=record(value,'Proposal');keys(proposal,['id','title','description','command'],'Proposal');
  text(proposal.id,'Proposal ID',120);text(proposal.title,'Proposal title',160);text(proposal.description,'Proposal description',4000);
  const command=record(proposal.command,'Command');keys(command,['id','label','source','baseRevision','operations'],'Command');
  text(command.id,'Command ID',120);text(command.label,'Command label',160);
  if(command.source!=='designer')fail('Proposal command source must be designer.','validation');
  if(command.baseRevision!==revision)fail('Designer proposal is stale or has a different base revision.','validation');
  if(!Array.isArray(command.operations)||command.operations.length<1||command.operations.length>500)fail('A proposal needs 1–500 furniture or appearance operations.','validation');
  const newMaterials=new Map<string,Json>(),usedMaterials=new Set<string>(),finishIds=new Set<string>(),finishFaces=new Set<string>(),deletedFinishes=new Map<string,string>();
  let migrations=0,finishes=0;
  // Validate the whole transaction before the disposable store applies any of it.
  for(const [index,value] of command.operations.entries()){
    const operation=record(value,'Operation');
    if(operation.type==='add')keys(operation,['type','object','on'],'Add operation');
    else if(operation.type==='delete')keys(operation,['type','id'],'Delete operation');
    else if(operation.type==='update'){
      keys(operation,['type','id','patch','on'],'Update operation');
      keys(record(operation.patch,'Object patch'),['name','position','rotation','scale','color','restsOn','materials'],'Object patch');
    }else if(operation.type==='update-wall'){
      keys(operation,['type','id','patch'],'Wall appearance operation');
      const wallId=appearanceWall(snapshot,operation.id),patch=record(operation.patch,'Wall colour patch');
      keys(patch,['color'],'Wall colour patch');
      if(typeof patch.color!=='string'||!/^#[0-9a-f]{6}$/i.test(patch.color))fail('Wall colour must be a six-digit hex value.','validation');
      if(snapshot.project?.mode==='renovate'||snapshot.project?.finishes.some(finish=>finish.entityId===wallId&&['wall-front','wall-back'].includes(finish.surface)))fail('Use wall finish assignments for a renovated or material-backed wall.','validation');
    }else if(operation.type==='update-room'){
      // Only the room-face snap the designer's export uses: same outline, each corner moved a few centimetres at most.
      keys(operation,['type','id','patch'],'Room outline snap');
      const roomId=designRoom(snapshot,operation.id),patch=record(operation.patch,'Room outline patch');keys(patch,['polygon'],'Room outline patch');
      const before=snapshot.rooms.find(room=>room.id===roomId)!.polygon,after=patch.polygon;
      if(!Array.isArray(after)||after.length!==before.length||after.some((point,i)=>!Array.isArray(point)||point.length!==2||point.some(value=>typeof value!=='number'||!Number.isFinite(value))||Math.hypot(point[0]-before[i]![0],point[1]-before[i]![1])>.1))fail('A room outline may only snap its corners onto the wall faces.','validation');
    }else if(operation.type==='migrate-project'){
      keys(operation,['type'],'Appearance migration');
      if(snapshot.version!==1||index!==0||++migrations>1)fail('Appearance migration must occur once at the start of a v1 proposal.','validation');
    }else if(operation.type==='upsert-material'){
      keys(operation,['type','material'],'Appearance material operation');
      const material=String(record(operation.material,'Appearance material').id).startsWith(DESIGN_MATERIAL)?designMaterial(operation.material):appearanceMaterial(operation.material),id=material.id as string;
      if(snapshot.project?.materials.some(existing=>existing.id===id)||newMaterials.has(id))fail('Designer appearance cannot overwrite an existing material.','validation');
      newMaterials.set(id,material);
    }else if(operation.type==='upsert-finish'){
      keys(operation,['type','finish'],'Wall finish operation');
      const finish=record(operation.finish,'Wall finish');keys(finish,['id','entityId','surface','materialId'],'Wall finish');
      const id=text(finish.id,'Finish ID',100),materialId=text(finish.materialId,'Finish material ID',100);
      // Floors and ceilings only as the designer's own records; walls as before.
      const room=id.startsWith(DESIGN_FINISH)&&(finish.surface==='floor'||finish.surface==='ceiling');
      const wallId=room?designRoom(snapshot,finish.entityId):appearanceWall(snapshot,finish.entityId);
      if(!room&&finish.surface!=='wall-front'&&finish.surface!=='wall-back')fail('Designer finishes support only wall-front and wall-back.','validation');
      const existing=snapshot.project?.finishes.find(entry=>entry.id===id),face=`${wallId}:${finish.surface}`;
      if(existing&&(existing.entityId!==wallId||existing.surface!==finish.surface))fail('A wall finish cannot replace an assignment on another surface.','validation');
      if(snapshot.project?.finishes.some(entry=>entry.entityId===wallId&&entry.surface===finish.surface&&entry.id!==id&&!deletedFinishes.has(entry.id))||finishIds.has(id)||finishFaces.has(face))fail('A wall face must retain its existing finish assignment without duplicates.','validation');
      finishIds.add(id);finishFaces.add(face);usedMaterials.add(materialId);finishes++;
    }else if(operation.type==='delete-finish'){
      keys(operation,['type','id'],'Finish removal');
      const existing=snapshot.project?.finishes.find(entry=>entry.id===operation.id);
      if(!existing||finishes)fail('Finish removals must name existing finishes and precede new finishes.','validation');
      deletedFinishes.set(existing.id,`${existing.entityId}:${existing.surface}`);
    }else if(operation.type==='set-metadata'){
      keys(operation,['type','id','patch'],'Ceiling design');designRoom(snapshot,operation.id);finishes++;
      const patch=record(operation.patch,'Ceiling design patch');keys(patch,['ceilingDesign'],'Ceiling design patch');
      if(patch.ceilingDesign!==null)record(patch.ceilingDesign,'Ceiling design');
    }else if(operation.type==='upsert-component'||operation.type==='delete-component'){
      const light=(value:Json|undefined)=>value?.kind==='light';finishes++;
      if(operation.type==='upsert-component'){
        keys(operation,['type','component'],'Light fixture');
        const component=record(operation.component,'Light fixture'),existing=snapshot.project?.components.find(entry=>entry.id===component.id);
        text(component.id,'Light fixture ID',100);
        if(!light(component)||component.phase!=='new'||(existing&&!light(existing as unknown as Json)))fail('Designer components are new light fixtures only.','validation');
      }else{
        keys(operation,['type','id'],'Light fixture removal');
        if(!light(snapshot.project?.components.find(entry=>entry.id===operation.id) as unknown as Json|undefined))fail('Designer can remove only light fixtures.','validation');
      }
    }else fail('Designer supports furniture changes and bounded wall appearance operations only.','validation');
  }
  // A designer's own finish can go; anyone else's only when the same face gets the design's finish.
  for(const [id,face] of deletedFinishes)if(!id.startsWith(DESIGN_FINISH)&&!finishFaces.has(face))fail('A finish can be removed only when its surface gets the new finish.','validation');
  if(migrations&&!finishes)fail('Appearance migration requires a wall finish.','validation');
  for(const id of newMaterials.keys())if(!usedMaterials.has(id))fail('Every new appearance material must be used by a wall finish.','validation');
  for(const id of usedMaterials)(id.startsWith(DESIGN_MATERIAL)?designMaterial:appearanceMaterial)(newMaterials.get(id)??snapshot.project?.materials.find(material=>material.id===id));
  const result=structuredClone(proposal) as unknown as AgentProposal;
  // This disposable store validates atomic editor semantics, including grouped moves.
  // Its revision is zero; the returned command retains the actual captured revision.
  const preview=new EditorStore(snapshot,catalog);
  const checked=preview.execute({...result.command,baseRevision:preview.revision},true);
  if(!checked.ok)fail(`Invalid designer proposal: ${checked.errors.join(' ')}`,'validation');
  // The store applies rigid group transforms, so check implicit changes to kept members too.
  for(const object of snapshot.objects){
    const metadata=snapshot.project?.metadata[object.id];
    if((keep.includes(object.id)||metadata?.locked||metadata?.phase==='retain')&&JSON.stringify(object)!==JSON.stringify(preview.scene.objects.find(candidate=>candidate.id===object.id)))fail('Designer proposal changes kept or locked furniture.','validation');
  }
  return result;
}

/** Network boundary only: returns a preview; application and approval remain with the editor. */
export function createDesignerHttpAdapter(options:DesignerHttpOptions={}):DesignerAdapter{
  const configured={
    events:options.events,onEvent:options.onEvent,onAssets:options.onAssets,
    image:options.image===undefined?undefined:structuredClone(options.image),
    url:options.url??'http://localhost:8787/designer/propose',
    request:options.request??'Make the room feel bigger by rearranging the furniture I already own at zero cost.',
    keep:options.keep===undefined?undefined:structuredClone(options.keep),
    northDeg:options.northDeg,doorSwings:options.doorSwings===undefined?undefined:structuredClone(options.doorSwings),
    conversationId:options.conversationId,design:options.design===undefined?undefined:structuredClone(options.design),catalog:options.catalog===undefined?undefined:structuredClone(options.catalog),
    vision:options.vision===undefined?undefined:structuredClone(options.vision),
    catalogCurrency:options.catalogCurrency,resolveAssets:options.resolveAssets,onPreview:options.onPreview,onPartial:options.onPartial,onProgress:options.onProgress,onMessageDelta:options.onMessageDelta,onConversationId:options.onConversationId,onMetrics:options.onMetrics,onNotes:options.onNotes,
    fetch:options.fetch??globalThis.fetch.bind(globalThis),
  };
  return {async propose(scene,revision,signal){
    checkAbort(signal);
    if(!Number.isSafeInteger(revision)||revision<0)fail('A nonnegative integer scene revision is required.','validation');
    const snapshot=structuredClone(scene),catalog=structuredClone(configured.catalog??localCatalog);
    // The store checks the original snapshot before anything is uploaded.
    try{new EditorStore(snapshot,catalog);}catch(error){fail(error instanceof Error?error.message:'Invalid editor scene.','validation');}
    if(configured.events!==undefined&&typeof configured.events!=='boolean')fail('events must be a boolean.','validation');
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
    if(configured.image!==undefined)validateDesignerImage(configured.image);
    const body=JSON.stringify({scene:snapshot,revision,request:configured.request,...(configured.events===undefined?{}:{events:configured.events}),
      ...(configured.image===undefined?{}:{image:configured.image}),
      ...(configured.vision===undefined?{}:{vision:configured.vision}),
      ...(configured.keep===undefined?{}:{keep:configured.keep}),...(configured.northDeg===undefined?{}:{northDeg:configured.northDeg}),
      ...(configured.doorSwings===undefined?{}:{doorSwings:configured.doorSwings}),...(configured.conversationId===undefined?{}:{conversationId:configured.conversationId}),...(configured.design===undefined?{}:{design:configured.design}),
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
      if(!response.ok){
        // The service explains a refusal in an NDJSON error line; show that, not just the status.
        let detail='';
        try{const body=await abortable(response.text(),signal);const first=JSON.parse(body.split('\n')[0]??'') as Json;if(typeof first.message==='string')detail=first.message.slice(0,500);}catch{/* no readable reason */}
        throw new DesignerServiceError(detail?`Designer service refused the request: ${detail}`:`Designer service returned HTTP ${response.status}.`,'http',response.status);
      }
      if(response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()!=='application/x-ndjson')fail('Designer service must return application/x-ndjson.');
      if(!response.body)fail('Designer service returned no response stream.');
      reader=response.body.getReader();
      const decoder=new TextDecoder('utf-8',{fatal:true});let pending='',bytes=0,draftLength=0,terminal:Json|undefined;
      // Partials validate asynchronously (catalog lookups); they run in order and finish before the final record is used.
      let partials:Promise<void>=Promise.resolve();
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
        if(entry.type==='preview'){
          keys(entry,['type','image','caption'],'Preview');
          if(typeof entry.image!=='string'||entry.image.length>700_000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(entry.image))fail('Preview must be a small base64 image data URL.');
          const caption=entry.caption===undefined?undefined:text(entry.caption,'Preview caption',200);
          configured.onPreview?.({image:entry.image,...(caption===undefined?{}:{caption})});return;
        }
        if(entry.type==='partial'){
          keys(entry,['type','proposal','rooms','metrics'],'Partial proposal');
          if(!Array.isArray(entry.rooms)||entry.rooms.length>20)fail('Partial rooms must be a short list.');
          const rooms=entry.rooms.map(value=>text(value,'Partial room',200));
          if(entry.metrics!==undefined)record(entry.metrics,'Partial metrics');
          partials=partials.then(async()=>{
            try{
              const proposal=proposalFrom(entry.proposal,revision,snapshot,await proposedCatalog(entry.proposal,catalog,configured.resolveAssets,signal),configured.keep);
              configured.onPartial?.({proposal,rooms,...(entry.metrics===undefined?{}:{metrics:structuredClone(entry.metrics)})});
            }catch(error){if(signal?.aborted)return;console.warn('Designer partial proposal skipped:',error instanceof Error?error.message:error);}
          });
          return;
        }
        if(entry.type==='tool'||entry.type==='build'){
          if(!configured.events)fail('Designer sent events without opt-in.');
          const event=parseDesignerEvent(entry);configured.onEvent?.(event);return;
        }
        if(entry.type==='message_delta'){
          keys(entry,['type','delta'],'Message delta');
          if(typeof entry.delta!=='string'||!entry.delta.length)fail('Message delta must be nonempty text.');
          draftLength+=entry.delta.length; if(draftLength>4000)fail('Streamed answer exceeds 4000 characters.');
          configured.onMessageDelta?.(entry.delta);return;
        }
        if(!['proposal','question','message','decline','error'].includes(String(entry.type)))fail('Designer response has an unknown record type.');
        terminal=entry;
      };
      while(true){
        const current=reader;
        const chunk=await abortable(current.read(),signal,()=>{void current.cancel().catch(()=>{});});
        checkAbort(signal);
        if(chunk.done){pending+=decoder.decode();break;}
        bytes+=chunk.value.byteLength;if(bytes>MAX_RESPONSE_BYTES)fail('Designer response exceeds the 16 MB limit.');
        pending+=decoder.decode(chunk.value,{stream:true});
        let newline:number;
        while((newline=pending.indexOf('\n'))>=0){consume(pending.slice(0,newline));pending=pending.slice(newline+1);}
        if(pending.length>MAX_LINE)fail('Designer response line exceeds the 1 MB limit.');
      }
      if(pending)consume(pending);
      if(!terminal)fail('Designer response ended without a final record.');
      await partials;
      const final:Json=terminal;
      const conversationId=final.conversationId===undefined?undefined:text(final.conversationId,'Conversation ID',200);
      let proposal:AgentProposal|undefined,question:string|undefined,choices:string[]|undefined,message:string|undefined,notes:string|undefined,suggestions:string[]|undefined,assets:CatalogAsset[]|undefined;
      if(final.type==='proposal'){
        keys(final,['type','conversationId','proposal','metrics','notes','assets'],'Proposal response');
        if(final.metrics!==undefined)record(final.metrics,'Metrics');
        if(final.notes!==undefined)notes=text(final.notes,'Proposal notes',1600);
        if(final.assets!==undefined){
          if(!conversationId||!Array.isArray(final.assets)||final.assets.length>100)fail('Invalid private assets.');
          const referenced=new Set((record(record(final.proposal,'Proposal').command,'Command').operations as unknown[] ?? []).flatMap(op=>{const o=record(op,'Operation');return o.type==='add'?[record(o.object,'Object').assetId]:[];}));
          assets=final.assets.map(value=>{
            const a=structuredClone(record(value,'Custom asset'));keys(a,['id','name','category','kind','dimensions','color','price','source','materialSlots'],'Custom asset');
            const id=text(a.id,'Custom asset ID',100),source=record(a.source,'Custom asset source');
            if(!id.startsWith(`custom-${conversationId}-`)||!/^custom-[A-Za-z0-9-]+-\d+$/.test(id)||!referenced.has(id)||!Number.isSafeInteger(a.price))fail('Invalid private asset identity or price.');
            if(source.type==='gltf'){
              keys(source,['type','url'],'Custom GLB source');
              if(source.url!==`/designer/files/${conversationId}/${id}.glb`)fail('Invalid private GLB URL.');
              source.url=new URL(source.url as string,new URL(configured.url,globalThis.location?.href??'http://localhost')).href;
            }else{keys(source,['type'],'Custom source');if(source.type!=='procedural')fail('Invalid private asset source.');}
            const existing=catalog.find(asset=>asset.id===id);
            if(existing&&JSON.stringify(existing)!==JSON.stringify(a))fail('Private assets cannot replace registered catalog identities.');
            return a as unknown as CatalogAsset;
          });
        }
        const merged=[...catalog,...(assets??[]).filter(asset=>!catalog.some(existing=>existing.id===asset.id))];
        if(new Set(assets?.map(asset=>asset.id)).size!==(assets?.length??0))fail('Duplicate private assets.');
        proposal=proposalFrom(final.proposal,revision,snapshot,await proposedCatalog(final.proposal,merged,configured.resolveAssets,signal),configured.keep);
      }else if(final.type==='question'){
        keys(final,['type','conversationId','question','options'],'Question response');question=text(final.question,'Question',1000);
        if(final.options!==undefined){
          if(!Array.isArray(final.options)||final.options.length===1||final.options.length>4)fail('A question must have zero or two to four options when supplied.');
          if(final.options.length)choices=final.options.map(value=>text(value,'Question option',300));
        }
      }else{
        keys(final,final.type==='message'?['type','conversationId','message','suggestions']:['type','conversationId','message'],'Terminal response');
        if(final.suggestions!==undefined){
          if(!Array.isArray(final.suggestions)||final.suggestions.length>4)fail('Message suggestions must be an array of at most four strings.');
          suggestions=final.suggestions.map(value=>text(value,'Message suggestions',300));
        }message=text(final.message,'Designer message',4000);
      }
      checkAbort(signal);
      if(conversationId)configured.onConversationId?.(conversationId);
      if(proposal){if(assets!==undefined)configured.onAssets?.(structuredClone(assets));if(final.metrics!==undefined)configured.onMetrics?.(structuredClone(final.metrics));if(notes!==undefined)configured.onNotes?.(notes);return proposal;}
      if(final.type==='question')throw new DesignerQuestionError(question!,choices,conversationId);
      if(final.type==='message')throw new DesignerMessageReply(message!,suggestions,conversationId);
      if(final.type==='decline')throw new DesignerDeclineError(message!,conversationId);
      throw new DesignerServiceError(message!,'service');
    }catch(error){
      if(signal?.aborted)throw abortError();
      if(error instanceof DesignerMessageReply||error instanceof DesignerServiceError||error instanceof DesignerQuestionError||error instanceof DesignerDeclineError)throw error;
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
  let conversationId:string|undefined,metrics:unknown,notes:string|undefined,assets:CatalogAsset[]|undefined;
  try{
    checkAbort(opts.signal);
    req=structuredClone(req);
    const vision=opts.vision?await requestVision(req.scene,req.revision,opts.vision,opts.signal):req.vision;
    checkAbort(opts.signal);
    const adapter=createDesignerHttpAdapter({
      events:req.events,onEvent:opts.onEvent,onAssets:value=>{assets=value;},
      image:req.image,vision,url:serviceUrl(opts.baseUrl),request:req.request,conversationId:req.conversationId,design:req.design,fetch:opts.fetch,
      keep:req.keep,doorSwings:req.doorSwings,northDeg:req.northDeg,catalog:req.catalog,catalogCurrency:req.catalogCurrency,resolveAssets:opts.resolveAssets,
      onPreview:opts.onPreview,onPartial:opts.onPartial,onProgress:opts.onProgress,onMessageDelta:opts.onMessageDelta,onConversationId:id=>{conversationId=id;},onMetrics:value=>{metrics=value;},onNotes:value=>{notes=value;},
    });
    const proposal=await adapter.propose(req.scene,req.revision,opts.signal);
    if(!conversationId)return {type:'error',message:'Designer response is missing its conversation ID.'};
    return {type:'proposal',conversationId,proposal,...(metrics===undefined?{}:{metrics}),...(notes===undefined?{}:{notes}),...(assets===undefined?{}:{assets})};
  }catch(error){
    if(opts.signal?.aborted||(error instanceof Error&&error.name==='AbortError'))throw abortError();
    if(error instanceof DesignerQuestionError){
      if(!error.conversationId)return {type:'error',message:'Designer question is missing its conversation ID.'};
      return {type:'question',conversationId:error.conversationId,question:error.question,options:error.options??[]};
    }
    if(error instanceof DesignerMessageReply){
      if(!error.conversationId)return {type:'error',message:'Designer answer is missing its conversation ID.'};
      return {type:'message',conversationId:error.conversationId,message:error.message,...(error.suggestions===undefined?{}:{suggestions:error.suggestions})};
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

/** Is the designer service up, and warm? Never throws: an unreachable service is `{ok:false}`. */
export async function designerHealth(opts:{baseUrl?:string;signal?:AbortSignal;fetch?:typeof globalThis.fetch;timeoutMs?:number}={}):Promise<DesignerHealth>{
  const url=serviceUrl(opts.baseUrl).replace(/\/propose$/,'/health');
  const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),opts.timeoutMs??3000);
  const abort=()=>timeout.abort();opts.signal?.addEventListener('abort',abort,{once:true});
  try{
    const response=await (opts.fetch??globalThis.fetch)(url,{signal:timeout.signal,cache:'no-store'});
    if(!response.ok)return {ok:false};
    const value=record(JSON.parse((await response.text()).split('\n')[0]??''),'Health');
    const warm=value.warm!==null&&typeof value.warm==='object'?value.warm as Record<string,unknown>:undefined;
    return {ok:value.ok===true,...(typeof value.engine==='string'?{engine:value.engine}:{}),
      ...(warm?{warm:{...(typeof warm.renderer==='string'?{renderer:warm.renderer}:{}),...(typeof warm.codex==='string'?{codex:warm.codex}:{})}}:{})};
  }catch{return {ok:false};}
  finally{clearTimeout(timer);opts.signal?.removeEventListener('abort',abort);}
}

/** End private image/build/history retention after the customer leaves this conversation. */
export async function endDesignerConversation(conversationId:string,opts:{baseUrl?:string;signal?:AbortSignal;fetch?:typeof globalThis.fetch}={}):Promise<void>{
 if(!/^[A-Za-z0-9-]{1,200}$/.test(conversationId))throw new DesignerServiceError('Invalid conversation ID.','validation');
 const url=serviceUrl(opts.baseUrl).replace(/\/propose$/,'/conversations/'+encodeURIComponent(conversationId));
 const response=await (opts.fetch??globalThis.fetch)(url,{method:'DELETE',signal:opts.signal});
 if(!response.ok)throw new DesignerServiceError(`Could not end conversation (HTTP ${response.status}).`,'http',response.status);
}
