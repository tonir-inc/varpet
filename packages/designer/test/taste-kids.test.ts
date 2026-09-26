import {test,expect} from 'vitest';
import {roomPrograms,inferRoomProgram} from '../knowledge/room-programs.js';
import {designRoom} from '../src/taste/design.js';
import {scoreComposition} from '../src/taste/composition.js';
import type {Scene} from '../src/scene.js';
const scene:Scene={rooms:[{id:'bedroom',name:'Bedroom',polygon:[[0,0],[6,0],[6,5],[0,5]]}],walls:[{id:'north',room_id:'bedroom',a:[0,5],b:[6,5]},{id:'south',room_id:'bedroom',a:[6,0],b:[0,0]},{id:'east',room_id:'bedroom',a:[6,5],b:[6,0]},{id:'west',room_id:'bedroom',a:[0,0],b:[0,5]}],openings:[],items:[],fixed:[]};
const sizes:Record<string,number[]>={bed:[1,2,.6],desk:[1,.5,.75],chair:[.5,.5,.8],shelf:[.6,.3,1],lamp:[.2,.2,1.4]};
const query=async(p:any)=>({results:sizes[p.kind]?[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind],price:40000,currency:'AMD',size_status:'confirmed',styles:['Modern'],colors_image:['beige']}]:[]});
test('children bedroom names select a distinct sleep, study, storage and play program',()=>{
 expect(inferRoomProgram("Children's bedroom")).toBe('kids');
 expect(inferRoomProgram('Kids room')).toBe('kids');
 expect(roomPrograms.kids?.search_kinds).toEqual(expect.arrayContaining(['bed','desk','shelf']));
 expect(roomPrograms.kids?.relations).toContain('clear_play_space');
});
test('budget-aware children request in a bedroom returns complete checked real-kind furniture',async()=>{
 const result=await designRoom(scene,{room_id:'bedroom',style_request:"Modern kids' room for one eight-year-old",budget_dram:300000} as any,query);
 expect(result.candidates.length).toBeGreaterThan(0);
 for(const candidate of result.candidates){
  expect(candidate.checks.ok).toBe(true);expect(candidate.composition.pass).toBe(true);
  expect(candidate.checks.price.cost_dram).toBeLessThanOrEqual(300000);
  expect(candidate.ops.flatMap(o=>o.type==='add'?[o.item.kind]:[])).toEqual(expect.arrayContaining(['bed','desk','shelf','chair']));
  expect(candidate.composition.checks.find(c=>c.code==='clear_play_space')?.pass).toBe(true);
 }
 const poor=await designRoom(scene,{room_id:'bedroom',style_request:"Modern kids' room",budget_dram:100000} as any,query);
 expect(poor.candidates).toEqual([]);
});
test('play space is a usable clear patch, not the sum of narrow leftover strips',()=>{
 const crowded={...scene,fixed:[{id:'obstacle',kind:'structure',name:'Structure',room_id:'bedroom',pos:[3,2.5] as [number,number],rot:0,size:[5.2,4.2,3] as [number,number,number],keep:true}]};
 expect(()=>scoreComposition(crowded,'bedroom',{program:'kids'})).not.toThrow();
 expect(scoreComposition(crowded,'bedroom',{program:'kids'}).issues.map(i=>i.code)).toContain('clear_play_space');
});
test('plain furnishing needs no invented customer style preference',async()=>{
 const result=await designRoom(scene,{room_id:'bedroom',style_request:"Furnish as a kids' room",budget_dram:300000} as any,query);
 expect(result.candidates.length).toBeGreaterThan(0);
 expect((result.knowledge as any).style_basis).toMatch(/default|assumed/i);
});
test('incidental children mention does not convert a living room into a bedroom',async()=>{
 const living={...scene,rooms:scene.rooms.map(r=>({...r,name:'Living room'}))};
 const plan=await designRoom(living,{room_id:'bedroom',style_request:'Furnish the living room so the kids can play'},async()=>({results:[]}));
 expect(plan.knowledge.program).toBe(roomPrograms.living);
});
test('a wardrobe panel cannot replace usable children storage',async()=>{
 const plan=await designRoom(scene,{room_id:'bedroom',style_request:"Modern kids' room",budget_dram:300000} as any,async p=>p.kind==='shelf'?{results:[]}:p.kind==='wardrobe'?{results:[{id:'panel',kind:'wardrobe',name:'Wardrobe panel',size_m:[.9,.36,1.2],price:100,currency:'AMD',styles:['Modern'],colors_image:['beige']}]}:query(p));
 expect(plan.candidates).toEqual([]);
});
