/** Incremental program construction. The model supplies intent; code owns every pose. */
import {roomPrograms} from '../knowledge/room-programs.js';
import {roomCatalog} from './room-catalog.js';
import {localGeometryErrors,compareLayoutErrors} from './local-checks.js';
import {functionClearances} from './metrics/function.js';
import {functionClearanceRegressions} from './proposal-clearances.js';
import {SceneAnalysisCache} from './fast-path.js';
import {applyOps} from './adapter.js';
import {DesignerSession} from './session.js';
import {requestPolicy,canonicalKind} from './request-policy.js';
import {scoreComposition} from './taste/composition.js';
import type {CatalogProduct,CatalogQuery} from './catalog.js';
import type {CatalogAsset} from '../../../apps/editor/src/contracts.js';
import type {Scene,Op,Item,Vec2} from './scene.js';
import type {Intent} from './request.js';
import {canRestOn,isSurface,surfacePoses} from './support.js';
import {isOutdoorRoom,railingSegments,railingGap,RAILING_CLEARANCE_M} from './balcony.js';

/** Customer-facing names for program roles and composition checks; raw codes stay in evidence. */
const ROLE_PHRASES:Record<string,string>={seating_anchor:'a sofa',rug:'a rug',light:'a reading lamp',table:'a coffee or side table',focal_point:'a TV unit or shelf to face',bed:'a bed',nightstands:'nightstands on both sides of the bed',bedside_lights:'bedside lamps',storage:'storage',work_surface:'a desk',work_seat:'a desk chair',task_light:'a desk lamp',seat:'a compact seat',bistro_table:'a small table',plant:'a plant',dining_anchor:'a dining table',dining_seats:'dining chairs'};
const CHECK_PHRASES:Record<string,string>={seat_facing:'seats facing a TV, window or each other',conversation_distance:'seats close enough to talk',rug_anchor:'a rug under the front legs of the seating',seat_table:'a table within reach of each seat',seat_light:'a reading lamp beside each seat',chair_row:'seats grouped rather than in a row',clear_play_space:'a clear floor-play square',work_seat_facing:'the chair facing the desk',work_reach:'the chair pulled up to the desk',task_light_reach:'a lamp at the desk',headboard_on_solid_wall:'the headboard against a solid wall',nightstand_each_open_side:'a nightstand on each side of the bed',light_each_bedside:'a lamp at each bedside',table_beside_seat:'a table beside the seat',railing_clear:`${RAILING_CLEARANCE_M * 100} cm kept clear of the railing`};
const phrase=(list:string[])=>list.length<2?list.join(''):`${list.slice(0,-1).join(', ')} and ${list.at(-1)}`;

export const counts=(items:Item[])=>Object.entries(items.reduce<Record<string,number>>((a,i)=>(a[i.kind]=(a[i.kind]??0)+1,a),{})).map(([kind,count])=>({kinds:[kind],count}));
export function intentFor(scene:Scene,ops:Op[],extra:Intent={}):Intent{
 return {...extra,add:counts(ops.flatMap(o=>o.type==='add'?[o.item]:[])),remove:counts(ops.flatMap(o=>o.type==='remove'?scene.items.filter(i=>i.id===o.id):[])),move:counts(ops.flatMap(o=>o.type==='move'?scene.items.filter(i=>i.id===o.id):[])),colors:ops.flatMap(o=>o.type==='color'?[{target:o.target,id:o.id,color:o.color}]:[])};
}
// This descriptor is used only by the geometric slot cache. Publication still resolves the real SKU through the editor catalog bridge.
export const slotAsset=(p:CatalogProduct):CatalogAsset=>({id:p.sku,name:p.name.slice(0,120),kind:p.kind as CatalogAsset['kind'],category:p.kind,dimensions:[p.size[0],p.size[2],p.size[1]],price:p.price,color:'#b8b4ad',source:{type:'procedural'}});
export interface RoomPlanRequest {room_id:string;program:string;style?:string;budget?:number;keep?:string[];history?:string[]}
/** missing keeps role/check codes for tests and eval; missing_text is what the model and customer read. */
export interface RoomPlan {ops:Op[];intent:Intent;missing:string[];missing_text:string[];complete:boolean;reason:string;products:CatalogProduct[];timing:{catalog_ms:number;placement_ms:number};evidence:unknown}

