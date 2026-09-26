import type {Scene,Item,Op,Vec2} from '../scene.js';
import type {CatalogProduct} from '../catalog.js';
import type {DesignCandidate,DesignRequest} from './design.js';
import {applyOps,wallOutward} from '../adapter.js';
import {localGeometryErrors,compareLayoutErrors} from '../local-checks.js';
import {checkLayout} from '../layout.js';
import {scoreComposition,type TasteOptions} from './composition.js';
import {requestPolicy} from '../request-policy.js';
/** Wall-oriented work zones; the independent grader checks facing, reach and physical fit. */
export function officeCandidates(scene:Scene,request:DesignRequest,products:Record<string,CatalogProduct[]>,options:TasteOptions):DesignCandidate[]{
 const excluded=new Set(request.excluded_roles??[]);
 if(excluded.has('work_surface')||excluded.has('work_seat'))return [];
 const nativeDesk=/\bdesks?\b/i.test(request.style_request)&&!requestPolicy(request.customer_requests?.length?request.customer_requests:[request.style_request]).blocked_kinds.includes('desk');
 const candidates:DesignCandidate[]=[];
 for(let variant=0;variant<4;variant++){
 const pick=(kinds:string[],test:(p:CatalogProduct)=>boolean)=>{const choices=kinds.map(k=>(products[k]??[]).filter(test)).find(ps=>ps.length)??[];return choices[variant%choices.length];};
 const desk=pick(nativeDesk?['desk']:['desk','table'],p=>p.size[0]>=.8&&p.size[0]<=1.8&&p.size[1]>=.45&&p.size[1]<=.9&&p.size[2]>=.65&&p.size[2]<=.9),chair=pick(['chair'],p=>p.size[0]<=.85&&p.size[1]<=.9),lamp=pick(['lamp'],p=>p.size[0]<=.4&&p.size[1]<=.4&&p.size[2]>=.8),shelf=pick(['shelf','cabinet'],p=>p.size[0]<=1.1&&p.size[1]>=.2&&p.size[1]<=.45&&p.size[2]>=.7);
 if(!desk||!chair||(!lamp&&!excluded.has('task_light'))||(!shelf&&!excluded.has('storage')))return [];
 const remove=scene.items.filter(i=>i.room_id===request.room_id&&!i.keep&&(request.remake||request.remove_ids?.includes(i.id))),base=applyOps(scene,remove.map(i=>({type:'remove' as const,id:i.id}))),baseline=localGeometryErrors(scene);
 for(const wall of scene.walls.filter(w=>w.room_id===request.room_id&&!w.open))for(const fraction of [.5,.35,.65]){
  const out=wallOutward(scene,wall),rotation=(Math.atan2(-out[0],out[1])*180/Math.PI+360)%360,r=rotation*Math.PI/180;
  const back:Vec2=[wall.a[0]+(wall.b[0]-wall.a[0])*fraction-out[0]*((wall.thickness??0)/2+.05),wall.a[1]+(wall.b[1]-wall.a[1])*fraction-out[1]*((wall.thickness??0)/2+.05)];
  const origin:Vec2=[back[0]-out[0]*desk.size[1]/2,back[1]-out[1]*desk.size[1]/2];
  const make=(p:CatalogProduct,role:string,x:number,y:number,turn=0):Item=>{
   let id=`taste-${role}`;for(let n=1;[...scene.items,...scene.fixed].some(i=>i.id===id);n++)id=`taste-${role}-${n}`;
   return {...p.item,name:p.name.slice(0,120).trim(),id,room_id:request.room_id,pos:[origin[0]+x*Math.cos(r)-y*Math.sin(r),origin[1]+x*Math.sin(r)+y*Math.cos(r)],rot:(rotation+turn)%360,keep:false};
  };
  const items=[make(desk,'desk',0,0),make(chair,'work-chair',0,-desk.size[1]/2-chair.size[1]/2-.65,180),...excluded.has('task_light')?[]:[make(lamp!,'task-light',desk.size[0]/2+lamp!.size[0]/2+.2,0)],...excluded.has('storage')?[]:[make(shelf!,'office-storage',-desk.size[0]/2-shelf!.size[0]/2-.65,(desk.size[1]-shelf!.size[1])/2)]];
  const after={...base,items:[...base.items,...items]};if(compareLayoutErrors(baseline,localGeometryErrors(after)).errors.length)continue;
  const composition=scoreComposition(after,request.room_id,options);if(!composition.pass)continue;
  const ops:Op[]=[...remove.map(i=>({type:'remove' as const,id:i.id})),...items.map(item=>({type:'add' as const,item}))],checks=checkLayout(scene,ops,{compareBaseline:true});if(!checks.ok)continue;
  const counts=(list:Item[])=>Object.entries(list.reduce<Record<string,number>>((m,i)=>(m[i.kind]=(m[i.kind]??0)+1,m),{})).map(([kind,count])=>({kinds:[kind],count}));
  candidates.push({id:`office-${variant}-${wall.id}-${fraction}`,ops,checks,composition,intent:{room_id:request.room_id,add:counts(items),remove:counts(remove)}});
  if(candidates.length===2)return candidates;
 }
 }
 return [];
}
