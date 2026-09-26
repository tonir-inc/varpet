import { createHash } from 'node:crypto';
import {isOutdoorRoom} from './balcony.js';
import {createHttpCatalogQuery, mapLimited, CATALOG_CONCURRENCY, type CatalogQuery} from './catalog.js';
import {catalogProduct} from '../../../apps/editor/src/adapters/database-catalog.js';
import { z } from 'zod';
import type { CatalogAsset } from '../../../apps/editor/src/contracts.js';
import { applyOps, parseOps, parseScene, wallOutward } from './adapter.js';
import { checkLocalLayout, compareLayoutErrors, localGeometryErrors, outsidePoint, sourceFloorPolygon } from './local-checks.js';
import { functionClearances, itemFunctionClearances, type FunctionClearance } from './metrics/function.js';
import { itemFront, itemPolygon, physicalDoorSwingPolygon, spaceMetrics, polygonsOverlap, isFloorRug, rasterizeRoom } from './metrics/space.js';
import { wallSolidPolygons } from './wall-geometry.js';
import { strategyMetrics } from './metrics/strategy.js';
import { sun } from './metrics/sun.js';
import { checkRequest, type Intent } from './request.js';
import { DesignerSession } from './session.js';
import { onFloor, type Item, type Op, type Scene, type Vec2 } from './scene.js';

export const FAST_VERSION = 'slots-v6';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sceneFingerprint = (scene: Scene, catalog: readonly CatalogAsset[] = []) => hash([FAST_VERSION, parseScene(scene), catalog]);
type ClassId = 'furnish.living'|'furnish.bedroom'|'furnish.kids'|'add.one'|'add.desk-window'|'move.face-window'|'move.group'|'rearrange.open-floor'|'appearance.walls'|'scope.structural'|'feasibility.area';
export interface Recipe { classId: ClassId; room?: 'living'|'bedroom'|'kids'|'bathroom'|'all'; double?:boolean; kind?: string; color?: string; wall?: string; budget?: number; count?:number; footprint?:[number,number] }

