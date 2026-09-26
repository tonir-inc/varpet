import {expect,test} from 'vitest';
import {createDesignerHttpAdapter} from '../../../apps/editor/src/adapters/designer-http.js';
import type {AgentProposal,CatalogAsset,SceneDocument} from '../../../apps/editor/src/contracts.js';

const owned:CatalogAsset={id:'chair-asset',name:'Chair',category:'Seating',kind:'chair',dimensions:[.5,.8,.5],color:'#886644',price:0,source:{type:'procedural'}};
const found:CatalogAsset={id:'abo:B0NEWCHAIR',name:'Catalog chair',category:'chair',kind:'chair',dimensions:[.5,.8,.5],color:'#886644',price:45000,
  source:{type:'gltf',url:'https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/R/B0NEWCHAIR.glb'}};
const scene=():SceneDocument=>({format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',rooms:[{id:'room',name:'Room',polygon:[[0,0],[6,0],[6,6],[0,6]],color:'#ffffff'}],walls:[],objects:[{id:'chair',name:'Chair',assetId:'chair-asset',position:[1,0,1],rotation:0,scale:[1,1,1]}]});
const adding=(assetId:string):AgentProposal=>({id:'proposal-1',title:'Add a chair',description:'A checked furniture layout.',command:{id:'command-1',label:'Add chair',source:'designer',baseRevision:7,
  operations:[{type:'add',object:{id:'new-chair',name:'Catalog chair',assetId,position:[3,0,3],rotation:0,scale:[1,1,1]}}]}});
const respond=(proposal:AgentProposal)=>async()=>new Response(JSON.stringify({type:'proposal',conversationId:'c1',proposal,metrics:{}})+'\n',{headers:{'Content-Type':'application/x-ndjson'}});

test('a purchase the request did not carry is resolved by id before the proposal is checked',async()=>{
  const asked:string[][]=[];
  const adapter=createDesignerHttpAdapter({catalog:[owned],fetch:respond(adding(found.id)),resolveAssets:async ids=>{asked.push(ids);return [found];}});
  expect(await adapter.propose(scene(),7)).toEqual(adding(found.id));
  expect(asked).toEqual([[found.id]]);
});

test('known purchases need no lookup, and an id the catalog cannot supply is still refused',async()=>{
  const never=async()=>{throw new Error('no lookup expected');};
  await expect(createDesignerHttpAdapter({catalog:[owned,found],fetch:respond(adding(found.id)),resolveAssets:never}).propose(scene(),7)).resolves.toEqual(adding(found.id));
  await expect(createDesignerHttpAdapter({catalog:[owned],fetch:respond(adding(found.id)),resolveAssets:async()=>[]}).propose(scene(),7)).rejects.toThrow(/unknown catalog asset/i);
  await expect(createDesignerHttpAdapter({catalog:[owned],fetch:respond(adding(found.id))}).propose(scene(),7)).rejects.toThrow(/unknown catalog asset/i);
  const other={...found,id:'abo:SOMETHING-ELSE'};
  await expect(createDesignerHttpAdapter({catalog:[owned],fetch:respond(adding(found.id)),resolveAssets:async()=>[other]}).propose(scene(),7)).rejects.toThrow(/unknown catalog asset/i);
});

test('a failed lookup rejects with a plain message, not the catalog error',async()=>{
  const adapter=createDesignerHttpAdapter({catalog:[owned],fetch:respond(adding(found.id)),resolveAssets:async()=>{throw new Error('connect ECONNREFUSED 100.107.246.46');}});
  const error:Error=await adapter.propose(scene(),7).then(()=>{throw new Error('expected a rejection');},value=>value as Error);
  expect(error.message).toMatch(/catalog/i);expect(error.message).not.toMatch(/100\.107|ECONNREFUSED/);
});
