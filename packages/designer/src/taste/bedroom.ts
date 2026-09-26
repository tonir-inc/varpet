import {roomPrograms} from '../../knowledge/room-programs.js';
import {requestPolicy} from '../request-policy.js';
import type {Scene,Item,Op,Vec2} from '../scene.js';
import type {CatalogProduct} from '../catalog.js';
import type {DesignCandidate,DesignRequest} from './design.js';
import {applyOps,wallOutward} from '../adapter.js';
import {localGeometryErrors,compareLayoutErrors} from '../local-checks.js';
import {checkLayout} from '../layout.js';
import {scoreComposition,type TasteOptions} from './composition.js';
import {functionClearances,type FunctionClearance} from '../metrics/function.js';
import {functionClearanceRegressions} from '../proposal-clearances.js';
export function bedroomCandidates(scene:Scene,request:DesignRequest,products:Record<string,CatalogProduct[]>,options:TasteOptions):DesignCandidate[]{
 const excluded=new Set(request.excluded_roles??[]);if(excluded.has('bed'))return [];
 const blocked=new Set(requestPolicy(request.customer_requests?.length?request.customer_requests:[request.style_request]).blocked_kinds);
 const mentions=[...request.style_request.matchAll(/\b(wardrobe|dresser)s?\b/gi)].map(m=>m[1]!.toLowerCase()).filter(k=>!blocked.has(k));
 const requestedStorage=mentions.at(-1);
 const enforced=(m:FunctionClearance)=>m.function==='bed_side'||m.function==='storage_front';
 const baselineAccess=functionClearances(scene).filter(enforced);
 const candidates:DesignCandidate[]=[];
 for(let variant=0;variant<4;variant++){
 const pick=(kind:string,predicate:(p:CatalogProduct)=>boolean)=>{const choices=products[kind]?.filter(predicate)??[];return choices[variant%choices.length];};
 const preferred=(role:string)=>roomPrograms.bedroom.essentials.find(r=>r.role===role)!.preferred_kinds!;
 const first=(kinds:readonly string[],predicate:(p:CatalogProduct)=>boolean)=>kinds.map(kind=>pick(kind,predicate)).find(Boolean);
 const bed=pick('bed',p=>p.size[0]>=1.4&&p.size[0]<=2.1),table=first(preferred('nightstands'),p=>p.size[0]<=.65&&p.size[1]<=.6&&p.size[2]<=.75),lamp=pick('lamp',p=>p.size[0]<=.4&&p.size[1]<=.4&&p.size[2]>=.8),cabinet=first(requestedStorage?[requestedStorage]:preferred('storage'),p=>p.size[0]<=1.5&&p.size[1]<=.6&&p.size[2]>=(p.kind==='dresser'?.65:p.kind==='wardrobe'?1.4:1)&& (p.kind!=='wardrobe'||p.size[1]>=.4));
 if(!bed||(!table&&!excluded.has('nightstands'))||(!lamp&&!excluded.has('bedside_lights'))||(!cabinet&&!excluded.has('storage')))return [];
 const remove=scene.items.filter(i=>i.room_id===request.room_id&&!i.keep&&(request.remake||request.remove_ids?.includes(i.id))),base=applyOps(scene,remove.map(i=>({type:'remove' as const,id:i.id}))),baseline=localGeometryErrors(scene);
 for(const wall of scene.walls.filter(w=>w.room_id===request.room_id&&!w.open))for(const fraction of [.5,.45,.55,.35,.65])for(const storageOffset of excluded.has('storage')?[0]:[0,.45,-.45]){
  const out=wallOutward(scene,wall),rotation=(Math.atan2(-out[0],out[1])*180/Math.PI+360)%360,r=rotation*Math.PI/180;
  const head:Vec2=[wall.a[0]+(wall.b[0]-wall.a[0])*fraction-out[0]*((wall.thickness??0)/2+.03),wall.a[1]+(wall.b[1]-wall.a[1])*fraction-out[1]*((wall.thickness??0)/2+.03)];
  const origin:Vec2=[head[0]-out[0]*bed.size[1]/2,head[1]-out[1]*bed.size[1]/2];
  const make=(p:CatalogProduct,role:string,x:number,y:number,turn=0):Item=>{
   let id=`taste-${role}`;for(let suffix=1;[...scene.items,...scene.fixed].some(i=>i.id===id);suffix++)id=`taste-${role}-${suffix}`;
   return {...p.item,name:p.name.slice(0,120).trim(),id,room_id:request.room_id,pos:[origin[0]+x*Math.cos(r)-y*Math.sin(r),origin[1]+x*Math.sin(r)+y*Math.cos(r)],rot:(rotation+turn)%360,keep:false};
  };
  const items=[make(bed,'bed',0,0),...[-1,1].flatMap(side=>[
   ...excluded.has('nightstands')?[]:[make(table!,`nightstand-${side}`,side*(bed.size[0]/2+table!.size[1]/2+.65),bed.size[1]/2-Math.max(table!.size[0]/2,.35),side<0?90:270)],
   ...excluded.has('bedside_lights')?[]:[make(lamp!,`bedside-light-${side}`,side*(bed.size[0]/2+.9+lamp!.size[0]/2),bed.size[1]/2-.85)],
  ]),...excluded.has('storage')?[]:[make(cabinet!,'wardrobe',storageOffset,-bed.size[1]/2-.9-cabinet!.size[1]/2,180)]];
  const after={...base,items:[...base.items,...items]};if(compareLayoutErrors(baseline,localGeometryErrors(after)).errors.length)continue;
  const composition=scoreComposition(after,request.room_id,options);if(!composition.pass)continue;
  const ops:Op[]=[...remove.map(i=>({type:'remove' as const,id:i.id})),...items.map(item=>({type:'add' as const,item}))],checks=checkLayout(scene,ops,{compareBaseline:true});if(!checks.ok)continue;
  if(functionClearanceRegressions(baselineAccess,checks.metrics!.function_clearances.filter(enforced)).length)continue;
  const counts=(list:Item[])=>Object.entries(list.reduce<Record<string,number>>((m,i)=>(m[i.kind]=(m[i.kind]??0)+1,m),{})).map(([kind,count])=>({kinds:[kind],count}));
  if(candidates.some(c=>items.every(item=>c.ops.some(op=>op.type==='add'&&op.item.id===item.id&&op.item.sku===item.sku&&op.item.rot===item.rot&&Math.hypot(op.item.pos[0]-item.pos[0],op.item.pos[1]-item.pos[1])<.25))))continue;
  candidates.push({id:`bedroom-${variant}-${wall.id}-${fraction}-${storageOffset}`,ops,checks,composition,intent:{room_id:request.room_id,add:counts(items),remove:counts(remove)}});if(candidates.length===2)return candidates;
 }
 }
 return candidates;
}
