import {test,expect} from 'vitest';
import {designRoom} from '../src/taste/design.js';
import type {Scene} from '../src/scene.js';
const scene:Scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[3.6,0],[3.6,5.5],[0,5.5]]}],walls:[{id:'north',room_id:'living',a:[0,5.5],b:[3.6,5.5]}],openings:[],items:[],fixed:[]};
const sizes:Record<string,number[]>={sofa:[1.7,.85,.8],rug:[3,2.4,.02],lamp:[.25,.25,1.4],table:[.8,.5,.4],shelf:[.7,.3,1.2]};
const query=async(p:any)=>({results:sizes[p.kind]?[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind],price:100,currency:'AMD',styles:['Modern'],colors_image:['beige']}]:[]});
test('living program can use one sofa facing a focal point without requiring an optional chair',async()=>{
 const result=await designRoom(scene,{room_id:'living',style_request:'Furnish the living room'},query);
 expect(result.candidates.length).toBeGreaterThan(0);
 for(const candidate of result.candidates){expect(candidate.checks.ok).toBe(true);expect(candidate.composition.pass).toBe(true);expect(candidate.ops.flatMap(o=>o.type==='add'?[o.item.kind]:[])).toEqual(expect.arrayContaining(['sofa','table','rug','lamp','shelf']));}
});
test('compact option cannot omit the focal point or restore a removed sofa',async()=>{
 const missing=await designRoom(scene,{room_id:'living',style_request:'modern'},async p=>p.kind==='shelf'?{results:[]}:query(p));expect(missing.candidates).toEqual([]);
 const removed=await designRoom(scene,{room_id:'living',style_request:'remove the sofa and remake in modern style'},query);expect(removed.candidates).toEqual([]);
 const requested=await designRoom(scene,{room_id:'living',style_request:'modern with a sofa and two chairs'},query);expect(requested.candidates).toEqual([]);
});
test('compact fallback respects armchair requests and usable focal storage dimensions',async()=>{
 for(const request of [{style_request:'modern with two armchairs'},{style_request:'modern',customer_requests:['Furnish with a sofa and two armchairs']}]){
  expect((await designRoom(scene,{room_id:'living',...request},query)).candidates).toEqual([]);
 }
 const panel=await designRoom(scene,{room_id:'living',style_request:'modern'},async p=>p.kind==='shelf'?{results:[{id:'panel',kind:'shelf',name:'Shelf panel',size_m:[.7,.1,1.2],price:100,currency:'AMD',styles:['Modern'],colors_image:['beige']}]}:query(p));
 expect(panel.candidates).toEqual([]);
});
