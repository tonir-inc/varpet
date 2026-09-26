import type {Scene,Item,Op,Vec2} from '../scene.js';
import type {CatalogProduct} from '../catalog.js';
import type {DesignCandidate,DesignRequest} from './design.js';
import {applyOps,wallOutward} from '../adapter.js';
import {localGeometryErrors,compareLayoutErrors} from '../local-checks.js';
import {checkLayout} from '../layout.js';
import {scoreComposition,type TasteOptions} from './composition.js';
import {styles} from '../../knowledge/styles/index.js';
/** A sofa facing storage is a complete seating anchor; an accent chair is optional. */
export function compactLivingCandidates(scene:Scene,request:DesignRequest,products:Record<string,CatalogProduct[]>,options:TasteOptions):DesignCandidate[]{
 if(options.alternative_seating||options.excluded_roles?.length||/\b(?:chairs?|armchairs?)\b/i.test([request.style_request,request.customer_requests?.at(-1)??''].join(' ')))return [];
 const pick=(kind:string,fit:(p:CatalogProduct)=>boolean)=>(products[kind]??[]).filter(fit).sort((a,b)=>Number(b.size_status==='confirmed')-Number(a.size_status==='confirmed')||a.size[0]-b.size[0]).slice(0,4);
 const sofas=pick('sofa',p=>p.size[0]>=1.4&&p.size[0]<=2.4&&p.size[1]<=1.1),rugs=pick('rug',p=>p.size[0]>=2.3&&p.size[1]>=1.7),tables=pick('table',p=>p.size[0]<=1.2&&p.size[1]<=.65&&p.size[2]<=.6),lamps=pick('lamp',p=>p.size[0]<=.35&&p.size[1]<=.35&&p.size[2]>=.8),shelves=pick('shelf',p=>p.size[0]<=1.2&&p.size[1]>=.2&&p.size[1]<=.45&&p.size[2]>=.7);
 if([sofas,rugs,tables,lamps,shelves].some(ps=>!ps.length))return [];
 const remove=scene.items.filter(i=>i.room_id===request.room_id&&!i.keep&&(request.remake||request.remove_ids?.includes(i.id))),removeOps:Op[]=remove.map(i=>({type:'remove',id:i.id})),base=applyOps(scene,removeOps),baseline=localGeometryErrors(scene);
 const counts=(list:Item[])=>Object.entries(list.reduce<Record<string,number>>((m,i)=>(m[i.kind]=(m[i.kind]??0)+1,m),{})).map(([kind,count])=>({kinds:[kind],count}));
 const extraLight=Math.max(...(options.styles??[]).map(id=>styles[id]?.piece_count.living[0]??5),5)>5,candidates:DesignCandidate[]=[];
 for(let variant=0;variant<4;variant++){
  const sofa=sofas[variant%sofas.length]!,rug=rugs[variant%rugs.length]!,table=tables[variant%tables.length]!,lamp=lamps[variant%lamps.length]!,shelf=shelves[variant%shelves.length]!;
  for(const wall of scene.walls.filter(w=>w.room_id===request.room_id&&!w.open))for(const fraction of [.5,.35,.65,.25,.75,.45,.55])for(const side of [-1,1]){
   const out=wallOutward(scene,wall),rotation=(Math.atan2(-out[0],out[1])*180/Math.PI+360)%360,r=rotation*Math.PI/180;
   const origin:Vec2=[wall.a[0]+(wall.b[0]-wall.a[0])*fraction-out[0]*((wall.thickness??0)/2+.05+sofa.size[1]/2),wall.a[1]+(wall.b[1]-wall.a[1])*fraction-out[1]*((wall.thickness??0)/2+.05+sofa.size[1]/2)];
   const make=(p:CatalogProduct,role:string,x:number,y:number,turn=0):Item=>{
    let id=`taste-compact-${role}`;for(let n=1;[...scene.items,...scene.fixed].some(i=>i.id===id);n++)id=`taste-compact-${role}-${n}`;
    return {...p.item,id,name:p.name.slice(0,120).trim(),room_id:request.room_id,pos:[origin[0]+x*Math.cos(r)-y*Math.sin(r),origin[1]+x*Math.sin(r)+y*Math.cos(r)],rot:(rotation+turn)%360,keep:false};
   };
   const tableY=-sofa.size[1]/2-.45-table.size[1]/2,shelfY=tableY-table.size[1]/2-.9-shelf.size[1]/2;
   const items=[make(sofa,'sofa',0,0),make(table,'table',0,tableY),make(rug,'rug',0,tableY),make(lamp,'reading-light',side*(sofa.size[0]/2+.65+lamp.size[0]/2),0),make(shelf,'focal-storage',0,shelfY,180),...extraLight?[make(lamp,'ambient-light',-side*(shelf.size[0]/2+.2+lamp.size[0]/2),shelfY)]:[]];
   const after={...base,items:[...base.items,...items]};if(compareLayoutErrors(baseline,localGeometryErrors(after)).errors.length)continue;
   const composition=scoreComposition(after,request.room_id,options);if(!composition.pass)continue;
   const ops:Op[]=[...removeOps,...items.map(item=>({type:'add' as const,item}))],checks=checkLayout(scene,ops,{compareBaseline:true});if(!checks.ok)continue;
   candidates.push({id:`compact-${variant}-${wall.id}-${fraction}-${side}`,ops,checks,composition,intent:{room_id:request.room_id,add:counts(items),remove:counts(remove)}});
   if(candidates.length===2)return candidates;
  }
 }
 return candidates;
}
