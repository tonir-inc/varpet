import {test,expect} from 'vitest';
const modules=import.meta.glob('../src/catalog-fit-worker.ts',{eager:true});
test('fit worker obeys a hard process budget while the caller remains responsive',async()=>{
 const api=Object.values(modules)[0] as any;expect(api).toBeDefined();
 const pool=new api.FitPool({budgetMs:20,maxConcurrent:1});let responsive=false;
 const pending=pool.fit({scene:{rooms:[],walls:[],openings:[],items:[],fixed:[]},rows:[],catalog:[]});
 setTimeout(()=>{responsive=true;},0);
 await expect(pool.fit({scene:{},rows:[{id:'other'}],catalog:[]})).rejects.toThrow('busy');
 const result=await pending;
 expect(responsive).toBe(true);expect(result.truncated).toBe(true);expect(result.results).toEqual([]);expect(pool.active).toBe(0);
});
