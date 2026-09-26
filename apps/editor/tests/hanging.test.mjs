import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'hanging-'));
after(() => rm(output, { recursive: true }));
await build({root,ssr:{noExternal:true},configFile:false,publicDir:false,logLevel:'error',plugins:[{name:'entry',resolveId(id){if(id.endsWith('hanging-entry'))return '\0entry';},load(id){if(id==='\0entry')return `export * from '${root}/src/core/store.ts'; export * from '${root}/src/core/validation.ts'; export * from '${root}/src/core/decoration-placement.ts'; export * from '${root}/src/adapters/database-catalog.ts'; export * from '${root}/src/render/assets.ts'; export * from '${root}/src/core/placement-conflicts.ts';`;}}],build:{ssr:'hanging-entry',target:'node22',outDir:output,rolldownOptions:{output:{entryFileNames:'test.mjs'}}}});
const {EditorStore,validateScene,placementIssues,placementConflicts,hangsFromCeiling,catalogProduct,makeFurniture,CURTAIN_ROD_GAP}=await import(pathToFileURL(join(output,'test.mjs')));

const asset=(id,kind,dimensions,name=id)=>({id,name,kind,dimensions,category:'Decoration',color:'#ffffff',price:0,source:{type:'procedural'}});
const curtain=asset('curtain','curtain',[2.1,2.628,.13],'Linen curtains, natural beige, pair drawn open, 200 cm rod, 260 cm');
const hanging=asset('extra:plants:hanging-string-of-pearls','plant',[.35,.9,.387],'Hanging planter, trailing succulent');
const sofa=asset('sofa','sofa',[2,.8,1]);
const vase=asset('vase','decor',[.2,.3,.2]);
const catalog=[curtain,hanging,sofa,vase];
const object=(id,assetId,position)=>({id,name:id,assetId,position,rotation:0,scale:[1,1,1]});
const wall=(id,start,end,height,openings=[])=>({id,start,end,height,thickness:.2,color:'#ffffff',openings});
const scene=(height=2.7)=>({format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',
  rooms:[{id:'room',name:'Room',color:'#ffffff',polygon:[[0,0],[6,0],[6,6],[0,6]]}],
  walls:[wall('south',[0,0],[6,0],height,[{id:'win',kind:'window',offset:1,width:1.2,height:1.4,sill:.9}]),wall('east',[6,0],[6,6],height),wall('north',[6,6],[0,6],height),wall('west',[0,6],[0,0],height)],objects:[]});
const apply=(store,operations)=>store.execute({id:`c${store.revision}`,label:'Place',source:'designer',baseRevision:store.revision,operations},true);
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-6,`${message}: ${a} vs ${b}`);

test('a curtain near a window centres on it, faces the room and hangs from a rod just below the ceiling', () => {
  const s=new EditorStore(scene(),catalog);
  const result=apply(s,[{type:'add',object:object('c','curtain',[1.3,0,1])}]);
  assert.equal(result.ok,true,result.errors.join(' '));
  const c=s.scene.objects[0];
  assert.equal(c.host.wallId,'south');
  near(c.host.offset,1.6,'centred on the window');
  near(c.position[0],1.6,'x at the window centre'); near(c.position[2],.1+.13/2,'flush with the wall face');
  near(c.rotation,0,'faces into the room');
  near(c.position[1]+2.628,2.7-CURTAIN_ROD_GAP,'top at the rod');
  assert.deepEqual(c.scale,[1,1,1]);
  assert.equal(placementIssues(s.scene,catalog).length,0);
  assert.equal(validateScene(s.scene,catalog).ok,true);
});

test('a curtain away from windows keeps its position along the wall; a long curtain is hemmed to the drop', () => {
  const s=new EditorStore(scene(2.5),catalog);
  assert.equal(apply(s,[{type:'add',object:object('c','curtain',[4.5,0,.8])}]).ok,true);
  const c=s.scene.objects[0];
  near(c.position[0],4.5,'no window snap'); near(c.position[1],0,'reaches the floor');
  near(c.scale[1],(2.5-CURTAIN_ROD_GAP)/2.628,'hemmed to the drop');
  assert.equal(placementIssues(s.scene,catalog).length,0,'re-mounting is idempotent');
  assert.equal(apply(s,[{type:'update',id:'c',patch:{position:[5.9,0,3]}}]).ok,true);
  assert.equal(s.scene.objects[0].host.wallId,'east');
  s.undo(); assert.equal(s.scene.objects[0].host.wallId,'south');
});

