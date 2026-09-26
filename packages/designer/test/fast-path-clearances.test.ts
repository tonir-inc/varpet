import {test,expect} from 'vitest';
import {parseScene} from '../src/adapter.js';
import {SceneAnalysisCache} from '../src/fast-path.js';
import type {CatalogAsset} from '../../../apps/editor/src/contracts.js';
test('a catalog wardrobe keeps storage clearance even though the editor kind is cabinet',()=>{
  const scene=parseScene({rooms:[{id:'r',name:'Bedroom',polygon:[[0,0],[3,0],[3,3],[0,3]]}],
    walls:[{id:'s',room_id:'r',a:[0,0],b:[3,0],thickness:.2},{id:'e',room_id:'r',a:[3,0],b:[3,3],thickness:.2},
      {id:'n',room_id:'r',a:[3,3],b:[0,3],thickness:.2},{id:'w',room_id:'r',a:[0,3],b:[0,0],thickness:.2}],openings:[],items:[],fixed:[]});
  const catalog:CatalogAsset[]=[{id:'wardrobe',kind:'cabinet',name:'Wardrobe',category:'Storage',dimensions:[2.2,2,2.2],color:'#ffffff',price:50000,source:{type:'procedural'}}];
  expect(new SceneAnalysisCache().slots(scene,catalog,{roomId:'r',catalogId:'wardrobe'})).toHaveLength(0);
});
