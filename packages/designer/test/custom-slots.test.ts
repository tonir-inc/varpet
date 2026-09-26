import { expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import type { Scene } from '../src/scene.js';
const room: Scene = {rooms:[{id:'room',polygon:[[0,0],[5,0],[5,5],[0,5]]}],walls:[],openings:[],items:[],fixed:[]};
async function connect(root: string, turnId='t1', scene=room) {
  const server=createServer(scene,{buildsDir:root,conversationId:'c1',turnId,catalogQuery:async()=>({results:[]})} as any);
  const client=new Client({name:'slots-test',version:'1'}); const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  const call=async(name:string,args:Record<string,unknown>={})=>{const reply=await client.callTool({name,arguments:args});const text=(reply.content as {text:string}[])[0]!.text; let data;try{data=JSON.parse(text);}catch{data={message:text};}return {error:reply.isError===true,data};};
  return {client,server,call,close:async()=>{await client.close();await server.close();}};
}
async function setup(run:(connection:Awaited<ReturnType<typeof connect>>,root:string)=>Promise<void>) {
  const root=await mkdtemp(join(tmpdir(),'varpet-slots-')); const c=await connect(root);
  try {await run(c,root);}finally{await c.close();await rm(root,{recursive:true,force:true});}
}
const reserve={kind:'cabinet',size_wdh_m:[.5,.4,.65],note:'Generic white bedside cabinet on wood legs'};
const search=async(c:Awaited<ReturnType<typeof connect>>)=>c.call('search_catalog',{kind:'cabinet',max_w:.5,max_d:.4,max_h:.65});
test('configured MCP exposes slots, requires catalog search, refuses soft kinds and invalid sizes',async()=>setup(async(c)=>{
  expect((await c.client.listTools()).tools.map(t=>t.name)).toContain('reserve_slot');
  expect((await c.call('reserve_slot',reserve)).error).toBe(true);
  await search(c);
  for(const kind of ['sofa','armchair','chair','bed','upholstered bed'])expect((await c.call('reserve_slot',{...reserve,kind})).error).toBe(true);
  for(const size_wdh_m of [[0,.4,.65],[-1,.4,.65],[.5,.4]])expect((await c.call('reserve_slot',{...reserve,size_wdh_m})).error).toBe(true);
  const r=await c.call('reserve_slot',reserve);expect(r.error).toBe(false);expect(r.data.slotId).toBe('custom-c1-1');
  expect(r.data.asset.dimensions).toEqual([.5,.65,.4]);expect(r.data.asset.kind).toBe('cabinet');expect(r.data.source).toBe('custom');
  expect(r.data.asset.source).toEqual({type:'procedural'});expect(r.data.asset.price).toBeGreaterThan(0);
  expect(r.data.estimate.label).toContain('workshop confirms');
}));
test('three slots per turn persist across MCP restarts, concurrent calls cannot evade the cap',async()=>setup(async(c,root)=>{
  await search(c);const results=await Promise.all(Array.from({length:4},()=>c.call('reserve_slot',reserve)));
  expect(results.filter(r=>!r.error)).toHaveLength(3);
  const resumed=await connect(root);try{await search(resumed);expect((await resumed.call('reserve_slot',reserve)).error).toBe(true);}finally{await resumed.close();}
  const next=await connect(root,'t2');try{await search(next);expect((await next.call('reserve_slot',reserve)).data.slotId).toBe('custom-c1-4');}finally{await next.close();}
  expect((await readdir(join(root,'slots'))).filter(x=>x.endsWith('.json'))).toHaveLength(4);
}));
test('only checked proposed slots queue, duplicate builds are idempotent, dimensions and placement stay checked',async()=>setup(async(c,root)=>{
  await search(c);const r=await c.call('reserve_slot',reserve);expect(r.error).toBe(false);const slot=r.data;
  expect((await c.call('build_piece',{slotId:slot.slotId})).error).toBe(true);
  expect((await c.call('build_piece',{slotId:'../outside'})).error).toBe(true);
  expect((await c.call('build_piece',{slotId:'custom-c1-99'})).error).toBe(true);
  await c.call('set_intent',{room_id:'room',add:[{kinds:['cabinet'],count:1}]});
  const item={...slot.item,room_id:'room',pos:[2,2],rot:0,keep:false};
  const propose=(item:unknown)=>c.call('propose',{ops:[{type:'add',item}],rationale:'A generic custom cabinet, with an estimate the workshop confirms.'});
  expect((await propose({...item,size:[.4,.4,.65]})).error).toBe(true);
  expect((await propose({...item,price:0})).error).toBe(true);
  expect((await propose({...item,pos:[10,10]})).error).toBe(true);
  const accepted=await propose(item);expect(accepted.error).toBe(false);
  expect(accepted.data.assets).toEqual([slot.asset]);
  expect((await c.call('build_piece',{slotId:slot.slotId})).data).toMatchObject({slotId:slot.slotId,state:'queued'});
  expect((await c.call('build_piece',{slotId:slot.slotId})).error).toBe(false);
  expect((await readdir(join(root,'requests'))).filter(x=>x.endsWith('.json'))).toEqual([slot.slotId+'.json']);
  expect(JSON.parse(await readFile(join(root,'slots',slot.slotId+'.json'),'utf8')).size_wdh_m).toEqual([.5,.4,.65]);
}));
test('custom slot on real Avani demo passes normal placement, bridge and EditorStore approval with fixed W/H/D',async()=>{
  const root=await mkdtemp(join(tmpdir(),'varpet-avani-slot-')), scene=editorToDesigner(demoScene,{catalog:localCatalog});
  const c=await connect(root,'t1',scene);try {
    await search(c);const r=await c.call('reserve_slot',{...reserve,size_wdh_m:[.3,.25,.4]});expect(r.error).toBe(false);const slot=r.data;
    const placed=await c.call('place',{room_id:'room-living',item:slot.item,relations:[{type:'against_wall'}]});expect(placed.error).toBe(false);expect(placed.data.candidates.length).toBeGreaterThan(0);
    await c.call('set_intent',{room_id:'room-living',add:[{kinds:['cabinet'],count:1}]});
    const checked=await c.call('propose',{ops:[placed.data.candidates[0].op],rationale:'Add one small custom cabinet; the workshop confirms the estimate.'});expect(checked.error).toBe(false);
    const catalog=[...localCatalog,slot.asset];const proposal=proposalToEditor(checked.data.proposal,demoScene,0,{catalog,catalogCurrency:'AMD'});
    await writeFile(join(root,'proposal.json'),JSON.stringify(checked.data.proposal));
    await writeFile(join(root,'scene.json'),JSON.stringify(demoScene));await writeFile(join(root,'custom.json'),JSON.stringify([slot.asset]));
    execFileSync(fileURLToPath(new URL('../node_modules/.bin/tsx',import.meta.url)),[fileURLToPath(new URL('../src/editor-bridge.ts',import.meta.url)),'to-command',join(root,'proposal.json'),join(root,'scene.json'),'0',join(root,'command.json'),'--custom-assets',join(root,'custom.json'),'--currency','AMD']);
    expect(JSON.stringify(JSON.parse(await readFile(join(root,'command.json'),'utf8')).command.operations)).toBe(JSON.stringify(proposal.command.operations));
    const store=new EditorStore(demoScene,catalog);expect(store.execute(proposal.command,false).ok).toBe(false);expect(store.execute(proposal.command,true).ok).toBe(true);
    expect(store.scene.objects.find(o=>o.assetId===slot.slotId)?.scale).toEqual([1,1,1]);expect(store.scene.objects.length).toBe(demoScene.objects.length+1);
  } finally {await c.close();await rm(root,{recursive:true,force:true});}
},20000);
