import { parseScene } from './adapter.js';
import { physicalDoorSwingPolygon, itemPolygon, isFloorRug, pointInPolygon, polygonsOverlap, spaceMetrics } from './metrics/space.js';
import type { Scene, Vec2 } from './scene.js';
import { wallSolidPolygons } from './wall-geometry.js';

export interface LayoutError {
  check: 'inside' | 'overlap' | 'door_swing' | 'walkway' | 'wall_collision';
  item_ids: string[]; at: Vec2; message: string; deficit_m?: number;
  room_id: string;
  opening_id?: string;
  wall_id?: string;
  walkway?: { from: string; to: string; reachable: boolean };
}
const EPS=1e-8;
const cross=(a:Vec2,b:Vec2)=>a[0]*b[1]-a[1]*b[0];
const subtract=(a:Vec2,b:Vec2):Vec2=>[a[0]-b[0],a[1]-b[1]];

/** Identity excludes presentation text and bottleneck coordinates, which can change without worsening. */
export function layoutErrorKey(error:LayoutError):string|undefined {
  if(!error.room_id) return undefined;
  if(error.check==='walkway') {
    const path=error.walkway;
    if(!path?.from||!path.to||typeof path.reachable!=='boolean') return undefined;
    return JSON.stringify([error.check,error.room_id,[path.from,path.to].sort()]);
  }
  if(!error.item_ids.length||(error.check==='door_swing'&&!error.opening_id)) return undefined;
  if(error.check==='wall_collision') return error.wall_id ? JSON.stringify([error.check,error.room_id,[...error.item_ids].sort(),error.wall_id]) : undefined;
  return JSON.stringify([error.check,error.room_id,[...error.item_ids].sort(),error.opening_id??null]);
}

/** Only a measured, same-identity violation that has not worsened may become a baseline note. */
export function compareLayoutErrors(before:readonly LayoutError[],after:readonly LayoutError[]):{errors:LayoutError[];notes:LayoutError[]} {
  const baseline=new Map<string,LayoutError>(),errors:LayoutError[]=[],notes:LayoutError[]=[];
  for(const issue of before) {
    const key=layoutErrorKey(issue);
    if(key!==undefined) baseline.set(key,issue);
  }
  for(const issue of after) {
    const key=layoutErrorKey(issue),previous=key===undefined?undefined:baseline.get(key);
    const measured=Number.isFinite(previous?.deficit_m)&&Number.isFinite(issue.deficit_m);
    const reachabilityPreserved=issue.check!=='walkway'||(previous?.walkway?.reachable===false||issue.walkway?.reachable===true);
    if(previous&&measured&&issue.deficit_m!<=previous.deficit_m!+EPS&&reachabilityPreserved) notes.push(issue);
    else errors.push(issue);
  }
  return {errors,notes};
}

/** Test every corner and edge interval cut by the room boundary, including concave notches. */
function* outsidePoints(footprint:Vec2[],room:Vec2[]):Generator<Vec2> {
  for (const point of footprint) if (!pointInPolygon(point,room)) yield point;
  for(let i=0;i<footprint.length;i++) {
    const a=footprint[i]!,b=footprint[(i+1)%footprint.length]!,r=subtract(b,a),cuts=[0,1];
    for(let j=0;j<room.length;j++) {
      const c=room[j]!,d=room[(j+1)%room.length]!,s=subtract(d,c),den=cross(r,s);
      if(Math.abs(den)<EPS) continue;
      const t=cross(subtract(c,a),s)/den,u=cross(subtract(c,a),r)/den;
      if(t>EPS&&t<1-EPS&&u>=-EPS&&u<=1+EPS) cuts.push(t);
    }
    cuts.sort((x,y)=>x-y);
    for(let j=1;j<cuts.length;j++) {
      const t=(cuts[j-1]!+cuts[j]!)/2,point:Vec2=[a[0]+r[0]*t,a[1]+r[1]*t];
      if(!pointInPolygon(point,room)) yield point;
    }
  }
}

/** Cheap containment predicate; callers needing a deficit inspect every outside point. */
export function outsidePoint(footprint:Vec2[],room:Vec2[]):Vec2|undefined {
  return outsidePoints(footprint,room).next().value;
}

