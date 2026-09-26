import {test,expect} from 'vitest';
import {designRoom} from '../src/taste/design.js';
import type {Scene} from '../src/scene.js';
const scene:Scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]]}],walls:[],openings:[],items:[],fixed:[]};
const sizes:Record<string,number[]>={sofa:[2,.85,.8],chair:[.8,.8,.8],rug:[3,3,.02],lamp:[.3,.3,1.4],table:[1,.5,.4],shelf:[1,.3,1.2]};
const query=async(p:any)=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind],price:100,currency:'AMD',size_status:'confirmed',styles:['Scandinavian'],colors_image:['beige']}]});
test('style redesign produces two distinct checked complete candidates from program catalog',async()=>{
 const result=await designRoom(scene,{room_id:'living',style_request:'minimalistic and cozy',remake:true},query);
 expect(result.candidates).toHaveLength(2);expect(result.candidates[0]!.ops).not.toEqual(result.candidates[1]!.ops);
 expect(result.candidates.every(c=>c.checks.ok&&c.composition.pass)).toBe(true);
 expect(scene.items).toEqual([]);expect(result.selected_id).toBe(result.candidates[0]!.id);
});
test('catalog failure and impossible room do not invent a candidate',async()=>{
 const missing=await designRoom(scene,{room_id:'living',style_request:'modern'},async()=>({results:[]}));expect(missing.candidates).toEqual([]);expect(missing.reason).toMatch(/catalog/i);
 const tiny={...scene,rooms:[{id:'living',polygon:[[0,0],[1,0],[1,1],[0,1]] as [number,number][]}]};
 const result=await designRoom(tiny,{room_id:'living',style_request:'minimalist'},query);expect(result.candidates).toEqual([]);
});
test('remake respects kept furniture and scopes deletions to the requested room',async()=>{
 const owned={id:'keep',kind:'plant',name:'plant',room_id:'living',pos:[.5,.5] as [number,number],rot:0,size:[.2,.2,.4] as [number,number,number],keep:true};
 const result=await designRoom({...scene,items:[owned]},{room_id:'living',style_request:'minimalist',remake:true},query);
 expect(result.candidates.flatMap(c=>c.ops).some(op=>op.type==='remove'&&op.id==='keep')).toBe(false);
});
test('explicit no rug or lamps does not require those catalog categories',async()=>{
 const result=await designRoom(scene,{room_id:'living',style_request:'minimalist',excluded_roles:['rug','light']},async p=>['rug','lamp'].includes(p.kind!)?{results:[]}:query(p));
 expect(result.candidates).toHaveLength(2);expect(result.candidates[0]!.ops.some(op=>op.type==='add'&&['rug','lamp'].includes(op.item.kind))).toBe(false);
});
test('remaking a previous taste plan allocates fresh IDs and editor-range rotations',async()=>{
 const first=await designRoom(scene,{room_id:'living',style_request:'minimalist',remake:true},query);
 const owned={...scene,items:first.candidates[0]!.ops.flatMap(op=>op.type==='add'?[op.item]:[])};
 const next=await designRoom(owned,{room_id:'living',style_request:'minimalist',remake:true},query);
 expect(next.candidates).toHaveLength(2);
 for(const candidate of next.candidates)for(const op of candidate.ops)if(op.type==='add'){expect(owned.items.some(i=>i.id===op.item.id)).toBe(false);expect(op.item.rot).toBeGreaterThanOrEqual(0);expect(op.item.rot).toBeLessThan(360);}
});
test('catalog product titles cannot overflow the editor object-name contract',async()=>{
 const result=await designRoom(scene,{room_id:'living',style_request:'minimalist'},async p=>{const r=await query(p);r.results[0]!.name='Long catalog title '.repeat(20);return r;});
 expect(result.candidates).toHaveLength(2);
 expect(result.candidates.flatMap(c=>c.ops).every(op=>op.type!=='add'||op.item.name.length<=120)).toBe(true);
});
test('bedroom style candidates put the headboard on a solid wall with bedside furniture',async()=>{
 const bedroom:Scene={...scene,rooms:[{id:'bedroom',name:'Bedroom',polygon:[[0,0],[7,0],[7,6],[0,6]]}],walls:[{id:'north',room_id:'bedroom',a:[0,6],b:[7,6]}]};
 const dimensions:Record<string,number[]>={bed:[1.6,2,.6],table:[.5,.45,.5],lamp:[.25,.25,1.5],cabinet:[1,.5,1.8],rug:[2,3,.02]};
 const result=await designRoom(bedroom,{room_id:'bedroom',style_request:'Scandinavian',remake:true},async p=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:dimensions[p.kind!],price:100,currency:'AMD',size_status:'confirmed',styles:['Scandinavian'],colors_image:['beige']}]}));
 expect(result.candidates).toHaveLength(2);expect(result.candidates.every(c=>c.composition.pass&&c.checks.ok)).toBe(true);
});
test('bedroom exclusions never buy omitted nightstands or lamps',async()=>{
 const bedroom:Scene={...scene,rooms:[{id:'bedroom',name:'Bedroom',polygon:[[0,0],[7,0],[7,6],[0,6]]}],walls:[{id:'north',room_id:'bedroom',a:[0,6],b:[7,6]}]};
 const dimensions:Record<string,number[]>={bed:[1.6,2,.6],cabinet:[1,.5,1.8],rug:[2,3,.02]};
 const result=await designRoom(bedroom,{room_id:'bedroom',style_request:'Scandinavian',remake:true,excluded_roles:['nightstands','bedside_lights']},async p=>({results:dimensions[p.kind!]? [{id:p.kind,kind:p.kind,name:p.kind,size_m:dimensions[p.kind!],price:100,currency:'AMD',size_status:'confirmed',styles:['Scandinavian'],colors_image:['beige']}]:[]}));
 expect(result.candidates).toHaveLength(2);expect(result.candidates.flatMap(c=>c.ops).some(op=>op.type==='add'&&['table','lamp'].includes(op.item.kind))).toBe(false);
});
