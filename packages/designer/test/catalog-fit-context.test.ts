import {test,expect} from 'vitest';
import type {Scene} from '../src/scene.js';
const modules=import.meta.glob('../src/catalog-acceleration.ts',{eager:true});
const api=()=>Object.values(modules)[0] as any;
const scene:Scene={rooms:[{id:'r',polygon:[[0,0],[4,0],[4,4],[0,4]]},{id:'other',polygon:[[5,0],[9,0],[9,4],[5,4]]}],walls:[],openings:[],fixed:[],items:[
 {id:'old',name:'Old bed',room_id:'r',kind:'bed',pos:[2,2],rot:0,size:[3,3,1],keep:false},
 {id:'kept',name:'Kept lamp',room_id:'r',kind:'lamp',pos:[.2,.2],rot:0,size:[.2,.2,1],keep:true},
 {id:'elsewhere',name:'Other chair',room_id:'other',kind:'chair',pos:[6,1],rot:0,size:[.5,.5,1],keep:false}]};
test('remake fit preview removes only authorized movable inventory in the requested room',()=>{
 const before=JSON.stringify(scene);
 expect(api().fitScene(scene,{room_id:'r',remake:true}).items.map((i:any)=>i.id)).toEqual(['kept','elsewhere']);
 expect(api().fitScene(scene,{room_id:'r',remove_ids:['old']}).items.map((i:any)=>i.id)).toEqual(['kept','elsewhere']);
 expect(()=>api().fitScene(scene,{room_id:'r',remove_ids:['kept']})).toThrow();
 expect(()=>api().fitScene(scene,{room_id:'r',remove_ids:['elsewhere']})).toThrow();
 expect(()=>api().fitScene(scene,{remake:true})).toThrow();
 expect(JSON.stringify(scene)).toBe(before);
});
test('supported semantic catalog kinds use the editor bridge mapping and retain exact dimensions',()=>{
 const row={id:'desk',kind:'desk',name:'Desk',size_m:[1,.5,.75],price:1000,currency:'AMD',glb_url:'https://example.com/d.glb'};
 const asset={id:'desk',kind:'table',name:'Desk',dimensions:[1,.75,.5],price:1000,color:'#888888',category:'desk',source:{type:'gltf',url:row.glb_url}};
 expect(api().compatibleProduct(row,[asset])).toBe(true);
 expect(api().compatibleProduct({...row,size_m:[2,.5,.75]},[asset])).toBe(false);
 expect(api().compatibleProduct({...row,price:2000},[asset])).toBe(false);
 const empty={...scene,items:[]};
 expect(api().fitProducts(empty,[row],'r',2,[asset]).map((r:any)=>r.id)).toEqual(['desk']);
});
test('native desk and wardrobe catalog identities stay native through fit selection',()=>{
 for(const kind of ['desk','wardrobe']){
  const row={id:kind,kind,name:kind,size_m:[1,.5,.75],price:1000,currency:'AMD',glb_url:'https://example.com/model.glb'};
  const asset={id:kind,kind,name:kind,dimensions:[1,.75,.5],price:1000,color:'#888888',category:kind,source:{type:'gltf',url:row.glb_url}};
  expect(api().compatibleProduct(row,[asset])).toBe(true);
  const fitted=api().fitProducts({...scene,items:[]},[row],'r',2,[asset]);
  expect(fitted).toHaveLength(1);
  expect(fitted[0].fit_slots[0].ops[0].item.kind).toBe(kind);
 }
});
