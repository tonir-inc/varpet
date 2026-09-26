import {test,expect} from 'vitest';
import {proposalCatalog} from './komitas-assets.js';
import {localCatalog} from '../../../apps/editor/src/core/demo.js';
test('new purchase identities are hydrated with the editor converter; existing identities stay fixed',async()=>{
  const product={id:'abo:test',name:'Desk',kind:'desk',currency:'AMD',price:100,size_m:[1,.5,.75],license:'CC BY 4.0',glb_url:'https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/test.glb'};
  const proposal={command:{operations:[{type:'add',object:{assetId:'abo:test'}},{type:'add',object:{assetId:localCatalog[0]!.id}}]}};
  let asked:string[]=[];
  const result=await proposalCatalog(proposal,localCatalog,async ids=>{asked=ids;return[product];});
  expect(asked).toEqual(['abo:test']);expect(result[0]).toBe(localCatalog[0]);
  expect(result.at(-1)).toMatchObject({id:'abo:test',kind:'desk',dimensions:[1,.75,.5]});
  await expect(proposalCatalog(proposal,localCatalog,async()=>[])).rejects.toThrow('unavailable');
});
