import {test,expect} from 'vitest';
import {designRoom} from '../src/taste/design.js';
import {searchRoomCatalog} from '../src/taste/catalog.js';
import {scoreComposition} from '../src/taste/composition.js';
import type {Scene} from '../src/scene.js';
const scene:Scene={rooms:[{id:'room',name:'Bedroom',polygon:[[0,0],[7,0],[7,6],[0,6]]}],walls:[{id:'north',room_id:'room',a:[0,6],b:[7,6]},{id:'west',room_id:'room',a:[0,0],b:[0,6]}],openings:[],items:[],fixed:[]};
const sizes:Record<string,number[]>={bed:[1.6,2,.6],nightstand:[.5,.4,.55],wardrobe:[1.1,.5,1.8],dresser:[1,.45,.85],table:[.5,.45,.5],cabinet:[1,.5,1.8],lamp:[.25,.25,1.5],rug:[2,3,.02],desk:[1.2,.6,.75],chair:[.55,.55,.85],shelf:[.7,.3,1.4],bench:[1,.4,.45],stool:[.4,.4,.45],ottoman:[.6,.6,.4]};
const query=async(p:any)=>({results:sizes[p.kind]?[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind],price:100,currency:'AMD',styles:['Modern'],colors_image:['beige'],size_status:'confirmed'}]:[]});
test('bedroom and office catalog programs search the real furniture kinds',async()=>{
 const calls:string[]=[];for(const program of ['bedroom','office','entry','living'])await searchRoomCatalog(program,['modern'],async p=>{calls.push(p.kind!);return query(p);});
 expect(calls).toEqual(expect.arrayContaining(['desk','wardrobe','dresser','nightstand','bench','stool','ottoman']));
});
for(const storage of ['wardrobe','dresser'])test(`bedroom prefers real nightstands and the explicitly requested ${storage}`,async()=>{
 const result=await designRoom(scene,{room_id:'room',style_request:`Scandinavian bedroom with a ${storage}`,remake:true},query);
 expect(result.candidates).toHaveLength(2);
 for(const c of result.candidates){const kinds=c.ops.flatMap(o=>o.type==='add'?[o.item.kind]:[]);expect(kinds.filter(k=>k==='nightstand')).toHaveLength(2);expect(kinds).toContain(storage);expect(kinds).not.toContain('table');expect(kinds).not.toContain('cabinet');}
});
test('office makes two complete compositions with a real desk and correctly oriented chair',async()=>{
 const office={...scene,rooms:[{...scene.rooms[0]!,name:'Office'}]};
 const result=await designRoom(office,{room_id:'room',style_request:'modern office',remake:true},query);
 expect(result.candidates).toHaveLength(2);
 for(const c of result.candidates){const items=c.ops.flatMap(o=>o.type==='add'?[o.item]:[]);expect(items.map(i=>i.kind)).toEqual(expect.arrayContaining(['desk','chair','lamp','shelf']));expect(c.composition.pass).toBe(true);const chair=items.find(i=>i.kind==='chair')!;const wrong={...office,items:items.map(i=>i===chair?{...i,rot:(i.rot+180)%360}:i)};expect(scoreComposition(wrong,'room',{program:'office'}).issues.map(i=>i.code)).toContain('work_seat_facing');}
});
test('bedroom can replace a removed wardrobe with a dresser',async()=>{
 const result=await designRoom(scene,{room_id:'room',style_request:'modern bedroom without a wardrobe',remake:true},query);
 expect(result.candidates).toHaveLength(2);
 expect(result.candidates[0]!.ops.flatMap(o=>o.type==='add'?[o.item.kind]:[])).toContain('dresser');
});
test('an explicit desk request cannot be satisfied by a generic table',async()=>{
 const office={...scene,rooms:[{...scene.rooms[0]!,name:'Office'}]};
 const result=await designRoom(office,{room_id:'room',style_request:'modern office with a desk',remake:true},async p=>p.kind==='desk'?{results:[]}:query(p));
 expect(result.candidates).toHaveLength(0);
});
test('office does not restore an excluded work surface or work seat role',async()=>{
 const office={...scene,rooms:[{...scene.rooms[0]!,name:'Office'}]};
 for(const role of ['work_surface','work_seat']){
  const result=await designRoom(office,{room_id:'room',style_request:'modern office',remake:true,excluded_roles:[role]},query);
  expect(result.candidates).toHaveLength(0);
 }
});
test('replace wardrobe with dresser follows the positive replacement kind',async()=>{
 const result=await designRoom(scene,{room_id:'room',style_request:'replace wardrobe with dresser and remake the modern bedroom',remake:true},query);
 expect(result.candidates).toHaveLength(2);
 const kinds=result.candidates[0]!.ops.flatMap(o=>o.type==='add'?[o.item.kind]:[]);expect(kinds).toContain('dresser');expect(kinds).not.toContain('wardrobe');
});
test('a work-height fallback table is offered only when the customer did not require a desk',async()=>{
 const office={...scene,rooms:[{...scene.rooms[0]!,name:'Office'}]};const calls:string[]=[];
 const fallback=async(p:any)=>{if(p.kind==='table'){calls.push(p.text);return {results:[{id:'work-table',kind:'table',name:'Work table',size_m:[1.2,.6,.75],price:100,currency:'AMD',styles:['Modern'],colors_image:['beige'],size_status:'confirmed'}]};}return p.kind==='desk'?{results:[]}:query(p);};
 const allowed=await designRoom(office,{room_id:'room',style_request:'modern office',remake:true},fallback);expect(allowed.candidates).toHaveLength(2);expect(calls).toContain('work table writing table');
 const exact=await designRoom(office,{room_id:'room',style_request:'modern office with a desk',remake:true},fallback);expect(exact.candidates).toHaveLength(0);
});
