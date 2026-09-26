import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'tv-support-'));
after(() => rm(output, { recursive: true }));
await build({root,ssr:{noExternal:true},configFile:false,publicDir:false,logLevel:'error',build:{ssr:join(root,'src/core/store.ts'),target:'node22',outDir:output,rolldownOptions:{output:{entryFileNames:'store.mjs'}}}});
const {EditorStore}=await import(pathToFileURL(join(output,'store.mjs')));
const asset=(id,kind,dimensions)=>({id,name:id,kind,dimensions,category:'Test',color:'#ffffff',price:0,source:{type:'procedural'}});
const catalog=[asset('stand','cabinet',[1.5,.5,.45]),asset('tv55','tv',[1.23,.76,.12]),asset('wall-tv','tv',[2.4,1.4,.1])];
const scene=()=>({format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',rooms:[{id:'room',name:'Room',color:'#ffffff',polygon:[[0,0],[6,0],[6,6],[0,6]]}],walls:[],objects:[]});
const object=(id,assetId,position)=>({id,name:id,assetId,position,rotation:0,scale:[1,1,1]});
const apply=(store,operations)=>store.execute({id:`c${store.revision}`,label:'Place',source:'designer',baseRevision:store.revision,operations},true);

test('a flat-screen TV rests on its TV unit and follows it',()=>{
 const s=new EditorStore(scene(),catalog);
 assert.equal(apply(s,[{type:'add',object:object('stand','stand',[3,0,1])},{type:'add',object:object('tv','tv55',[3,0,1]),on:'stand'}]).ok,true);
 const tv=s.scene.objects.find(o=>o.id==='tv');assert.equal(tv.restsOn,'stand');assert.ok(Math.abs(tv.position[1]-.5)<1e-9);
 assert.equal(apply(s,[{type:'update',id:'stand',patch:{position:[2,0,1]}}]).ok,true);
 assert.equal(s.scene.objects.find(o=>o.id==='tv').position[0],2);
});
test('an oversized TV is still refused as a furniture load',()=>{
 const s=new EditorStore(scene(),catalog);
 assert.equal(apply(s,[{type:'add',object:object('stand','stand',[3,0,1])},{type:'add',object:object('tv','wall-tv',[3,0,1]),on:'stand'}]).ok,false);
});
