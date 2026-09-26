import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'decoration-'));
after(() => rm(output, { recursive: true }));
await build({root,ssr:{noExternal:true},configFile:false,publicDir:false,logLevel:'error',plugins:[{name:'entry',resolveId(id){if(id.endsWith('decoration-entry'))return '\0entry';},load(id){if(id==='\0entry')return `export * from '${root}/src/core/store.ts'; export * from '${root}/src/core/validation.ts'; export * from '${root}/src/adapters/database-catalog.ts'; export * from '${root}/src/render/assets.ts'; export * from '${root}/src/core/designer-catalog.ts'; export * from '${root}/src/core/renovation.ts'; export * from '${root}/src/core/placement-conflicts.ts'; export * from '${root}/src/render/furniture-surfaces.ts'; export * as THREE from 'three';`;}}],build:{ssr:'decoration-entry',target:'node22',outDir:output,rolldownOptions:{output:{entryFileNames:'test.mjs'}}}});
const {EditorStore,validateScene,placementIssues,catalogProduct,makeFurniture,createFurnitureSurfaceResolver,THREE}=await import(pathToFileURL(join(output,'test.mjs')));
const asset=(kind,dimensions=[.4,.6,.02])=>({id:kind,name:kind,kind,dimensions,category:'Decoration',color:'#ffffff',price:0,source:{type:'procedural'}});
const object=(id,assetId,position=[3,0,2])=>({id,name:id,assetId,position,rotation:0,scale:[1,1,1]});
const scene=()=>({format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',rooms:[{id:'room',name:'Room',color:'#ffffff',polygon:[[0,0],[6,0],[6,6],[0,6]]}],walls:[{id:'wall',start:[0,0],end:[6,0],height:3,thickness:.2,color:'#ffffff',openings:[]}],objects:[]});
const apply=(store,operations)=>store.execute({id:`c${store.revision}`,label:'Place',source:'designer',baseRevision:store.revision,operations},true);
test('decoration kinds accept tiny dimensions and render fallback geometry',()=>{for(const kind of ['decor','wall_art','mirror']){const a=asset(kind,[.01,.1,.02]);assert.equal(validateScene(scene(),[a]).ok,true);assert.ok(makeFurniture(a).children.length);const p=catalogProduct({id:`extra:test:${kind}`,name:kind,kind,currency:'AMD',price:1,fit_size_m:[.1,.02,.3],glb_url:'http://100.107.246.46:8765/models/decor.glb',license:'CC0'});assert.equal(p?.asset.kind,kind);}});
test('wall art snaps flush, faces room, sits above sofa and follows moves; undo restores',()=>{const s=new EditorStore(scene(),[asset('wall_art'),asset('sofa',[2,.8,1])]);assert.equal(apply(s,[{type:'add',object:object('sofa','sofa',[3,0,.7])},{type:'add',object:object('art','wall_art')}]).ok,true);const art=s.scene.objects[1];assert.equal(art.host.wallId,'wall');assert.ok(Math.abs(art.position[2]-.11)<1e-6);assert.equal(art.position[1],1.2);assert.equal(art.rotation,0);assert.equal(placementIssues(s.scene,[asset('wall_art'),asset('sofa',[2,.8,1])]).length,0);assert.equal(apply(s,[{type:'update',id:'art',patch:{position:[4,0,3]}}]).ok,true);assert.equal(s.scene.objects[1].position[0],4);s.undo();assert.equal(s.scene.objects[1].position[0],3);s.redo();assert.equal(s.scene.objects[1].position[0],4);});
test('tall mirrors remain floor based; short mirrors hang; no wall gives a clear rejection',()=>{const s=new EditorStore(scene(),[asset('mirror',[.6,1.8,.05])]);assert.equal(apply(s,[{type:'add',object:object('mirror','mirror')}]).ok,true);assert.equal(s.scene.objects[0].position[1],0);const empty=scene();empty.walls=[];const noWall=new EditorStore(empty,[asset('wall_art')]);const result=apply(noWall,[{type:'add',object:object('art','wall_art')}]);assert.equal(result.ok,false);assert.match(result.errors.join(' '),/wall/i);});

test('on places at a support surface; children follow rotation/translation and drop on deletion with undo',()=>{
  const catalog=[asset('table',[2,.8,2]),asset('decor',[.2,.3,.2])];
  const s=new EditorStore(scene(),catalog);
  assert.equal(apply(s,[{type:'add',object:object('table','table',[3,0,3])},{type:'add',object:object('vase','decor',[3.5,0,3]),on:'table'}]).ok,true);
  assert.deepEqual(s.scene.objects[1].position,[3.5,.8,3]);assert.equal(s.scene.objects[1].restsOn,'table');
  assert.equal(placementIssues(s.scene,catalog).length,0);
  assert.equal(apply(s,[{type:'update',id:'table',patch:{position:[2,0,3],rotation:Math.PI/2}}]).ok,true);
  assert.deepEqual(s.scene.objects[1].position,[2,.8,2.5]);
  assert.equal(apply(s,[{type:'delete',id:'table'}]).ok,true);assert.equal(s.scene.objects[0].restsOn,undefined);assert.equal(s.scene.objects[0].position[1],0);
  s.undo();assert.equal(s.scene.objects[1].restsOn,'table');s.redo();assert.equal(s.scene.objects[0].position[1],0);
});
test('support rejects missing surfaces and large furniture, detects decor overlaps and outside centres',()=>{
  const catalog=[asset('table',[2,.8,2]),asset('decor',[.3,.3,.3]),asset('sofa',[2,1,1])];const s=new EditorStore(scene(),catalog);
  assert.equal(apply(s,[{type:'add',object:object('table','table',[3,0,3])}]).ok,true);
  assert.equal(apply(s,[{type:'add',object:object('bad','decor',[5,0,5]),on:'table'}]).ok,false);
  assert.equal(apply(s,[{type:'add',object:object('big','sofa',[3,0,3]),on:'table'}]).ok,false);
  assert.equal(apply(s,[{type:'add',object:object('a','decor',[3,0,3]),on:'table'},{type:'add',object:object('b','decor',[3.1,0,3]),on:'table'}]).ok,true);
  assert.ok(placementIssues(s.scene,catalog).some(i=>i.kind==='overlap'));
  const invalid=structuredClone(s.scene);invalid.objects[1].position[0]=5;assert.ok(placementIssues(invalid,catalog).some(i=>i.entityId==='a'&&i.kind==='support'));
  assert.equal(apply(s,[{type:'update',id:'a',on:'missing',patch:{position:[3,0,3]}}]).ok,false);
});
test('headless sofa seat and default support-centre update; explicit detachment',()=>{
  const s=new EditorStore(scene(),[asset('sofa',[2,1,1]),asset('decor',[.2,.2,.2])]);
  assert.equal(apply(s,[{type:'add',object:object('sofa','sofa',[3,0,3])},{type:'add',object:object('v','decor',[1,0,1])}]).ok,true);
  assert.equal(apply(s,[{type:'update',id:'v',patch:{rotation:0},on:'sofa'}]).ok,true);
  assert.deepEqual(s.scene.objects[1].position,[3,.45,3]);
  assert.equal(apply(s,[{type:'update',id:'v',patch:{position:[1,0,1]},on:null}]).ok,true);assert.equal(s.scene.objects[1].restsOn,undefined);
});

test('mesh raycast hits sofa seat and lower shelf, rejects holes instead of using box top',()=>{
  const catalog=[asset('sofa',[2,1,1]),asset('decor',[.2,.2,.2])];const doc=scene();doc.objects=[object('sofa','sofa',[3,0,3])];
  const model=new THREE.Group();
  const board=(w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());m.position.set(x,y,z);model.add(m);};
  board(2,.1,1,0,.4,0);board(2,.5,.1,0,.75,-.45);
  const resolve=createFurnitureSurfaceResolver(id=>id==='sofa'?model:undefined);
  const vase=object('v','decor',[3,0,3]);assert.ok(Math.abs(resolve(doc,catalog,vase,'sofa').y-.45)<1e-6);
  board(2,.1,1,0,.85,0);assert.ok(Math.abs(resolve(doc,catalog,vase,'sofa',.7).y-.45)<1e-6);
  assert.ok(Math.abs(resolve(doc,catalog,vase,'sofa').y-.9)<1e-6);
  model.clear();board(.2,.1,.2,.8,.4,0);assert.equal(resolve(doc,catalog,vase,'sofa'),null);
  const store=new EditorStore(doc,catalog);store.setSurfaceResolver(resolve);assert.equal(apply(store,[{type:'add',object:vase,on:'sofa'}]).ok,false);
});
test('on add can omit position; nested supports move once; invalid cycles and supported large imports reject',()=>{
 const catalog=[asset('table',[2,.8,2]),asset('decor',[.4,.2,.4])],s=new EditorStore(scene(),catalog);
 const vase=object('v','decor');delete vase.position;
 assert.equal(apply(s,[{type:'add',object:object('table','table',[3,0,3])},{type:'add',object:vase,on:'table'}]).ok,true);
 assert.deepEqual(s.scene.objects[1].position,[3,.8,3]);
 assert.equal(apply(s,[{type:'add',object:object('top','decor',[3,0,3]),on:'v'}]).ok,true);
 assert.equal(apply(s,[{type:'update',id:'table',patch:{position:[2,0,3]}}]).ok,true);assert.deepEqual(s.scene.objects[2].position,[2,1,3]);
 assert.equal(apply(s,[{type:'update',id:'v',on:'top',patch:{rotation:0}}]).ok,false);
 const invalid=structuredClone(s.scene);invalid.objects[0].restsOn='v';assert.equal(validateScene(invalid,catalog).ok,false);
});
test('full-length mirror leans toward its wall with its complete mesh above the floor and outside the wall',async()=>{
 const {poseWallDecoration}=await import(pathToFileURL(join(output,'test.mjs')));
 const mirror=asset('mirror',[.6,1.8,.05]),s=new EditorStore(scene(),[mirror]);
 assert.equal(apply(s,[{type:'add',object:object('mirror','mirror')}]).ok,true);
 const item=s.scene.objects[0],model=makeFurniture(mirror);poseWallDecoration(model,mirror,item);
 const group=new THREE.Group();group.position.fromArray(item.position);group.rotation.y=item.rotation;group.add(model);group.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(group);assert.ok(model.rotation.x<0);assert.ok(Math.abs(bounds.min.y)<1e-6);assert.ok(bounds.min.z>=.1-1e-6);
 assert.equal(placementIssues(s.scene,[mirror]).length,0);
});

test('catalog aliases, designer discovery and renovation analysis accept decorations',async()=>{
 const {mergeDesignerProducts,analyzeProject}=await import(pathToFileURL(join(output,'test.mjs')));
 for (const [kind,expected] of [['books','decor'],['throw_blanket','decor'],['clock','wall_art'],['planter','decor'],['mirror','mirror']]) {
  const product=catalogProduct({id:`extra:test:${kind}`,name:kind,kind,currency:'AMD',price:1,fit_size_m:[.2,.02,.3],glb_url:'http://100.107.246.46:8765/models/decor.glb',license:'CC0'});
  assert.equal(product.asset.kind,expected);assert.equal(mergeDesignerProducts([],[product.asset])[0].asset.kind,expected);
  const store=new EditorStore(scene(),[product.asset]);assert.equal(apply(store,[{type:'add',object:object(kind,product.asset.id)}]).ok,true);
  assert.ok(analyzeProject(store.scene,[product.asset]).quantities.some(q=>q.id===kind));
 }
});
test('preview uses support exemptions but shows overlapping decorations and off-edge centres',async()=>{
 const {placementConflicts}=await import(pathToFileURL(join(output,'test.mjs')));
 const catalog=[asset('sofa',[2,1,1]),asset('decor',[.2,.2,.2])],s=new EditorStore(scene(),catalog);
 assert.equal(apply(s,[{type:'add',object:object('sofa','sofa',[3,0,3])},{type:'add',object:object('a','decor',[3,0,3]),on:'sofa'}]).ok,true);
 assert.equal(placementConflicts(s.scene,catalog,s.scene.objects[1]).length,0);
 assert.equal(apply(s,[{type:'add',object:object('b','decor',[3,0,3]),on:'sofa'}]).ok,true);
 assert.ok(placementConflicts(s.scene,catalog,s.scene.objects[1]).some(c=>c.kind==='overlap'&&c.entityId==='b'));
 const moved={...s.scene.objects[1],position:[5,.45,3]};assert.ok(placementConflicts(s.scene,catalog,moved).some(c=>c.kind==='support'));
});
test('on alone in an update defaults to the centre without requiring a dummy transform',()=>{
 const s=new EditorStore(scene(),[asset('table',[2,.8,2]),asset('decor',[.2,.2,.2])]);
 assert.equal(apply(s,[{type:'add',object:object('table','table',[3,0,3])},{type:'add',object:object('v','decor',[1,0,1])}]).ok,true);
 assert.equal(apply(s,[{type:'update',id:'v',on:'table',patch:{}}]).ok,true);
 assert.deepEqual(s.scene.objects[1].position,[3,.8,3]);
});
