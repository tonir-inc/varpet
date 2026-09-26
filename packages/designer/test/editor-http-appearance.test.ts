import {expect,test} from 'vitest';
import {createDesignerHttpAdapter} from '../../../apps/editor/src/adapters/designer-http.js';
import type {AgentProposal,FinishAssignment,FinishMaterial,Operation,SceneDocument} from '../../../apps/editor/src/contracts.js';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {migrateScene} from '../../../apps/editor/src/core/renovation.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';

const material=(id='designer-paint'):FinishMaterial=>({id,name:'Conceptual sage paint',color:'#aabbcc',unit:'m2',unitCost:0,thickness:.0002,wastePercent:0,notes:'Conceptual colour; no supplier or quoted price.'});
const finish=(id='paint-front',entityId='wall-west',surface:FinishAssignment['surface']='wall-front',materialId='designer-paint'):FinishAssignment=>({id,entityId,surface,materialId});
const proposal=(operations:unknown[],revision=7):AgentProposal=>({id:'appearance-proposal',title:'A sage wall',description:'Conceptual colour, without a supplier quote.',command:{id:'appearance-command',label:'Apply appearance',source:'designer',baseRevision:revision,operations:operations as Operation[]}});
function response(value:AgentProposal){
  const bytes=new TextEncoder().encode(JSON.stringify({type:'proposal',conversationId:'appearance',proposal:value})+'\n');let offset=0;
  return new Response(new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+=17));}}),{headers:{'Content-Type':'application/x-ndjson'}});
}
async function accept(input:SceneDocument,operations:unknown[],revision=7){
  return createDesignerHttpAdapter({catalog:localCatalog,fetch:async()=>response(proposal(operations,revision))}).propose(input,7);
}
const paintedOps=():Operation[]=>[
  {type:'upsert-material',material:material()},
  {type:'upsert-finish',finish:finish()},
  {type:'upsert-finish',finish:finish('paint-back','wall-west','wall-back')},
];

test('actual Avani wall and furniture colours remain an unapplied snapshot proposal',async()=>{
  const input=structuredClone(demoScene),before=structuredClone(input);
  const operations:Operation[]=[{type:'update-wall',id:'wall-west',patch:{color:'#aabbcc'}},{type:'update',id:'sofa',patch:{color:'#123456'}}];
  const result=await accept(input,operations);
  expect(result.command.operations).toEqual(operations);expect(result.command.baseRevision).toBe(7);expect(input).toEqual(before);
  const store=new EditorStore(input,localCatalog);
  expect(store.execute({...result.command,baseRevision:0},false).ok).toBe(false);
  expect(store.execute({...result.command,baseRevision:0},true).ok).toBe(true);
  expect(store.scene.walls.find(wall=>wall.id==='wall-west')!.color).toBe('#aabbcc');
  expect(store.scene.objects.find(object=>object.id==='sofa')!.color).toBe('#123456');
  expect(store.scene.walls.map(({color,...wall})=>wall)).toEqual(input.walls.map(({color,...wall})=>wall));
});

test('wall appearance rejects empty, malformed, geometry-mixed, missing and stale operations',async()=>{
  const input=structuredClone(demoScene);
  for(const operation of [
    {type:'update-wall',id:'wall-west',patch:{}},
    {type:'update-wall',id:'wall-west',patch:{color:'sage'}},
    {type:'update-wall',id:'wall-west',patch:{color:'#aabbcc',height:3}},
    {type:'update-wall',id:'wall-west',patch:{start:[-4,-4]}},
    {type:'update-wall',id:'missing',patch:{color:'#aabbcc'}},
    {type:'update-opening',id:'window-west',patch:{width:1}},
    {type:'set-metadata',id:'wall-west',patch:{locked:false}},
  ])await expect(accept(input,[operation])).rejects.toThrow();
  await expect(accept(input,[{type:'update-wall',id:'wall-west',patch:{color:'#aabbcc'}}],6)).rejects.toThrow(/revision|stale/i);
  expect(input).toEqual(demoScene);
});

