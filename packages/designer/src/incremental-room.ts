/** Incremental program construction. The model supplies intent; code owns every pose. */
import {roomPrograms} from '../knowledge/room-programs.js';
import {resolveStyles} from '../knowledge/styles/index.js';
import {searchRoomCatalog} from './taste/catalog.js';
import {SceneAnalysisCache} from './fast-path.js';
import {applyOps} from './adapter.js';
import {DesignerSession} from './session.js';
import {requestPolicy,canonicalKind} from './request-policy.js';
import {scoreComposition} from './taste/composition.js';
import type {CatalogProduct,CatalogQuery} from './catalog.js';
import type {CatalogAsset} from '../../../apps/editor/src/contracts.js';
import type {Scene,Op,Item} from './scene.js';
import type {Intent} from './request.js';

export const counts=(items:Item[])=>Object.entries(items.reduce<Record<string,number>>((a,i)=>(a[i.kind]=(a[i.kind]??0)+1,a),{})).map(([kind,count])=>({kinds:[kind],count}));
export function intentFor(scene:Scene,ops:Op[],extra:Intent={}):Intent{
 return {...extra,add:counts(ops.flatMap(o=>o.type==='add'?[o.item]:[])),remove:counts(ops.flatMap(o=>o.type==='remove'?scene.items.filter(i=>i.id===o.id):[])),move:counts(ops.flatMap(o=>o.type==='move'?scene.items.filter(i=>i.id===o.id):[])),colors:ops.flatMap(o=>o.type==='color'?[{target:o.target,id:o.id,color:o.color}]:[])};
}
// This descriptor is used only by the geometric slot cache. Publication still resolves the real SKU through the editor catalog bridge.
export const slotAsset=(p:CatalogProduct):CatalogAsset=>({id:p.sku,name:p.name.slice(0,120),kind:p.kind as CatalogAsset['kind'],category:p.kind,dimensions:[p.size[0],p.size[2],p.size[1]],price:p.price,color:'#b8b4ad',source:{type:'procedural'}});
export interface RoomPlanRequest {room_id:string;program:string;style?:string;budget?:number;keep?:string[];history?:string[]}
export interface RoomPlan {ops:Op[];intent:Intent;missing:string[];complete:boolean;reason:string;products:CatalogProduct[];timing:{catalog_ms:number;placement_ms:number};evidence:unknown}

