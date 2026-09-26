import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'rehang-'));
after(() => rm(output, { recursive: true }));
await build({root,ssr:{noExternal:true},configFile:false,publicDir:false,logLevel:'error',plugins:[{name:'entry',resolveId(id){if(id.endsWith('rehang-entry'))return '\0entry';},load(id){if(id==='\0entry')return `export * from '${root}/src/core/store.ts'; export * from '${root}/src/core/validation.ts'; export * from '${root}/src/core/decoration-placement.ts'; export * from '${root}/src/adapters/database-catalog.ts'; export * from '${root}/src/render/assets.ts'; export * from '${root}/src/core/placement-conflicts.ts';`;}}],build:{ssr:'rehang-entry',target:'node22',outDir:output,rolldownOptions:{output:{entryFileNames:'test.mjs'}}}});
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

const heights=s=>s.walls.map(w=>({type:'update-wall',id:w.id,patch:{height:3}}));

test('raising the walls re-hangs a curtain at the new rod and a planter from the new ceiling', () => {
  const s=new EditorStore(scene(),catalog);
  assert.equal(apply(s,[{type:'add',object:object('c','curtain',[1.3,0,1])},{type:'add',object:object('p','extra:plants:hanging-string-of-pearls',[3,0,3])}]).ok,true);
  const result=apply(s,heights(s.scene));
  assert.equal(result.ok,true,result.errors?.join(' '));
  const c=s.scene.objects.find(o=>o.id==='c'), p=s.scene.objects.find(o=>o.id==='p');
  near(c.position[1]+2.628*c.scale[1],3-CURTAIN_ROD_GAP,'curtain top at the raised rod');
  near(p.position[1]+.9,3,'planter top at the raised ceiling');
  assert.deepEqual(placementIssues(s.scene,catalog),[],'nothing is left floating');
});

test('lowering the walls hems a curtain again instead of pushing it into the floor', () => {
  const s=new EditorStore(scene(3),catalog);
  assert.equal(apply(s,[{type:'add',object:object('c','curtain',[1.3,0,1])}]).ok,true);
  assert.equal(apply(s,s.scene.walls.map(w=>({type:'update-wall',id:w.id,patch:{height:2.4}}))).ok,true);
  const c=s.scene.objects[0];
  near(c.position[1],0,'reaches the floor'); near(c.position[1]+2.628*c.scale[1],2.4-CURTAIN_ROD_GAP,'top at the lowered rod');
});

test('an edit that does not touch walls or ceilings leaves hung items exactly as they are', () => {
  const s=new EditorStore(scene(),catalog);
  assert.equal(apply(s,[{type:'add',object:object('c','curtain',[1.3,0,1])}]).ok,true);
  const before=structuredClone(s.scene.objects[0]);
  assert.equal(apply(s,[{type:'add',object:object('v','sofa',[3,0,3])}]).ok,true);
  assert.deepEqual(s.scene.objects.find(o=>o.id==='c'),before);
});
