/** Balconies, loggias and terraces get their own program: compact seats, a small table and plants,
 * nothing pushed against the railing. Detection uses the editor's room zone first, then the name
 * (the Balcony flat names its balcony "Balcony · living room", so name tests must run before /living/). */
import type {Item,Room,Scene,Vec2} from './scene.js';
import {itemPolygon,pointInPolygon} from './metrics/space.js';

/** Climbable furniture keeps this gap from a railing or open edge (derived policy, 27 Sept). */
export const RAILING_CLEARANCE_M=.3;
const OUTDOOR_NAME=/balcon|loggia|terrace|patio|veranda|балкон|лоджи|террас|պատշգամբ|լոջիա/i;
export const isOutdoorRoom=(room:Pick<Room,'name'|'zone'>|undefined)=>!!room&&(room.zone!==undefined||OUTDOOR_NAME.test(room.name??''));

type Segment=[Vec2,Vec2];
const segmentDistance=(p:Vec2,[a,b]:Segment)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
const edges=(polygon:Vec2[]):Segment[]=>polygon.map((p,i)=>[p,polygon[(i+1)%polygon.length]!]);

/** Railing geometry for an outdoor room: explicit railing/parapet components when the editor has them,
 * otherwise the room's edges that border no other room (probed up to 0.6 m outward). */
export function railingSegments(scene:Scene,roomId:string):Segment[]{
 const room=scene.rooms.find(r=>r.id===roomId);if(!room)return [];
 const near=(polygon:Vec2[])=>polygon.some(p=>pointInPolygon(p,room.polygon)||edges(room.polygon).some(e=>segmentDistance(p,e)<=.5));
 const railings=scene.fixed.filter(f=>f.structure&&/railing|parapet|balustrade/i.test(`${f.id} ${f.name}`)).map(itemPolygon).filter(near);
 if(railings.length)return railings.flatMap(edges);
 const others=scene.rooms.filter(r=>r.id!==roomId);
 return edges(room.polygon).filter(([a,b])=>{
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-6)return false;
  const mid:Vec2=[(a[0]+b[0])/2,(a[1]+b[1])/2],n:Vec2=[(b[1]-a[1])/length,-(b[0]-a[0])/length];
  const sign=pointInPolygon([mid[0]+n[0]*1e-3,mid[1]+n[1]*1e-3],room.polygon)?-1:1;
  return ![.05,.2,.4,.6].some(d=>others.some(r=>pointInPolygon([mid[0]+sign*n[0]*d,mid[1]+sign*n[1]*d],r.polygon)));
 });
}

/** Smallest distance from an item's footprint to any railing segment. */
export function railingGap(item:Item,segments:Segment[]):number{
 if(!segments.length)return Infinity;
 const polygon=itemPolygon(item);
 return Math.min(...polygon.flatMap(p=>segments.map(s=>segmentDistance(p,s))),...segments.flatMap(([a,b])=>edges(polygon).flatMap(e=>[segmentDistance(a,e),segmentDistance(b,e)])));
}