/** Related poses first; ranked single-piece slots are the common fallback. */
export function* pieceOps(scene:Scene,p:CatalogProduct,roomId:string,cache:SceneAnalysisCache,role='',anchor?:Item,index=0):Generator<Op>{
 const candidates:Op[]=[];
 if(anchor){
  const related=(x:number,y:number,rotation=anchor.rot)=>{const t=anchor.rot*Math.PI/180;candidates.push({type:'add',item:{...p.item,name:p.name.slice(0,120),id:`room-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,rot:rotation,pos:[anchor.pos[0]+x*Math.cos(t)-y*Math.sin(t),anchor.pos[1]+x*Math.sin(t)+y*Math.cos(t)]}});};
  if(role==='table')for(const x of [0,-.25,.25])related(x,-(anchor.size[1]+p.size[1])/2-.41);
  if(role==='focal_point')for(const gap of [2,1.5,2.5])related(0,-(anchor.size[1]+p.size[1])/2-gap,(anchor.rot+180)%360);
  if(role==='light'||role==='task_light')for(const side of [1,-1])for(const gap of [.15,.45,.6])related(side*((anchor.size[0]+p.size[0])/2+gap),0);
  if(role==='work_seat')related(0,-(anchor.size[1]+p.size[1])/2-.4,(anchor.rot+180)%360);
  if(role==='rug'){
   const t=anchor.rot*Math.PI/180,dist=anchor.size[1]/2+p.size[1]/2-.25;
   candidates.push({type:'add',item:{...p.item,name:p.name.slice(0,120),id:`room-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,rot:anchor.rot,pos:[anchor.pos[0]+Math.sin(t)*dist,anchor.pos[1]-Math.cos(t)*dist]}});
  }
  if(role==='nightstands'||role==='bedside_lights'){
   const side=index===0?-1:1,t=anchor.rot*Math.PI/180,x=side*(anchor.size[0]/2+p.size[0]/2+.65),y=role==='nightstands'?anchor.size[1]/2-p.size[1]/2:anchor.size[1]/2-.85;
   candidates.push({type:'add',item:{...p.item,name:p.name.slice(0,120),id:`room-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,rot:anchor.rot,pos:[anchor.pos[0]+x*Math.cos(t)-y*Math.sin(t),anchor.pos[1]+x*Math.sin(t)+y*Math.cos(t)]}});
  }
 }
 for(const candidate of candidates)yield candidate;
 const hasWindow=scene.openings.some(o=>o.kind==='window'&&scene.walls.some(w=>w.id===o.wall_id&&w.room_id===roomId));
 const slots=cache.slots(scene,[slotAsset(p)],{roomId,catalogId:p.sku,maxChecks:16,solidHeadboard:p.kind==='bed',faceWindow:role==='seating_anchor'&&hasWindow});
 const filtered=slots.flatMap(c=>c.ops);
 if(role==='seating_anchor'){
  const room=scene.rooms.find(r=>r.id===roomId)!;
  const center=room.polygon.reduce((sum,p)=>[sum[0]+p[0]/room.polygon.length,sum[1]+p[1]/room.polygon.length],[0,0]);
  const alignment=(o:Op)=>{if(o.type!=='add')return 0;const t=o.item.rot*Math.PI/180,dx=center[0]!-o.item.pos[0],dy=center[1]!-o.item.pos[1];return (Math.sin(t)*dx-Math.cos(t)*dy)/Math.hypot(dx,dy);};
  filtered.sort((a,b)=>alignment(b)-alignment(a));
 }
 yield* filtered;
}

export async function planIncrementally(scene:Scene,request:RoomPlanRequest,query?:CatalogQuery,history:readonly string[]=[]):Promise<RoomPlan>{
 const started=performance.now();
 const program=roomPrograms[request.program];if(!program)throw new Error('Choose a supported room program');
 if(!scene.rooms.some(r=>r.id===request.room_id))throw new Error('Unknown room_id; use a room from the scene');
 const checkKeeps=new DesignerSession(scene,history);checkKeeps.setIntent({keeps:request.keep});
 const styles=resolveStyles(request.style??''),catalog=await searchRoomCatalog(request.program,styles.length?styles:['modern'],query,true,request.budget);
 const catalogMs=performance.now()-started;
 const blocked=new Set(requestPolicy(history).blocked_kinds),cache=new SceneAnalysisCache(),ops:Op[]=[],missing:string[]=[],chosen:CatalogProduct[]=[];
 const extra:Intent={room_id:request.room_id,keeps:request.keep,budget_dram:request.budget};
 let preview=scene,anchor:Item|undefined,desk:Item|undefined,cost=0;
 const roles=[...program.essentials];
 if(request.program==='living')roles.sort((a,b)=>['seating_anchor','rug','table','light','focal_point'].indexOf(a.role)-['seating_anchor','rug','table','light','focal_point'].indexOf(b.role));
 const failures:unknown[]=[];
 let deadline=Infinity;
 const used=new Set<string>();
 const qualifies=(kind:string,size:Item['size'],role:string)=>!(role==='bed'&&request.program==='bedroom'&&size[0]<1.4)&&!(role==='storage'&&kind==='wardrobe'&&(size[1]<.4||size[2]<1.4));
 for(const role of roles){
  if(role!==roles[0]&&!anchor){missing.push(`${role.role}: anchor has no checked fit`);continue;}
  const existing=scene.items.filter(i=>!used.has(i.id)&&i.room_id===request.room_id&&role.kinds.includes(i.kind)&&qualifies(i.kind,i.size,role.role));
  for(let n=0;n<role.count;n++){
   if(existing[n]){used.add(existing[n]!.id);if(!anchor){anchor=existing[n];deadline=performance.now()+12000;}if(role.role==='work_surface')desk=existing[n];continue;}
   const kinds=role.preferred_kinds??role.kinds;
   const choices=kinds.flatMap(kind=>catalog.products[kind]??[]).filter(p=>!blocked.has(canonicalKind(p.kind))&&p.price+cost<=(request.budget??Infinity)
    &&qualifies(p.kind,p.size,role.role));
   choices.sort((a,b)=>(request.budget===undefined?0:a.price-b.price)||kinds.indexOf(a.kind)-kinds.indexOf(b.kind)||a.size[0]*a.size[1]-b.size[0]*b.size[1]);
   let selected:Op|undefined,product:CatalogProduct|undefined;
   for(const p of choices.slice(0,6)){
    if(anchor&&performance.now()>deadline)break;
    for(const op of pieceOps(preview,p,request.room_id,cache,role.role,role.role==='work_seat'||role.role==='task_light'?desk??anchor:anchor,n)){
     if(anchor&&performance.now()>deadline)break;
     const related:Record<string,string[]>={rug:['rug_anchor'],table:['seat_table'],light:['seat_light'],focal_point:['seat_facing'],work_seat:['work_seat_facing','work_reach'],task_light:['task_light_reach'],nightstands:n===role.count-1?['nightstand_each_open_side']:[],bedside_lights:n===role.count-1?['light_each_bedside']:[]};
     if(related[role.role]?.length){const composition=scoreComposition(applyOps(preview,[op]),request.room_id,{program:request.program});if(composition.issues.some(i=>related[role.role]!.includes(i.code)))continue;}
     const trial=[...ops,op],checker=new DesignerSession(scene,history);checker.setIntent(intentFor(scene,trial,extra));const checked=checker.propose(trial,'Incremental checked placement.');
     if(checked.ok){selected=op;product=p;break;}
     if(failures.length<30)failures.push({role:role.role,sku:p.sku,errors:checked.errors});
    }
    if(selected)break;
   }
   if(selected&&product){ops.push(selected);chosen.push(product);cost+=product.price;preview=applyOps(scene,ops);if(selected.type==='add'){if(!anchor){anchor=selected.item;deadline=performance.now()+12000;}if(role.role==='work_surface')desk=selected.item;}}
   else missing.push(`${role.role} ${n+1}/${role.count}: ${performance.now()>deadline?'placement time budget exhausted':'no checked fit found within catalog, budget and access constraints'}`);
  }
 }
 const composition=scoreComposition(preview,request.room_id,{program:request.program});
 for(const issue of composition.issues)if(!program.essentials.some(r=>r.role===issue.code))missing.push(issue.message);
 const complete=!missing.length;
 return {ops,intent:intentFor(scene,ops,extra),missing,complete,products:chosen,timing:{catalog_ms:catalogMs,placement_ms:performance.now()-started-catalogMs},reason:complete?`Placed the ${chosen.map(p=>p.kind).join(', ')} as a checked ${request.program} arrangement, preserving existing furniture and access.`:`Partial layout: ${missing.join('; ')}. This bounded search does not prove impossibility.`,evidence:{catalog,failures,composition,style_basis:styles.length?'customer':'assumed modern',requested_program:program}};
}