/** Whole-message rules: unsupported qualifications must go to the general agent. */
export function classifyRequest(request: string): Recipe | undefined {
  const text=request.trim().toLowerCase().replace(/[.!]+$/,'');
  const beds=text.match(/^fit (\d+) additional beds inside this [\d.]+ by [\d.]+ metre bedroom, all at the same floor level, with no overlapping footprints\. each additional bed is exactly ([\d.]+) by ([\d.]+) metres; i already own them, so their purchase cost is zero\. keep the existing bed completely untouched and every existing piece\. do not resize, stack, overlap or move beds outside the bedroom\. if impossible, decline and explain the floor-area contradiction with numbers$/);
  if(beds&&[beds[1],beds[2],beds[3]].every(v=>Number.isFinite(Number(v))&&Number(v)>0))return {classId:'feasibility.area',room:'bedroom',count:Number(beds[1]),footprint:[Number(beds[2]),Number(beds[3])]};
  if (/^(?:knock down|tear down|remove|demolish|destroy) (?:the |a )?(?:(?:kitchen|living room|bedroom|bathroom) )?wall(?: between (?:the )?(?:kitchen|living room|bedroom|bathroom) and (?:the )?(?:kitchen|living room|bedroom|bathroom|other room))?$/.test(text)) return {classId:'scope.structural'};
  if (/^furnish (?:the |my )?living room$/.test(text)) return {classId:'furnish.living',room:'living'};
  if (/^furnish (?:the |my )?bedroom(?:: a double bed, two nightstands and a wardrobe)?$/.test(text)) return {classId:'furnish.bedroom',room:'bedroom'};
  if (/^furnish the second bedroom as a kids' room under 300,000 ֏$/.test(text)) return {classId:'furnish.kids',room:'kids',budget:300000};
  if (/^add a desk by the window(?: for working from home)?$/.test(text)) return {classId:'add.desk-window',kind:'desk'};
  const double=text.match(/^(?:put|place|add|fit) (?:a |one )?double bed (?:in|into|to) (?:the |my )?(bathroom|bedroom|living room)$/);
  if(double)return {classId:'add.one',kind:'bed',double:true,room:double[1]==='living room'?'living':double[1] as 'bathroom'|'bedroom'};
  const allPaint=text.match(/^paint (?:the (?:apartment|flat)(?: walls)?|all(?: the)? walls) (red|blue|green|white|warm white|#[0-9a-f]{6})$/);
  if(allPaint)return {classId:'appearance.walls',room:'all',color:({'red':'#ff0000','blue':'#0000ff','green':'#008000','white':'#ffffff','warm white':'#f5efe4'} as Record<string,string>)[allPaint[1]!]??allPaint[1]};
  const add=text.match(/^add (?:a|one) (sofa|chair|bed|table|cabinet|lamp|plant|rug|shelf) to (?:the |my )?(living room|bedroom)$/);
  if(add) return {classId:'add.one',kind:add[1],room:add[2]==='living room'?'living':'bedroom'};
  if (/^move the sofa so it faces the window$/.test(text)) return {classId:'move.face-window',kind:'sofa'};
  if (text==='make the living room feel bigger') return {classId:'rearrange.open-floor',room:'living'};
  if (text==='move the grouped lounge chair and living rug together to a different valid location in the living room. preserve their relative arrangement and all other furniture poses. keep every item, buy nothing, and propose the checked group move') return {classId:'move.group',room:'living'};
  if (text==='paint the bedroom walls warm white') return {classId:'appearance.walls',room:'bedroom',color:'#f5efe4'};
  const paint=text.match(/^make the living room (north|south|east|west) wall (?:blue|green|red|white|#[0-9a-f]{6}), exactly (#[0-9a-f]{6})(?:\. keep all furniture, geometry and other colours unchanged\. propose the colour edit; do not claim that paint or labour has been priced)?$/);
  if(paint) return {classId:'appearance.walls',room:'living',wall:paint[1],color:paint[2]};
  return undefined;
}

export function catalogKind(asset: CatalogAsset): string {
  if (['cabinet','table'].includes(asset.kind) && /night\s*stand|bedside/i.test(asset.name)) return 'nightstand';
  if (asset.kind==='cabinet' && /wardrobe|armoire/i.test(asset.name)) return 'wardrobe';
  if (asset.kind==='table' && /\bdesk\b|workstation/i.test(asset.name)) return 'desk';
  if (asset.kind==='table' && /coffee|cocktail/i.test(asset.name)) return 'coffee_table';
  return asset.kind;
}
function matchesKind(kind:string,semantic:string,broad:string):boolean {
  return semantic===kind||(kind==='table'&&semantic==='coffee_table')||(kind==='cabinet'&&broad==='cabinet');
}
function roomId(scene:Scene,recipe:Recipe):string|undefined {
  const bedrooms=scene.rooms.filter(r=>/bedroom|bed room|ննջ|спаль/i.test(r.name??''));
  if(recipe.room==='bathroom'){const baths=scene.rooms.filter(r=>/bathroom|bath room|լոգ|ванн/i.test(r.name??''));return baths.length===1?baths[0]!.id:undefined;}
  if(recipe.room==='kids') return bedrooms[1]?.id;
  if(recipe.room==='bedroom') return bedrooms.length===1?bedrooms[0]!.id:undefined;
  if(recipe.room==='living') {const living=scene.rooms.filter(r=>!isOutdoorRoom(r)&&/living|հյուր|гостин/i.test(r.name??''));return living.length===1?living[0]!.id:undefined;}
  if(recipe.kind==='sofa') { const rooms=[...new Set(scene.items.filter(i=>i.kind==='sofa').map(i=>i.room_id))]; return rooms.length===1?rooms[0]:undefined; }
  // An unqualified desk belongs to the only living room with a window; otherwise ask the general agent.
  const windowed=scene.rooms.filter(r=>windows(scene,r.id).length>0);
  if(windowed.length===1) return windowed[0]!.id;
  return scene.rooms.length===1?scene.rooms[0]!.id:undefined;
}
const SEATS=['chair','desk_chair','dining_chair','office_chair'];
const bounds=(polygon:Vec2[])=>({minX:Math.min(...polygon.map(p=>p[0])),maxX:Math.max(...polygon.map(p=>p[0])),minY:Math.min(...polygon.map(p=>p[1])),maxY:Math.max(...polygon.map(p=>p[1]))});
const typedScene=(scene:Scene,catalog:readonly CatalogAsset[]):Scene=>({...scene,items:scene.items.map(i=>{const asset=catalog.find(a=>a.id===i.sku);return asset?{...i,kind:catalogKind(asset)}:i;})});
const deficitKey=(c:FunctionClearance)=>`f:${c.item_id}:${c.function}:${c.side}:${c.other_item_id??''}`;
function deficitMap(scene:Scene,catalog:readonly CatalogAsset[]) {
  const result=new Map<string,number>();
  for(const c of functionClearances(typedScene(scene,catalog))) result.set(deficitKey(c),Math.max(c.deficit_m,c.excess_m??0));
  for(const r of spaceMetrics(scene).rooms) for(const p of r.walkways) result.set(`w:${r.room_id}:${[p.from,p.to].sort().join(':')}`,p.reachable?Math.max(0,.75-p.width_m):.75);
  return result;
}
function deficitsPreserved(before:Map<string,number>,after:Scene,catalog:readonly CatalogAsset[]):boolean {
  for(const [key,value] of deficitMap(after,catalog)) if(value>(before.get(key)??0)+1e-6)return false;
  return true;
}
/** The placed item's own part of deficitsPreserved, cheap enough to run on every candidate pose. */
function ownFunctionWorsens(after:Scene,itemId:string,before:Map<string,number>,catalog:readonly CatalogAsset[]):boolean {
  const typed=typedScene(after,catalog),item=typed.items.find(i=>i.id===itemId);
  return !!item&&itemFunctionClearances(typed,item).some(c=>Math.max(c.deficit_m,c.excess_m??0)>(before.get(deficitKey(c))??0)+1e-6);
}
function windows(scene:Scene,room:string) {
  return scene.openings.filter(o=>o.kind==='window').flatMap(o=>{
    const w=scene.walls.find(w=>w.id===o.wall_id&&w.room_id===room);if(!w)return [];
    const length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
    const at=(offset:number):Vec2=>[w.a[0]+(w.b[0]-w.a[0])*offset/length,w.a[1]+(w.b[1]-w.a[1])*offset/length];
    return [{id:o.id,wall_id:w.id,sill:o.sill,a:at(o.offset),b:at(o.offset+o.width)}];
  });
}
function windowBlocked(scene:Scene,item:Item):boolean {
  return windows(scene,item.room_id).some(w=>{
    if(item.size[2]<=w.sill)return false;
    const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],length=Math.hypot(dx,dy),poly=itemPolygon(item);
    const projected=poly.map(p=>((p[0]-w.a[0])*dx+(p[1]-w.a[1])*dy)/length);
    const depth=Math.min(...poly.map(p=>Math.abs((p[0]-w.a[0])*dy-(p[1]-w.a[1])*dx)/length));
    return depth<.3&&Math.max(...projected)>0&&Math.min(...projected)<length;
  });
}
/** Coarse geometry ranks only; acceptance always uses the existing 5 cm path checker. */
function coarseOpenFloor(scene:Scene,room:Scene['rooms'][number]):number {
  const grid=rasterizeRoom(scene,room,.25),heights=new Int32Array(grid.width);let best=0;
  for(let row=0;row<grid.height;row++){
    for(let x=0;x<grid.width;x++)heights[x]=grid.occupied[row*grid.width+x]?0:heights[x]!+1;
    const stack:{x:number;height:number}[]=[];
    for(let x=0;x<=grid.width;x++){
      const height=x===grid.width?0:heights[x]!;let start=x;
      while(stack.length&&stack[stack.length-1]!.height>height){const prior=stack.pop()!;best=Math.max(best,prior.height*(x-prior.x));start=prior.x;}
      if(height>0&&(!stack.length||stack[stack.length-1]!.height<height))stack.push({x:start,height});
    }
  }
  return best*.25**2;
}
export interface Candidate { id:string; catalog_ids:string[]; ops:Op[]; intent?:Intent; score:number; scores:{daylight:number;zoning:number;facing:number;open_floor:number}; description:string }
export interface SlotQuery {roomId:string;catalogId?:string;itemId?:string;nearWindow?:boolean;faceWindow?:boolean;openFloor?:boolean;maxChecks?:number;solidHeadboard?:boolean;diverse?:boolean;sideReserve?:number;/** Stop after this many checked slots (default 6). */limit?:number}
export function supportedHeadboard(scene:Scene,item:Item){
 const t=item.rot*Math.PI/180,back:Vec2=[item.pos[0]-Math.sin(t)*item.size[1]/2,item.pos[1]+Math.cos(t)*item.size[1]/2];
 return scene.walls.some(w=>{
  if(w.room_id!==item.room_id||w.open)return false;
  const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy),out=wallOutward(scene,w),along=((back[0]-w.a[0])*dx+(back[1]-w.a[1])*dy)/len;
  return Math.abs((back[0]-w.a[0])*out[0]+(back[1]-w.a[1])*out[1]+(w.thickness??0)/2)<.13
   && Math.abs(-Math.sin(t)*out[0]+Math.cos(t)*out[1]-1)<.05
   && along>=item.size[0]/2&&along<=len-item.size[0]/2
   && !scene.openings.some(o=>o.wall_id===w.id&&o.offset<along+item.size[0]/2&&o.offset+o.width>along-item.size[0]/2);
 });
}
export interface SceneAnalysis {fingerprint:string;rooms:{id:string;bounds:ReturnType<typeof bounds>;wall_spans:{wall_id:string;from:number;to:number}[];windows:ReturnType<typeof windows>}[];door_swings:{id:string;polygon:Vec2[]|null}[];walkways:ReturnType<typeof spaceMetrics>;daylight:ReturnType<typeof sun>}

/** Bounded immutable snapshots. Geometry and slot caches invalidate on ANY scene/catalog edit. */
export class SceneAnalysisCache {
  private analyses=new Map<string,SceneAnalysis>();
  private candidates=new Map<string,Candidate[]>();
  readonly stats={hits:0,misses:0};
  analyze(input:Scene,catalog:readonly CatalogAsset[]=[]):SceneAnalysis {
    const scene=parseScene(input),fingerprint=sceneFingerprint(scene,catalog),cached=this.analyses.get(fingerprint);
    if(cached){this.stats.hits++;return structuredClone(cached);}this.stats.misses++;
    const value:SceneAnalysis={fingerprint,rooms:scene.rooms.map(r=>({id:r.id,bounds:bounds(r.polygon),windows:windows(scene,r.id),wall_spans:scene.walls.filter(w=>w.room_id===r.id&&!w.open).flatMap(w=>{
      let cursor=0;const spans:{wall_id:string;from:number;to:number}[]=[],length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
      for(const o of scene.openings.filter(o=>o.wall_id===w.id).sort((a,b)=>a.offset-b.offset)){if(o.offset>cursor)spans.push({wall_id:w.id,from:cursor,to:o.offset});cursor=Math.max(cursor,o.offset+o.width);}
      if(cursor<length)spans.push({wall_id:w.id,from:cursor,to:length});return spans;
    })})),door_swings:scene.openings.filter(o=>o.kind==='door').map(o=>({id:o.id,polygon:physicalDoorSwingPolygon(scene,o)})),walkways:spaceMetrics(scene),daylight:sun(scene)};
    if(this.analyses.size>=8)this.analyses.delete(this.analyses.keys().next().value!);
    this.analyses.set(fingerprint,structuredClone(value));return value;
  }
  slots(input:Scene,catalog:readonly CatalogAsset[],query:SlotQuery):Candidate[] {
    const scene=parseScene(input),key=hash([sceneFingerprint(scene,catalog),query]),cached=this.candidates.get(key);
    if(cached)return structuredClone(cached);
    const candidates=generateSlots(scene,catalog,query);
    if(this.candidates.size>=64)this.candidates.delete(this.candidates.keys().next().value!);
    this.candidates.set(key,structuredClone(candidates));return candidates;
  }
}

function generateSlots(scene:Scene,catalog:readonly CatalogAsset[],query:SlotQuery):Candidate[] {
  const room=scene.rooms.find(r=>r.id===query.roomId);if(!room)return [];
  const asset=catalog.find(a=>a.id===query.catalogId),owned=scene.items.find(i=>i.id===query.itemId);
  if((!owned&&!asset)||(owned&&(owned.keep||scene.items.some(i=>i.group_id&&i.group_id===owned.group_id&&i.keep))))return [];
  const serial=scene.items.length;
  let newId=`fast-${hash([room.id,asset?.id,serial]).slice(0,12)}`;
  while([...scene.items,...scene.fixed,...scene.rooms,...scene.walls,...scene.openings].some(i=>i.id===newId))newId+='x';
  const base:Item=owned??{id:newId,room_id:room.id,kind:asset!.kind,name:asset!.name,pos:[0,0],rot:0,size:[asset!.dimensions[0],asset!.dimensions[2],asset!.dimensions[1]],keep:false,sku:asset!.id,price:asset!.price};
  const box=bounds(room.polygon),center:Vec2=[(box.minX+box.maxX)/2,(box.minY+box.maxY)/2],spans=windows(scene,room.id);
  const poses:Item[]=[],seen=new Set<string>();
  const add=(pos:Vec2,rot:number)=>{
    if(poses.length>=1000)return;
    rot=((rot%360)+360)%360;pos=pos.map(v=>Math.round(v*1e8)/1e8) as Vec2;
    const key=JSON.stringify([pos,rot]);if(seen.has(key))return;seen.add(key);
    if(owned&&Math.hypot(pos[0]-owned.pos[0],pos[1]-owned.pos[1])<.01&&Math.abs((((rot-owned.rot+180)%360+360)%360)-180)<.01)return;
    poses.push({...base,pos,rot});
  };
  const rotations=(pos:Vec2,defaultRot:number)=>{
    if(query.faceWindow) for(const w of spans){const dx=(w.a[0]+w.b[0])/2-pos[0],dy=(w.a[1]+w.b[1])/2-pos[1];add(pos,Math.atan2(dx,-dy)*180/Math.PI);}
    else add(pos,defaultRot);
  };
  if(owned) for(const dx of [-.5,-.25,-.1,0,.1,.25,.5])for(const dy of [-.5,-.25,-.1,0,.1,.25,.5])rotations([owned.pos[0]+dx,owned.pos[1]+dy],owned.rot);
  for(const wall of scene.walls.filter(w=>w.room_id===room.id&&!w.open)){
    const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],length=Math.hypot(dx,dy),out=wallOutward(scene,wall),rot=Math.atan2(-out[0],out[1])*180/Math.PI;
    for(const inset of query.diverse?[0,.025,.65,1]:[0,.65,1])for(let offset=base.size[0]/2+(wall.thickness??0)/2;offset<=length-base.size[0]/2-(wall.thickness??0)/2+1e-7;offset+=.25){
      const depth=base.size[1]/2+(wall.thickness??0)/2+inset;
      rotations([wall.a[0]+dx*offset/length-out[0]*depth,wall.a[1]+dy*offset/length-out[1]*depth],rot);
    }
  }
  for(let x=box.minX+.5;x<box.maxX&&poses.length<1000;x+=.5)for(let y=box.minY+.5;y<box.maxY&&poses.length<1000;y+=.5)for(const rot of [0,90,180,270])rotations([x,y],rot);
  const previous=localGeometryErrors(scene),baseline=checkLocalLayout(scene),deficits=deficitMap(scene,catalog);
  const beforeFloor=baseline.metrics.rooms.find(r=>r.room_id===room.id)?.largest_free_rectangle?.area_m2??0;
  const obstacles=[...scene.items,...scene.fixed].filter(i=>i.id!==base.id&&!(base.group_id&&i.group_id===base.group_id)&&!isFloorRug(i)&&onFloor(i)).map(i=>({room:i.room_id,polygon:itemPolygon(i)}));
  const swings=scene.openings.map(o=>physicalDoorSwingPolygon(scene,o)).filter((p):p is Vec2[]=>p!==null);
  const solids=new Map<number,Vec2[][]>();
  const cheap:{item:Item;op:Op;after:Scene;score:number}[]=[];
  const seatAnchors=typedScene(scene,catalog).items.filter(i=>i.room_id===room.id&&i.id!==base.id&&onFloor(i)&&['sofa','table','coffee_table','desk','dining_table'].includes(i.kind));
  for(const item of poses){
    if(query.solidHeadboard&&!supportedHeadboard(scene,item))continue;
    const op:Op=owned?{type:'move',id:owned.id,pos:item.pos,rot:item.rot}:{type:'add',item};
    let after:Scene;try{after=applyOps(scene,[op]);}catch{continue;}
    const moved=after.items.filter(i=>i.id===item.id||(owned?.group_id&&i.group_id===owned.group_id));
    if(moved.some(i=>{
      const polygon=itemPolygon(i),ownRoom=scene.rooms.find(r=>r.id===i.room_id)!;
      if(!solids.has(i.size[2]))solids.set(i.size[2],wallSolidPolygons(scene,i.size[2]).map(s=>s.polygon));
      return outsidePoint(polygon,ownRoom.polygon)||outsidePoint(polygon,sourceFloorPolygon(scene,ownRoom))||solids.get(i.size[2])!.some(p=>polygonsOverlap(polygon,p))||(!isFloorRug(i)&&(obstacles.some(o=>o.room===i.room_id&&polygonsOverlap(polygon,o.polygon))||swings.some(p=>polygonsOverlap(polygon,p))));
    }))continue;
    if(moved.some(i=>windowBlocked(after,i)))continue;
    if(query.sideReserve!==undefined&&functionClearances(after).some(c=>c.item_id===item.id&&c.function==='bed_side'&&c.clearance_m<query.sideReserve!-1e-6))continue;
    if(query.nearWindow&&!checkRequest(after,after,[],{preferences:[{type:'near_window',item_id:item.id,max_distance_m:1.5}]},0).ok)continue;
    // deficitsPreserved rejects any pose whose own function clearance worsens (a chair backed against a wall has
    // no pull-out room). Rejecting those here keeps the bounded full checks for poses that can pass.
    if(ownFunctionWorsens(after,item.id,deficits,catalog))continue;
    const edge=Math.min(item.pos[0]-box.minX,box.maxX-item.pos[0],item.pos[1]-box.minY,box.maxY-item.pos[1]);
    const distance=spans.length?Math.min(...spans.map(w=>Math.hypot(item.pos[0]-(w.a[0]+w.b[0])/2,item.pos[1]-(w.a[1]+w.b[1])/2))):10;
    const travel=owned?Math.hypot(item.pos[0]-owned.pos[0],item.pos[1]-owned.pos[1]):0;
    const semantic=asset?catalogKind(asset):base.kind;
    let purchaseRank=-edge;
    // A bed needs both sides accessible. Corner-first ranking can exhaust the
    // bounded checks without ever trying the middle of a perfectly usable wall.
    if(query.solidHeadboard)purchaseRank=-Math.hypot(item.pos[0]-center[0],item.pos[1]-center[1]);
    if(semantic==='table'){
      const footprint=bounds(itemPolygon(item));
      const clearance=Math.min(footprint.minX-box.minX,box.maxX-footprint.maxX,footprint.minY-box.minY,box.maxY-footprint.maxY);
      purchaseRank=-Math.abs(clearance-1); // Rank usable table access before the bounded full checks.
    }
    if(semantic==='coffee_table'){
      const sofas=scene.items.filter(i=>i.room_id===room.id&&i.kind==='sofa');
      if(sofas.length){
        purchaseRank=-Math.min(...sofas.map(sofa=>{
          const theta=sofa.rot*Math.PI/180,reach=(sofa.size[1]+item.size[1])/2+.41;
          return Math.hypot(item.pos[0]-(sofa.pos[0]+Math.sin(theta)*reach),item.pos[1]-(sofa.pos[1]-Math.cos(theta)*reach));
        }));
      }
    }
    // A chair needs an open approach to its seat (the walkway check wants 0.75 m in front) and reads as part of
    // the room when it faces the sofa or table it serves. Edge-first ranking spent the whole budget on chairs
    // tucked sideways along walls, whose approach is narrower than that.
    if(SEATS.includes(semantic)){
      const front=itemFront(item),t=item.rot*Math.PI/180,ahead:Vec2=[Math.sin(t),-Math.cos(t)],side:Vec2=[Math.cos(t),Math.sin(t)];
      const approach:Vec2[]=([[-1,0],[1,0],[1,1],[-1,1]] as Vec2[]).map(([u,v])=>[front[0]+side[0]*u*.375+ahead[0]*v*.45,front[1]+side[1]*u*.375+ahead[1]*v*.45]);
      if(!solids.has(item.size[2]))solids.set(item.size[2],wallSolidPolygons(scene,item.size[2]).map(s=>s.polygon));
      const open=!outsidePoint(approach,room.polygon)&&!solids.get(item.size[2])!.some(p=>polygonsOverlap(approach,p))&&!obstacles.some(o=>o.room===room.id&&polygonsOverlap(approach,o.polygon))&&!swings.some(p=>polygonsOverlap(approach,p));
      const served=seatAnchors.map(anchor=>{
        const dx=anchor.pos[0]-item.pos[0],dy=anchor.pos[1]-item.pos[1],d=Math.hypot(dx,dy)||1;
        return (ahead[0]*dx+ahead[1]*dy)/d-.3*Math.max(0,d-2.5);
      });
      purchaseRank=(open?10:0)+(served.length?Math.max(...served):-edge);
    }
    cheap.push({item,op,after,score:owned&&!query.openFloor?-travel:purchaseRank-(query.nearWindow?distance:0)});
  }
  cheap.sort((a,b)=>b.score-a.score||JSON.stringify(a.op).localeCompare(JSON.stringify(b.op)));
  if(query.openFloor){
    const before=coarseOpenFloor(scene,room);
    for(const c of cheap)c.score=coarseOpenFloor(c.after,room)-before;
    cheap.sort((a,b)=>b.score-a.score||JSON.stringify(a.op).localeCompare(JSON.stringify(b.op)));
  }
  // Room programs need alternatives on different walls/positions, not six adjacent slots.
  if(query.diverse){
    const pool=cheap.splice(0),ranked:typeof cheap=[];
    while(pool.length&&ranked.length<(query.maxChecks??24)){
      let index=0;
      if(ranked.length){let best=-Infinity;for(let i=0;i<pool.length;i++){
        const c=pool[i]!,distance=Math.min(...ranked.map(p=>Math.hypot(c.item.pos[0]-p.item.pos[0],c.item.pos[1]-p.item.pos[1])+Math.abs(Math.sin((c.item.rot-p.item.rot)*Math.PI/360))));
        const merit=distance+.1*c.score;if(merit>best){best=merit;index=i;}
      }}
      ranked.push(pool.splice(index,1)[0]!);
    }
    cheap.push(...ranked);
  }
  const output:Candidate[]=[];
  for(const {item,op,after} of cheap.slice(0,query.maxChecks??24)){
    if(compareLayoutErrors(previous,localGeometryErrors(after)).errors.length)continue;
    const current=checkLocalLayout(after);
    if(compareLayoutErrors(baseline.errors,current.errors).errors.length||!deficitsPreserved(deficits,after,catalog))continue;
    const open_floor=(current.metrics.rooms.find(r=>r.room_id===room.id)?.largest_free_rectangle?.area_m2??0)-beforeFloor;
    if(query.openFloor&&open_floor<.1-1e-6)continue;
    const strategy=strategyMetrics(after),zoning=Math.hypot(item.pos[0]-center[0],item.pos[1]-center[1]);
    const daylight=query.nearWindow?1/(1+Math.min(...spans.map(w=>Math.hypot(item.pos[0]-(w.a[0]+w.b[0])/2,item.pos[1]-(w.a[1]+w.b[1])/2)))):strategy.daylight_for_work.score;
    const facing=query.faceWindow?1:strategy.social_living.score,score=(query.openFloor?10:1)*open_floor+daylight+facing+.1*zoning;
    output.push({id:`slot-${hash([op]).slice(0,16)}`,catalog_ids:asset?[asset.id]:[],ops:[op],scores:{daylight,zoning,facing,open_floor},score,description:`${owned?'Move':'Add'} ${base.name}; largest open rectangle ${open_floor>=0?'+':''}${open_floor.toFixed(2)} m²; no worsened access deficits.`});
    if(output.length>=(query.limit??6))break;
  }
  return output.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,24);
}

export type PreparedFastRequest = {type:'fallback';reason:string;classId?:ClassId}
  | {type:'decline';classId:ClassId;reason:string;alternative:string;proof:string}
  | {type:'candidates';classId:ClassId;fingerprint:string;scene_fingerprint:string;intent:Intent;candidates:Candidate[];recipe:string;budget_ms:number;catalog:CatalogAsset[]};
const defaultCache=new SceneAnalysisCache();
export function prepareFastRequest(input:Scene,request:string,catalog:readonly CatalogAsset[]=[],cache=defaultCache,limits:{maxChecks?:number;variant?:number;catalogComplete?:boolean}={}):PreparedFastRequest {
  const recipe=classifyRequest(request);if(!recipe)return {type:'fallback',reason:'Unclassified or qualified request'};
  const {classId}=recipe,scene=parseScene(input);
  const fallback=(reason:string):PreparedFastRequest=>({type:'fallback',classId,reason});
  const decline=(reason:string,alternative:string,proof:string):PreparedFastRequest=>({type:'decline',classId,reason,alternative,proof});
  if(classId==='scope.structural')return decline('I cannot demolish structural walls.','I can rearrange the furniture; consult a structural engineer about changing walls.','Designer scope excludes structural operations');
  const room=recipe.room==='all'?'':roomId(scene,recipe)??'';
  if(!room&&recipe.room!=='all'){
    if(limits.catalogComplete!==false&&classId.startsWith('add.')&&recipe.kind&&!catalog.some(a=>matchesKind(recipe.kind!,catalogKind(a),a.kind)))
      return decline(`No ${recipe.kind} with a usable catalog identity is available.`,`Load a catalog containing a ${recipe.kind}, or choose another available furniture kind.`,'Empty supplied catalog subtype set across all rooms; not a claim of physical impossibility');
    return fallback('Room is ambiguous or missing');
  }
  if(recipe.double&&room){
    const polygon=scene.rooms.find(r=>r.id===room)!.polygon,box=bounds(polygon);
    const rectangle=polygon.length===4&&polygon.every(p=>(p[0]===box.minX||p[0]===box.maxX)&&(p[1]===box.minY||p[1]===box.maxY));
    const width=Math.min(box.maxX-box.minX,box.maxY-box.minY);
    // Even ignoring walls/fixtures, a double bed (>=1.35 x 1.8) plus the existing
    // 0.60 m side-access gates has a minimum projected width of 1.8 m at ANY yaw.
    if(rectangle&&width<1.8-1e-7)return decline(`A double bed cannot fit with usable side access: this room is only ${Number(width.toFixed(2))} m wide. A double bed of at least 1.35 × 1.8 m plus 0.60 m access on each side needs at least 1.8 m in its narrowest orientation, before walls and fixtures.`, 'Try the bedroom instead, or choose a smaller single piece.', 'Rectangular room width is smaller than every rotation of the minimum bed-and-access rectangle');
  }
  if(recipe.double&&!catalog.length)return fallback('Room width does not prove infeasibility; a verified double-bed catalog is needed');
  if(classId==='feasibility.area'){
    const polygon=scene.rooms.find(r=>r.id===room)!.polygon;
    const area=Math.abs(polygon.reduce((n,p,i)=>{const q=polygon[(i+1)%polygon.length]!;return n+p[0]*q[1]-q[0]*p[1];},0))/2;
    const required=recipe.count!*recipe.footprint![0]*recipe.footprint![1];
    if(Number.isFinite(required)&&required>area+1e-7)return decline(`I cannot fit these beds without overlap: their footprints require ${Number(required.toFixed(3))} m², but the entire bedroom has only ${Number(area.toFixed(3))} m², before existing furniture and access.`,`Use fewer or smaller beds, or a larger room; at most ${Math.floor(area/(recipe.footprint![0]*recipe.footprint![1]))} could fit by area alone, which does not prove a legal layout.`,'Sum of non-overlapping footprint areas exceeds measured polygon area');
    return fallback('Area bound does not prove infeasibility');
  }
  const finish=(candidates:Candidate[],intent:Intent):PreparedFastRequest=>candidates.length?{type:'candidates',classId,fingerprint:sceneFingerprint(scene,catalog),scene_fingerprint:sceneFingerprint(scene),intent,candidates:candidates.slice(0,12),recipe:`${classId}: choose one checked complete layout by slot_id; repeat its catalog_ids exactly. No coordinates, operations, or extra fields.`,budget_ms:15000,catalog:structuredClone([...catalog])}:fallback('Bounded candidate search found no complete checked layout; impossibility is not proven');
  if(classId==='appearance.walls'){
    let walls=scene.walls.filter(w=>(recipe.room==='all'||w.room_id===room)&&!w.open);
    if(recipe.wall){
      // Named editor compass walls are stable IDs, not an inferred north direction.
      walls=walls.filter(w=>(w.source_id??w.id)===`wall-${recipe.wall}`||w.id===recipe.wall);
      if(!walls.length)return fallback('Named wall is ambiguous');
    }
    if(!walls.length)return fallback('No paintable walls');
    const colors=walls.map(w=>({target:'wall' as const,id:w.id,color:recipe.color!})),ops:Op[]=colors.map(c=>({type:'color',...c}));
    return finish([{id:`slot-${hash(ops).slice(0,16)}`,catalog_ids:[],ops,score:0,scores:{daylight:0,zoning:0,facing:0,open_floor:0},description:'Apply the requested wall colour. Furniture and geometry stay in place; paint and labour are unquoted.'}],{room_id:room||undefined,add:[],remove:[],colors});
  }
  if((classId==='add.desk-window'||classId==='move.face-window')&&!windows(scene,room).length)return decline('This room has no window, so a window-facing or window-side placement is impossible.','Place the desk with task lighting, or choose a room with a window.','No window span in selected room');
  if(limits.maxChecks===0)return fallback('Candidate check budget exhausted');
  if(classId.startsWith('move.')||classId==='rearrange.open-floor'){
    let targets=scene.items.filter(i=>i.room_id===room&&!i.keep);
    if(classId==='move.face-window')targets=targets.filter(i=>i.kind==='sofa');
    if(classId==='move.group')targets=targets.filter(i=>{
      if(!i.group_id||i.kind!=='chair'||!/lounge chair/i.test(i.name))return false;
      const members=[...scene.items,...scene.fixed].filter(m=>m.group_id===i.group_id);
      return members.length===2&&members.some(m=>m.kind==='rug'&&/living rug/i.test(m.name));
    });
    if(!targets.length){
      if(classId==='rearrange.open-floor')return decline('There is no movable furniture in the living room, so there is nothing to rearrange to gain floor space.', 'I can furnish the living room with a sofa and table instead.', 'No movable furniture in the selected room');
      return fallback('No unambiguous movable target');
    }
    if(classId!=='rearrange.open-floor'&&targets.length!==1)return fallback('Multiple targets require clarification');
    cache.analyze(scene,catalog);
    if(classId==='rearrange.open-floor'){
      const polygon=scene.rooms.find(r=>r.id===room)!;
      const gains=new Map(targets.map(i=>{
        const members=scene.items.filter(m=>m.id===i.id||(i.group_id&&m.group_id===i.group_id));
        try{return [i.id,coarseOpenFloor(applyOps(scene,members.map(m=>({type:'remove' as const,id:m.id}))),polygon)] as const;}
        catch{return [i.id,-Infinity] as const;}
      }));
      targets.sort((a,b)=>gains.get(b.id)!-gains.get(a.id)!||a.id.localeCompare(b.id));
    }
    const candidates:Candidate[]=[];
    for(const i of targets){
      candidates.push(...cache.slots(scene,catalog,{roomId:room,itemId:i.id,solidHeadboard:i.kind==='bed',faceWindow:classId==='move.face-window',openFloor:classId==='rearrange.open-floor',maxChecks:classId==='rearrange.open-floor'?6:24,...limits}));
      if(candidates.length>=1)break;
    }
    const kinds=[...new Set(targets.map(i=>i.kind))];
    // Scope all unmoved furniture through immutable ops; groups expand atomically in applyOps.
    return finish(candidates.sort((a,b)=>b.score-a.score),{room_id:room,add:[],remove:[],budget_dram:0,move:[{kinds,count:1}]});
  }
  let needed=classId==='furnish.living'?['sofa','table']:classId==='furnish.bedroom'?['bed','wardrobe','nightstand','nightstand']:classId==='furnish.kids'?['bed','desk','cabinet']:[recipe.kind!];
  if(classId.startsWith('furnish.')){
    const owned=scene.items.filter(i=>i.room_id===room),used=new Set<string>();
    needed=needed.filter(kind=>{
      const existing=owned.find(i=>{
        const asset=catalog.find(a=>a.id===i.sku),semantic=asset?catalogKind(asset):i.kind;
        return !used.has(i.id)&&matchesKind(kind,semantic,i.kind)&&(kind!=='bed'||classId!=='furnish.bedroom'||i.size[0]>=1.35&&i.size[1]>=1.8);
      });
      if(existing){used.add(existing.id);return false;}return true;
    });
    if(!needed.length){
      if(classId==='furnish.living'){
        const edit=prepareFastRequest(scene,'Make the living room feel bigger.',catalog,cache,limits);
        return {...edit,classId,...edit.type==='candidates'?{recipe:'furnish.living: the room already owns the required pieces. Choose a checked rearrangement by ID; buy nothing.'}:{}};
      }
      return fallback('The room already has all requested pieces; no nonempty furnishing edit is specified');
    }
  }
  const assets=(kind:string)=>catalog.filter(a=>matchesKind(kind,catalogKind(a),a.kind)&&(!(classId==='furnish.bedroom'||recipe.double)||kind!=='bed'||a.dimensions[0]>=1.35&&a.dimensions[2]>=1.8)).sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));
  const polygon=scene.rooms.find(r=>r.id===room)!.polygon,box=bounds(polygon),roomArea=Math.abs(polygon.reduce((s,a,i)=>{const b=polygon[(i+1)%polygon.length]!;return s+a[0]*b[1]-b[0]*a[1];},0))/2;
  for(const kind of needed){const choices=assets(kind);
    if(!choices.length&&limits.catalogComplete===false)return fallback(`Bounded catalog search has not found a usable ${kind}; absence from the catalog is not proven`);
    if(!choices.length)return decline(`No ${kind} with a usable catalog identity is available.`,`Choose another available furniture kind or load a catalog containing a ${kind}.`,'Empty supplied catalog subtype set; not a claim of physical impossibility');
    if(choices.every(a=>a.dimensions[0]*a.dimensions[2]>roomArea+1e-7)&&limits.catalogComplete===false)return fallback('Bounded catalog search has not found a small enough piece; impossibility is not proven');
    if(choices.every(a=>a.dimensions[0]*a.dimensions[2]>roomArea+1e-7))return decline(`The available ${kind} footprint is larger than this room's ${roomArea.toFixed(2)} m² area.`,`Choose a smaller ${kind}, within the room's ${(box.maxX-box.minX).toFixed(2)} × ${(box.maxY-box.minY).toFixed(2)} m bounds.`,'Every available footprint area exceeds total room area');
  }
  if(recipe.budget!==undefined&&needed.reduce((s,k)=>s+assets(k)[0]!.price,0)>recipe.budget&&limits.catalogComplete===false)return fallback('Bounded catalog search has not found an affordable set; catalog minimum price is unknown');
  if(recipe.budget!==undefined&&needed.reduce((s,k)=>s+assets(k)[0]!.price,0)>recipe.budget)return decline('The cheapest available requested pieces exceed the budget.','Keep existing furniture, reduce the piece count, or increase the budget.','Sum of independent minimum catalog prices exceeds budget');
  cache.analyze(scene,catalog);
  // Bounded beam over complete layouts; every next piece sees previous placements.
  let beam:{scene:Scene;ops:Op[];score:number}[]=[{scene,ops:[],score:0}];
  for(const kind of needed){
    const next:typeof beam=[];
    const choices=assets(kind),offset=limits.variant?limits.variant%Math.max(1,choices.length):0;
    const varied=[...choices.slice(offset),...choices.slice(0,offset)];
    for(const state of beam.slice(0,2))for(const asset of varied.slice(0,3)){
      const slots=cache.slots(state.scene,catalog,{roomId:room,catalogId:asset.id,solidHeadboard:asset.kind==='bed',nearWindow:kind==='desk',...limits});
      for(const slot of slots.slice(0,2)){
        const ops=[...state.ops,...slot.ops];if(recipe.budget!==undefined&&ops.reduce((n,o)=>n+(o.type==='add'?o.item.price??Infinity:0),0)>recipe.budget)continue;
        next.push({scene:applyOps(state.scene,slot.ops),ops,score:state.score+slot.score});
      }
    }
    beam=next.sort((a,b)=>b.score-a.score).slice(0,2);if(!beam.length)break;
  }
  const candidates=beam.map(b=>({id:`slot-${hash(b.ops).slice(0,16)}`,catalog_ids:b.ops.flatMap(o=>o.type==='add'&&o.item.sku?[o.item.sku]:[]),ops:b.ops,score:b.score,scores:{daylight:0,zoning:0,facing:0,open_floor:0},description:`Add ${needed.join(', ')}. Purchase total ${b.ops.reduce((n,o)=>n+(o.type==='add'?o.item.price??0:0),0)} ֏; no worsened access deficits.`}));
  // Intent kinds use the editor's actual broad kinds; semantic labels never falsify catalog identity.
  const withIntents=candidates.map(candidate=>{
    const counts=new Map<string,number>();
    for(const op of candidate.ops)if(op.type==='add')counts.set(op.item.kind,(counts.get(op.item.kind)??0)+1);
    return {...candidate,intent:{room_id:room,add:[...counts].map(([kind,count])=>({kinds:[kind],count})),remove:[],budget_dram:recipe.budget}};
  });
  return finish(withIntents,withIntents[0]?.intent??{room_id:room,add:[],remove:[]});
}

