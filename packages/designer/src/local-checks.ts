import { parseScene } from './adapter.js';
import { doorSwingPolygon, itemPolygon, pointInPolygon, polygonsOverlap, spaceMetrics } from './metrics/space.js';
import type { Scene, Vec2 } from './scene.js';

export interface LayoutError {
  check: 'inside' | 'overlap' | 'door_swing' | 'walkway';
  item_ids: string[]; at: Vec2; message: string; deficit_m?: number;
}
const EPS=1e-8;
const cross=(a:Vec2,b:Vec2)=>a[0]*b[1]-a[1]*b[0];
const subtract=(a:Vec2,b:Vec2):Vec2=>[a[0]-b[0],a[1]-b[1]];

/** Test every edge interval cut by the room boundary, so concave notches cannot be bridged. */
export function outsidePoint(footprint:Vec2[],room:Vec2[]):Vec2|undefined {
  for (const point of footprint) if (!pointInPolygon(point,room)) return point;
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
      if(!pointInPolygon(point,room)) return point;
    }
  }
  return undefined;
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
    const outside=outsidePoint(footprints[i]!,room.polygon);
    if(outside) errors.push({check:'inside',item_ids:[item.id],at:outside,deficit_m:boundaryDistance(outside,room.polygon),message:`${item.id} extends outside room ${room.id}`});
    for(let j=i+1;j<items.length;j++) {
      const other=items[j]!;
      if(other.room_id===item.room_id&&polygonsOverlap(footprints[i]!,footprints[j]!)) {
        errors.push({check:'overlap',item_ids:[item.id,other.id],at:[(item.pos[0]+other.pos[0])/2,(item.pos[1]+other.pos[1])/2],deficit_m:penetration(footprints[i]!,footprints[j]!),message:`${item.id} overlaps ${other.id}`});
      }
    }
  }
  for(const opening of scene.openings) {
    const swing=doorSwingPolygon(scene,opening);
    if(!swing) continue;
    const wall=scene.walls.find(w=>w.id===opening.wall_id)!;
    for(let i=0;i<items.length;i++) if(items[i]!.room_id===wall.room_id&&polygonsOverlap(footprints[i]!,swing)) {
      const item=items[i]!;
      errors.push({check:'door_swing',item_ids:[item.id],at:[...item.pos],deficit_m:penetration(footprints[i]!,swing),message:`${item.id} blocks door ${opening.id} swing`});
    }
  }
  return errors;
}

export function checkLocalLayout(scene:Scene) {
  const errors=localGeometryErrors(scene),metrics=spaceMetrics(scene);
  for(const room of metrics.rooms) for(const path of room.walkways) if(path.status==='fail') {
    errors.push({check:'walkway',item_ids:[path.from,path.to].filter(id=>id.startsWith('item:')).map(id=>id.slice(5)),at:path.narrowest,deficit_m:Math.max(0,0.6-path.width_m),message:`${path.from} to ${path.to}: ${path.reachable?path.width_m.toFixed(2)+' m path; minimum 0.60 m':'no accessible path'}`});
  }
  return {ok:errors.length===0,errors,metrics};
}
