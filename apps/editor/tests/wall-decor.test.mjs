import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'wall-decor-'));
after(() => rm(output, { recursive: true }));
await build({root,ssr:{noExternal:true},configFile:false,publicDir:false,logLevel:'error',plugins:[{name:'entry',resolveId(id){if(id.endsWith('wall-decor-entry'))return '\0entry';},load(id){if(id==='\0entry')return `export * from '${root}/src/core/store.ts'; export * from '${root}/src/core/validation.ts'; export * from '${root}/src/core/decoration-placement.ts'; export * from '${root}/src/core/furniture-support.ts'; export * from '${root}/src/adapters/database-catalog.ts';`;}}],build:{ssr:'wall-decor-entry',target:'node22',outDir:output,rolldownOptions:{output:{entryFileNames:'test.mjs'}}}});
const {EditorStore,validateScene,placementIssues,mountDecoration,rehangObjects,wallDecoration,wallShelf,catalogProduct,HOOD_BOTTOM}=await import(pathToFileURL(join(output,'test.mjs')));

const asset=(id,kind,dimensions,name=id)=>({id,name,kind,dimensions,category:'Decoration',color:'#ffffff',price:0,source:{type:'procedural'}});
const art=asset('art','wall_art',[.5,.4,.03],'Framed print');
const tall=asset('tall','wall_art',[.8,1.8,.03],'Tall canvas');
const shelf=asset('shelf','shelf',[.9,.05,.25],'Floating oak shelf 90');
const vase=asset('vase','decor',[.12,.25,.12],'Stoneware vase');
const sofa=asset('sofa','sofa',[2,.8,.9]);
const catalog=[art,tall,shelf,vase,sofa];
const object=(id,assetId,position=[3,0,.5])=>({id,name:id,assetId,position,rotation:0,scale:[1,1,1]});
const scene=()=>({format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',rooms:[{id:'room',name:'Room',color:'#ffffff',polygon:[[0,0],[6,0],[6,6],[0,6]]}],
  walls:[{id:'wall',start:[0,0],end:[6,0],height:2.7,thickness:.2,color:'#ffffff',openings:[{id:'win',kind:'window',offset:4.5,width:1,height:1.2,sill:.9}]}],objects:[]});
const apply=(store,operations)=>store.execute({id:`c${store.revision}`,label:'Place',source:'designer',baseRevision:store.revision,operations},true);
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-9,`${message}: ${a} vs ${b}`);

test('a requested elevation is kept, persists through add, validation and a move along the wall', () => {
  const doc=scene(), mounted=mountDecoration(doc,object('a','art'),art,{elevation:1.75});
  near(mounted.position[1],1.75,'bottom'); near(mounted.host.elevation,1.75,'host');
  const store=new EditorStore(doc,catalog);
  assert.equal(apply(store,[{type:'add',object:mounted}]).ok,true);
  near(store.scene.objects[0].host.elevation,1.75,'store keeps the host height');
  assert.equal(validateScene(store.scene,catalog).ok,true);
  assert.deepEqual(placementIssues(store.scene,catalog),[]);
  assert.equal(apply(store,[{type:'update',id:'a',patch:{position:[2,0,.5]}}]).ok,true);
  near(store.scene.objects[0].position[1],1.75,'moving keeps the height'); near(store.scene.objects[0].host.offset,2,'moved along');
  const saved=JSON.parse(JSON.stringify(store.scene));
  assert.equal(validateScene(saved,catalog).ok,true); assert.deepEqual(placementIssues(saved,catalog),[]);
  near(rehangObjects(saved,catalog).objects[0].position[1],1.75,'re-hang keeps the height');
});

test('without a request the standard height applies, and the standard stays valid for pieces the new bounds would reject', () => {
  near(mountDecoration(scene(),object('a','art'),art).position[1],1.3,'standard bottom max(0.9, 1.5 - h/2)');
  const big=mountDecoration(scene(),object('t','tall'),tall);
  near(big.position[1],.9,'tall art keeps its standard height'); // top 2.7, above ceiling - 0.1
  assert.deepEqual(placementIssues({...scene(),objects:[big]},catalog),[]);
});

test('a cooker hood hangs with its bottom 0.65 m over a 0.9 m worktop; a water heater keeps the standard height', () => {
  const hood=asset('hood','wall_art',[.6,.8,.5],'Chimney cooker hood 60 cm, stainless');
  const heater=asset('heater','wall_art',[.5,.98,.28],'Slim electric water heater 50 L, white, wall-hung');
  near(HOOD_BOTTOM,1.55,'hood bottom');
  const hung=mountDecoration(scene(),object('h','hood'),hood);
  near(hung.position[1],1.55,'hood bottom over the hob');
  assert.deepEqual(placementIssues({...scene(),objects:[hung]},[hood]),[]);
  near(rehangObjects({...scene(),objects:[hung]},[hood]).objects[0].position[1],1.55,'re-hang keeps the hood height');
  near(mountDecoration(scene(),object('w','heater'),heater).position[1],Math.max(.9,1.5-.98/2),'heater standard bottom');
});

