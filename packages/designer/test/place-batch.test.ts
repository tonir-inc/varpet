import {expect,test} from 'vitest';
import {placeBatch} from '../src/place-batch.js';
import {checkLayout} from '../src/layout.js';
import type {Scene} from '../src/scene.js';

function room():Scene {
  return {rooms:[{id:'r',polygon:[[0,0],[6,0],[6,6],[0,6]]}],
    walls:[{id:'s',room_id:'r',a:[0,0],b:[6,0]},{id:'n',room_id:'r',a:[6,6],b:[0,6]}],openings:[],fixed:[],
    items:['a','b'].map(id=>({id,kind:'desk',name:id,room_id:'r',pos:[3,3],rot:0,size:[1,0.6,0.75],keep:false}))};
}

test('batch places multiple existing items from relations and validates the combined copy',()=>{
  const scene=room(),original=structuredClone(scene);
  const result=placeBatch(scene,[
    {room_id:'r',item_id:'a',relations:[{type:'against_wall',wall_id:'n'}]},
    {room_id:'r',item_id:'b',relations:[{type:'against_wall',wall_id:'s'}]},
  ]);
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.candidates.length).toBeLessThanOrEqual(3);
  for(const candidate of result.candidates) {
    expect(candidate.ops.map(op=>op.type)).toEqual(['move','move']);
    expect(checkLayout(scene,candidate.ops).ok).toBe(true);
    expect(candidate.score.cost_dram).toBe(0);
  }
  expect(scene).toEqual(original);
});

test('batch cannot temporarily remove kept items or silently drop repeated requests',()=>{
  const scene=room();scene.items[0]!.keep=true;
  const request={room_id:'r',item_id:'a',relations:[{type:'against_wall' as const,wall_id:'n'}]};
  expect(()=>placeBatch(scene,[request])).toThrow(/kept/i);
  scene.items[0]!.keep=false;
  expect(()=>placeBatch(scene,[request,request])).toThrow(/duplicate/i);
});

test('partial placements cannot hide an unrequested invalid item from final checks',()=>{
  const scene=room();scene.items[1]!.pos=[20,20];
  const result=placeBatch(scene,[{room_id:'r',item_id:'a',relations:[{type:'against_wall',wall_id:'n'}]}]);
  expect(result.candidates).toEqual([]);
  expect(result.reason).toMatch(/candidate|checked|pose/i);
});