const tableLamp=(p:{kind:string;size:[number,number,number]})=>p.kind==='lamp'&&p.size[2]<.8;
/** Related poses first; ranked single-piece slots are the common fallback. */
export function* pieceOps(scene:Scene,p:CatalogProduct,roomId:string,cache:SceneAnalysisCache,role='',anchor?:Item,index=0,relatedOnly=false,bedsideAngle=0,allowMediaFacing=false):Generator<Op>{
 const candidates:Op[]=[];
 if(anchor){
  const related=(x:number,y:number,rotation=anchor.rot)=>{const t=anchor.rot*Math.PI/180;candidates.push({type:'add',item:{...p.item,name:p.name.slice(0,120),id:`room-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,rot:rotation,pos:[anchor.pos[0]+x*Math.cos(t)-y*Math.sin(t),anchor.pos[1]+x*Math.sin(t)+y*Math.cos(t)]}});};
  if(role==='table'){
   // A reach gap is not a walking aisle. Leave the centre-front approach clear
   // by trying the small table beside either front corner before centred poses.
   const corner=(anchor.size[0]+p.size[0])/2+.05;
   for(const x of [-corner,corner,0,-.25,.25])for(const gap of [.41,.36,.46])related(x,-(anchor.size[1]+p.size[1])/2-gap);
  }
  if(role==='focal_point')for(const gap of [2,1.5,2.5])related(0,-(anchor.size[1]+p.size[1])/2-gap,(anchor.rot+180)%360);
  if((role==='light'||role==='task_light')&&!tableLamp(p))for(const side of [1,-1])for(const gap of [.15,.45,.6])related(side*((anchor.size[0]+p.size[0])/2+gap),0);
  if(role==='work_seat')related(0,-(anchor.size[1]+p.size[1])/2-.4,(anchor.rot+180)%360);
  if(role==='bistro_table')for(const gap of [.05,.15,.3]){for(const side of [1,-1])related(side*((anchor.size[0]+p.size[0])/2+gap),0);related(0,-(anchor.size[1]+p.size[1])/2-gap);}
  // Table lamps stand on furniture: the bedside stand on this side of the bed, or the desk top toward its back.
  if((role==='bedside_lights'||role==='task_light')&&canRestOn(p.kind,p.size)){
   const t=anchor.rot*Math.PI/180,side=index===0?-1:1,localX=(q:Vec2)=>(q[0]-anchor.pos[0])*Math.cos(t)+(q[1]-anchor.pos[1])*Math.sin(t);
   const supports=role==='task_light'?(isSurface(anchor)?[anchor]:[]):scene.items.filter(i=>i.room_id===roomId&&isSurface(i)&&side*localX(i.pos)>anchor.size[0]/2);
   const front:Vec2=[anchor.pos[0]+Math.sin(t)*anchor.size[1]/2,anchor.pos[1]-Math.cos(t)*anchor.size[1]/2];
   for(const support of supports)for(const pose of surfacePoses(scene,support,p.size,{away:role==='task_light'?front:anchor.pos}).slice(0,3))
    candidates.push({type:'add',item:{...p.item,name:p.name.slice(0,120),id:`room-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,rot:pose.rot,pos:pose.pos,on:support.id}});
  }
  if(role==='rug'){
   const t=anchor.rot*Math.PI/180,dist=anchor.size[1]/2+p.size[1]/2-.25;
   candidates.push({type:'add',item:{...p.item,name:p.name.slice(0,120),id:`room-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,rot:anchor.rot,pos:[anchor.pos[0]+Math.sin(t)*dist,anchor.pos[1]-Math.cos(t)*dist]}});
  }
  if(role==='nightstands'||role==='bedside_lights'&&!tableLamp(p)){
   const side=index===0?-1:1;
   const angles=role==='nightstands'?[side*bedsideAngle,0,side*90,-side*90,side*45,-side*45]:[side*90,0,side*45,-side*45];
   for(const angle of angles){
    const t=angle*Math.PI/180,width=Math.abs(Math.cos(t))*p.size[0]+Math.abs(Math.sin(t))*p.size[1],depth=Math.abs(Math.sin(t))*p.size[0]+Math.abs(Math.cos(t))*p.size[1];
    // Stay inside the existing micrometre comparison tolerance at the exact reach boundary.
    for(const headGap of role==='nightstands'?[depth/2,.65,.85]:[.15,.5,.85])for(const gap of role==='nightstands'?[.6-1e-8]:[.6,.75,.85])
     related(side*(anchor.size[0]/2+width/2+gap),anchor.size[1]/2-headGap,anchor.rot+angle);
   }
  }
 }
 for(const candidate of candidates)yield candidate;
 // A table lamp is never a floor lamp; it only goes on a support.
 if(tableLamp(p)&&['bedside_lights','task_light'].includes(role))return;
 // Bedside roles are defined relative to the anchor; a whole-room wall scan
 // spends the budget on slots that cannot satisfy their side/reach requirements.
 if(relatedOnly||anchor&&['nightstands','bedside_lights'].includes(role))return;
 const hasWindow=scene.openings.some(o=>o.kind==='window'&&scene.walls.some(w=>w.id===o.wall_id&&w.room_id===roomId));
 const slotQuery={roomId,catalogId:p.sku,maxChecks:anchor?16:48,diverse:!anchor,solidHeadboard:p.kind==='bed',faceWindow:role==='seating_anchor'&&hasWindow&&!allowMediaFacing};
 let slots=role==='bed'&&p.size[0]>=1.35?cache.slots(scene,[slotAsset(p)],{...slotQuery,sideReserve:1.01}):[];
 if(!slots.length)slots=cache.slots(scene,[slotAsset(p)],slotQuery);
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
 const room=scene.rooms.find(r=>r.id===request.room_id);
 if(!room)throw new Error('Unknown room_id; use a room from the scene');
 // An outdoor room gets the balcony program whatever the room is named after or the model asked for.
 const outdoor=isOutdoorRoom(room),requestedProgram=request.program;
 if(outdoor)request={...request,program:'balcony'};
 const started=performance.now(),program=roomPrograms[request.program];
 if(!program)throw new Error('Choose a supported room program');
 const railings=outdoor?railingSegments(scene,request.room_id):[];
 const checker=new DesignerSession(scene,history);checker.setIntent({keeps:request.keep});
 const catalog=await roomCatalog(request.program,request.style,request.budget,query),catalogMs=performance.now()-started;
 const cache=new SceneAnalysisCache(),blocked=new Set(requestPolicy(history).blocked_kinds);
 const extra:Intent={room_id:request.room_id,keeps:request.keep,budget_dram:request.budget};
 const roles=[...program.essentials];
 if(request.program==='living')roles.sort((a,b)=>['seating_anchor','rug','table','light','focal_point'].indexOf(a.role)-['seating_anchor','rug','table','light','focal_point'].indexOf(b.role));
 // Tabletop lights qualify only for roles that place them on a support (nightstand or desk), never on the floor.
 const requiresDouble=[...history,...request.history??[],request.style??''].some(text=>/\b(?:double|queen|king)(?:[ -]size(?:d)?)?\s+bed\b/i.test(text));
 const isDouble=(size:Item['size'],name:string)=>size[0]>=1.35&&size[1]>=1.8&&!/\b(?:twin|single|loft|bunk)\b/i.test(name);
 let requireMedia=false;
 const qualifies=(kind:string,size:Item['size'],role:string,name='')=>!(role==='focal_point'&&requireMedia&&!/\btv\b|television|media/i.test(name))&&!(kind==='lamp'&&size[2]<.8&&!['bedside_lights','task_light'].includes(role))&&!(role==='bed'&&requiresDouble&&!isDouble(size,name))&&!(role==='storage'&&kind==='wardrobe'&&(size[1]<.4||size[2]<1.4))
  // Balcony pieces are adult outdoor furniture: no child chairs or tabletop plants on the floor.
  &&!(role==='seat'&&(kind==='chair'&&size[2]<.7||/\bkids?\b|child/i.test(name)))&&!(role==='plant'&&size[2]<.5);
 const pools=roles.map(role=>{
  const kinds=role.preferred_kinds??role.kinds;
  return [...new Map(kinds.flatMap(kind=>catalog.products[kind]??[]).filter(p=>!blocked.has(canonicalKind(p.kind))&&qualifies(p.kind,p.size,role.role,p.name)&&!(role.role==='work_surface'&&/desk extender|rolling cart|pedestal|printer stand|monitor stand|\bchairs?\b|\bstools?\b/i.test(p.name))).map(p=>[p.sku,p])).values()]
   .sort((a,b)=>(request.budget===undefined?0:a.price-b.price)
    ||(role.role==='focal_point'?Number(!/\btv\b|television|media/i.test(a.name))-Number(!/\btv\b|television|media/i.test(b.name)):0)
    ||(role.role==='table'?Number(!/coffee|cocktail/i.test(a.name))-Number(!/coffee|cocktail/i.test(b.name)):0)
    ||(['bedside_lights','task_light'].includes(role.role)?Number(!tableLamp(a))-Number(!tableLamp(b)):0)
    ||kinds.indexOf(a.kind)-kinds.indexOf(b.kind)||a.size[0]*a.size[1]-b.size[0]*b.size[1]);
 });
 const focalIndex=roles.findIndex(r=>r.role==='focal_point'),media=pools[focalIndex]?.filter(p=>/\btv\b|television|media/i.test(p.name))??[];
 // Room-facing anchors must retain a real media focal point, not silently fall
 // back to an unrelated shelf when the media units fail to fit.
 if(media.length){pools[focalIndex]=media;requireMedia=true;}
 const faces=(item:Item,target:Vec2)=>{const t=item.rot*Math.PI/180,dx=target[0]-item.pos[0],dy=target[1]-item.pos[1];return (Math.sin(t)*dx-Math.cos(t)*dy)/Math.max(1e-9,Math.hypot(dx,dy))>=Math.cos(Math.PI/9);};
 const windowTargets=scene.openings.filter(o=>o.kind==='window').flatMap(o=>{
  const wall=scene.walls.find(w=>w.id===o.wall_id);if(!wall||wall.room_id!==request.room_id&&!o.room_ids?.includes(request.room_id))return [];
  const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],length=Math.hypot(dx,dy);
  return [o.offset,o.offset+o.width/2,o.offset+o.width].map(d=>[wall.a[0]+dx*d/length,wall.a[1]+dy*d/length] as Vec2);
 });
 const baselineGeometry=localGeometryErrors(scene),baselineFunctions=functionClearances(scene);
 // Keep all existing proposal checks. New access routes must also be at least 0.75 m.
 // Existing shell bottlenecks may be retained only under the unchanged baseline rule.
 const failures:{attempt:number;role:string;sku:string;errors:unknown[]}[]=[],attempts:unknown[]=[];
 const deadline=performance.now()+30000;let attempt=0;
 const allocated=new Set<string>();
 const ownedByRole=roles.map(role=>{const items=scene.items.filter(i=>!allocated.has(i.id)&&i.room_id===request.room_id&&role.kinds.includes(i.kind)&&qualifies(i.kind,i.size,role.role,i.name)).slice(0,role.count);items.forEach(i=>allocated.add(i.id));return items;});
 const minimumCost=(r:number)=>pools[r]!.length?Math.min(...pools[r]!.map(p=>p.price)):0;
 const requiredMinimum=roles.reduce((sum,r,i)=>sum+minimumCost(i)*(r.count-ownedByRole[i]!.length),0);
 const maxAttempts=request.budget!==undefined&&requiredMinimum>request.budget?1:12;
 const evaluate=(ops:Op[],role:string,sku:string)=>{
  const after=applyOps(scene,ops),geometry=compareLayoutErrors(baselineGeometry,localGeometryErrors(after)).errors;
  const placed=new Set(ops.flatMap(o=>o.type==='add'?[o.item.id]:[]));
  const enforced=(c:ReturnType<typeof functionClearances>[number])=>c.function==='bed_side'||c.function==='storage_front'||c.function==='sofa_coffee'&&placed.has(c.other_item_id!);
  const access=functionClearanceRegressions(baselineFunctions.filter(enforced),functionClearances(after).filter(enforced));
  const railing=after.items.filter(i=>placed.has(i.id)&&railingGap(i,railings)<RAILING_CLEARANCE_M-1e-9).map(i=>({check:'railing_clearance',item_id:i.id,gap_m:railingGap(i,railings),minimum_m:RAILING_CLEARANCE_M}));
  if(geometry.length||access.length||railing.length){if(failures.filter(f=>f.attempt===attempt&&f.role===role).length<5)failures.push({attempt,role,sku,errors:[...geometry,...access,...railing].slice(0,3)});return undefined;}
  checker.setIntent(intentFor(scene,ops,extra));const checked=checker.propose(ops,'Incremental checked placement.');
  if(!checked.ok){if(failures.filter(f=>f.attempt===attempt&&f.role===role).length<5)failures.push({attempt,role,sku,errors:checked.errors.slice(0,3)});return undefined;}
  const paths=checked.proposal.checks.metrics!.space.rooms.find(r=>r.room_id===request.room_id)!.walkways;
  const newRoutes=paths.filter(p=>[p.from,p.to].some(id=>id.startsWith('item:')&&placed.has(id.slice(5))));
  const narrow=newRoutes.filter(p=>!p.reachable||p.width_m<.75-1e-6);
  if(narrow.length){if(failures.filter(f=>f.attempt===attempt&&f.role===role).length<5)failures.push({attempt,role,sku,errors:narrow.map(p=>({check:'secondary_access',from:p.from,to:p.to,width_m:p.width_m,minimum_m:.75}))});return undefined;}
  return {after,paths:newRoutes};
 };
 type Variant={ops:Op[];products:CatalogProduct[];missing:string[];complete:boolean;composition:ReturnType<typeof scoreComposition>;paths:{width_m:number}[]};
 const build=(anchorOp?:Op,anchorProduct?:CatalogProduct,bedsideAngle=0):Variant=>{
  const ops:Op[]=[],chosen:CatalogProduct[]=[],missing:string[]=[];
  let preview=scene,anchor:Item|undefined,desk:Item|undefined,cost=0,paths:{width_m:number}[]=[];
  for(let r=0;r<roles.length;r++){
   const role=roles[r]!;
   if(r>0&&!anchor){missing.push(`${role.role}: anchor has no checked fit`);continue;}
   const existing=ownedByRole[r]!;
   for(let n=0;n<role.count;n++){
    if(existing[n]){anchor??=existing[n];if(role.role==='work_surface')desk=existing[n];continue;}
    let selected:Op|undefined,product:CatalogProduct|undefined;
    const choices=r===0&&anchorProduct?[anchorProduct]:pools[r]!;
    // Reserve the cheapest known remaining roles whenever the full program can meet budget.
    const reserve=request.budget!==undefined&&requiredMinimum<=request.budget?minimumCost(r)*Math.max(0,role.count-Math.max(n+1,existing.length))+roles.slice(r+1).reduce((sum,rr,j)=>sum+minimumCost(r+j+1)*(rr.count-ownedByRole[r+j+1]!.length),0):0;
    const roleDeadline=Math.min(deadline,performance.now()+2000);
    for(const relatedOnly of anchor&&['nightstands','bedside_lights'].includes(role.role)?[true]:[true,false]){
    for(const p of choices.slice(0,10)){
     if(p.price+cost+reserve>(request.budget??Infinity))continue;
     if(performance.now()>roleDeadline)break;
     const candidates=r===0&&anchorOp?[anchorOp]:pieceOps(preview,p,request.room_id,cache,role.role,role.role==='work_seat'||role.role==='task_light'?desk??anchor:anchor,n,relatedOnly,bedsideAngle);
     for(const op of candidates){
      if(performance.now()>roleDeadline)break;
      if(anchor&&op.type==='add'&&['nightstands','bedside_lights'].includes(role.role)){
       // Reject a wrong-side generic slot immediately; it cannot be repaired by
       // placing the second bedside piece. Final QUALITY relationships still run.
       const t=anchor.rot*Math.PI/180,dx=op.item.pos[0]-anchor.pos[0],dy=op.item.pos[1]-anchor.pos[1];
       const x=dx*Math.cos(t)+dy*Math.sin(t),y=-dx*Math.sin(t)+dy*Math.cos(t),side=n===0?-1:1;
       const angle=(op.item.rot-anchor.rot)*Math.PI/180,w=Math.abs(Math.cos(angle))*op.item.size[0]+Math.abs(Math.sin(angle))*op.item.size[1];
       const reach=Math.abs(x)-anchor.size[0]/2-w/2;
       if(side*x<=(role.role==='nightstands'?anchor.size[0]/2:0)||y<anchor.size[1]/2-.9||reach>(role.role==='nightstands'?.6:.9)+1e-6)continue;
      }
      if(requireMedia&&role.role==='focal_point'&&anchor&&op.type==='add'&&!faces(anchor,op.item.pos))continue;
      const related:Record<string,string[]>={bistro_table:['table_beside_seat'],rug:['rug_anchor'],table:['seat_table'],light:['seat_light'],focal_point:['seat_facing'],work_seat:['work_seat_facing','work_reach'],task_light:['task_light_reach'],nightstands:n===role.count-1?['nightstand_each_open_side']:[],bedside_lights:n===role.count-1?['light_each_bedside']:[]};
      if(related[role.role]?.length){const c=scoreComposition(applyOps(preview,[op]),request.room_id,{program:request.program});if(c.issues.some(i=>related[role.role]!.includes(i.code)))continue;}
      const checked=evaluate([...ops,op],role.role,p.sku);
      if(checked){selected=op;product=p;paths=checked.paths;break;}
     }
     if(selected)break;
    }
    if(selected)break;
    }
    if(selected&&product){ops.push(selected);chosen.push(product);cost+=product.price;preview=applyOps(scene,ops);if(selected.type==='add'){anchor??=selected.item;if(role.role==='work_surface')desk=selected.item;}}
    else missing.push(`${role.role} ${n+1}/${role.count}: ${performance.now()>roleDeadline?'bounded search budget exhausted':'no checked fit in current catalog, budget and access constraints'}`);
   }
  }
  const composition=scoreComposition(preview,request.room_id,{program:request.program});
  for(const issue of composition.issues)missing.push(issue.message);
  if(request.program==='living'&&(media.length||windowTargets.length)){
   const targets=[...windowTargets,...preview.items.filter(i=>i.room_id===request.room_id&&roles[focalIndex]!.kinds.includes(i.kind)&&/\btv\b|television|media/i.test(i.name)).map(i=>i.pos)];
   if(preview.items.some(i=>i.room_id===request.room_id&&i.kind==='sofa'&&!targets.some(t=>faces(i,t))))missing.push('Face every sofa toward a window or the actual media unit; a different shelf cannot substitute for that target.');
  }
  return {ops,products:chosen,missing:[...new Set(missing)],complete:!missing.length,composition,paths};
 };
 let best:Variant|undefined;
 const consider=(candidate:Variant)=>{attempts.push({attempt,pieces:candidate.products.length,missing:candidate.missing});if(!best||Number(candidate.complete)>Number(best.complete)||candidate.products.length>best.products.length||candidate.products.length===best.products.length&&candidate.composition.score>best.composition.score)best=candidate;};
 const owned=scene.items.some(i=>i.room_id===request.room_id&&roles[0]!.kinds.includes(i.kind)&&qualifies(i.kind,i.size,roles[0]!.role,i.name));
 if(owned){attempt++;consider(build());}
 else {
  // Round-robin catalog sizes as well as anchor positions: one SKU must not
  // spend the whole attempt budget before compact alternatives are considered.
  const preferDouble=request.program==='bedroom'&&roles[0]!.role==='bed';
  const groups=preferDouble?[pools[0]!.filter(p=>isDouble(p.size,p.name)),pools[0]!.filter(p=>!isDouble(p.size,p.name))]:[pools[0]!];
  for(const group of groups){
   // Preserve the single-bed fallback without weakening an explicit double-bed request.
   const groupDeadline=preferDouble&&!requiresDouble&&group===groups[0]?Math.min(deadline,performance.now()+15000):deadline;
   const attemptLimit=attempt+maxAttempts;
   const anchors=group.filter(p=>p.price<=(request.budget??Infinity)).slice(0,4).map(p=>({p,poses:pieceOps(scene,p,request.room_id,cache,roles[0]!.role,undefined,0,false,0,media.length>0)}));
   let active=true;
   while(active&&performance.now()<groupDeadline&&attempt<attemptLimit){
    active=false;
    for(const entry of anchors){
     if(performance.now()>groupDeadline||attempt>=attemptLimit)break;
     const next=entry.poses.next();if(next.done)continue;active=true;
     attempt++;consider(build(next.value,entry.p));
     if(best?.complete)break;
    }
    if(best?.complete||request.budget!==undefined&&requiredMinimum>request.budget&&attempt>=maxAttempts)break;
   }
   // Prefer any checked double anchor, even if later bedroom roles remain missing.
   if(best?.ops.some(o=>o.type==='add'&&roles[0]!.kinds.includes(o.item.kind)))break;
  }
 }

 best??=build();
 const {ops,products,missing,complete,composition,paths}=best;
 const minPath=paths.length?Math.min(...paths.map(p=>p.width_m)):undefined;
 const accessNote=minPath!==undefined&&minPath<.9?` Secondary access is ${minPath.toFixed(2)} m: acceptable at 0.75 m minimum, below the comfortable 0.90 m target.`:'';
 const budgetNote=request.budget!==undefined&&requiredMinimum>request.budget?` The cheapest currently found full program totals ${requiredMinimum} AMD, above the ${request.budget} AMD budget; this is a catalog-search bound, not proof about all products.`:'';
 const overrideNote=outdoor&&requestedProgram!=='balcony'?` Furnished as an outdoor balcony, not as a ${requestedProgram} room: compact pieces, ${RAILING_CLEARANCE_M*100} cm kept clear of the railing.`:'';
 // The customer reads this text; role and check codes stay in missing/evidence for the model and eval.
 const missingRoles=[...new Set(missing.map(m=>m.match(/^([a-z_]+)(?: \d+\/\d+)?:/)?.[1]).filter((r):r is string=>!!r&&r in ROLE_PHRASES))];
 const unmet=[...new Set([...composition.issues.map(i=>i.code),...missing.some(m=>m.startsWith('Face every sofa'))?['seat_facing']:[]])].filter(c=>!missingRoles.includes(c)&&!roles.some(r=>r.role===c)&&c in CHECK_PHRASES);
 const placedText=products.length?`placed ${phrase(products.map(p=>p.kind.replaceAll('_',' ')))}`:'nothing placed yet';
 const partial=`Partial layout: ${placedText}.${missingRoles.length?` No checked fit found for ${phrase(missingRoles.map(r=>ROLE_PHRASES[r]!))}.`:''}${unmet.length?` Still missing ${phrase(unmet.map(c=>CHECK_PHRASES[c]!))}.`:''} This bounded search does not prove impossibility.`;
 const missingText=[...missingRoles.map(r=>`${ROLE_PHRASES[r]!}: no checked fit`),...unmet.map(c=>`still missing ${CHECK_PHRASES[c]!}`)];
 return {ops,intent:intentFor(scene,ops,extra),missing,missing_text:missingText,complete,products,timing:{catalog_ms:catalogMs,placement_ms:performance.now()-started-catalogMs},reason:(complete?`Placed the ${products.map(p=>p.kind).join(', ')} as a complete checked ${request.program} arrangement.`:partial)+overrideNote+accessNote+budgetNote,evidence:{catalog,failures,attempts,composition,minimum_found_program_dram:requiredMinimum,style_basis:catalog.style_basis,requested_program:program,program_name:request.program,...outdoor?{outdoor:true,requested_program_name:requestedProgram,railing_segments:railings.length}:{}}};
}
