/** Fill mode: after a room program's essentials, keep adding optional pieces in priority order until the room is
 * well furnished, nothing more passes the checks, the budget is spent or the time bound is reached. Code owns every
 * pose; each candidate passes the caller's full proposal checks and may not add a composition issue. */
import {roomExtras,type ExtraRole} from '../knowledge/room-programs.js';
import {searchCatalog,mapLimited,CATALOG_CONCURRENCY,type CatalogProduct,type CatalogQuery} from './catalog.js';
import {SceneAnalysisCache} from './fast-path.js';
import {applyOps,wallOutward} from './adapter.js';
import {itemPolygon,polygonsOverlap,isFloorRug} from './metrics/space.js';
import {mountPoses,isCurtain} from './mounts.js';
import {isSurface,surfacePoses} from './support.js';
import {scoreComposition} from './taste/composition.js';
import {outsidePoint,sourceFloorPolygon} from './local-checks.js';
import {editorKindOf} from './editor-bridge.js';
import {spaceMetrics} from './metrics/space.js';
import {functionClearances} from './metrics/function.js';
import {slotAsset} from './incremental-room.js';
import {onFloor,type Item,type Op,type Scene,type Vec2} from './scene.js';

export interface FillContext {
 scene:Scene;roomId:string;program:string;ops:Op[];cost:number;budget?:number;
 /** Placement time bound in ms, counted after the catalog searches. */
 time_ms:number;
 cache:SceneAnalysisCache;query?:CatalogQuery;blocked:ReadonlySet<string>;
 /** The caller's full proposal checks for the whole op list; undefined means rejected. */
 evaluate:(ops:Op[],role:string,sku:string)=>unknown;
}
export interface FillResult {
 ops:Op[];products:CatalogProduct[];cost:number;added:{role:string;sku:string;kind:string;place:string}[];
 unfilled:string[];stopped:'well_furnished'|'nothing_more_fits'|'budget'|'time';
 searches:{role:string;kind:string;status:string;returned:number}[];checks:number;check_ms:number;
}

const WALL_KINDS=new Set(['wall_art','mirror','clock','wall_hanging']);
/** Below this much remaining budget no catalog piece is affordable. */
const SPENT_DRAM=10000;
const CLEAR_ABOVE_M=.02,WALL_END_M=.3,OPENING_MARGIN_M=.15;
const kindsOf=(role:ExtraRole)=>[...new Set(role.queries.map(q=>q.kind))];
const facingRot=(from:Vec2,to:Vec2)=>((Math.atan2(to[0]-from[0],-(to[1]-from[1]))*180/Math.PI)%360+360)%360;
const at=(anchor:Item,x:number,y:number):Vec2=>{const t=anchor.rot*Math.PI/180;return [anchor.pos[0]+x*Math.cos(t)-y*Math.sin(t),anchor.pos[1]+x*Math.sin(t)+y*Math.cos(t)];};

/** How many pieces of this role the room already holds. */
function present(scene:Scene,roomId:string,role:ExtraRole):number{
 const items=scene.items.filter(i=>i.room_id===roomId),kinds=kindsOf(role);
 if(role.place==='on')return items.filter(i=>i.on!==undefined&&!['lamp','tv','mattress'].includes(i.kind)).length;
 if(role.place==='window')return items.filter(isCurtain).length;
 if(role.place==='wall')return items.filter(i=>kinds.includes(i.kind)&&i.mount==='wall').length;
 return items.filter(i=>kinds.includes(i.kind)&&onFloor(i)).length;
}
function target(scene:Scene,roomId:string,role:ExtraRole):number{
 if(role.place!=='window')return role.total;
 const windows=scene.openings.filter(o=>o.kind==='window'&&scene.walls.some(w=>w.id===o.wall_id&&w.room_id===roomId&&!w.open)).length;
 return Math.min(role.total,windows);
}

/** Wall-hung art or a mirror: centred over a low piece against the wall where possible, clear of openings, wall ends,
 * other hung pieces, and of anything standing below that reaches the editor's hanging height. */
