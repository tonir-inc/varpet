import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseScene,applyOps} from './adapter.js';
import {DesignerSession} from './session.js';
import {SceneAnalysisCache} from './fast-path.js';
import {searchCatalog,searchCatalogInputSchema,proxyCatalogQuery,type CatalogQuery} from './catalog.js';
import {candidateSheet} from './catalog-vision.js';
import {planIncrementally,intentFor,slotAsset} from './incremental-room.js';
import {place,placeInputSchema} from './place.js';
import {relationsToolSchema} from './tool-inputs.js';
import {ask,askInputSchema} from './ask.js';
import type {Scene,Op} from './scene.js';
import type {Intent} from './request.js';
import {spaceMetrics} from './metrics/space.js';
import {functionClearances} from './metrics/function.js';

const id=z.string().trim().min(1).max(200);
const planSchema=z.object({room_id:id,program:z.enum(['living','bedroom','kids','office','dining','entry','kitchen','bathroom']),style:z.string().max(500).optional(),budget:z.number().int().nonnegative().safe().optional(),keep:z.array(id).max(200).optional(),history:z.array(z.string().max(2000)).max(12).optional()}).strict();
interface Option {ops:Op[];intent:Intent;note:string;missing:string[];complete:boolean;epoch:number}
export interface TypedOptions {catalogQuery?:CatalogQuery;proposalsDir?:string;customerRequests?:readonly string[];images?:(ids:string[])=>Promise<unknown>}

