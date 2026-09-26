import {test,expect} from 'vitest';
import {searchCatalog} from '../src/catalog.js';
import {searchRoomCatalog} from '../src/taste/catalog.js';
test('bounded fit exhaustion is explicit and never presented as absent inventory',async()=>{
 const result=await searchCatalog({kind:'sofa'},async()=>({results:[],fit_budget_exhausted:true,timing:{seconds:4,cache_hit:true}}));
 expect(result.status).toBe('unavailable');expect(result.reason).toMatch(/budget|incomplete/i);expect(result.reason).not.toMatch(/No sized/);
 expect((result as any).fit_budget_exhausted).toBe(true);expect((result as any).timing.seconds).toBe(4);
});
test('style searches distinguish incomplete fits from known missing inventory',async()=>{
 const result=await searchRoomCatalog('living',['modern'],async()=>({results:[],fit_budget_exhausted:true}));
 expect(result.unavailable_kinds.length).toBeGreaterThan(0);expect(result.missing_kinds).toEqual([]);
});