export function wallPoses(scene:Scene,roomId:string,p:{kind:string;size:[number,number,number]}):{pos:Vec2;rot:number}[]{
 const [w,d,h]=p.size,base=Math.max(.9,1.5-h/2),poses:{pos:Vec2;rot:number;score:number}[]=[],room=scene.rooms.find(r=>r.id===roomId);if(!room)return [];
 const hung=scene.items.filter(i=>i.room_id===roomId&&i.mount==='wall');
 const floor=scene.items.filter(i=>i.room_id===roomId&&onFloor(i)&&!isFloorRug(i));
 const anchors=floor.filter(i=>['sofa','bed','cabinet','dresser','desk','tv_unit','bench','console'].includes(i.kind)&&i.size[2]<base-CLEAR_ABOVE_M);
 for(const wall of scene.walls.filter(v=>v.room_id===roomId&&!v.open)){
  const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],length=Math.hypot(dx,dy);if(length<w+2*WALL_END_M)continue;
  let out:Vec2;try{out=wallOutward(scene,wall);}catch{continue;}
  const inward:Vec2=[-out[0],-out[1]],rot=facingRot([0,0],inward),t=(wall.thickness??0)/2;
  const along=(q:Vec2)=>((q[0]-wall.a[0])*dx+(q[1]-wall.a[1])*dy)/length,offsets=new Set<number>();
  // Centred over each low piece along this wall, then a regular scan.
  for(const a of anchors)offsets.add(Math.round(along(a.pos)*1e6)/1e6);
  for(let offset=WALL_END_M+w/2;offset<=length-WALL_END_M-w/2+1e-9;offset+=.25)offsets.add(offset);
  for(const offset of offsets){
   if(offset<WALL_END_M+w/2-1e-9||offset>length-WALL_END_M-w/2+1e-9)continue;
   if(scene.openings.some(o=>o.wall_id===wall.id&&o.offset<offset+w/2+OPENING_MARGIN_M&&o.offset+o.width>offset-w/2-OPENING_MARGIN_M))continue;
   const on:Vec2=[wall.a[0]+dx*offset/length,wall.a[1]+dy*offset/length],pos:Vec2=[on[0]+inward[0]*(t+d/2),on[1]+inward[1]*(t+d/2)];
   // The editor hangs it on the wall face; it must also lie inside the room's floor outline there.
   const footprint=itemPolygon({id:'art',room_id:roomId,kind:p.kind,name:'',pos,rot,size:[w,d,h],keep:false});
   if(outsidePoint(footprint,room.polygon)||outsidePoint(footprint,sourceFloorPolygon(scene,room)))continue;
   const probe:Item={id:'wall-probe',room_id:roomId,kind:p.kind,name:'',pos,rot,size:[w+.1,d+.3,h],keep:false};
   const below=itemPolygon(probe);
   if(floor.some(i=>i.size[2]>=base-CLEAR_ABOVE_M&&polygonsOverlap(itemPolygon(i),below)))continue;
   if(hung.some(i=>Math.hypot(i.pos[0]-pos[0],i.pos[1]-pos[1])<(Math.max(i.size[0],i.size[1])+w)/2+.3))continue;
   const centred=anchors.filter(a=>polygonsOverlap(itemPolygon(a),below)).map(a=>1/(1+Math.abs(along(a.pos)-offset)));
   poses.push({pos,rot,score:centred.length?1+Math.max(...centred):-Math.abs(offset-length/2)/length});
  }
 }
 return poses.sort((a,b)=>b.score-a.score).map(({pos,rot})=>({pos,rot}));
}

