import {test,expect} from 'vitest';
import {designRoom} from '../src/taste/design.js';
import {scoreComposition} from '../src/taste/composition.js';
import {searchRoomCatalog} from '../src/taste/catalog.js';
import type {Scene} from '../src/scene.js';
const scene:Scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]]}],walls:[],openings:[],items:[],fixed:[]};
const sizes:Record<string,number[]>={sofa:[2,.85,.8],chair:[.8,.8,.8],rug:[3,3,.02],lamp:[.3,.3,1.4],table:[.5,.5,.4],shelf:[1,.3,1.2]};
const tags:Record<string,Record<string,string[]>>={industrial:{sofa:['Modern'],chair:['Modern'],rug:['Modern'],lamp:['Modern'],table:['Industrial'],shelf:['Industrial']},boho:{sofa:['Modern'],chair:['Rustic'],rug:['Bohemian'],lamp:['Modern'],table:['Rustic'],shelf:['Rustic']}};
function query(style:string,calls:any[]=[]){return async(p:any)=>{calls.push(p);return {results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind],price:100,currency:'AMD',size_status:'confirmed',styles:tags[style]![p.kind],colors_image:['beige']}]};};}
for(const style of ['industrial','boho'])test(`${style} composes compatible roles without demanding identical product tags`,async()=>{
 const calls:any[]=[];const result=await designRoom(scene,{room_id:'living',style_request:style,remake:true},query(style,calls));
 expect(result.candidates).toHaveLength(2);expect(result.candidates.every(c=>c.composition.pass&&c.checks.ok)).toBe(true);
 const catalog=Object.fromEntries(Object.values(result.catalog.products).flat().map(p=>[p.sku,p]));
 const after={...scene,items:result.candidates[0]!.ops.flatMap(o=>o.type==='add'?[o.item]:[])};
 const signature=style==='boho'?'rug':'table';
 const withoutSignature={...catalog,[signature]:{...catalog[signature]!,styles:['Modern'],styles_inferred:[]}};
 expect(scoreComposition(after,'living',{program:'living',styles:[style],catalog:withoutSignature}).issues.map(i=>i.code)).toContain('style_signature');
 const unrelated={...catalog,chair:{...catalog.chair!,styles:['Traditional'],styles_inferred:[]}};
 expect(scoreComposition(after,'living',{program:'living',styles:[style],catalog:unrelated}).issues.map(i=>i.code)).toContain('style_consistency');
 expect(calls.find(p=>p.kind==='lamp').styles).toEqual(['Modern']);
 if(style==='boho'){expect(calls.find(p=>p.kind==='sofa').styles).toEqual(['Modern']);expect(calls.find(p=>p.kind==='rug').styles).toEqual(['Bohemian']);}
});
test('a boho name cannot substitute for catalog style evidence or a compatible palette',async()=>{
 const result=await searchRoomCatalog('living',['boho'],async p=>({results:[{id:p.kind,kind:p.kind,name:'Perfect Bohemian furniture',size_m:sizes[p.kind!],styles:['Traditional'],colors_image:['purple']}]}));
 expect(Object.values(result.products).flat()).toEqual([]);
});
test('industrial focal storage uses a freestanding-sized unit instead of a tiny wall rack on the floor',async()=>{
 const base=query('industrial');
 const result=await designRoom(scene,{room_id:'living',style_request:'industrial',remake:true},async p=>{
  const r=await base(p);if(p.kind==='shelf')r.results.unshift({...r.results[0]!,id:'wall-rack',size_m:[.56,.14,.33]});return r;
 });
 expect(result.candidates).toHaveLength(2);
 expect(result.candidates.flatMap(c=>c.ops).filter(o=>o.type==='add'&&o.item.kind==='shelf').every(o=>o.type==='add'&&o.item.sku!=='wall-rack')).toBe(true);
});
for(const style of ['industrial','boho'])test(`${style} living signatures do not make bedrooms impossible`,async()=>{
 const bedroom:Scene={...scene,rooms:[{id:'bedroom',name:'Bedroom',polygon:[[0,0],[7,0],[7,6],[0,6]]}],walls:[{id:'north',room_id:'bedroom',a:[0,6],b:[7,6]}]};
 const dimensions:Record<string,number[]>={bed:[1.6,2,.6],table:[.5,.45,.5],lamp:[.25,.25,1.5],cabinet:[1,.5,1.8],rug:[2,3,.02]};
 const result=await designRoom(bedroom,{room_id:'bedroom',style_request:style,remake:true},async p=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:dimensions[p.kind!],price:100,currency:'AMD',styles:[style==='boho'?'Bohemian':'Industrial'],colors_image:['beige']}]}));
 expect(result.candidates).toHaveLength(2);
});
test('explicit signature-role exclusions retain style identity in the remaining pieces',async()=>{
 const industrial=await designRoom(scene,{room_id:'living',style_request:'industrial',excluded_roles:['focal_point']},query('industrial'));
 expect(industrial.candidates).toHaveLength(2);expect(industrial.candidates.flatMap(c=>c.ops).some(o=>o.type==='add'&&o.item.kind==='shelf')).toBe(false);
 const neutral=await designRoom(scene,{room_id:'living',style_request:'boho',excluded_roles:['rug']},query('boho'));
 expect(neutral.candidates).toHaveLength(0);
 const base=query('boho');const boho=await designRoom(scene,{room_id:'living',style_request:'boho',excluded_roles:['rug']},async p=>{const r=await base(p);if(p.kind==='chair')r.results[0]!.styles=['Bohemian'];return r;});
 expect(boho.candidates).toHaveLength(2);expect(boho.candidates.flatMap(c=>c.ops).some(o=>o.type==='add'&&o.item.kind==='rug')).toBe(false);
});