test('a curtain cannot rest on furniture and a tampered mount is a support issue', () => {
  const s=new EditorStore(scene(),catalog);
  assert.equal(apply(s,[{type:'add',object:object('sofa','sofa',[3,0,3])}]).ok,true);
  assert.equal(apply(s,[{type:'add',object:object('c','curtain',[3,0,3]),on:'sofa'}]).ok,false);
  assert.equal(apply(s,[{type:'add',object:object('c','curtain',[1.3,0,1])}]).ok,true);
  const bad=structuredClone(s.scene); bad.objects[1].position[1]+=.3; bad.objects[1].host.elevation+=.3;
  assert.ok(placementIssues(bad,catalog).some(i=>i.entityId==='c'&&i.kind==='support'));
});

test('a hanging planter hangs from the ceiling above a sofa without clashing, and nothing rests on it', () => {
  const s=new EditorStore(scene(),catalog);
  const result=apply(s,[{type:'add',object:object('sofa','sofa',[3,0,3])},{type:'add',object:object('p',hanging.id,[3,0,3])}]);
  assert.equal(result.ok,true,result.errors.join(' '));
  const p=s.scene.objects[1];
  assert.equal(p.hangsFrom,'ceiling'); assert.equal(p.restsOn,undefined);
  near(p.position[1]+.9,2.7,'top touches the ceiling');
  assert.equal(placementIssues(s.scene,catalog).length,0);
  assert.equal(placementConflicts(s.scene,catalog,p).length,0);
  assert.equal(validateScene(s.scene,catalog).ok,true);
  assert.equal(apply(s,[{type:'add',object:object('v','vase',[3,0,3]),on:'p'}]).ok,false,'a vase cannot rest on a hanging planter');
  assert.equal(apply(s,[{type:'update',id:'p',on:'sofa',patch:{}}]).ok,false,'hanging planters do not rest on furniture');
  assert.equal(apply(s,[{type:'update',id:'p',patch:{position:[1,0,4],scale:[1,.5,1]}}]).ok,true);
  near(s.scene.objects[1].position[1]+.45,2.7,'rescaled planter still touches the ceiling');
  const bad=structuredClone(s.scene); bad.objects[1].position[1]=0;
  assert.ok(placementIssues(bad,catalog).some(i=>i.entityId==='p'&&i.kind==='support'));
  const wrongKind=structuredClone(s.scene); wrongKind.objects[0].hangsFrom='ceiling';
  assert.equal(validateScene(wrongKind,catalog).ok,false,'a sofa cannot hang');
});

test('only hanging planters hang; wall, deck and plain planters do not; catalog curtains reach the editor', () => {
  assert.equal(hangsFromCeiling(hanging),true);
  assert.equal(hangsFromCeiling(asset('extra:plants:hanging-flowering-planter','plant',[.37,.9,.37],'Hanging planter with flowers and trailing vines')),true);
  assert.equal(hangsFromCeiling(asset('abo:1','decor',[.2,1,.2],'Indoor Hanging Planter Flower Pot with Rope')),true);
  assert.equal(hangsFromCeiling(asset('abo:2','decor',[.5,.3,.3],'Recycled Wood Deck Hanging Planter - 2-Pack')),false);
  assert.equal(hangsFromCeiling(asset('abo:3','decor',[.2,.2,.1],'Round Wall Mount Planter')),false);
  assert.equal(hangsFromCeiling(asset('extra:plants:pothos','plant',[.3,.4,.3],'Pothos, trailing, in grey pot')),false);
  const product=catalogProduct({id:'extra:textiles:curtain-linen-beige-pair-open-200',name:curtain.name,kind:'curtain',currency:'AMD',price:39900,size_m:[2.1,.13,2.628],glb_url:'http://100.107.246.46:8765/models/extra-textiles-curtain-linen-beige-pair-open-200.glb',license:'CC0'});
  assert.equal(product?.asset.kind,'curtain'); assert.equal(product?.asset.category,'Decoration');
  assert.ok(makeFurniture(curtain).children.length);
});