/** Seats relate to the room's main seating: accent chairs face the sofa across the rug; small tables stand at the ends. */
function* nearSeating(scene:Scene,roomId:string,p:CatalogProduct,role:string):Generator<Op>{
 const sofa=scene.items.find(i=>i.room_id===roomId&&i.kind==='sofa');if(!sofa)return;
 const add=(pos:Vec2,rot:number):Op=>({type:'add',item:{...p.item,name:p.name.slice(0,120),id:`fill-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,pos,rot}});
 const [w,d]=p.size;
 if(role==='accent_seating'){
  // Front legs on the group's rug (0.15 m inside its edge), facing the sofa or the focal piece.
  const rug=scene.items.find(i=>i.room_id===roomId&&isFloorRug(i)),focal=scene.items.find(i=>i.room_id===roomId&&['tv_unit','shelf','cabinet','tv'].includes(i.kind)&&onFloor(i));
  // Each spot also faces straight in across the rug edge it sits on.
  const spots:{pos:Vec2;straight?:Vec2}[]=[];
  if(rug){
   const inset=d/2-.15;
   // Along the rug's sides first (an L or U around the table), then across from the sofa.
   for(const t of [-.25,0,.25,-.5])for(const side of [-1,1])spots.push({pos:at(rug,side*(rug.size[0]/2+inset),t),straight:at(rug,0,t)});
   for(const t of [0,-.4,.4])spots.push({pos:at(rug,t,-rug.size[1]/2-inset),straight:at(rug,t,0)});
  }
  for(const y of [.6,.75,.9,1.2,1.5])for(const x of [0,-.5,.5,-(sofa.size[0]/2+w/2+.15),sofa.size[0]/2+w/2+.15])spots.push({pos:at(sofa,x,-(sofa.size[1]/2+y+d/2))});
  const targets=[sofa.pos,...focal?[focal.pos]:[],...rug?[rug.pos,[(rug.pos[0]+sofa.pos[0])/2,(rug.pos[1]+sofa.pos[1])/2] as Vec2]:[]];
  for(const {pos,straight} of spots)for(const to of [...straight?[straight]:[],...targets])yield add(pos,facingRot(pos,to));
 }
 if(role==='side_tables')for(const side of [-1,1])for(const y of [0,-sofa.size[1]/2+d/2])yield add(at(sofa,side*(sofa.size[0]/2+w/2+.05),y),sofa.rot);
 // Beside each chair that faces the seating group.
 for(const chair of scene.items.filter(i=>i.room_id===roomId&&i.kind==='chair'&&role==='side_tables'))for(const side of [-1,1])yield add(at(chair,side*(chair.size[0]/2+w/2+.05),0),chair.rot);
 if(role==='pouf')for(const x of [-(sofa.size[0]/2+w/2+.3),sofa.size[0]/2+w/2+.3])for(const y of [.6,1])yield add(at(sofa,x,-(sofa.size[1]/2+y)),sofa.rot);
}

/** A rug under the lower part of the bed, a bench at its foot. */
function* nearBed(scene:Scene,roomId:string,p:CatalogProduct,role:string):Generator<Op>{
 const bed=scene.items.find(i=>i.room_id===roomId&&i.kind==='bed');if(!bed)return;
 const add=(pos:Vec2,rot:number):Op=>({type:'add',item:{...p.item,name:p.name.slice(0,120),id:`fill-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,pos,rot}});
 if(role==='rug')for(const turn of [90,0])for(const shift of [.35,.2,.5]){const depth=turn?p.size[0]:p.size[1];yield add(at(bed,0,-(bed.size[1]/2-depth/2+shift)+(depth>bed.size[1]?0:0)),(bed.rot+turn)%360);}
 if(role==='bench')for(const gap of [.05,.15,.6])for(const turn of [0,180])yield add(at(bed,0,-(bed.size[1]/2+p.size[1]/2+gap)),(bed.rot+turn)%360);
}

function* poses(scene:Scene,roomId:string,p:CatalogProduct,role:ExtraRole,cache:SceneAnalysisCache):Generator<Op>{
 if(role.place==='window'){
  for(const [index,pose] of mountPoses(scene,roomId,p).entries())yield {type:'add',item:{...p.item,name:p.name.slice(0,120),id:`fill-hung-${index}-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,pos:pose.pos,rot:pose.rot,mount:pose.mount}};
  return;
 }
 if(role.place==='wall'){
  for(const pose of wallPoses(scene,roomId,p).slice(0,8))yield {type:'add',item:{...p.item,name:p.name.slice(0,120),id:`fill-wall-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,pos:pose.pos,rot:pose.rot,mount:'wall'}};
  return;
 }
 if(role.place==='on'){
  // Spread decor: tops without anything on them first, larger tops first.
  const tops=scene.items.filter(i=>i.room_id===roomId&&isSurface(i)).sort((a,b)=>scene.items.filter(i=>i.on===a.id).length-scene.items.filter(i=>i.on===b.id).length||b.size[0]*b.size[1]-a.size[0]*a.size[1]);
  for(const support of tops)for(const pose of surfacePoses(scene,support,p.size).slice(0,2))
   yield {type:'add',item:{...p.item,name:p.name.slice(0,120),id:`fill-on-${support.id}-${scene.items.length}-${p.sku}`.slice(0,200),room_id:roomId,keep:false,pos:pose.pos,rot:pose.rot,on:support.id}};
  return;
 }
 if(role.near==='seating')yield* nearSeating(scene,roomId,p,role.role);
 if(role.near==='bed')yield* nearBed(scene,roomId,p,role.role);
 // Each slot check measures the whole flat; a small diverse set keeps a furnished room within the time bound.
 const query={roomId,catalogId:p.sku,maxChecks:12,diverse:true};
 if(role.near==='window')for(const slot of cache.slots(scene,[slotAsset(p)],{...query,nearWindow:true}))yield* slot.ops;
 for(const slot of cache.slots(scene,[slotAsset(p)],query))yield* slot.ops;
}