test('grouped movement and individual colour retain the v2 project and submitted snapshot',async()=>{
  const input=migrateScene(demoScene),anchor=input.objects.find(object=>object.id==='dining-table')!,member=input.objects.find(object=>object.id==='dining-chair-east')!;
  anchor.groupId=member.groupId='dining-group';
  input.project!.metadata.sofa={notes:'Keep these project notes'};
  const before=structuredClone(input);let posted:unknown;
  const operations:Operation[]=[{type:'update',id:anchor.id,patch:{position:[anchor.position[0]+.1,0,anchor.position[2]+.1]}},{type:'update',id:anchor.id,patch:{color:'#123456'}}];
  const adapter=createDesignerHttpAdapter({catalog:localCatalog,fetch:async(_url,init)=>{posted=JSON.parse(init!.body as string).scene;return response(proposal(operations));}});
  const result=await adapter.propose(input,7);expect(posted).toEqual(before);expect(input).toEqual(before);
  const store=new EditorStore(input,localCatalog);expect(store.execute({...result.command,baseRevision:0},true).ok).toBe(true);
  expect(store.scene.version).toBe(2);expect(store.scene.project).toEqual(before.project);
  expect(store.scene.objects.filter(object=>object.groupId==='dining-group')).toHaveLength(2);
  expect(store.scene.objects.find(object=>object.id===member.id)!.position).toEqual([member.position[0]+.1,0,member.position[2]+.1]);
  expect(store.scene.objects.find(object=>object.id===member.id)!.color).toBeUndefined();
});

test('renovate-mode wall finishes preserve structural metadata, shared materials and other surfaces',async()=>{
  const input=migrateScene(demoScene);input.project!.mode='renovate';
  input.project!.metadata['wall-west']={phase:'existing',review:'reviewed',structuralRole:'structural'};
  input.project!.materials=[{...material('shared'),unitCost:20}];
  input.project!.finishes=[finish('paint-front','wall-west','wall-front','shared'),finish('floor','room-living','floor','shared')];
  const before=structuredClone(input),result=await accept(input,paintedOps());
  const store=new EditorStore(input,localCatalog);expect(store.execute({...result.command,baseRevision:0},true).ok).toBe(true);
  expect(store.scene.project!.metadata).toEqual(before.project!.metadata);expect(store.scene.walls).toEqual(before.walls);
  expect(store.scene.project!.materials.find(entry=>entry.id==='shared')).toEqual(before.project!.materials[0]);
  expect(store.scene.project!.finishes.find(entry=>entry.id==='floor')).toEqual(before.project!.finishes[1]);
  expect(store.scene.project!.finishes.filter(entry=>entry.entityId==='wall-west').map(entry=>entry.materialId)).toEqual(['designer-paint','designer-paint']);
  expect(input).toEqual(before);
});

test('explicit v1 migration is allowed only as part of a wall-finish proposal',async()=>{
  const input=structuredClone(demoScene),result=await accept(input,[{type:'migrate-project'},...paintedOps()]);
  const store=new EditorStore(input,localCatalog);expect(store.execute({...result.command,baseRevision:0},true).ok).toBe(true);
  expect(store.scene.version).toBe(2);expect(store.scene.objects).toEqual(input.objects);expect(input).toEqual(demoScene);
  await expect(accept(input,[{type:'migrate-project'}])).rejects.toThrow();
  await expect(accept(input,[{type:'migrate-project'},{type:'migrate-project'},...paintedOps()])).rejects.toThrow();
});

test('an existing unquoted conceptual material can be reused without an upsert',async()=>{
  const input=migrateScene(demoScene);input.project!.materials=[material()];
  const result=await accept(input,[{type:'upsert-finish',finish:finish()}]);
  expect(result.command.operations).toEqual([{type:'upsert-finish',finish:finish()}]);
});

