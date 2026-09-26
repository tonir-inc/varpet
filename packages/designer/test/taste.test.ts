import {test,expect} from 'vitest';
import {styles,resolveStyles} from '../knowledge/styles/index.js';
import {roomPrograms} from '../knowledge/room-programs.js';
import {scoreComposition,rankCompositions} from '../src/taste/composition.js';
import {searchRoomCatalog} from '../src/taste/catalog.js';
import type {Item,Scene} from '../src/scene.js';
const item=(id:string,kind:string,x:number,y:number,rot=0,size:[number,number,number]=[.8,.8,.8]):Item=>({id,kind,name:id,pos:[x,y],rot,size,room_id:'living',keep:false,sku:id});
const scene=(items:Item[]):Scene=>({rooms:[{id:'living',name:'Living room',polygon:[[0,0],[8,0],[8,7],[0,7]]}],walls:[],openings:[],items,fixed:[]});
const good=()=>scene([item('sofa','sofa',3,4,0,[2,.9,.8]),item('chair','chair',3,1.8,180),item('rug','rug',3,3,0,[3,2.5,.02]),item('table','table',3,3,0,[1,.5,.4]),item('lamp','lamp',4.25,4,0,[.3,.3,1.5]),item('lamp2','lamp',3.65,1.8,0,[.3,.3,1.5]),item('shelf','shelf',3,.5,180,[1,.3,1.2])]);
const metadata=(s:Scene)=>Object.fromEntries(s.items.map(i=>[i.sku!,{styles:['Scandinavian'],colors_image:['beige']} ]));
test('eight styles express furniture choices, and minimalistic cozy blends preserve warmth',()=>{
 expect(Object.keys(styles)).toHaveLength(8);
 for(const style of Object.values(styles)){expect(style.anchor.length).toBeGreaterThan(0);expect(style.materials.length).toBeGreaterThan(0);expect(style.textiles.length).toBeGreaterThan(0);expect(style.lighting.length).toBeGreaterThan(0);expect(style.piece_count.living[0]).toBeGreaterThanOrEqual(5);}
 expect(resolveStyles('minimalistic but also cozy')).toEqual(['minimalist','cozy']);
 expect(resolveStyles('hygge')).toEqual(['cozy']);expect(resolveStyles('nonsense')).toEqual([]);
});
test('programs define complete living and sleeping essentials, not a count minimizer',()=>{
 expect(roomPrograms.living.search_kinds).toEqual(expect.arrayContaining(['sofa','chair','rug','lamp','table','shelf']));
 expect(roomPrograms.bedroom.relations).toContain('headboard_on_solid_wall');
 expect(roomPrograms.bedroom.essentials.map(e=>e.role)).toContain('nightstands');
});
test('Ashot chair row and an empty room fail independent composition checks',()=>{
 const bad=scene([item('c1','chair',.8,2,90),item('c2','chair',.8,4.4,90),item('t','table',.8,3.2,90,[.43,.43,.46])]);
 const score=scoreComposition(bad,'living',{program:'living',styles:['minimalist','cozy'],catalog:metadata(bad)});
 expect(score.pass).toBe(false);expect(score.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['seating_anchor','rug_anchor','seat_light','chair_row','seat_facing']));
 expect(scoreComposition(scene([]),'living',{program:'living'}).score).toBe(0);
});
test('a coherent conversational group beats open floor and supports front-leg rug contact',()=>{
 const s=good(),score=scoreComposition(s,'living',{program:'living',styles:['minimalist','cozy'],catalog:metadata(s)});
 expect(score.pass).toBe(true);expect(score.score).toBeGreaterThanOrEqual(80);
 const bad=scene([item('c1','chair',.8,2,90),item('c2','chair',.8,4.4,90)]);
 expect(rankCompositions([{id:'empty',scene:bad},{id:'cozy',scene:s}],'living',{program:'living',styles:['cozy'],catalog:metadata(s)})[0]!.id).toBe('cozy');
 expect(()=>rankCompositions([{id:'one',scene:s}],'living',{program:'living'})).toThrow(/two/i);
});
test('unknown metadata cannot silently pass style consistency, and incompatible pieces fail',()=>{
 const s=good();expect(scoreComposition(s,'living',{program:'living',styles:['minimalist']}).issues.map(i=>i.code)).toContain('style_unknown');
 const catalog=metadata(s);catalog.chair={styles:['Baroque'],colors_image:['purple']};
 expect(scoreComposition(s,'living',{program:'living',styles:['minimalist'],catalog}).issues.map(i=>i.code)).toContain('style_consistency');
});
test('far seats and a tiny displaced rug fail even when kinds are complete',()=>{
 const s=good();s.items[1]!.pos=[7,1];s.items[2]!.pos=[7,6];s.items[2]!.size=[.5,.5,.02];
 const codes=scoreComposition(s,'living',{program:'living'}).issues.map(i=>i.code);
 expect(codes).toContain('conversation_distance');expect(codes).toContain('rug_anchor');expect(codes).toContain('seat_table');
});
test('search covers the program, filters catalog image colors/styles, and prefers confirmed sizes',async()=>{
 const calls:string[]=[];
 const result=await searchRoomCatalog('living',['minimalist','cozy'],async query=>{
  calls.push(query.kind!);const raw=(id:string,status:string,styles:string[],colors:string[])=>({id,kind:query.kind,name:'Minimalist cozy name is not evidence',size_m:[1,.5,.5],price:100,currency:'AMD',size_status:status,styles,colors_image:colors});
  return {results:[raw('wrong','confirmed',['Baroque'],['purple']),raw('estimated','estimated',['Scandinavian'],['beige']),raw('confirmed','confirmed',['Scandinavian'],['beige'])]};
 });
 expect(calls.sort()).toEqual([...roomPrograms.living.search_kinds].sort());
 for(const group of Object.values(result.products)){expect(group.map(p=>p.sku)).toEqual(['confirmed','estimated']);}
 const empty=await searchRoomCatalog('living',['minimalist'],async()=>({results:[]}));expect(empty.missing_kinds).toContain('sofa');
});
test('explicit customer exclusions waive the associated relationship, not just the item count',()=>{
 const s=good();s.items=s.items.filter(i=>!['rug','lamp','table'].includes(i.kind));
 const codes=scoreComposition(s,'living',{program:'living',excluded_roles:['rug','light','table']}).issues.map(i=>i.code);
 expect(codes).not.toContain('rug_anchor');expect(codes).not.toContain('seat_light');expect(codes).not.toContain('seat_table');
});
test('cozy means a consistent family, not arbitrary independent accepted tags',()=>{
 const s=good(),catalog=metadata(s);catalog.chair={styles:['Rustic'],colors_image:['beige']};
 expect(scoreComposition(s,'living',{program:'living',styles:['cozy'],catalog}).issues.map(i=>i.code)).toContain('style_consistency');
});
test('bedroom roles use maximum matching and a perpendicular wall cannot support a headboard',()=>{
 const s=scene([item('storage','cabinet',6,4),item('n1','table',2,4),item('n2','table',4,4),item('bed','bed',3,3,0,[1.6,2,.6]),item('l1','lamp',1.5,4),item('l2','lamp',4.5,4)]);
 s.walls=[{id:'badwall',room_id:'living',a:[3,4],b:[3,6]}];
 const codes=scoreComposition(s,'living',{program:'bedroom'}).issues.map(i=>i.code);
 expect(codes).not.toContain('storage');expect(codes).not.toContain('nightstands');expect(codes).toContain('headboard_on_solid_wall');
});
test('image-derived catalog style tags qualify a functional lamp without reading its name',async()=>{
 const result=await searchRoomCatalog('living',['minimalist','cozy'],async q=>({results:[{id:'inferred',kind:q.kind,name:'ignore this title',size_m:[.4,.4,1.5],price:100,currency:'AMD',styles:['Floor Lamp'],style_astra:['modern'],colors_image:['beige']}]}));
 expect(result.products.lamp!.map(p=>p.sku)).toContain('inferred');
});
test('room catalog queries bound concurrency to avoid flooding the shared service',async()=>{
 let active=0,peak=0;
 await searchRoomCatalog('living',['minimalist'],async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return {results:[]};});
 expect(peak).toBeLessThanOrEqual(2);
});
test('transient catalog outages get one bounded retry; persistent outages stay explicit',async()=>{
 const calls:Record<string,number>={};
 const recovered=await searchRoomCatalog('living',['minimalist'],async q=>{const n=calls[q.kind!]=(calls[q.kind!]??0)+1;if(n===1)throw new Error('temporary outage');return {results:[{id:q.kind,kind:q.kind,name:'item',size_m:[1,.5,.5],price:100,currency:'AMD',styles:['Modern'],colors_image:['beige']}]};});
 expect(recovered.unavailable_kinds).toEqual([]);expect(Object.values(calls)).toEqual([2,2,2,2,2,2]);
 let attempts=0;const unavailable=await searchRoomCatalog('living',['minimalist'],async()=>{attempts++;throw new Error('offline');});
 expect(attempts).toBe(12);expect(unavailable.unavailable_kinds).toHaveLength(6);
});
