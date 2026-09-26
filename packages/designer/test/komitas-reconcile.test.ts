import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { demoScene } from '../../../apps/editor/src/core/demo.js';
import { editorToDesigner } from '../src/editor-bridge.js';
import { applyOps, sceneSummary, wallOutward } from '../src/adapter.js';
import { localGeometryErrors } from '../src/local-checks.js';
import { spaceMetrics } from '../src/metrics/space.js';
import { sun } from '../src/metrics/sun.js';
import { snapRoomFaces, reconciledWall, ROOM_FACE_TOLERANCE_M } from '../src/reconcile-geometry.js';
import type { Scene } from '../src/scene.js';
import type { SceneDocument } from '../../../apps/editor/src/contracts.js';
const options={northDeg:0,catalog:[],geometryPolicy:'reconcile' as const};
const ids=['b20-t11','b25-t72','b31-t46','b21-t13','b28-t31','b30-t35'];
for(const id of ids)test(`${id}: real editor-valid shell supports summary, sunlight and access`,()=>{
  const input=JSON.parse(readFileSync(new URL(`../eval/komitas/${id}.rejected.json`,import.meta.url),'utf8'));
  const before=structuredClone(input), scene=editorToDesigner(input,options);
  expect(()=>sceneSummary(scene)).not.toThrow();
  expect(sun(scene).status).not.toBe('unknown');
  expect(spaceMetrics(scene).rooms).toHaveLength(input.rooms.length);
  expect(scene.openings.map(o=>o.id).sort()).toEqual(input.walls.flatMap((w:any)=>w.openings.map((o:any)=>o.id)).sort());
  for(const wall of scene.walls)expect(wallOutward(scene,wall).every(Number.isFinite)).toBe(true);
  expect(input).toEqual(before);
},30_000);
function obstacleScene():SceneDocument {
 const s=structuredClone(demoScene);s.rooms=[{id:'a',name:'A',polygon:[[0,0],[4,0],[4,4],[0,4]],color:'#ffffff'},{id:'b',name:'B',polygon:[[4,0],[8,0],[8,4],[4,4]],color:'#ffffff'}];s.objects=[];
 s.walls=[{id:'pier',start:[3,2],end:[5,2],height:1.1,thickness:.3,color:'#ffffff',openings:[]}];return s;
}
test('an interior structural wall is an immutable obstacle on both sides of room ownership',()=>{
 const scene=editorToDesigner(obstacleScene(),options);expect(scene.fixed.length).toBeGreaterThan(0);
 for(const room of ['a','b']) {
  const pos:[number,number]=[room==='a'?3.5:4.5,-2];
  const item={id:'collision',room_id:room,name:'Chair',kind:'chair',pos,rot:0,size:[.5,.5,.8] as [number,number,number],keep:false};
  expect(localGeometryErrors({...scene,items:[item]}).some(e=>e.check==='wall_collision'||e.check==='overlap')).toBe(true);
 }
 expect(()=>applyOps(scene,[{type:'remove',id:scene.fixed[0]!.id}])).toThrow(/fixed/);
 expect(spaceMetrics(scene).free_area_m2).toBeLessThan(32);
});
test('the robust bridge never moves a detached room face beyond its documented tolerance',()=>{
 const s=obstacleScene();s.rooms=s.rooms.slice(0,1);s.rooms[0]!.polygon=[[.3,0],[4,0],[4,4],[.3,4]];
 s.walls=[{id:'west',start:[0,0],end:[0,4],height:2.7,thickness:.2,color:'#ffffff',openings:[]}];
 const scene=editorToDesigner(s,options);expect(scene.rooms[0]!.polygon).toEqual(s.rooms[0]!.polygon.map(([x,z])=>[x,-z]));
 expect(scene.fixed.length).toBeGreaterThan(0);
});

test('room summaries expose shared opening walls and all immutable structure',()=>{
 const raw=JSON.parse(readFileSync(new URL('../eval/komitas/b20-t11.rejected.json',import.meta.url),'utf8'));
 const scene=editorToDesigner(raw,options),shared=scene.openings.find(o=>(o.room_ids?.length??0)>1)!;
 expect(shared).toBeDefined();
 for(const room of shared.room_ids!) {
  const summary=sceneSummary(scene,[room]);
  expect(summary.openings.some(o=>o.id===shared.id)).toBe(true);
  expect(summary.walls.some(w=>w.id===shared.wall_id)).toBe(true);
  expect(summary.fixed.filter(f=>f.structure).length).toBe(scene.fixed.filter(f=>f.structure).length);
  expect(sun(scene,{room_id:room}).windows.some(w=>w.window_id===shared.id)).toBe(true);
 }
 const pier=editorToDesigner(obstacleScene(),options);
 expect(sceneSummary(pier,['b']).fixed).toEqual(pier.fixed);
 expect(sceneSummary(pier,[]).fixed).toEqual([]);
});

test('overhead structure permits short items but blocks tall furniture and floor structure blocks rugs',()=>{
 const scene=editorToDesigner(obstacleScene(),options);
 const fixed=scene.fixed[0]!;fixed.structure!.bottom_m=1.5;fixed.size[2]=.5;
 const chair={id:'under',room_id:'b',name:'Chair',kind:'chair',pos:[4.5,-2] as [number,number],rot:0,size:[.5,.5,1] as [number,number,number],keep:false};
 expect(localGeometryErrors({...scene,items:[chair]}).filter(e=>e.check==='wall_collision')).toHaveLength(0);
 expect(localGeometryErrors({...scene,items:[{...chair,size:[.5,.5,2]}]}).some(e=>e.check==='wall_collision')).toBe(true);
 fixed.structure!.bottom_m=0;
 expect(localGeometryErrors({...scene,items:[{...chair,kind:'rug',size:[.5,.5,.01]}]}).some(e=>e.check==='wall_collision')).toBe(true);
});


test('53 mm is the smallest whole-millimetre tolerance supporting the balcony aperture',()=>{
 const raw=JSON.parse(readFileSync(new URL('../eval/komitas/b21-t13.rejected.json',import.meta.url),'utf8'));
 const {editor,audit}=snapRoomFaces(raw,.052);
 const scene:Scene={rooms:editor.rooms.map(r=>({id:r.id,polygon:r.polygon.map(([x,z])=>[x,-z])})),walls:[],openings:[],items:[],fixed:[],geometry_audit:audit};
 expect(()=>{for(const wall of editor.walls)reconciledWall(wall,editor,scene,audit);}).toThrow(/balcony_guard_opening/);
 const converted=editorToDesigner(raw,{northDeg:0,catalog:[]});
 expect(ROOM_FACE_TOLERANCE_M).toBe(.053);
 expect(converted.geometry_audit!.adjustments.every(a=>a.distance_m<=ROOM_FACE_TOLERANCE_M+1e-7)).toBe(true);
 expect(converted.openings.some(o=>o.id==='balcony_guard_opening')).toBe(true);
});