test('requested heights clamp to floor + 0.3 and ceiling - 0.1, and may not cover an opening', () => {
  near(mountDecoration(scene(),object('a','art'),art,{elevation:.05}).position[1],.3,'low clamp');
  near(mountDecoration(scene(),object('a','art'),art,{elevation:2.6}).position[1],2.7-.1-.4,'high clamp');
  assert.throws(()=>mountDecoration(scene(),object('w','art',[5,0,.5]),art,{elevation:1.2}),/window/);
  near(mountDecoration(scene(),object('w','art',[5,0,.5]),art,{elevation:2.15}).position[1],2.15,'above the window head is fine');
});

test('the inconsistent-mount guard still flags a stored height out of bounds or a moved position', () => {
  const doc=scene(), good=mountDecoration(doc,object('a','art'),art,{elevation:1.75});
  const low=structuredClone(good); low.host.elevation=.1; low.position[1]=.1;
  assert.ok(placementIssues({...doc,objects:[low]},catalog).some(i=>i.kind==='support'&&/inconsistent wall mount/.test(i.message)));
  const drift=structuredClone(good); drift.position[1]=1.6;
  assert.ok(placementIssues({...doc,objects:[drift]},catalog).some(i=>/inconsistent wall mount/.test(i.message)));
  const window=structuredClone(mountDecoration(doc,object('w','art',[5,0,.5]),art,{elevation:2.15})); window.host.elevation=1.2; window.position[1]=1.2;
  assert.ok(placementIssues({...doc,objects:[window]},catalog).some(i=>/inconsistent wall mount/.test(i.message)));
});

test('a gallery wall of five frames at varied heights over a sofa validates', () => {
  const doc=scene(), frames=[[1.8,1.3],[2.4,1.55],[3,1.25],[3.6,1.5],[4.2,1.35]].map(([x,y],i)=>mountDecoration(doc,object(`f${i}`,'art',[x,0,.5]),art,{elevation:y}));
  const store=new EditorStore(doc,catalog);
  assert.equal(apply(store,[{type:'add',object:object('sofa','sofa',[3,0,.7])},...frames.map(f=>({type:'add',object:f}))]).ok,true);
  assert.deepEqual(store.scene.objects.slice(1).map(o=>o.host.elevation),[1.3,1.55,1.25,1.5,1.35]);
  assert.deepEqual(placementIssues(store.scene,catalog).filter(i=>i.blocking),[]);
});

test('wall shelves, ledges, wall hangings, planters, clocks and sconces hang; floor pieces do not', () => {
  for (const a of [shelf,asset('m','shelf',[.61,.05,.1],'Rivet Modern Metal Shelf, 24"W, Black'),asset('l','wall_art',[.9,.5,.1],'Rift oak picture ledge 90 cm'),
    asset('p','decor',[.19,.16,.07],'Rivet Rounded Wall Mount Planter'),asset('c','decor',[.3,.3,.04],'Round wall clock'),asset('s','lamp',[.2,.3,.2],'Brass wall sconce, opal globe')])
    assert.equal(wallDecoration(a),true,a.name);
  for (const a of [asset('b','shelf',[1,1.8,.35],'Open walnut bookshelf'),asset('v','decor',[.2,.3,.2],'Stoneware vase'),asset('t','lamp',[.3,.5,.3],'Table lamp'),asset('h','plant',[.3,.9,.3],'Hanging planter, pothos')])
    assert.equal(wallDecoration(a),false,a.name);
  for (const [kind,name] of [['wall_hanging','Floating rift oak shelf 90 cm'],['wall_hanging','Large macrame wall hanging'],['clock','Square oak wall clock']]) {
    const product=catalogProduct({id:`extra:test:${kind}`,name,kind,currency:'AMD',price:1,fit_size_m:[.8,.2,.3],glb_url:'http://100.107.246.46:8765/models/x.glb',license:'CC0'});
    assert.equal(wallDecoration(product.asset),true,name);
  }
  assert.equal(wallShelf(shelf),true); assert.equal(wallShelf(asset('x','wall_art',[.9,.7,.26],'Floating rift oak shelf 90 cm, styled with stacked books')),false);
  const store=new EditorStore(scene(),catalog);
  assert.equal(apply(store,[{type:'add',object:object('shelf','shelf')}]).ok,true);
  assert.equal(store.scene.objects[0].host.wallId,'wall');
});

test('small decor rests on a hung shelf, validates, and follows it when the shelf moves', () => {
  const doc=scene(), hung=mountDecoration(doc,object('shelf','shelf',[2,0,.5]),shelf,{elevation:1.2});
  const store=new EditorStore(doc,catalog);
  const resolver=()=>null; // the viewer's mesh resolver skips wall-hung pieces
  store.setSurfaceResolver(resolver);
  assert.equal(apply(store,[{type:'add',object:hung},{type:'add',object:object('vase','vase',[2.2,0,hung.position[2]]),on:'shelf'}]).ok,true);
  const placed=store.scene.objects[1];
  assert.equal(placed.restsOn,'shelf'); near(placed.position[1],1.25,'on the shelf top');
  assert.equal(validateScene(store.scene,catalog).ok,true);
  assert.deepEqual(placementIssues(store.scene,catalog).filter(i=>i.blocking),[]);
  assert.equal(apply(store,[{type:'update',id:'shelf',patch:{position:[3,0,.5]}}]).ok,true);
  near(store.scene.objects[1].position[0],3.2,'the vase follows'); near(store.scene.objects[1].position[1],1.25,'at the same height');
});
