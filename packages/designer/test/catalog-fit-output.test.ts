import {test,expect} from 'vitest';
import {searchCatalog} from '../src/catalog.js';
test('checked catalog slot identities survive the model tool boundary',async()=>{
 const slot={id:'slot-one',room_id:'living',ops:[],score:1};
 const result=await searchCatalog({kind:'chair'},async()=>({results:[{id:'abo:chair',kind:'chair',name:'Chair',size_m:[.5,.5,.8],price:10000,currency:'AMD',fit_slots:[slot]}]}));
 expect(result.results[0]?.fit_slots).toEqual([slot]);
});
