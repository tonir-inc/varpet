import { test, expect } from 'vitest';
import type { Item, Scene } from '../src/scene.js';
import { checkLocalLayout, localGeometryErrors } from '../src/local-checks.js';

function room(): Scene { return {rooms:[{id:'r',polygon:[[0,0],[4,0],[4,4],[0,4]]}], walls:[{id:'s',room_id:'r',a:[0,0],b:[4,0]},{id:'n',room_id:'r',a:[4,4],b:[0,4]}],openings:[],items:[],fixed:[]}; }
function item(id:string,pos:[number,number],size:[number,number,number]=[1,1,1]):Item { return {id,room_id:'r',kind:'desk',name:id,pos,size,rot:0,keep:false}; }

test('local geometry permits touching but rejects overlap and outside poses with coordinates',()=>{
  const scene=room();scene.items=[item('a',[0.5,0.5]),item('b',[1.5,0.5])];
  expect(localGeometryErrors(scene)).toEqual([]);
  scene.items[1]!.pos=[1.4,0.5];
  expect(localGeometryErrors(scene)).toEqual(expect.arrayContaining([expect.objectContaining({check:'overlap',item_ids:['a','b'],at:expect.any(Array)})]));
  scene.items[1]!.pos=[4,0.5];
  expect(localGeometryErrors(scene).some(e=>e.check==='inside'&&e.item_ids.includes('b'))).toBe(true);
});

test('inside check catches a concave notch crossing a footprint even when its corners are inside',()=>{
  const scene=room();scene.rooms[0]!.polygon=[[0,0],[4,0],[4,4],[2.5,4],[2.5,2],[1.5,2],[1.5,4],[0,4]];
  scene.walls=[];scene.items=[item('bridge',[2,2],[3,2,1])];
  expect(localGeometryErrors(scene).some(e=>e.check==='inside')).toBe(true);
});

test('door swing checks include fixed items and allow an empty sweep',()=>{
  const scene=room();scene.openings=[{id:'d',wall_id:'s',kind:'door',offset:1,width:1,height:2,sill:0,swing:'inward-left'}];
  expect(localGeometryErrors(scene)).toEqual([]);
  scene.fixed=[item('radiator',[1.5,0.4],[0.2,0.2,1])];
  expect(localGeometryErrors(scene).some(e=>e.check==='door_swing'&&e.item_ids.includes('radiator'))).toBe(true);
});

test('local layout reports failed circulation and evaluates on a copy',()=>{
  const scene=room();scene.openings=[{id:'d1',wall_id:'s',kind:'door',offset:1.5,width:1,height:2,sill:0,swing:'none'},{id:'d2',wall_id:'n',kind:'door',offset:1.5,width:1,height:2,sill:0,swing:'none'}];
  scene.items=[item('barrier',[2,2],[4,0.5,1])];
  const before=JSON.stringify(scene), result=checkLocalLayout(scene);
  expect(result.ok).toBe(false);
  expect(result.errors.some(e=>e.check==='walkway'&&e.deficit_m!>0&&e.at.length===2)).toBe(true);
  expect(JSON.stringify(scene)).toBe(before);
  expect(checkLocalLayout(room()).ok).toBe(true);
});
