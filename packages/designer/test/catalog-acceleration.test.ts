import {test,expect} from 'vitest';
import type {Scene} from '../src/scene.js';
const modules=import.meta.glob('../src/catalog-acceleration.ts',{eager:true});
function api():any{const value=Object.values(modules)[0];expect(value,'catalog accelerator exists').toBeDefined();return value;}
const product=(n:number)=>({id:`abo:${n}`,kind:'sofa',name:`Sofa ${n}`,size_m:[1,.7,.8],size_status:'confirmed',price:1000+n*1000,currency:'AMD',styles:['Modern'],glb_url:`https://models.example/${n}.glb`,preview_url:`https://models.example/${n}.webp`,wd_swapped:false});
test('search cache shares simultaneous reads, isolates mutations, expires and bounds memory',async()=>{
 let now=0,calls=0;const cache=new (api().SearchCache)(async()=>{calls++;return {results:[product(calls)]};},{ttlMs:10,maxEntries:2,now:()=>now});
 const [a,b]=await Promise.all([cache.query({kind:'sofa',max_w:2}),cache.query({max_w:2,kind:'sofa'})]);
 expect(calls).toBe(1);a.results[0].price=999;expect(b.results[0].price).toBe(2000);
 expect((await cache.query({kind:'sofa',max_w:2})).results[0].price).toBe(2000);
 await cache.query({kind:'sofa',max_w:3});expect(calls).toBe(2);
 now=11;await cache.query({kind:'sofa',max_w:2});expect(calls).toBe(3);
 await cache.query({kind:'chair'});await cache.query({kind:'bed'});expect(cache.size).toBeLessThanOrEqual(2);
 cache.clear();expect(cache.size).toBe(0);
});
test('errors and invalid backend replies are not cached',async()=>{
 let count=0;const cache=new (api().SearchCache)(async()=>{if(++count===1)throw new Error('offline');if(count===2)return {};return {results:[]};});
 await expect(cache.query({kind:'sofa'})).rejects.toThrow('offline');await expect(cache.query({kind:'sofa'})).rejects.toThrow();
 expect((await cache.query({kind:'sofa'})).results).toEqual([]);expect(count).toBe(3);
});
test('shortlist requires confirmed dimensions and verified GLB, respects style and spans prices',async()=>{
 const rows=Array.from({length:30},(_,n)=>product(n));
 rows.push({...product(100),size_status:'estimated'},{...product(101),styles:['Traditional']},{...product(102),glb_url:'broken'}, {...product(103),size_m:[0,.5,.5]});
 const selected=await api().curate(rows,'sofa','Modern',async(url:string)=>url!=='broken',20);
 expect(selected).toHaveLength(20);expect(selected.map((r:any)=>r.id)).toContain('abo:0');expect(selected.map((r:any)=>r.id)).toContain('abo:29');
 expect(selected.every((r:any)=>Number(r.id.split(':')[1])<30)).toBe(true);
 expect(await api().curate([], 'sofa','Modern',async()=>true,20)).toEqual([]);
});
test('fit list includes only products with a checked slot and never mutates the room',()=>{
 const scene:Scene={rooms:[{id:'r',name:'Living room',polygon:[[0,0],[4,0],[4,4],[0,4]]}],walls:[],openings:[],items:[],fixed:[]};
 const snapshot=JSON.stringify(scene),small=product(1),large={...product(2),size_m:[10,10,1]};
 const result=api().fitProducts(scene,[large,small],undefined,4);
 expect(result.map((r:any)=>r.id)).toEqual([small.id]);expect(result[0].fit_slots.length).toBeGreaterThan(0);
 expect(JSON.stringify(scene)).toBe(snapshot);expect(api().fitProducts(scene,[small],'missing',4)).toEqual([]);
});
