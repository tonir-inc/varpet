import type { SceneDocument, Wall as EditorWall } from '../../../apps/editor/src/contracts.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { wallOutward } from './adapter.js';
import type { Item, Scene, Vec2, Wall } from './scene.js';

/** Maximum perpendicular edge correction and vertex displacement, in metres. */
export const ROOM_FACE_TOLERANCE_M = 0.053;
const EPS=1e-7;
const plan=([x,z]:Vec2):Vec2=>[x,-z];
const sub=(a:Vec2,b:Vec2):Vec2=>[a[0]-b[0],a[1]-b[1]];
const dot=(a:Vec2,b:Vec2)=>a[0]*b[0]+a[1]*b[1];
const cross=(a:Vec2,b:Vec2)=>a[0]*b[1]-a[1]*b[0];
function basis(wall:EditorWall) {
 const length=Math.hypot(...sub(wall.end,wall.start));const u:Vec2=[(wall.end[0]-wall.start[0])/length,(wall.end[1]-wall.start[1])/length];const n:Vec2=[-u[1],u[0]];
 return {length,u,n,project:(p:Vec2)=>dot(sub(p,wall.start),u),distance:(p:Vec2)=>dot(sub(p,wall.start),n)};
}
type Line={a:Vec2;b:Vec2};
export interface GeometryAudit { tolerance_m:number; adjustments:{room_id:string;vertex:number;before:Vec2;after:Vec2;distance_m:number}[]; warnings:string[]; obstacle_wall_ids:string[]; opening_room_ids:Record<string,string[]> }

/** Reconcile a disposable copy; editor source walls/openings and the input remain unchanged. */
export function snapRoomFaces(input:SceneDocument,tolerance=ROOM_FACE_TOLERANCE_M):{editor:SceneDocument;audit:GeometryAudit} {
 if(!Number.isFinite(tolerance)||tolerance<0||tolerance>.1)throw new Error('Room-face tolerance must be between 0 and 0.1 m');
 const editor=structuredClone(input),audit:GeometryAudit={tolerance_m:tolerance,adjustments:[],warnings:[],obstacle_wall_ids:[],opening_room_ids:{}};
 for(const room of editor.rooms) {
  const original=room.polygon,lines:Line[]=original.map((a,i)=>({a,b:original[(i+1)%original.length]!}));
  const shifted=lines.map(line=>{
   let best:Line=line,error=Infinity;
   const v=sub(line.b,line.a),length=Math.hypot(...v);
   for(const wall of editor.walls) {
    const f=basis(wall),da=f.distance(line.a),db=f.distance(line.b);
    if(Math.abs(dot(v,f.u))/length<.99)continue;
    const overlap=Math.min(f.length,Math.max(f.project(line.a),f.project(line.b)))-Math.max(0,Math.min(f.project(line.a),f.project(line.b)));
    if(overlap<Math.min(.05,length/2))continue;
    // Preserve exact centreline floor conventions (Avani) and door threshold edges.
    if(Math.max(Math.abs(da),Math.abs(db))<EPS)return line;
    const face=(da+db>=0?1:-1)*wall.thickness/2;
    const delta=Math.max(Math.abs(da-face),Math.abs(db-face));
    if(delta>tolerance+EPS||delta>=error)continue;
    error=delta;best={a:[line.a[0]+f.n[0]*(face-da),line.a[1]+f.n[1]*(face-da)],b:[line.b[0]+f.n[0]*(face-db),line.b[1]+f.n[1]*(face-db)]};
   }
   return best;
  });
  const candidate=original.map((point,i):Vec2=>{
   const before=shifted[(i+shifted.length-1)%shifted.length]!,after=shifted[i]!,a=sub(before.b,before.a),b=sub(after.b,after.a),den=cross(a,b);
   let next:Vec2;
   if(Math.abs(den)<EPS)next=[(before.b[0]+after.a[0])/2,(before.b[1]+after.a[1])/2];
   else {const t=cross(sub(after.a,before.a),b)/den;next=[before.a[0]+a[0]*t,before.a[1]+a[1]*t];}
   const displacement=Math.hypot(...sub(next,point));
   return displacement>EPS&&displacement<=tolerance+EPS?next:[...point];
  });
  room.polygon=candidate;
  // Validate polygon syntax/topology with the product gate without needing furniture catalog entries.
  const check=validateScene({...editor,objects:[]},[]);
  if(!check.ok) {room.polygon=original;audit.warnings.push(`Room ${room.id}: snapping skipped: ${check.errors.join('; ')}`);continue;}
  candidate.forEach((point,i)=>{const d=Math.hypot(...sub(point,original[i]!));if(d>EPS)audit.adjustments.push({room_id:room.id,vertex:i,before:plan(original[i]!),after:plan(point),distance_m:d});});
 }
 return {editor,audit};
}
interface Span {roomId:string;from:number;to:number;id?:string}
function merged(intervals:Vec2[]):Vec2[] {
 const result:Vec2[]=[];for(const [a,b] of intervals.sort((a,b)=>a[0]-b[0])){const last=result.at(-1);if(last&&a<=last[1]+EPS)last[1]=Math.max(last[1],b);else result.push([a,b]);}return result;
}
function distanceToSegment(p:Vec2,a:Vec2,b:Vec2):number {const d=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),d)/dot(d,d)));return Math.hypot(p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1]);}
function edgeDistance(p:Vec2,polygon:Vec2[]):number {return Math.min(...polygon.map((a,i)=>distanceToSegment(p,a,polygon[(i+1)%polygon.length]!)));}

