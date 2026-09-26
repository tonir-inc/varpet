import {expect,test} from 'vitest';
import type {AgentProposal,CatalogAsset} from '../../../apps/editor/src/contracts.js';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {checkPurchase,CUSTOMER_REQUEST} from './catalog-armchair-smoke.js';

// Measured REST record from localhost:8765/editor/assets on 2026-09-26; no live calls in tests.
const armchair:CatalogAsset={id:'abo:B071J7Q6KD',name:'Amazon Brand – Rivet Revolve Modern Upholstered Armchair with Tapered Legs, 33"W',category:'Living',kind:'chair',dimensions:[.8545,.9267,.8003],color:'#706e6a',price:77000,source:{type:'gltf',url:'https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/D/B071J7Q6KD.glb'}};
const proposal=():AgentProposal=>({id:'purchase',title:'Reading armchair',description:'A catalog armchair by the west window.',command:{id:'purchase',label:'Add armchair',source:'designer',baseRevision:0,operations:[{type:'add',object:{id:'reading-chair',name:armchair.name,assetId:armchair.id,position:[-3.85,0,.65],rotation:0,scale:[1,1,1]}}]}});
test('collector keeps the exact requested customer text',()=>expect(CUSTOMER_REQUEST).toBe('add an armchair for reading by the window'));
test('real catalog armchair applies only to a disposable editor store',()=>{
  const before=structuredClone(demoScene),checked=checkPurchase(demoScene,[...localCatalog,armchair],[armchair],proposal());
  expect(checked.pass).toBe(true);expect(checked.store_result?.ok).toBe(true);expect(checked.added_assets[0]?.asset).toEqual(armchair);
  expect(checked.approval_required).toBe(true);expect(demoScene).toEqual(before);
});
test('a no-op or reused demo chair cannot masquerade as a purchased catalog armchair',()=>{
  const p=proposal();p.command.operations=[{type:'update',id:'sofa',patch:{color:'#112233'}}];
  expect(checkPurchase(demoScene,[...localCatalog,armchair],[armchair],p).pass).toBe(false);
  const reused=proposal();const op=reused.command.operations[0]!;if(op.type==='add')op.object.assetId='chair-clay';
  expect(checkPurchase(demoScene,[...localCatalog,armchair],[armchair],reused).pass).toBe(false);
});
test('stale, resized, distant, or missing remote assets fail purchase evidence',()=>{
  const stale=proposal();stale.command.baseRevision=1;
  const resized=proposal();const add=resized.command.operations[0]!;if(add.type==='add')add.object.scale=[.5,.5,.5];
  const distant=proposal();const move=distant.command.operations[0]!;if(move.type==='add')move.object.position=[-2,0,-.1];
  for(const p of [stale,resized,distant])expect(checkPurchase(demoScene,[...localCatalog,armchair],[armchair],p).pass).toBe(false);
  expect(checkPurchase(demoScene,[...localCatalog,armchair],[],proposal()).pass).toBe(false);
});
