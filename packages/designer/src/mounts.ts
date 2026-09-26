/** Items that hang instead of standing (editor contract 4bdeb95): curtains on the wall over a window,
 * hanging planters from the ceiling. The editor computes the exact mount (window centre, rod height,
 * ceiling drop); the designer proposes the plan position and checks the mount makes sense. */
import type {Item,Scene,Vec2,Wall} from './scene.js';
import type {LayoutError} from './local-checks.js';
import {wallOutward} from './adapter.js';
import {isOutdoorRoom} from './balcony.js';

type Piece={kind:string;name:string;size:[number,number,number];sku?:string};
export const isCurtain=(p:Pick<Piece,'kind'>)=>p.kind==='curtain';
/** Mirrors the editor's hangsFromCeiling: named hanging planters, never wall, deck or railing planters. */
export const isHangingPlanter=(p:Piece)=>['plant','decor'].includes(p.kind)&&(/\bhanging\b/i.test(p.name)||/(^|:)hanging-/i.test(p.sku??''))
 &&/\b(plant|planter|pot|basket)s?\b/i.test(p.name)&&!/\b(wall|deck|rail|railing|balcony|print|art)\b/i.test(p.name);
export const mountOf=(p:Piece):Item['mount']=>isCurtain(p)?'wall':isHangingPlanter(p)?'ceiling':undefined;

const segmentDistance=(p:Vec2,a:Vec2,b:Vec2)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
function windowsOf(scene:Scene,roomId:string){
 return scene.openings.filter(o=>o.kind==='window').flatMap(o=>{
  const wall=scene.walls.find(w=>w.id===o.wall_id);if(!wall||wall.open||wall.room_id!==roomId)return [];
  const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),t=(o.offset+o.width/2)/length;
  let inward:Vec2;try{const out=wallOutward(scene,wall);inward=[-out[0],-out[1]];}catch{return [];}
  return [{opening:o,wall,length,centre:[wall.a[0]+(wall.b[0]-wall.a[0])*t,wall.a[1]+(wall.b[1]-wall.a[1])*t] as Vec2,inward}];
 });
}
/** Front (local -y) faces into the room. */
const facing=(inward:Vec2)=>((Math.atan2(inward[0],-inward[1])*180/Math.PI)%360+360)%360;

/** Plan poses for a hanging piece: a curtain centred over each uncurtained window; a planter hung
 * just inside a window (not in an outdoor space, which has no ceiling). */
export function mountPoses(scene:Scene,roomId:string,p:Piece):{pos:Vec2;rot:number;mount:'wall'|'ceiling'}[]{
 const mount=mountOf(p),room=scene.rooms.find(r=>r.id===roomId);if(!mount||!room)return [];
 const windows=windowsOf(scene,roomId);
 if(mount==='wall')return windows.filter(w=>w.length>=p.size[0]&&!scene.items.some(i=>isCurtain(i)&&i.room_id===roomId&&Math.hypot(i.pos[0]-w.centre[0],i.pos[1]-w.centre[1])<=w.opening.width/2+(w.wall.thickness??0)+i.size[1]))
  .map(w=>{const gap=(w.wall.thickness??0)/2+p.size[1]/2;return {pos:[w.centre[0]+w.inward[0]*gap,w.centre[1]+w.inward[1]*gap] as Vec2,rot:facing(w.inward),mount};});
 if(isOutdoorRoom(room))return [];
 return windows.map(w=>{const gap=(w.wall.thickness??0)/2+.35+p.size[1]/2;return {pos:[w.centre[0]+w.inward[0]*gap,w.centre[1]+w.inward[1]*gap] as Vec2,rot:facing(w.inward),mount};});
}

/** A wall-hung item must sit against a wall of its room; a ceiling-hung one needs a room with a ceiling. */
export function mountErrors(scene:Scene):LayoutError[]{
 const errors:LayoutError[]=[];
 for(const item of scene.items.filter(i=>i.mount!==undefined)){
  const base={check:'support' as const,room_id:item.room_id,item_ids:[item.id],at:[...item.pos] as Vec2};
  if(item.mount==='ceiling'&&isOutdoorRoom(scene.rooms.find(r=>r.id===item.room_id)))errors.push({...base,deficit_m:1,message:`${item.id} cannot hang from the ceiling of an outdoor space`});
  if(item.mount==='wall'){
   const walls=scene.walls.filter((w:Wall)=>w.room_id===item.room_id&&!w.open),reach=(w:Wall)=>segmentDistance(item.pos,w.a,w.b)-((w.thickness??0)/2+Math.min(item.size[0],item.size[1])/2);
   const gap=walls.length?Math.min(...walls.map(reach)):Infinity;
   if(gap>.1)errors.push({...base,deficit_m:Number.isFinite(gap)?gap:1,message:`${item.id} must hang against a wall of its room`});
  }
 }
 return errors;
}
