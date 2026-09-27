import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'mattress-support-'));
after(() => rm(output, { recursive: true }));
await build({root,ssr:{noExternal:true},configFile:false,publicDir:false,logLevel:'error',build:{ssr:join(root,'src/core/furniture-support.ts'),target:'node22',outDir:output,rolldownOptions:{output:{entryFileNames:'support.mjs'}}}});
const {placeFurniture}=await import(pathToFileURL(join(output,'support.mjs')));
const asset=(id,kind,dimensions,name=id)=>({id,name,kind,dimensions,category:'Test',color:'#ffffff',price:0,source:{type:'procedural'}});
const catalog=[asset('frame','bed',[1.47,1.05,2.15]),asset('low','bed',[1,.25,1.9]),
 asset('mattress','decor',[1.4,.34,1.99],'Double mattress 140x200 cm made up with fitted sheet, duvet and pillows, grey'),asset('book','decor',[.2,.05,.3])];
const scene=()=>({format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',rooms:[{id:'room',name:'Room',color:'#ffffff',polygon:[[0,0],[6,0],[6,6],[0,6]]}],walls:[],
 objects:[{id:'bed',name:'bed',assetId:'frame',position:[3,0,3],rotation:0,scale:[1,1,1]},{id:'low',name:'low',assetId:'low',position:[1,0,1.5],rotation:0,scale:[1,1,1]}]});
const object=(id,assetId,position)=>({id,name:id,assetId,position,rotation:0,scale:[1,1,1]});

test('a mattress lies on the bed frame deck, not at the implied mattress top', () => {
 const placed=placeFurniture(scene(),catalog,object('m','mattress',[3,0,3]),'bed');
 assert.equal(placed.restsOn,'bed');assert.ok(Math.abs(placed.position[1]-.3)<1e-9);
 assert.ok(Math.abs(placeFurniture(scene(),catalog,object('m','mattress',[1,0,1.5]),'low').position[1]-.25)<1e-9);
});
test('other decor on a bed still sits at the implied mattress top', () => {
 assert.ok(Math.abs(placeFurniture(scene(),catalog,object('b','book',[3,0,3]),'bed').position[1]-.55)<1e-9);
});
test('an explicit support the model raycast misses falls back to its catalog box height', () => {
 const miss=()=>null;
 const placed=placeFurniture(scene(),catalog,object('b','book',[3,0,3.5]),'bed',miss);
 assert.equal(placed.restsOn,'bed');assert.ok(Math.abs(placed.position[1]-.55)<1e-9);
 assert.throws(()=>placeFurniture(scene(),catalog,object('b','book',[5.5,0,5.5]),'bed',miss),/No supporting surface on/);
});