test('material operations cannot replace existing records or create unused or quoted materials',async()=>{
  const input=migrateScene(demoScene);input.project!.materials=[material('shared')];
  for(const operations of [
    [{type:'upsert-material',material:{...material('shared'),color:'#000000'}},{type:'upsert-finish',finish:finish('paint-front','wall-west','wall-front','shared')}],
    [{type:'upsert-material',material:material()}],
    [{type:'upsert-material',material:{...material(),unitCost:1}},{type:'upsert-finish',finish:finish()}],
    [{type:'upsert-material',material:{...material(),thickness:.02}},{type:'upsert-finish',finish:finish()}],
    [{type:'upsert-material',material:{...material(),wastePercent:10}},{type:'upsert-finish',finish:finish()}],
    [{type:'upsert-material',material:material()},{type:'upsert-material',material:{...material(),color:'#000000'}},{type:'upsert-finish',finish:finish()}],
  ])await expect(accept(input,operations)).rejects.toThrow();
  input.project!.materials=[{...material(),unitCost:5}];
  await expect(accept(input,[{type:'upsert-finish',finish:finish()}])).rejects.toThrow();
});

test('wall finishes cannot retarget an existing assignment, touch floors, or add a duplicate wall face',async()=>{
  const input=migrateScene(demoScene);input.project!.materials=[material()];
  input.project!.finishes=[finish('existing'),finish('floor','room-living','floor')];
  for(const entry of [
    finish('floor'),finish('existing','wall-east'),finish('existing','wall-west','wall-back'),
    finish('new-floor','room-living','floor'),finish('new','missing'),finish('duplicate'),
  ])await expect(accept(input,[{type:'upsert-finish',finish:entry}])).rejects.toThrow();
});

test('appearance operations cannot bypass wall locks, retain/removal flags or furniture keeps',async()=>{
  for(const metadata of [{locked:true},{phase:'retain'},{phase:'remove'}] as const){
    const input=migrateScene(demoScene);input.project!.metadata['wall-west']={...metadata};
    await expect(accept(input,[{type:'update-wall',id:'wall-west',patch:{color:'#aabbcc'}}])).rejects.toThrow();
    await expect(accept(input,paintedOps())).rejects.toThrow();
  }
  const input=migrateScene(demoScene);input.project!.metadata.sofa={locked:true};
  await expect(accept(input,[{type:'update',id:'sofa',patch:{color:'#aabbcc'}}])).rejects.toThrow();
  const adapter=createDesignerHttpAdapter({catalog:localCatalog,keep:['sofa'],fetch:async()=>response(proposal([{type:'update',id:'sofa',patch:{color:'#aabbcc'}}]))});
  await expect(adapter.propose(demoScene,7)).rejects.toThrow();
});

test('direct wall colour cannot obscure a material finish or falsely mark renovation replacement',async()=>{
  const input=migrateScene(demoScene);input.project!.mode='renovate';
  await expect(accept(input,[{type:'update-wall',id:'wall-west',patch:{color:'#aabbcc'}}])).rejects.toThrow();
  input.project!.mode='correct';input.project!.materials=[material()];input.project!.finishes=[finish()];
  await expect(accept(input,[{type:'update-wall',id:'wall-west',patch:{color:'#aabbcc'}}])).rejects.toThrow();
});

test('an implicit group transform cannot move a kept member',async()=>{
  const input=migrateScene(demoScene),anchor=input.objects.find(object=>object.id==='dining-table')!,member=input.objects.find(object=>object.id==='dining-chair-east')!;
  anchor.groupId=member.groupId='dining-group';
  const before=structuredClone(input),operations:Operation[]=[{type:'update',id:anchor.id,patch:{position:[anchor.position[0]+.1,0,anchor.position[2]+.1]}}];
  const adapter=createDesignerHttpAdapter({catalog:localCatalog,keep:[member.id],fetch:async()=>response(proposal(operations))});
  await expect(adapter.propose(input,7)).rejects.toThrow(/kept/i);expect(input).toEqual(before);
});
