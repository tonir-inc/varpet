import type {Scene,Item,Vec2} from '../scene.js';
import {itemPolygon,polygonsOverlap} from '../metrics/space.js';
import {roomPrograms} from '../../knowledge/room-programs.js';
import {styles,styleMatchesKind,stylePalette,styleFamilies} from '../../knowledge/styles/index.js';
export interface TasteOptions {program:string;styles?:string[];catalog?:Record<string,{styles:string[];styles_inferred?:string[];colors_image:string[]}>;excluded_roles?:string[];alternative_seating?:boolean}
export interface TasteIssue {code:string;item_ids:string[];message:string}
const EPS=1e-6;
const seats=(i:Item)=>['sofa','chair','armchair','loveseat'].includes(i.kind);
const tables=(i:Item)=>['table','coffee_table','side_table','nightstand'].includes(i.kind);
function local(i:Item,p:Vec2):Vec2 {const r=i.rot*Math.PI/180,dx=p[0]-i.pos[0],dy=p[1]-i.pos[1];return [dx*Math.cos(r)+dy*Math.sin(r),-dx*Math.sin(r)+dy*Math.cos(r)];}
function world(i:Item,x:number,y:number):Vec2 {const r=i.rot*Math.PI/180;return [i.pos[0]+x*Math.cos(r)-y*Math.sin(r),i.pos[1]+x*Math.sin(r)+y*Math.cos(r)];}
function inside(i:Item,p:Vec2):boolean {const [x,y]=local(i,p);return Math.abs(x)<=i.size[0]/2+EPS&&Math.abs(y)<=i.size[1]/2+EPS;}
function distance(a:Item,b:Item):number {return Math.hypot(a.pos[0]-b.pos[0],a.pos[1]-b.pos[1]);}
function facing(a:Item,p:Vec2,tolerance=55):boolean {const [x,y]=local(a,p);return -y>EPS&&Math.atan2(Math.abs(x),-y)<=tolerance*Math.PI/180+EPS;}
/** Reach from the seat's edge, not centre; rotation and actual catalog dimensions matter. */
function edgeGap(a:Item,b:Item):number {
 const aa=itemPolygon(a),bb=itemPolygon(b);if(polygonsOverlap(aa,bb))return 0;
 return Math.min(...aa.flatMap(p=>bb.map((q,i)=>segmentDistance(p,q,bb[(i+1)%bb.length]!))),...bb.flatMap(p=>aa.map((q,i)=>segmentDistance(p,q,aa[(i+1)%aa.length]!))));
}
function segmentDistance(p:Vec2,a:Vec2,b:Vec2):number {const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
/** Independent, pure grading. This does not generate poses or replace physical/request gates. */
export function scoreComposition(scene:Scene,roomId:string,options:TasteOptions){
 const program=roomPrograms[options.program];if(!program)throw new Error(`Unknown room program: ${options.program}`);
 if(!scene.rooms.some(r=>r.id===roomId))throw new Error(`Unknown room: ${roomId}`);
 const items=[...scene.items,...scene.fixed].filter(i=>i.room_id===roomId),issues:TasteIssue[]=[];
 const excluded=new Set(options.excluded_roles??[]);
 for(const [role,relations] of Object.entries({rug:['rug_anchor'],light:['seat_light'],table:['seat_table'],bedside_lights:['light_each_bedside'],nightstands:['nightstand_each_open_side']}))if(excluded.has(role))relations.forEach(r=>excluded.add(r));
 const checks:{code:string;pass:boolean;weight:number}[]=[];
 const check=(code:string,pass:boolean,weight:number,message:string,ids:string[]=[])=>{if(excluded.has(code))return;checks.push({code,pass,weight});if(!pass)issues.push({code,item_ids:ids,message});};
 // One item cannot satisfy two essential roles (e.g. wardrobe and both nightstands).
 const roles=program.essentials.filter(role=>!excluded.has(role.role));
 const slots=roles.flatMap(role=>Array.from({length:role.count},()=>role));
 const allocation=new Map<number,number>();
 const assign=(slot:number,seen:Set<number>):boolean=>{
  for(let i=0;i<items.length;i++)if(!seen.has(i)&&slots[slot]!.kinds.includes(items[i]!.kind)){
   seen.add(i);const previous=allocation.get(i);
   if(previous===undefined||assign(previous,seen)){allocation.set(i,slot);return true;}
  }return false;
 };
 slots.forEach((_,i)=>assign(i,new Set()));
 for(const role of roles){
  const count=[...allocation.values()].filter(slot=>slots[slot]===role).length;
  check(role.role,count>=role.count,role.role==='seating_anchor'?3:1,`Needs ${role.count} ${role.role.replaceAll('_',' ')} (${role.kinds.join(' or ')}).`);
 }
 if(options.program==='living'){
  if(options.alternative_seating)check('alternative_seating_anchor',items.filter(i=>i.kind==='chair').length>=2&&!items.some(i=>i.kind==='sofa'),3,'Replace the removed sofa with at least two seats of another kind.');
  const group=items.filter(seats),rugs=items.filter(i=>i.kind==='rug'),lamps=items.filter(i=>i.kind==='lamp'),surfaces=items.filter(tables);
  const focal=items.filter(i=>['tv','tv_unit','shelf','cabinet','fireplace'].includes(i.kind));
  check('seat_facing',group.length>0&&group.every(a=>focal.some(b=>facing(a,b.pos)&&distance(a,b)<=4.5)||group.some(b=>a!==b&&facing(a,b.pos)&&facing(b,a.pos))),2,'Every seat must face a focal point or another seat.',group.map(i=>i.id));
  check('conversation_distance',group.length>0&&group.every(a=>group.length===1||group.some(b=>a!==b&&distance(a,b)<=3+EPS)),1,'Seats need a conversation partner within 3 m.',group.map(i=>i.id));
  check('rug_anchor',group.length>0&&rugs.some(r=>group.every(s=>[-1,1].every(side=>inside(r,world(s,side*s.size[0]*.4,-s.size[1]*.4))))),2,'One rug must reach under both front legs of every seat in the group.',group.map(i=>i.id));
  check('seat_table',group.length>0&&group.every(s=>surfaces.some(t=>edgeGap(s,t)<=.6+EPS&&t.size[2]<=.75)),1,'Each seat needs a usable table within 0.60 m of its edge.',group.map(i=>i.id));
  check('seat_light',group.length>0&&group.every(s=>lamps.some(l=>edgeGap(s,l)<=.9+EPS)),1,'Each seat needs a reading lamp within 0.90 m of its edge.',group.map(i=>i.id));
  const chairs=group.filter(i=>i.kind!=='sofa');
  const row=chairs.length>=2&&chairs.every(s=>Math.abs(Math.sin((s.rot-chairs[0]!.rot)*Math.PI/180))<.1&&Math.cos((s.rot-chairs[0]!.rot)*Math.PI/180)>.9)&&chairs.every(s=>!focal.some(f=>facing(s,f.pos))&&!group.some(b=>s!==b&&facing(s,b.pos)&&facing(b,s.pos)));
  check('chair_row',!row,2,'Parallel chairs facing nothing form a waiting-room row, not a living group.',chairs.map(i=>i.id));
 }
 if(options.program==='office'){
  const desks=items.filter(i=>['desk','table'].includes(i.kind)),chairs=items.filter(i=>['chair','office_chair'].includes(i.kind)),lamps=items.filter(i=>i.kind==='lamp');
  check('work_seat_facing',chairs.length>0&&chairs.every(chair=>desks.some(desk=>facing(chair,desk.pos)&&distance(chair,desk)<=2)),2,'The work chair must face the desk within 2 m.',chairs.map(i=>i.id));
  check('work_reach',chairs.length>0&&chairs.every(chair=>desks.some(desk=>edgeGap(chair,desk)<=.65+EPS)),1,'Keep the work chair within 0.65 m of the desk edge.');
  check('task_light_reach',excluded.has('task_light')||desks.every(desk=>lamps.some(lamp=>edgeGap(desk,lamp)<=.6)),1,'Place task light within 0.60 m of the desk.');
 }
 if(options.program==='bedroom'){
  const beds=items.filter(i=>i.kind==='bed');
  check('headboard_on_solid_wall',beds.length>0&&beds.every(b=>{
   const head=world(b,0,b.size[1]/2);
   return scene.walls.filter(w=>w.room_id===roomId&&!w.open).some(w=>{
    const ends=[world(b,-b.size[0]/2,b.size[1]/2),world(b,b.size[0]/2,b.size[1]/2)];
    if(!ends.every(p=>segmentDistance(p,w.a,w.b)<=.25+(w.thickness??0)/2))return false;
    const length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
    return !scene.openings.filter(o=>o.wall_id===w.id).some(o=>{
     const a:Vec2=[w.a[0]+(w.b[0]-w.a[0])*o.offset/length,w.a[1]+(w.b[1]-w.a[1])*o.offset/length],end:Vec2=[a[0]+(w.b[0]-w.a[0])*o.width/length,a[1]+(w.b[1]-w.a[1])*o.width/length];
     return segmentDistance(head,a,end)<=b.size[0]/2+.1;
    });
   });
  }),2,'Place the headboard against a solid wall, clear of windows and doors.',beds.map(b=>b.id));
  check('nightstand_each_open_side',beds.length>0&&beds.every(b=>[-1,1].every(side=>items.some(t=>t!==b&&['table','nightstand','cabinet'].includes(t.kind)&&side*local(b,t.pos)[0]>b.size[0]/2&&edgeGap(b,t)<=.6&&local(b,t.pos)[1]>0))),1,'Provide a nightstand beside each side of the headboard.');
  check('light_each_bedside',beds.length>0&&beds.every(b=>[-1,1].every(side=>items.some(t=>t.kind==='lamp'&&side*local(b,t.pos)[0]>0&&edgeGap(b,t)<=.9+EPS&&local(b,t.pos)[1]>=b.size[1]/2-.6-EPS))),1,'Provide reachable light at both bedsides.');
 }
 if(options.styles?.length){
  const ids=options.styles,palette=stylePalette(ids),records=items.map(i=>({i,meta:(()=>{const m=options.catalog?.[i.sku??i.id];return m?{...m,styles:[...m.styles,...m.styles_inferred??[]]}:undefined;})()}));
  check('style_unknown',records.length>0&&records.every(r=>r.meta?.styles.length&&r.meta.colors_image.length),1,'Style/color evidence is missing; unknown is not a style match.',records.filter(r=>!r.meta?.styles.length||!r.meta.colors_image.length).map(r=>r.i.id));
  const shared=styleFamilies(records[0]?.meta?.styles??[]).filter(tag=>records.every(r=>styleFamilies(r.meta?.styles??[]).includes(tag)))??[];
  const recipes=ids.flatMap(id=>styles[id]?.composition?.program===options.program?[styles[id]!.composition!]:[]);
  check('style_consistency',(shared.length>0||recipes.length>0)&&records.length>0&&records.every(r=>r.meta&&styleMatchesKind(r.i.kind,r.meta.styles,ids,options.program)&&r.meta.colors_image.some(c=>palette.includes(c.toLowerCase()))),2,'Use compatible role-specific styles and an image-derived palette, or a shared style family.',records.filter(r=>r.meta&&!styleMatchesKind(r.i.kind,r.meta.styles,ids,options.program)).map(r=>r.i.id));
  if(recipes.length)check('style_signature',recipes.every(recipe=>{
   const active=recipe.signatures.filter(signature=>!program.essentials.some(role=>excluded.has(role.role)&&role.kinds.includes(signature.kind)));
   return active.every(signature=>records.filter(r=>r.i.kind===signature.kind&&styleFamilies(r.meta?.styles??[]).some(f=>styleFamilies(signature.catalog_styles).includes(f))).length>=signature.count)
    &&records.some(r=>styleFamilies(r.meta?.styles??[]).some(f=>styleFamilies(recipe.identity_styles).includes(f)));
  }),2,'Keep the non-excluded signature pieces and at least one item with the requested style identity; a neutral supporting set alone is insufficient.');
 }
 const total=checks.reduce((s,c)=>s+c.weight,0),earned=checks.reduce((s,c)=>s+(c.pass?c.weight:0),0);
 return {room_id:roomId,program:options.program,score:items.length&&total?Math.round(100*earned/total):0,pass:issues.length===0,issues,checks};
}
export function rankCompositions(candidates:{id:string;scene:Scene}[],roomId:string,options:TasteOptions){
 if(candidates.length<2)throw new Error('Style requests require at least two candidates');
 return candidates.map(c=>({id:c.id,...scoreComposition(c.scene,roomId,options)})).sort((a,b)=>Number(b.pass)-Number(a.pass)||b.score-a.score||a.id.localeCompare(b.id));
}
