/** Furniture resting on furniture (editor `restsOn`, designer `Item.on`).
 * A supported item stands on its support's top, so it occupies no floor: floor metrics skip it and
 * these checks own its fit. The accepted kinds are a subset of the editor's `canRestOnFurniture`. */
import type {Item,Scene,Vec2} from './scene.js';
import {itemPolygon,polygonsOverlap} from './metrics/space.js';
import type {LayoutError} from './local-checks.js';

const EPS=1e-6;
/** Fine catalog decor kinds (bridge editorKindOf -> editor decor); wall-hung kinds are excluded. */
const DECOR=new Set(['decor','vase','candle','sculpture','books','cushion','throw_blanket','basket','tray','bowl','lantern','picture_frame','toy','planter']);
const ELECTRONICS=new Set(['microwave','monitor','computer','laptop','speaker','printer','game_console','fan']);
/** Upward-facing furniture tops the designer places onto. Seats, beds, rugs and tall wardrobes are not offered. */
export const SURFACE_KINDS=new Set(['table','coffee_table','side_table','nightstand','desk','cabinet','dresser','shelf','tv_unit','kitchen_counter','kitchen_island']);

export type Size=[number,number,number];
/** Item size is [width, depth, height] in metres. */
export function canRestOn(kind:string,size:Size):boolean{
 if(DECOR.has(kind)||kind==='plant'||kind==='lamp')return true;
 if(kind==='tv')return size[0]<=2&&size[2]<=1.3&&size[1]<=.5;
 return ELECTRONICS.has(kind)&&size.every(s=>s<=1);
}
export const isSurface=(item:Pick<Item,'kind'|'on'>)=>SURFACE_KINDS.has(item.kind)&&item.on===undefined;
export const onFloor=(item:Pick<Item,'on'>)=>item.on===undefined;

function outsideDepth(points:Vec2[],support:Item):number{
 const t=support.rot*Math.PI/180;let depth=0;
 for(const [x,y] of points){
  const dx=x-support.pos[0],dy=y-support.pos[1],u=dx*Math.cos(t)+dy*Math.sin(t),v=-dx*Math.sin(t)+dy*Math.cos(t);
  depth=Math.max(depth,Math.abs(u)-support.size[0]/2,Math.abs(v)-support.size[1]/2);
 }
 return Math.max(0,depth);
}

/** Every supported item: a restable kind, on a surface kind in the same room, whole footprint on the top, no clash with neighbours on it. */
export function supportErrors(scene:Scene):LayoutError[]{
 const errors:LayoutError[]=[],supported=scene.items.filter(i=>i.on!==undefined);
 for(const item of supported){
  const support=scene.items.find(i=>i.id===item.on)!,base={room_id:item.room_id,item_ids:[item.id,support.id],at:[...item.pos] as Vec2};
  if(!canRestOn(item.kind,item.size)){errors.push({...base,check:'support',deficit_m:1,message:`${item.id} (${item.kind}) cannot rest on furniture; place it on the floor`});continue;}
  if(!isSurface(support)||support.room_id!==item.room_id){errors.push({...base,check:'support',deficit_m:1,message:`${support.id} (${support.kind}) is not a usable surface for ${item.id}`});continue;}
  const depth=outsideDepth(itemPolygon(item),support);
  if(depth>EPS)errors.push({...base,check:'support',deficit_m:depth,message:`${item.id} overhangs ${support.id} by ${depth.toFixed(3)} m; it must fit on the top`});
 }
 for(let i=0;i<supported.length;i++)for(let j=i+1;j<supported.length;j++){
  const a=supported[i]!,b=supported[j]!;
  if(a.on===b.on&&polygonsOverlap(itemPolygon(a),itemPolygon(b)))errors.push({check:'overlap',room_id:a.room_id,item_ids:[a.id,b.id],at:[(a.pos[0]+b.pos[0])/2,(a.pos[1]+b.pos[1])/2],deficit_m:0,message:`${a.id} overlaps ${b.id} on ${a.on}`});
 }
 return errors;
}

/** Candidate poses on a support top, most usable first; each keeps the whole footprint on the top and clear of items already there.
 * `away` prefers poses farther from a point, e.g. a bedside lamp toward the stand's outer edge. */
export function surfacePoses(scene:Scene,support:Item,size:Size,options:{away?:Vec2}={}):{pos:Vec2;rot:number}[]{
 const t=support.rot*Math.PI/180,world=(u:number,v:number):Vec2=>[support.pos[0]+u*Math.cos(t)-v*Math.sin(t),support.pos[1]+u*Math.sin(t)+v*Math.cos(t)];
 const poses:{pos:Vec2;rot:number;score:number}[]=[],siblings=scene.items.filter(i=>i.on===support.id);
 for(const turn of [0,90]){
  const w=turn?size[1]:size[0],d=turn?size[0]:size[1],su=(support.size[0]-w)/2,sv=(support.size[1]-d)/2;
  if(su<-EPS||sv<-EPS)continue;
  for(const u of [...new Set([0,-su,su].map(v=>Math.max(-su,Math.min(su,v))))])for(const v of [...new Set([0,sv].map(x=>Math.max(-sv,Math.min(sv,x))))]){
   const pos=world(u,v),rot=((support.rot+turn)%360+360)%360;
   const candidate:Item={id:'probe',room_id:support.room_id,kind:'decor',name:'',pos,rot,size,keep:false,on:support.id};
   if(outsideDepth(itemPolygon(candidate),support)>EPS||siblings.some(s=>polygonsOverlap(itemPolygon(s),itemPolygon(candidate))))continue;
   const away=options.away?Math.hypot(pos[0]-options.away[0],pos[1]-options.away[1]):0;
   poses.push({pos,rot,score:away-(turn?1e-3:0)-Math.abs(u)*1e-4});
  }
 }
 return poses.sort((a,b)=>b.score-a.score).map(({pos,rot})=>({pos,rot}));
}

/** Surfaces in a room that can hold an item of this size, largest free top first. */
export function surfacesFor(scene:Scene,roomId:string,kind:string,size:Size):Item[]{
 if(!canRestOn(kind,size))return [];
 return scene.items.filter(i=>i.room_id===roomId&&isSurface(i)&&surfacePoses(scene,i,size).length).sort((a,b)=>b.size[0]*b.size[1]-a.size[0]*a.size[1]);
}
