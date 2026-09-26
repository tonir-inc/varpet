import {requestPolicy,canonicalKind} from '../request-policy.js';
import type {Scene,Op,Item,Vec2} from '../scene.js';
import {applyOps} from '../adapter.js';
import {checkLayout} from '../layout.js';
import {localGeometryErrors,compareLayoutErrors} from '../local-checks.js';
import {searchRoomCatalog} from './catalog.js';
import {compactLivingCandidates} from './living-compact.js';
import {kidsCandidates} from './kids.js';
import {officeCandidates} from './office.js';
import {bedroomCandidates} from './bedroom.js';
import {resolveStyles,styles} from '../../knowledge/styles/index.js';
import {inferRoomProgram,roomPrograms} from '../../knowledge/room-programs.js';
import {scoreComposition,type TasteOptions} from './composition.js';
import type {CatalogQuery,CatalogProduct} from '../catalog.js';
export interface DesignRequest {room_id:string;style_request:string;remake?:boolean;remove_ids?:string[];excluded_roles?:string[];customer_requests?:readonly string[];budget_dram?:number}
export interface DesignCandidate {id:string;ops:Op[];intent:{room_id:string;add:{kinds:string[];count:number}[];remove:{kinds:string[];count:number}[]};checks:ReturnType<typeof checkLayout>;composition:ReturnType<typeof scoreComposition>}
/** Geometry recipes enumerate poses. Composition grading is independent of these construction rules. */
export async function designRoom(scene:Scene,request:DesignRequest,query?:CatalogQuery){
 const room=scene.rooms.find(r=>r.id===request.room_id);if(!room)throw new Error('Unknown room');
 const words=[request.customer_requests?.at(-1)??'',request.style_request].join(' ');
 const program=/(?:kids?['’]?|children(?:['’]s)?|child['’]s)\s+(?:bed)?room|(?:bed)?room\s+for\s+(?:the\s+)?(?:kids|children)/i.test(words)?'kids':inferRoomProgram(room.name??room.id),requestedStyles=resolveStyles(request.style_request),styleIds=requestedStyles.length?requestedStyles:['modern'];
 if(!program)throw new Error('A supported room program is required');
 if(request.budget_dram!==undefined&&(!Number.isSafeInteger(request.budget_dram)||request.budget_dram<0))throw new Error('Budget must be nonnegative whole dram');
 const blocked=new Set(requestPolicy(request.customer_requests?.length?request.customer_requests:[request.style_request]).blocked_kinds);
 const anchorAlternative=blocked.has('sofa');
 const excludedRoles=[...request.excluded_roles??[],...anchorAlternative?['seating_anchor']:[]];
 const catalog=await searchRoomCatalog(program,styleIds,query,true,program==='kids'?request.budget_dram:undefined);
 for(const kind of Object.keys(catalog.products))if(blocked.has(canonicalKind(kind)))catalog.products[kind]=[];
 const knowledge={style_basis:requestedStyles.length?'customer request':'assumed modern default; customer specified no supported style',blocked_kinds:[...blocked],program:roomPrograms[program],styles:styleIds.map(id=>({id,...styles[id]}))};
 const base={knowledge,catalog,candidates:[] as DesignCandidate[],selected_id:null as string|null,reason:''};
 if(program==='kids'){
  const candidates=kidsCandidates(scene,request,catalog.products,{program,styles:styleIds,catalog:Object.fromEntries(Object.values(catalog.products).flat().map(p=>[p.sku,p])),excluded_roles:excludedRoles});
  return {...base,candidates,selected_id:candidates[0]?.id??null,reason:candidates.length===1?'One complete checked children’s room; no alternative was found.':candidates.length?'Two complete checked children’s rooms with sleep, study, storage and clear play space.':'No complete children’s room found within the catalog, budget, play-space and circulation constraints.'};
 }
 if(program==='bedroom'){
  const candidates=bedroomCandidates(scene,request,catalog.products,{program,styles:styleIds,catalog:Object.fromEntries(Object.values(catalog.products).flat().map(p=>[p.sku,p])),excluded_roles:excludedRoles});
  return {...base,candidates,selected_id:candidates[0]?.id??null,reason:candidates.length===1?'One complete checked bedroom composition; no alternative was found.':candidates.length?'Two complete checked bedroom compositions.':'No complete bedroom composition fits with a solid headboard wall and reachable bedside furniture.'};
 }
 if(program==='office'){
  const candidates=officeCandidates(scene,request,catalog.products,{program,styles:styleIds,catalog:Object.fromEntries(Object.values(catalog.products).flat().map(p=>[p.sku,p])),excluded_roles:excludedRoles});
  return {...base,candidates,selected_id:candidates[0]?.id??null,reason:candidates.length===1?'One complete checked office composition; no alternative was found.':candidates.length?'Two complete checked office compositions with a desk, work chair, task light and storage.':'No complete office composition fits the catalog pieces and circulation.'};
 }
 if(program!=='living')return {...base,reason:'Room program and catalog supplied; automatic composition currently supports living rooms, bedrooms and offices. Use relation placement for this program.'};
 const products=catalog.products,excluded=new Set(excludedRoles);
 const compact=(reason:string)=>{
  const candidates=compactLivingCandidates(scene,request,products,{program,styles:styleIds,catalog:Object.fromEntries(Object.values(products).flat().map(p=>[p.sku,p])),excluded_roles:excludedRoles,alternative_seating:anchorAlternative});
  return {...base,candidates,selected_id:candidates[0]?.id??null,reason:candidates.length===1?'One complete compact living composition; no alternative was found.':candidates.length?'Two complete compact living compositions with the sofa facing a focal point.':reason};
 };
 const target:Record<string,number>={sofa:1.8,chair:.8,table:.5,lamp:.3,shelf:.65,rug:3};
 const pick=(kind:string,predicate:(p:CatalogProduct)=>boolean=()=>true)=>(products[kind]?.filter(predicate)??[]).sort((a,b)=>Number(b.size_status==='confirmed')-Number(a.size_status==='confirmed')||Math.abs(a.size[0]-(target[kind]??1))-Math.abs(b.size[0]-(target[kind]??1))).slice(0,4);
 const sofas=pick(excluded.has('seating_anchor')?'chair':'sofa',p=>p.size[0]>=(excluded.has('seating_anchor')?.6:1.4)&&p.size[0]<=2.8&&p.size[1]<=1.2),chairs=pick('chair',p=>p.size[0]>=.6&&p.size[0]<=1.1&&p.size[1]<=1.15);
 const rugs=pick('rug',p=>Math.max(p.size[0],p.size[1])>=2.3&&Math.min(p.size[0],p.size[1])>=1.7);
 const tables=pick('table',p=>p.size[2]<=.6&&p.size[0]<=1.5&&p.size[1]<=.85);
 const lamps=pick('lamp',p=>p.size[2]>=.8&&p.size[0]<=.65&&p.size[1]<=.65),shelves=pick('shelf',p=>p.size[0]<=1.4&&p.size[1]>=.2&&p.size[1]<=.5&&p.size[2]>=.7);
 if([sofas,chairs,...excluded.has('rug')?[]:[rugs],...excluded.has('table')?[]:[tables],...excluded.has('light')?[]:[lamps],...excluded.has('focal_point')?[]:[shelves]].some(p=>!p.length))return compact('Catalog lacks a compatible, sized full living-room set; missing roles or dimensions must be resolved, not silently omitted.');
 const remove=scene.items.filter(i=>i.room_id===room.id&&!i.keep&&(request.remake||request.remove_ids?.includes(i.id)));
 const removed=new Set(remove.map(i=>i.id));
 const lifted=applyOps(scene,remove.map(i=>({type:'remove' as const,id:i.id})));
 const xs=room.polygon.map(p=>p[0]),ys=room.polygon.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const evidence=Object.fromEntries(Object.values(products).flat().map(p=>[p.sku,p]));
 const options:TasteOptions={program,styles:styleIds,catalog:evidence,excluded_roles:excludedRoles,alternative_seating:anchorAlternative};
 const rejected:Record<string,number>={};const reject=(code:string)=>{rejected[code]=(rejected[code]??0)+1;};
 const candidates:DesignCandidate[]=[],baselineGeometry=localGeometryErrors(scene);
 const counts=(items:Item[])=>Object.entries(items.reduce<Record<string,number>>((m,i)=>(m[i.kind]=(m[i.kind]??0)+1,m),{})).map(([kind,count])=>({kinds:[kind],count}));
 // Bounded product variants; preserve catalog relevance and confirmed-size priority.
 variants: for(let variant=0;variant<4;variant++){
  const sofa=sofas[variant%sofas.length]!,chair=chairs[variant%chairs.length]!,table=tables[variant%tables.length]??chair,lamp=lamps[variant%lamps.length]??chair,shelf=shelves[variant%shelves.length]??chair;
  const d=sofa.size[1]/2+1.25+chair.size[1]/2;
  const frontSpan=d-sofa.size[1]*.4-chair.size[1]*.4;
  const rug=rugs.find(r=>r.size[0]>=sofa.size[0]*.8+.1&&r.size[1]>=frontSpan+.2)??rugs[0]??chair;
  poses: for(const rotation of [0,90,180,270])for(const fx of [.5,.38,.62])for(const fy of [.5,.35,.65]){
   const origin:Vec2=[minX+(maxX-minX)*fx,minY+(maxY-minY)*fy],rad=rotation*Math.PI/180;
   const make=(p:CatalogProduct,role:string,x:number,y:number,rot=0):Item=>{
    let id=`taste-${role}`;for(let suffix=1;[...scene.items,...scene.fixed].some(i=>i.id===id);suffix++)id=`taste-${role}-${suffix}`;
    return {...p.item,name:p.name.slice(0,120).trim(),id,room_id:room.id,pos:[origin[0]+x*Math.cos(rad)-y*Math.sin(rad),origin[1]+x*Math.sin(rad)+y*Math.cos(rad)],rot:(rotation+rot)%360,keep:false};
   };
   const sy=d/2,cy=-d/2,ty=0,tx=Math.max(chair.size[0]/2+.45+table.size[1]/2,.9);
   const group=[make(sofa,'sofa',0,sy),make(chair,'chair',0,cy,180),...excluded.has('table')?[]:[make(table,'table',tx,ty,90)],...excluded.has('rug')?[]:[make(rug,'rug',0,(sy-sofa.size[1]*.4+cy+chair.size[1]*.4)/2)],...excluded.has('light')?[]:[make(lamp,'sofa-light',sofa.size[0]/2+lamp.size[0]/2+.65,sy),make(lamp,'chair-light',chair.size[0]/2+lamp.size[0]/2+.65,cy)],...excluded.has('focal_point')?[]:[make(shelf,'focal-shelf',-Math.max(sofa.size[0]/2,shelf.size[1]/2)-.9,ty,90)]];
   const active=group.filter(i=>!((request.excluded_roles?.includes('rug')&&i.kind==='rug')||(request.excluded_roles?.includes('light')&&i.kind==='lamp')||(request.excluded_roles?.includes('table')&&i.kind==='table')));
   const after={...lifted,items:[...lifted.items,...active]};
   // Cheap containment/collision checks first; full circulation and baseline checks stay authoritative.
   const geometry=compareLayoutErrors(baselineGeometry,localGeometryErrors(after)).errors;
   if(geometry.length){geometry.forEach(e=>reject(e.check));continue;}
   const composition=scoreComposition(after,room.id,options);
   if(!composition.pass){composition.issues.forEach(e=>reject(e.code));continue;}
   const ops:Op[]=[...remove.map(i=>({type:'remove' as const,id:i.id})),...active.map(item=>({type:'add' as const,item}))];
   const checks=checkLayout(scene,ops,{compareBaseline:true});if(!checks.ok){checks.errors.filter(e=>e.severity==='hard').forEach(e=>reject(e.message));continue;}
   candidates.push({id:`composition-${variant}-${rotation}-${fx}-${fy}`,ops,intent:{room_id:room.id,add:counts(active),remove:counts(remove)},checks,composition});
   // Keep distinct orientations/product sets, not tiny translations of one solution.
   if(candidates.length>=2)break variants;
   continue poses;
  }
  if(candidates.length>=8)break;
 }
 candidates.sort((a,b)=>b.composition.score-a.composition.score||a.id.localeCompare(b.id));
 const first=candidates[0],second=candidates.find(c=>first&&c!==first&&c.ops.some((op,i)=>op.type==='add'&&first.ops[i]?.type==='add'&&op.item.rot!==first.ops[i].item.rot))??candidates[1];
 if(!first)return {...compact('No complete, physically checked composition fits. Keep the program and report the obstruction; do not substitute an empty room.'),rejected_by:rejected};
 return {...base,candidates:second?[first,second]:[first],selected_id:first.id,reason:second?'Two complete catalog compositions passed physical and taste checks. Select by ID; preserve exact ops and declare the returned intent.':'One complete composition passed physical and taste checks; no alternative was found. Select its ID and preserve exact ops and intent.'};
}
