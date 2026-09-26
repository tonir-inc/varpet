import {expect,test,vi,afterEach} from 'vitest';
import type {Scene} from '../src/scene.js';
import {scoreComposition} from '../src/taste/composition.js';
import {designRoom} from '../src/taste/design.js';
import * as layout from '../src/layout.js';
const scene:Scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]]}],walls:[],openings:[],items:[],fixed:[]};
const sizes:Record<string,number[]>={sofa:[2,.85,.8],chair:[.8,.8,.8],rug:[3,3,.02],lamp:[.3,.3,1.4],table:[1,.5,.4],shelf:[1,.3,1.2]};
const query=async(p:any)=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind],price:100,currency:'AMD',size_status:'confirmed',styles:['Scandinavian'],colors_image:['beige']}]});
afterEach(()=>vi.restoreAllMocks());
test('fixed structural objects need no catalog appearance evidence but still obstruct placement',async()=>{
 const fixed={id:'column',kind:'structural',name:'Column',pos:[.5,.5] as [number,number],rot:0,size:[.3,.3,3] as [number,number,number],room_id:'living',keep:true};
 const result=await designRoom({...scene,fixed:[fixed]},{room_id:'living',style_request:'Scandinavian'},query);
 expect(result.candidates.length).toBeGreaterThan(0);
 expect(result.candidates.every(c=>c.composition.pass&&c.checks.ok)).toBe(true);
 const blocked=await designRoom({...scene,fixed:[{...fixed,pos:[4,4],size:[8,8,3]}]},{room_id:'living',style_request:'Scandinavian'},query);
 expect(blocked.candidates).toEqual([]);
});
test('appearance ignores fixed furniture but never hides missing evidence for catalog purchases',()=>{
 const chair={id:'chair',sku:'chair',kind:'chair',name:'Chair',pos:[2,2] as [number,number],rot:0,size:[1,1,1] as [number,number,number],room_id:'living',keep:false};
 const options={program:'living',styles:['Scandinavian'],catalog:{chair:{styles:['Scandinavian'],colors_image:['beige']}}};
 const fixed={...chair,id:'owned',sku:undefined,keep:true};
 expect(scoreComposition({...scene,items:[chair],fixed:[fixed]},'living',options).issues.map(i=>i.code)).not.toContain('style_unknown');
 expect(scoreComposition({...scene,items:[{...chair,sku:'unknown'}]},'living',options).issues.map(i=>i.code)).toContain('style_unknown');
});
test('one surviving fully checked composition is returned, with no-alternative disclosure',async()=>{
 const original=layout.checkLayout;let survivors=0;
 vi.spyOn(layout,'checkLayout').mockImplementation((...args)=>{
  const checked=original(...args);
  if(checked.ok&&++survivors>1)return {...checked,ok:false};
  return checked;
 });
 const result=await designRoom(scene,{room_id:'living',style_request:'Scandinavian'},query);
 expect(result.candidates).toHaveLength(1);
 expect(result.candidates[0]!.checks.ok).toBe(true);
 expect(result.selected_id).toBe(result.candidates[0]!.id);
 expect(result.reason).toMatch(/no alternative/i);
});
test('structure marker excludes structural items even with ordinary kind and SKU',()=>{
 const structure={id:'column',sku:'structural-record',kind:'cabinet',name:'Column',pos:[1,1] as [number,number],rot:0,size:[.2,.2,3] as [number,number,number],room_id:'living',keep:true,structure:{wall_id:'source',bottom_m:0}};
 const furniture={...structure,id:'desk',sku:'desk',kind:'desk',structure:undefined};
 const result=scoreComposition({...scene,items:[structure,furniture]},'living',{program:'office',styles:['modern'],catalog:{desk:{styles:['Modern'],colors_image:['beige']}}});
 expect(result.issues.map(i=>i.code)).not.toContain('style_unknown');
});
test.each(['Bedroom','Office'])('%s retains its only checked composition',async name=>{
 const room={...scene,rooms:[{...scene.rooms[0]!,name}],walls:[{id:'north',room_id:'living',a:[0,8] as [number,number],b:[8,8] as [number,number]}]};
 const dimensions:Record<string,number[]>={...sizes,bed:[1.6,2,.6],nightstand:[.5,.45,.5],wardrobe:[1,.5,1.8],desk:[1.2,.6,.75],lamp:[.25,.25,1.4]};
 const original=layout.checkLayout;let accepted=0;
 vi.spyOn(layout,'checkLayout').mockImplementation((...args)=>{const result=original(...args);return result.ok&&++accepted>1?{...result,ok:false}:result;});
 const result=await designRoom(room,{room_id:'living',style_request:'modern'},async p=>({results:dimensions[p.kind!]? [{id:p.kind,kind:p.kind,name:p.kind,size_m:dimensions[p.kind!],price:100,currency:'AMD',styles:['Modern'],colors_image:['beige']}]:[]}));
 expect(result.candidates).toHaveLength(1);expect(result.candidates[0]!.checks.ok).toBe(true);expect(result.reason).toMatch(/no alternative/i);
});
