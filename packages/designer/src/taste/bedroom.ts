import type {Scene,Item,Op,Vec2} from '../scene.js';
import type {CatalogProduct} from '../catalog.js';
import type {DesignCandidate,DesignRequest} from './design.js';
import {applyOps,wallOutward} from '../adapter.js';
import {localGeometryErrors,compareLayoutErrors} from '../local-checks.js';
import {checkLayout} from '../layout.js';
import {scoreComposition,type TasteOptions} from './composition.js';
export function bedroomCandidates(scene:Scene,request:DesignRequest,products:Record<string,CatalogProduct[]>,options:TasteOptions):DesignCandidate[]{
 const excluded=new Set(request.excluded_roles??[]);if(excluded.has('bed'))return [];
 const pick=(kind:string,predicate:(p:CatalogProduct)=>boolean)=>products[kind]?.find(predicate);
 const bed=pick('bed',p=>p.size[0]>=1.4&&p.size[0]<=2.1),table=pick('table',p=>p.size[0]<=.65&&p.size[1]<=.6&&p.size[2]<=.75),lamp=pick('lamp',p=>p.size[0]<=.4&&p.size[1]<=.4&&p.size[2]>=.8),cabinet=pick('cabinet',p=>p.size[0]<=1.5&&p.size[1]<=.6&&p.size[2]>=1);
 if(!bed||(!table&&!excluded.has('nightstands'))||(!lamp&&!excluded.has('bedside_lights'))||(!cabinet&&!excluded.has('storage')))return [];
 const remove=scene.items.filter(i=>i.room_id===request.room_id&&!i.keep&&(request.remake||request.remove_ids?.includes(i.id))),base=applyOps(scene,remove.map(i=>({type:'remove' as const,id:i.id}))),baseline=localGeometryErrors(scene),candidates:DesignCandidate[]=[];
 for(const wall of scene.walls.filter(w=>w.room_id===request.room_id&&!w.open))for(const fraction of [.5,.35,.65]){
  const out=wallOutward(scene,wall),rotation=(Math.atan2(-out[0],out[1])*180/Math.PI+360)%360,r=rotation*Math.PI/180;
  const head:Vec2=[wall.a[0]+(wall.b[0]-wall.a[0])*fraction-out[0]*((wall.thickness??0)/2+.03),wall.a[1]+(wall.b[1]-wall.a[1])*fraction-out[1]*((wall.thickness??0)/2+.03)];
  const origin:Vec2=[head[0]-out[0]*bed.size[1]/2,head[1]-out[1]*bed.size[1]/2];
  const make=(p:CatalogProduct,role:string,x:number,y:number,turn=0):Item=>{
   let id=`taste-${role}`;for(let suffix=1;[...scene.items,...scene.fixed].some(i=>i.id===id);suffix++)id=`taste-${role}-${suffix}`;
   return {...p.item,name:p.name.slice(0,120).trim(),id,room_id:request.room_id,pos:[origin[0]+x*Math.cos(r)-y*Math.sin(r),origin[1]+x*Math.sin(r)+y*Math.cos(r)],rot:(rotation+turn)%360,keep:false};
  };
  const items=[make(bed,'bed',0,0),...[-1,1].flatMap(side=>[
   ...excluded.has('nightstands')?[]:[make(table!,`nightstand-${side}`,side*(bed.size[0]/2+table!.size[0]/2+.35),bed.size[1]/2-.8)],
   ...excluded.has('bedside_lights')?[]:[make(lamp!,`bedside-light-${side}`,side*(bed.size[0]/2+lamp!.size[0]/2+.45),bed.size[1]/2-.15)],
  ]),...excluded.has('storage')?[]:[make(cabinet!,'wardrobe',0,-bed.size[1]/2-1.1,180)]];
  const after={...base,items:[...base.items,...items]};if(compareLayoutErrors(baseline,localGeometryErrors(after)).errors.length)continue;
  const composition=scoreComposition(after,request.room_id,options);if(!composition.pass)continue;
  const ops:Op[]=[...remove.map(i=>({type:'remove' as const,id:i.id})),...items.map(item=>({type:'add' as const,item}))],checks=checkLayout(scene,ops,{compareBaseline:true});if(!checks.ok)continue;
  const counts=(list:Item[])=>Object.entries(list.reduce<Record<string,number>>((m,i)=>(m[i.kind]=(m[i.kind]??0)+1,m),{})).map(([kind,count])=>({kinds:[kind],count}));
  candidates.push({id:`bedroom-${wall.id}-${fraction}`,ops,checks,composition,intent:{room_id:request.room_id,add:counts(items),remove:counts(remove)}});if(candidates.length===2)return candidates;
 }
 return [];
}