/** New runtime surface; no schema accepts operation JSON or poses. Full evidence stays in this process/on disk. */
export function createTypedServer(input:Scene,config:TypedOptions={}){
 const scene=parseScene(input),server=new McpServer({name:'varpet-designer',version:'1.0.0'}),cache=new SceneAnalysisCache();
 const options=new Map<string,Option>(),slots=new Map<string,{piece:string;ops:Op[];epoch:number}>(),seen=new Set<string>();
 const evidence=new Map<string,unknown>(),dir=config.proposalsDir??process.env.VARPET_PROPOSALS_DIR,history=config.customerRequests??[];
 const session=new DesignerSession(scene,history);
 let staged:Op[]=[],epoch=0,asked=false;
 const preview=()=>applyOps(scene,staged);
 const receipt=(data:unknown,isError=false)=>{
  let text=JSON.stringify(data);if(text.length>3000){const key=randomUUID();evidence.set(key,data);text=JSON.stringify({ok:!isError,evidence_id:key,message:'Detailed evidence retained server-side; narrow the request for a smaller receipt.'});}
  return {content:[{type:'text' as const,text}],...(isError?{isError:true}:{})};
 };
 const error=(e:unknown)=>receipt({ok:false,message:(e instanceof Error?e.message:String(e)).slice(0,1800),next:'Use returned room, item, slot or option IDs. If no fit was found, try fewer pieces or a different room.'},true);
 const checked=(ops:Op[],intent=intentFor(scene,ops),note='Checked layout for review.')=>{session.setIntent(intent);return session.propose(ops,note.slice(0,3900).replace(/\s+/g,' '));};
 const saveOption=(option:Omit<Option,'epoch'>)=>{const key=`option-${randomUUID()}`;options.set(key,{...option,epoch});return key;};
 const inspect=async(ids:string[])=>{const response=await candidateSheet(ids,config.images);ids.forEach(id=>seen.add(id));return [...response.content.filter(p=>p.type==='image'),{type:'text' as const,text:response.content.filter(p=>p.type==='text').map(p=>p.text).join('\n').slice(0,1000)}];};
 const query=(roomId:string,planning=false)=>config.catalogQuery??(process.env.VARPET_CATALOG_PROXY?proxyCatalogQuery(roomId,{},planning):undefined);
 const saveStage=(ops:Op[])=>{
  const trial=[...staged,...ops],validation=checked(trial);if(!validation.ok)return receipt({ok:false,errors:validation.errors.slice(0,3).map(e=>({check:e.check,message:e.message}))},true);
  staged=trial;epoch++;return receipt({ok:true,staged_changes:staged.length,next:'Call propose to save these checked changes for customer review.'});
 };
 server.registerTool('inspect_layout',{description:'Read measured open floor, access and furniture relationships in the current room, without editing. Use to explain why the actual layout works; measurements are geometric, not observed daylight.',inputSchema:z.object({room_id:id}).strict()},async({room_id})=>{
  try{const current=preview(),room=current.rooms.find(r=>r.id===room_id);if(!room)throw new Error('Unknown room_id');
   const items=current.items.filter(i=>i.room_id===room_id),ids=new Set(items.map(i=>i.id)),space=spaceMetrics(current).rooms.find(r=>r.room_id===room_id);
   return receipt({room_id,items:items.map(i=>({id:i.id,kind:i.kind})).slice(0,20),free_area_m2:space?.free_area_m2,largest_open_rectangle_m2:space?.largest_free_rectangle?.area_m2,walkways:space?.walkways.slice(0,6),clearances:functionClearances(current).filter(c=>ids.has(c.item_id)).slice(0,10).map(c=>({function:c.function,side:c.side,item_id:c.item_id,other_item_id:c.other_item_id,clearance_m:c.clearance_m,status:c.status})),note:'Measured from the current scene; preserve missing or warning results in the explanation.'});
  }catch(e){return error(e);}
 });
 server.registerTool('plan_room',{description:'Furnish incrementally using the room program: anchor first, then each piece against the updated scene. Returns checked complete or honestly labelled partial options plus exact product previews. Inspect images, then propose option_id. Never invent coordinates. Existing furniture is preserved.',inputSchema:planSchema},async request=>{
  try{
   if(staged.length)throw new Error('Finish the staged edit with propose before starting a room plan.');
   const startedEpoch=epoch;
   const plan=await planIncrementally(scene,request,query(request.room_id,true),history);
   if(epoch!==startedEpoch)throw new Error('Layout changed during planning. Your staged edits are preserved; propose them or plan again.');
   const evidenceId=randomUUID();evidence.set(evidenceId,plan);
   if(dir){await mkdir(join(dir,'evidence'),{recursive:true});await writeFile(join(dir,'evidence',evidenceId+'.json'),JSON.stringify(plan),{flag:'wx',mode:0o600});}
   if(!plan.ops.length)return receipt({ok:false,complete:false,missing:plan.missing,reason:plan.reason,next:'No new anchor fit was found. Try a smaller single product with search_catalog; do not claim impossibility.'},true);
   const valid=checked(plan.ops,plan.intent,plan.reason);if(!valid.ok)return receipt({ok:false,errors:valid.errors.slice(0,3)},true);
   const ids=[...new Set(plan.products.map(p=>p.sku))];
   const option_id=saveOption({...plan,note:plan.reason});
   const images=[];let inspection='Exact SKU previews attached; check appearance before proposing.';
   try{for(let i=0;i<ids.length;i+=12)images.push(...await inspect(ids.slice(i,i+12)));}catch{inspection='Previews unavailable. Layout retained: call show_candidates for the listed products before propose.';}
   if(epoch!==startedEpoch){options.delete(option_id);throw new Error('Layout changed during preview inspection. Plan again after proposing your staged edits.');}
   const out=receipt({ok:true,options:[{option_id,complete:plan.complete,missing:plan.missing,cost_dram:valid.proposal.checks.price.cost_dram,products:ids.map((catalog_id,index)=>({tile:index+1,catalog_id})),note:plan.reason.slice(0,500)}],evidence_id:evidenceId,timing:plan.timing,inspection,next:'One checked incremental layout found. Inspect products then propose(option_id). Catalog mock prices are estimates.'});
   return {...out,content:[...out.content,...images]};
  }catch(e){return error(e);}
 });
 server.registerTool('search_catalog',{description:'Find one purchase with checked free slots. Independent queries run in parallel. Returns option IDs with exact product previews: inspect then propose(option_id), or stage place(piece_or_catalog_id, slot_id). No invented dimensions.',inputSchema:z.object({room_id:id,queries:z.array(searchCatalogInputSchema).min(1).max(4)}).strict()},async({room_id,queries})=>{
  try{
   if(!scene.rooms.some(r=>r.id===room_id))throw new Error('Unknown room_id');
   const startedEpoch=epoch;
   const results=await Promise.all(queries.map(q=>searchCatalog({...q,limit:Math.min(q.limit??4,4)},query(room_id))));
   if(epoch!==startedEpoch)throw new Error('Layout changed during catalog search. Search again for current slots.');
   const products=results.flatMap(r=>r.results).slice(0,6),candidates=[];
   for(const product of products){
    const found=cache.slots(preview(),[slotAsset(product)],{roomId:room_id,catalogId:product.sku,maxChecks:16});
    for(const candidate of found.slice(0,1)){
     const ops=[...staged,...candidate.ops],intent=intentFor(scene,ops,{room_id});if(!checked(ops,intent).ok)continue;
     const slot_id=`slot-${randomUUID()}`;slots.set(slot_id,{piece:product.sku,ops:candidate.ops,epoch});
     const option_id=saveOption({ops,intent,note:`Add ${product.name.slice(0,100)} in the checked slot.`,missing:[],complete:true});
     candidates.push({catalog_id:product.sku,slot_id,option_id,name:product.name.slice(0,80),price:product.price,price_source:product.price_source});
    }
   }
   const images=candidates.length?await inspect([...new Set(candidates.map(c=>c.catalog_id))]):[];
   const out=receipt({ok:!!candidates.length,candidates,reason:candidates.length?'Inspect the attached products, then propose one option ID.':'No checked product fit found; try a different kind or room. This is not proof of impossibility.',catalog_status:results.map(r=>r.status)});
   return {...out,content:[...out.content,...images]};
  }catch(e){return error(e);}
 });
 server.registerTool('place',{description:'Stage an exact catalog or owned piece in a returned slot. Code composes and checks the operation. Call propose afterward.',inputSchema:z.object({piece_or_catalog_id:id,slot_id:id}).strict()},async({piece_or_catalog_id,slot_id})=>{
  const slot=slots.get(slot_id);if(!slot||slot.piece!==piece_or_catalog_id||slot.epoch!==epoch)return error('Unknown, mismatched or stale slot. Search again after changing the layout.');return saveStage(slot.ops);
 });
 server.registerTool('move',{description:'Stage moving an existing item by a semantic relation or returned slot. Kept items and rigid groups remain protected.',inputSchema:z.object({item_id:id,slot_id:id.optional(),relation:relationsToolSchema.element.optional()}).strict()},async({item_id,slot_id,relation})=>{
  try{
   const item=preview().items.find(i=>i.id===item_id);if(!item||item.keep)throw new Error('Unknown or kept item; choose a movable item.');
   if(Boolean(slot_id)===Boolean(relation))throw new Error('Supply exactly one slot_id or relation');
   if(slot_id){const slot=slots.get(slot_id);if(!slot||slot.piece!==item_id||slot.epoch!==epoch)throw new Error('Unknown or stale item slot');return saveStage(slot.ops);}
   const choices=place(preview(),placeInputSchema.parse({room_id:item.room_id,item_id,relations:[relation!]})).candidates;
   for(const c of choices)if(checked([...staged,c.op]).ok)return saveStage([c.op]);
   throw new Error('No checked position satisfies that relation. Try another anchor or wall.');
  }catch(e){return error(e);}
 });
 server.registerTool('remove',{description:'Stage removal of an existing movable piece; checked against keeps and customer history.',inputSchema:z.object({item_id:id}).strict()},async({item_id})=>{
  const item=preview().items.find(i=>i.id===item_id);if(!item||item.keep)return error('Unknown or kept item; choose a movable item.');return saveStage([{type:'remove',id:item_id}]);
 });
 server.registerTool('paint',{description:'Stage a finish change to a wall or item. Colour uses #RRGGBB. Paint and labour are unquoted. Call propose after painting the requested targets.',inputSchema:z.object({target:z.object({type:z.enum(['wall','item']),id}).strict(),colour:z.string().regex(/^#[0-9a-fA-F]{6}$/)}).strict()},async({target,colour})=>saveStage([{type:'color',target:target.type,id:target.id,color:colour}]));
 server.registerTool('show_candidates',{description:'Inspect exact catalog product renders (up to 12). Blank imagery is unknown; choose only products you inspected.',inputSchema:z.object({item_ids:z.array(id).min(1).max(12)}).strict()},async({item_ids})=>{try{const images=await inspect(item_ids),out=receipt({ok:true,products:item_ids.map((catalog_id,index)=>({tile:index+1,catalog_id}))});return {...out,content:[...out.content,...images]};}catch(e){return error(e);}});
 server.registerTool('propose',{description:'Save a returned option_id or the edits staged by place/move/remove/paint. Code owns operations and checks them again. A partial plan stays explicitly partial. This does not apply changes: customer acceptance in the editor is required.',inputSchema:z.object({option_id:id.optional()}).strict()},async({option_id})=>{
  try{
   const option=option_id?options.get(option_id):undefined;if(option_id&&(!option||option.epoch!==epoch))throw new Error('Unknown or stale option_id; plan again after editing.');
   const ops=option?.ops??staged,missing=ops.flatMap(o=>o.type==='add'&&!seen.has(o.item.sku??'')?[o.item.sku]:[]);if(missing.length)throw new Error('Inspect the selected products with show_candidates first: '+missing.join(', '));
   const proposal=checked(ops,option?.intent??intentFor(scene,ops),option?.note??'Checked changes ready for your review.');
   if(!proposal.ok)return receipt({ok:false,errors:proposal.errors.slice(0,3).map(e=>({check:e.check,message:e.message}))},true);
   evidence.set(proposal.proposal_id,proposal.proposal);
   if(dir){await mkdir(dir,{recursive:true});const temp=join(dir,`.${randomUUID()}.tmp`);try{await writeFile(temp,JSON.stringify(proposal.proposal),{flag:'wx',mode:0o600});await rename(temp,join(dir,proposal.proposal_id+'.json'));}catch(e){await rm(temp,{force:true});throw new Error('Could not save proposal for the editor. Retry after storage is available.');}}
   return receipt({ok:true,proposal_id:proposal.proposal_id,complete:option?.complete??true,missing:option?.missing??[],message:proposal.proposal.rationale.slice(0,1700),requires_user_acceptance:true,application_status:'not_applied',cost_dram:proposal.proposal.checks.price.cost_dram});
  }catch(e){return error(e);}
 });
 server.registerTool('ask',{description:'Ask at most one necessary clarification, then wait for the customer.',inputSchema:askInputSchema},async input=>{if(asked)return error('Wait for the answer to the previous question.');asked=true;return receipt(ask(input));});
 return server;
}