function boundaryDistance(point:Vec2,polygon:Vec2[]):number {
  return Math.min(...polygon.map((a,i)=>{
    const b=polygon[(i+1)%polygon.length]!,v=subtract(b,a),w=subtract(point,a);
    const t=Math.max(0,Math.min(1,(v[0]*w[0]+v[1]*w[1])/(v[0]**2+v[1]**2)));
    return Math.hypot(point[0]-a[0]-v[0]*t,point[1]-a[1]-v[1]*t);
  }));
}
function penetration(a:Vec2[],b:Vec2[]):number {
  let depth=Infinity;
  for(const poly of [a,b]) for(let i=0;i<poly.length;i++) {
    const p=poly[i]!,q=poly[(i+1)%poly.length]!,length=Math.hypot(q[0]-p[0],q[1]-p[1]);
    if(length<EPS) continue;
    const axis:Vec2=[(q[1]-p[1])/length,(p[0]-q[0])/length];
    const aa=a.map(v=>v[0]*axis[0]+v[1]*axis[1]),bb=b.map(v=>v[0]*axis[0]+v[1]*axis[1]);
    depth=Math.min(depth,Math.min(Math.max(...aa)-Math.min(...bb),Math.max(...bb)-Math.min(...aa)));
  }
  return Math.max(0,depth);
}

/** Cheap deterministic prefilter before computing circulation. */
export function localGeometryErrors(input:Scene):LayoutError[] {
  const scene=parseScene(input),errors:LayoutError[]=[],items=[...scene.items,...scene.fixed];
  const footprints=items.map(itemPolygon);
  for(let i=0;i<items.length;i++) {
    const item=items[i]!,room=scene.rooms.find(r=>r.id===item.room_id)!;
    // A first-corner witness can improve while another corner rotates farther outside.
    // Use the largest deficit across all outside corners and boundary-cut edge intervals.
    let outside:Vec2|undefined,deficit=0;
    for(const point of outsidePoints(footprints[i]!,room.polygon)) {
      const distance=boundaryDistance(point,room.polygon);
      if(!outside||distance>deficit) {outside=point;deficit=distance;}
    }
    if(outside) errors.push({check:'inside',room_id:room.id,item_ids:[item.id],at:outside,deficit_m:deficit,message:`${item.id} extends outside room ${room.id}`});
    // Rugs are floor coverings but cannot penetrate physical walls. Aggregate shared aliases
    // and split spans by source wall so the greatest penetration controls baseline comparison.
    const wallHits = new Map<string, LayoutError>();
    for(const solid of wallSolidPolygons(scene, item.size[2])) if(polygonsOverlap(footprints[i]!,solid.polygon)) {
      const depth = penetration(footprints[i]!,solid.polygon), previous = wallHits.get(solid.wall_id);
      if(!previous || depth > previous.deficit_m!) wallHits.set(solid.wall_id, {check:'wall_collision',room_id:room.id,wall_id:solid.wall_id,item_ids:[item.id],at:[...item.pos],deficit_m:depth,message:`${item.id} intersects wall ${solid.wall_id} by ${depth.toFixed(3)} m`});
    }
    errors.push(...wallHits.values());
    for(let j=i+1;j<items.length;j++) {
      const other=items[j]!;
      if(!isFloorRug(item)&&!isFloorRug(other)&&other.room_id===item.room_id&&polygonsOverlap(footprints[i]!,footprints[j]!)) {
        errors.push({check:'overlap',room_id:room.id,item_ids:[item.id,other.id],at:[(item.pos[0]+other.pos[0])/2,(item.pos[1]+other.pos[1])/2],deficit_m:penetration(footprints[i]!,footprints[j]!),message:`${item.id} overlaps ${other.id}`});
      }
    }
  }
  for(const opening of scene.openings) {
    const swing=physicalDoorSwingPolygon(scene,opening);
    if(!swing) continue;
    for(let i=0;i<items.length;i++) if(!isFloorRug(items[i]!)&&polygonsOverlap(footprints[i]!,swing)) {
      const item=items[i]!;
      errors.push({check:'door_swing',room_id:item.room_id,opening_id:opening.id,item_ids:[item.id],at:[...item.pos],deficit_m:penetration(footprints[i]!,swing),message:`${item.id} blocks door ${opening.id} swing`});
    }
  }
  return errors;
}

export function checkLocalLayout(scene:Scene) {
  const errors=localGeometryErrors(scene),metrics=spaceMetrics(scene);
  for(const room of metrics.rooms) for(const path of room.walkways) if(path.status==='fail') {
    errors.push({check:'walkway',room_id:room.room_id,walkway:{from:path.from,to:path.to,reachable:path.reachable},item_ids:[path.from,path.to].filter(id=>id.startsWith('item:')).map(id=>id.slice(5)),at:path.narrowest,deficit_m:Math.max(0,0.6-path.width_m),message:`${path.from} to ${path.to}: ${path.reachable?path.width_m.toFixed(2)+' m path; minimum 0.60 m':'no accessible path'}`});
  }
  return {ok:errors.length===0,errors,metrics};
}

/** Baseline-aware preview; static checkLocalLayout remains strict. */
export function checkLocalLayoutChange(before:Scene,after:Scene) {
  const previous=checkLocalLayout(before),current=checkLocalLayout(after);
  const comparison=compareLayoutErrors(previous.errors,current.errors);
  return {ok:comparison.errors.length===0,...comparison,metrics:current.metrics};
}
