import {test,expect} from 'vitest';
import type {CatalogAsset} from '../../../apps/editor/src/contracts.js';
import type {Scene,Item} from '../src/scene.js';
import {prepareFastRequest,selectFastCandidate,SceneAnalysisCache,type Candidate,type SlotQuery} from '../src/fast-path.js';
const room=():Scene=>({rooms:[{id:'room',name:'Living room',polygon:[[0,0],[10,0],[10,10],[0,10]]}],walls:[],openings:[],items:[],fixed:[]});
const asset=(id:string,kind:CatalogAsset['kind'],name:string):CatalogAsset=>({id,kind,name,category:'Furniture',dimensions:[.5,.5,.5],price:1000,color:'#888888',source:{type:'procedural'}});
test.each([['table','Coffee table'],['cabinet','Wardrobe']] as const)('broad %s requests accept available subtypes', (kind,name)=>{
  const result=prepareFastRequest(room(),`Add a ${kind} to the living room`,[asset('available',kind,name)]);
  expect(result.type).toBe('candidates');
});
test('every furnishing choice retains its own exact broad-kind intent',()=>{
  const scene=room();scene.rooms[0]!.name='Bedroom';
  scene.items=[{id:'bed',room_id:'room',kind:'bed',name:'Bed',pos:[2,2],rot:0,size:[1.6,2,.5],keep:true},
    {id:'wardrobe',room_id:'room',kind:'wardrobe',name:'Wardrobe',pos:[8,8],rot:0,size:[1,1,2],keep:true}];
  const catalog=[asset('table-nightstand','table','Bedside table'),asset('cabinet-nightstand','cabinet','Nightstand')];
  class SingleSlot extends SceneAnalysisCache {
    override slots(input:Scene,assets:readonly CatalogAsset[],query:SlotQuery):Candidate[]{
      const a=assets.find(a=>a.id===query.catalogId)!,n=input.items.length;
      const item:Item={id:`new-${n}`,room_id:'room',kind:a.kind,name:a.name,pos:[2+(n-2)*2,5],rot:0,size:[.5,.5,.5],keep:false,sku:a.id,price:a.price};
      return [{id:`${a.id}-${n}`,catalog_ids:[a.id],ops:[{type:'add',item}],score:1,scores:{daylight:0,zoning:0,facing:0,open_floor:0},description:'Checked bedside option'}];
    }
  }
  const prepared=prepareFastRequest(scene,'Furnish the bedroom: a double bed, two nightstands and a wardrobe',catalog,new SingleSlot());
  expect(prepared.type).toBe('candidates');
  if(prepared.type!=='candidates')return;
  expect(prepared.candidates.some(c=>new Set(c.ops.flatMap(o=>o.type==='add'?[o.item.kind]:[])).size===2)).toBe(true);
  for(const c of prepared.candidates)expect(selectFastCandidate(scene,prepared,{slot_id:c.id,catalog_ids:c.catalog_ids}).ok).toBe(true);
});