const selectionSchema=z.object({slot_id:z.string().min(1),catalog_ids:z.array(z.string())}).strict();
/** Revalidate IDs, snapshot, geometry and intent; persisted candidates never bypass propose. */
export function selectFastCandidate(scene:Scene,prepared:Extract<PreparedFastRequest,{type:'candidates'}>,selection:unknown,catalog:readonly CatalogAsset[]=prepared.catalog) {
  if(sceneFingerprint(scene)!==prepared.scene_fingerprint)throw new Error('Stale scene fingerprint');
  if(sceneFingerprint(scene,catalog)!==prepared.fingerprint)throw new Error('Stale catalog fingerprint');
  const selected=selectionSchema.parse(selection),candidate=prepared.candidates.find(c=>c.id===selected.slot_id);
  if(!candidate||JSON.stringify(selected.catalog_ids)!==JSON.stringify(candidate.catalog_ids))throw new Error('Unknown slot or mismatched catalog IDs');
  const session=new DesignerSession(scene);session.setIntent(candidate.intent??prepared.intent);
  return session.propose(candidate.ops,candidate.description);
}

/** Registered scene assets are identities, not a purchase universe. Query each requested kind
 * from the real catalog, map through the same editor boundary, and retain owned identities. */
export async function discoverFastCatalog(scene:Scene,request:string,owned:readonly CatalogAsset[],query:CatalogQuery=createHttpCatalogQuery({url:process.env.VARPET_CATALOG_URL||undefined,timeoutMs:6000})):Promise<CatalogAsset[]> {
  const recipe=classifyRequest(request);
  if(!recipe||!(recipe.classId.startsWith('furnish.')||recipe.classId.startsWith('add.')))return [...owned];
  const kinds=recipe.classId==='furnish.living'?['sofa','table']:recipe.classId==='furnish.bedroom'?['bed','wardrobe','nightstand']:recipe.classId==='furnish.kids'?['bed','desk','cabinet']:[recipe.kind!];
  const pages=await mapLimited(kinds,CATALOG_CONCURRENCY,kind=>query({kind,limit:12}));
  const merged=new Map<string,CatalogAsset>();
  for(const page of pages){
    if(!page||typeof page!=='object'||!Array.isArray((page as {results?:unknown}).results))throw Error('Catalog returned no product list');
    for(const raw of (page as {results:unknown[]}).results.slice(0,12)){const product=catalogProduct(raw);if(product)merged.set(product.asset.id,product.asset);}
  }
  for(const asset of owned)merged.set(asset.id,asset);
  return [...merged.values()];
}

/** Alternative requests may not silently repeat a previously offered layout. */
export function excludeFastOptions(prepared:PreparedFastRequest,excluded:readonly Op[][]):PreparedFastRequest {
  if(prepared.type!=='candidates'||!excluded.length)return prepared;
  const key=(ops:readonly Op[])=>JSON.stringify([...parseOps(ops)].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const seen=new Set(excluded.map(key)),candidates=prepared.candidates.filter(c=>!seen.has(key(c.ops)));
  return candidates.length?{...prepared,candidates}:{type:'fallback',classId:prepared.classId,reason:'Bounded candidate search has no different checked option yet; previous options were excluded'};
}
