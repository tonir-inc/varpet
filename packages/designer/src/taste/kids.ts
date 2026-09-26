import type {Scene,Item,Op,Vec2} from '../scene.js';
import type {CatalogProduct} from '../catalog.js';
import type {DesignCandidate,DesignRequest} from './design.js';
import {applyOps,wallOutward} from '../adapter.js';
import {localGeometryErrors,compareLayoutErrors} from '../local-checks.js';
import {checkLayout} from '../layout.js';
import {scoreComposition,type TasteOptions} from './composition.js';
import {functionClearances} from '../metrics/function.js';
import {functionClearanceRegressions} from '../proposal-clearances.js';
/** Bounded independent sleep/study/storage wall poses; no coordinates come from the model. */
export function kidsCandidates(scene:Scene,request:DesignRequest,products:Record<string,CatalogProduct[]>,options:TasteOptions):DesignCandidate[]{
 const excluded=new Set(options.excluded_roles??[]);
 if(['bed','work_surface','work_seat','storage'].some(role=>excluded.has(role)))return [];
 const choose=(kinds:string[],fit:(p:CatalogProduct)=>boolean)=>kinds.flatMap(k=>products[k]??[]).filter(fit).sort((a,b)=>Number(b.size_status==='confirmed')-Number(a.size_status==='confirmed')||a.price-b.price||a.size[0]*a.size[1]-b.size[0]*b.size[1]).slice(0,4);
 const beds=choose(['bed'],p=>p.size[0]>=.8&&p.size[0]<=1.3&&p.size[1]>=1.8&&p.size[1]<=2.3),desks=choose(['desk'],p=>p.size[0]>=.8&&p.size[0]<=1.4&&p.size[1]>=.45&&p.size[1]<=.7&&p.size[2]>=.65&&p.size[2]<=.9),chairs=choose(['chair'],p=>p.size[0]<=.7&&p.size[1]<=.7),storage=choose(['shelf','wardrobe','cabinet'],p=>p.size[0]<=1.2&&p.size[1]<=.6&&p.size[2]>=.6&&(p.kind!=='wardrobe'||p.size[2]>=1.4&&p.size[1]>=.4)),lamps=choose(['lamp'],p=>p.size[0]<=.35&&p.size[1]<=.35&&p.size[2]>=.8);
 if(!beds.length||!desks.length||!chairs.length||!storage.length||(!lamps.length&&!excluded.has('task_light')))return [];
 const remove=scene.items.filter(i=>i.room_id===request.room_id&&!i.keep&&(request.remake||request.remove_ids?.includes(i.id))),removeOps:Op[]=remove.map(i=>({type:'remove',id:i.id})),base=applyOps(scene,removeOps),baseline=localGeometryErrors(scene),accessBefore=functionClearances(scene);
 const unique=(role:string)=>{let id=`taste-kids-${role}`;for(let n=1;[...scene.items,...scene.fixed].some(i=>i.id===id);n++)id=`taste-kids-${role}-${n}`;return id;};
 const counts=(list:Item[])=>Object.entries(list.reduce<Record<string,number>>((m,i)=>(m[i.kind]=(m[i.kind]??0)+1,m),{})).map(([kind,count])=>({kinds:[kind],count}));
 const fits=(items:Item[])=>!compareLayoutErrors(baseline,localGeometryErrors({...base,items:[...base.items,...items]})).errors.length;
 const wallPoses=(p:CatalogProduct,role:string,companions?:(make:(p:CatalogProduct,role:string,x:number,y:number,turn?:number)=>Item)=>Item[])=>{
  const poses:Item[][]=[];
  for(const wall of scene.walls.filter(w=>w.room_id===request.room_id&&!w.open))for(const fraction of [.25,.5,.75,.35,.65]){
   const out=wallOutward(scene,wall),rotation=(Math.atan2(-out[0],out[1])*180/Math.PI+360)%360,r=rotation*Math.PI/180;
   const origin:Vec2=[wall.a[0]+(wall.b[0]-wall.a[0])*fraction-out[0]*((wall.thickness??0)/2+.04+p.size[1]/2),wall.a[1]+(wall.b[1]-wall.a[1])*fraction-out[1]*((wall.thickness??0)/2+.04+p.size[1]/2)];
   const make=(product:CatalogProduct,name:string,x:number,y:number,turn=0):Item=>({...product.item,id:unique(name),name:product.name.slice(0,120).trim(),room_id:request.room_id,pos:[origin[0]+x*Math.cos(r)-y*Math.sin(r),origin[1]+x*Math.sin(r)+y*Math.cos(r)],rot:(rotation+turn)%360,keep:false});
   const group=[make(p,role,0,0),...companions?.(make)??[]];if(fits(group))poses.push(group);
  }return poses;
 };
 const candidates:DesignCandidate[]=[];
 for(let variant=0;variant<4;variant++){
  const bed=beds[variant%beds.length]!,desk=desks[variant%desks.length]!,chair=chairs[variant%chairs.length]!,shelf=storage[variant%storage.length]!,lamp=lamps[variant%lamps.length];
  const price=bed.price+desk.price+chair.price+shelf.price+(excluded.has('task_light')?0:lamp!.price);
  if(request.budget_dram!==undefined&&price>request.budget_dram)continue;
  const sleeping=wallPoses(bed,'bed'),working=wallPoses(desk,'desk',make=>[make(chair,'chair',0,-desk.size[1]/2-chair.size[1]/2-.6,180),...excluded.has('task_light')?[]:[make(lamp!,'lamp',desk.size[0]/2+lamp!.size[0]/2+.15,0)]]),storing=wallPoses(shelf,'storage');
  for(const sleep of sleeping)for(const work of working){
   if(!fits([...sleep,...work]))continue;
   for(const store of storing){
    const items=[...sleep,...work,...store];if(!fits(items))continue;
    const after={...base,items:[...base.items,...items]};
    if(functionClearanceRegressions(accessBefore,functionClearances(after)).length)continue;
    const composition=scoreComposition(after,request.room_id,options);if(!composition.pass)continue;
    const ops:Op[]=[...removeOps,...items.map(item=>({type:'add' as const,item}))],checks=checkLayout(scene,ops,{compareBaseline:true});
    if(!checks.ok||request.budget_dram!==undefined&&(checks.price.cost_dram===null||checks.price.cost_dram>request.budget_dram))continue;
    if(candidates.some(c=>items.every(i=>c.ops.some(o=>o.type==='add'&&o.item.sku===i.sku&&o.item.rot===i.rot&&Math.hypot(o.item.pos[0]-i.pos[0],o.item.pos[1]-i.pos[1])<.25))))continue;
    candidates.push({id:`kids-${variant}-${candidates.length}`,ops,checks,composition,intent:{room_id:request.room_id,add:counts(items),remove:counts(remove)}});
    if(candidates.length===2)return candidates;
   }
  }
 }
 return candidates;
}