/** The first companion pose beside a new chair that clears the given composition issue. */
function companionFor(scene:Scene,chairOp:Op,pool:CatalogProduct[],code:string,roomId:string,issues:(s:Scene)=>Set<string>):{op:Op;p:CatalogProduct}|undefined{
 if(chairOp.type!=='add')return undefined;
 const chair=chairOp.item;
 for(const p of pool.slice(0,3)){
  const [w,d]=p.size,x=chair.size[0]/2+w/2+.05;
  const spots:Vec2[]=code==='seat_light'?[at(chair,x,chair.size[1]/2-d/2),at(chair,-x,chair.size[1]/2-d/2),at(chair,x,0),at(chair,-x,0)]:[at(chair,x,0),at(chair,-x,0),at(chair,x,chair.size[1]/4),at(chair,-x,chair.size[1]/4)];
  for(const [index,pos] of spots.entries()){
   const op:Op={type:'add',item:{...p.item,name:p.name.slice(0,120),id:`fill-with-${index}-${scene.items.length}-${p.sku}`,room_id:roomId,keep:false,pos,rot:chair.rot}};
   let after:Scene;try{after=applyOps(scene,[op]);}catch{continue;}
   if(!issues(after).has(code))return {op,p};
  }
 }
 return undefined;
}

export async function fillRoom(ctx:FillContext):Promise<FillResult>{
 const roles=(roomExtras[ctx.program]??[]).map(role=>({...role,queries:role.queries.filter(q=>!ctx.blocked.has(q.kind))})).filter(role=>role.queries.length);
 const specs=roles.flatMap(role=>[...role.queries.map(q=>({role:role.role,q})),...(role.with??[]).map(({fixes,...q})=>({role:`${role.role}+${fixes}`,q}))]);
 const results=await mapLimited(specs,CATALOG_CONCURRENCY*2,async({role,q})=>{
  const {min_h,...input}=q;
  const result=await searchCatalog({...input,limit:12,...ctx.budget!==undefined?{price_max:Math.max(0,ctx.budget-ctx.cost)}:{}},ctx.query);
  return {role,kind:q.kind,status:result.status,products:result.results.filter(p=>p.size[2]>=(min_h??0)&&p.kind===q.kind)};
 });
 const pools=new Map<string,CatalogProduct[]>();
 for(const r of results)pools.set(r.role,[...pools.get(r.role)??[],...r.products.filter(p=>!(pools.get(r.role)??[]).some(v=>v.sku===p.sku))]);
 // Under a budget spend on the cheapest checked fits; otherwise keep catalog relevance order. Mixed kinds alternate
 // (a vase, then books, then a candle) so decor does not repeat one product.
 for(const [role,pool] of pools){
  // Floor pieces: smaller footprints fit more; under a budget, cheaper first.
  if(ctx.budget!==undefined)pool.sort((a,b)=>a.price-b.price);
  else if(roles.find(r=>r.role===role.split('+')[0])?.place==='floor')pool.sort((a,b)=>a.size[0]*a.size[1]-b.size[0]*b.size[1]);
  if(roles.find(r=>r.role===role)?.place!=='on')continue;
  const byKind=[...new Set(pool.map(p=>p.kind))].map(kind=>pool.filter(p=>p.kind===kind)),mixed:CatalogProduct[]=[];
  for(let i=0;mixed.length<pool.length;i++)for(const list of byKind)if(list[i])mixed.push(list[i]!);
  pools.set(role,mixed);
 }
 // Floor pieces need slot searches over the whole flat; they get at most 60% of the time so decor, art and
 // curtains (cheap to place) are not starved.
 const deadline=performance.now()+ctx.time_ms,floorDeadline=performance.now()+ctx.time_ms*.6;
 const ops=[...ctx.ops],products:CatalogProduct[]=[],added:FillResult['added']=[],unfilled:string[]=[];
 let cost=ctx.cost,preview=applyOps(ctx.scene,ops),timedOut=false,overBudget=false,noFit=false,checks=0,checkMs=0;
 const issues=(scene:Scene)=>new Set(scoreComposition(scene,ctx.roomId,{program:ctx.program}).issues.map(i=>i.code));
 // Optional pieces may not narrow any existing walkway or function clearance below its 0.75 m / required value.
 // Measured with the kinds the editor will hold (a bench or pouf is a chair there and needs pull-out room).
 const deficits=(scene:Scene)=>new Map([...functionClearances({...scene,items:scene.items.map(i=>editorKindOf[i.kind]?{...i,kind:editorKindOf[i.kind]!}:i)}).map(c=>[`f:${c.item_id}:${c.function}:${c.side}:${c.other_item_id??''}`,Math.max(c.deficit_m,c.excess_m??0)] as const),
  ...spaceMetrics(scene).rooms.flatMap(r=>r.walkways.map(w=>[`w:${r.room_id}:${[w.from,w.to].sort().join(':')}`,w.reachable?Math.max(0,.75-w.width_m):.75] as const))]);
 const worsens=(before:Map<string,number>,after:Scene)=>[...deficits(after)].some(([key,value])=>value>1e-6&&value>(before.get(key)??0)+1e-6);
 let currentDeficits=deficits(preview);
 let current=issues(preview);
 for(const role of roles){
  const pool=pools.get(role.role)??[];
  for(let n=present(preview,ctx.roomId,role);n<target(preview,ctx.roomId,role);n++){
   const end=role.place==='floor'?floorDeadline:deadline;
   if(performance.now()>end){timedOut=true;break;}
   const affordable=pool.filter(p=>p.price+cost<=(ctx.budget??Infinity));
   // Searches were capped at the remaining budget: an empty pool with almost nothing left is the budget, not the catalog.
   if(pool.length&&!affordable.length||!pool.length&&ctx.budget!==undefined&&ctx.budget-ctx.cost<SPENT_DRAM){unfilled.push(`${role.role}: over the remaining budget`);overBudget=true;break;}
   // A role gets a bounded share of the fill time but always a few real checks.
   // Candidates the composition screen rejects cost pose generation too, so the bound doubles at most.
   const roleStart=performance.now(),roleDeadline=Math.min(end,roleStart+4000);let tried=0,placed=false;
   const over=()=>performance.now()>roleDeadline&&(tried>=3||performance.now()>roleStart+8000);
   const shift=role.place==='on'?n%Math.max(1,affordable.length):0;
   for(const p of [...affordable.slice(shift),...affordable.slice(0,shift)].slice(0,role.place==='floor'?3:6)){
    if(over())break;
    for(const op of poses(preview,ctx.roomId,p,role,ctx.cache)){
     if(over())break;
     let after:Scene;try{after=applyOps(preview,[op]);}catch{continue;}
     let group:{op:Op;p:CatalogProduct}[]=[{op,p}],next=issues(after);
     // A new chair may bring its own side table and reading lamp; any other new composition issue rejects it.
     const fixable=new Map((role.with??[]).map(w=>[w.fixes,pools.get(`${role.role}+${w.fixes}`)??[]]));
     if([...next].some(code=>!current.has(code)&&!fixable.has(code)))continue;
     for(const [code,companions] of fixable){
      if(!next.has(code)||current.has(code))continue;
      const fix=companionFor(after,op,companions.filter(c=>c.price+cost+group.reduce((s,g)=>s+g.p.price,0)<=(ctx.budget??Infinity)),code,ctx.roomId,issues);
      if(!fix)break;
      group.push(fix);after=applyOps(after,[fix.op]);next=issues(after);
     }
     if([...next].some(code=>!current.has(code)))continue;
     tried++;const t0=performance.now();const ok=!worsens(currentDeficits,after)&&!!ctx.evaluate([...ops,...group.map(g=>g.op)],role.role,p.sku);checks++;checkMs+=performance.now()-t0;
     if(!ok)continue;
     for(const g of group){ops.push(g.op);products.push(g.p);cost+=g.p.price;added.push({role:g===group[0]?role.role:`${role.role} companion`,sku:g.p.sku,kind:g.p.kind,place:role.place});}
     preview=after;current=next;currentDeficits=deficits(after);placed=true;break;
    }
    if(placed)break;
   }
   if(!placed){unfilled.push(`${role.role}: ${pool.length?'no checked fit':'no catalog match'}`);noFit=true;break;}
  }
  if(timedOut&&performance.now()>deadline)break;
 }
 const stopped:FillResult['stopped']=timedOut?'time':overBudget?'budget':noFit?'nothing_more_fits':'well_furnished';
 const searches=results.map(r=>({role:r.role,kind:r.kind,status:r.status,returned:r.products.length}));
 return {ops,products,cost,added,unfilled,stopped,searches,checks,check_ms:Math.round(checkMs)};
}