/** Preserve all physical solids, including unsupported stretches, as global immutable structure. */
export function reconciledWall(wall:EditorWall,editor:SceneDocument,scene:Scene,audit:GeometryAudit):Span[] {
 const f=basis(wall),spans:Span[]=[];
 const point=(t:number):Vec2=>[wall.start[0]+f.u[0]*t,wall.start[1]+f.u[1]*t];
 const asWall=(roomId:string,from:number,to:number):Wall=>({id:wall.id,room_id:roomId,a:plan(point(from)),b:plan(point(to)),thickness:wall.thickness,height:wall.height});
 for(const room of editor.rooms) {
  const intervals:Vec2[]=[];
  for(const [i,a] of room.polygon.entries()) {
   const b=room.polygon[(i+1)%room.polygon.length]!,v=sub(b,a),da=f.distance(a),db=f.distance(b);
   if(Math.abs(dot(v,f.u))/Math.hypot(...v)<.99||Math.max(Math.abs(da),Math.abs(db))>wall.thickness/2+EPS)continue;
   const cap=Math.max(Math.abs(da),Math.abs(db))>EPS?wall.thickness/2:0;
   const from=Math.max(0,Math.min(f.project(a),f.project(b))-cap),to=Math.min(f.length,Math.max(f.project(a),f.project(b))+cap);
   if(to-from>EPS)intervals.push([from,to]);
  }
  for(const [from,to] of merged(intervals)) {
   try {wallOutward(scene,asWall(room.id,from,to));spans.push({roomId:room.id,from,to});}catch{/* Not a one-sided boundary: retained below as structure. */}
  }
 }
 for(const opening of wall.openings) {
  const from=opening.offset,to=from+opening.width;
  if(spans.some(s=>from>=s.from-EPS&&to<=s.to+EPS))continue;
  // One physical window may span an open living/kitchen boundary. Preserve its ID and
  // entire aperture, and explicitly record every adjacent room rather than dropping half.
  const shared=spans.filter(s=>Math.min(to,s.to)-Math.max(from,s.from)>EPS);
  const coverage=merged(shared.map(s=>[Math.max(from,s.from),Math.min(to,s.to)]));
  if(coverage.length===1&&coverage[0]![0]<=from+EPS&&coverage[0]![1]>=to-EPS) {
   const owners=[...new Set(shared.map(s=>s.roomId))];
   const primary=shared.sort((a,b)=>(Math.min(to,b.to)-Math.max(from,b.from))-(Math.min(to,a.to)-Math.max(from,a.from)))[0]!;
   try {
    wallOutward(scene,asWall(primary.roomId,from,to));spans.push({roomId:primary.roomId,from,to});
    audit.opening_room_ids[opening.id]=owners;
    audit.warnings.push(`Opening ${opening.id} spans rooms ${owners.join(', ')}; sunlight remains the full, unoccluded physical aperture.`);
    continue;
   }catch{/* Fall through to the bounded face test. */}
  }
  const rooms=editor.rooms.map(room=>({room,error:Math.max(...[from,(from+to)/2,to].map(t=>edgeDistance(point(t),room.polygon)))})).sort((a,b)=>a.error-b.error);
  let found=false;
  for(const {room,error} of rooms) {
   if(error>wall.thickness/2+audit.tolerance_m+EPS)continue;
   try {wallOutward(scene,asWall(room.id,from,to));spans.push({roomId:room.id,from,to});found=true;break;}catch{/* Try the other actual adjacent face. */}
  }
  if(!found)throw new Error(`Opening ${opening.id}: no unambiguous adjacent room within ${audit.tolerance_m} m face tolerance`);
 }
 // Merge same-room spans before assigning stable IDs.
 const combined:Span[]=[];
 for(const room of editor.rooms)for(const [from,to] of merged(spans.filter(s=>s.roomId===room.id).map(s=>[s.from,s.to])))combined.push({roomId:room.id,from,to});
 combined.forEach((s,i)=>{s.id=combined.length===1?wall.id:`${wall.id}::${s.roomId}::${i}`;});
 const covered=merged(combined.map(s=>[s.from,s.to]));const gaps:Vec2[]=[];let cursor=0;
 for(const [a,b] of covered){if(a>cursor+EPS)gaps.push([cursor,a]);cursor=Math.max(cursor,b);}if(cursor<f.length-EPS)gaps.push([cursor,f.length]);
 let index=0;
 for(const [from,to] of gaps) {
  audit.obstacle_wall_ids.push(wall.id);
  const cuts=[from,to,...wall.openings.flatMap(o=>[o.offset,o.offset+o.width]).filter(t=>t>from&&t<to)].sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++) {
   const a=cuts[i-1]!,b=cuts[i]!;if(b-a<EPS)continue;
   const opening=wall.openings.find(o=>(a+b)/2>=o.offset-EPS&&(a+b)/2<=o.offset+o.width+EPS);
   const heights:Vec2[]=opening?[[0,opening.sill],[opening.sill+opening.height,wall.height]]:[[0,wall.height]];
   for(const [bottom,top] of heights) {
    if(top-bottom<EPS)continue;
    const centre=point((a+b)/2),owner=[...editor.rooms].sort((r,s)=>edgeDistance(centre,r.polygon)-edgeDistance(centre,s.polygon))[0]!;
    const obstacle:Item={id:`structure:${wall.id}:${index++}`,room_id:owner.id,kind:'structural_obstacle',name:`Fixed wall ${wall.id}`,pos:plan(centre),rot:Math.atan2(-f.u[1],f.u[0])*180/Math.PI,size:[b-a,wall.thickness,top-bottom],keep:true,structure:{wall_id:wall.id,bottom_m:bottom}};
    scene.fixed.push(obstacle);
   }
  }
 }
 audit.obstacle_wall_ids=[...new Set(audit.obstacle_wall_ids)];
 return combined;
}
