import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'varpet-multi-selection-'));
after(() => rm(output, { recursive: true }));
await build({ root, configFile: false, publicDir: false, logLevel: 'error', plugins: [{
  name: 'multi-selection-test-entry', resolveId(id) { if (id.endsWith('multi-selection-test-entry')) return '\0multi-selection-test-entry'; },
  load(id) { if (id === '\0multi-selection-test-entry') return ['store', 'renovation', 'wall-junctions', 'multi-selection']
    .filter(name => existsSync(join(root, `src/core/${name}.ts`)))
    .map(name => `export * from '${root}/src/core/${name}.ts';`).join('\n'); },
}], build: { ssr: 'multi-selection-test-entry', target: 'node22', outDir: output, minify: false,
  rolldownOptions: { output: { entryFileNames: 'test.mjs' } } } });
const api = await import(pathToFileURL(join(output, 'test.mjs')));
const { EditorStore, migrateScene, componentPosition, normalizeWallJunctions } = api;
const wall = (id, start, end) => ({ id, start, end, height: 2.7, thickness: .1, color: '#ffffff', openings: [] });
const room = { id: 'room', name: 'Room', color: '#ffffff', polygon: [[-10,-10],[10,-10],[10,10],[-10,10]] };
const shell = walls => migrateScene({ format: 'varpet.editor', version: 1, id: 'flat', name: 'Flat', units: 'm', upAxis: 'Y', rooms: [structuredClone(room)], walls, objects: [] });
const rawWallOps = (scene, ids, [dx,dz]) => ids.map(id => {
  const source = scene.walls.find(wall => wall.id === id);
  return { type: 'update-wall', id, patch: { start: [source.start[0]+dx,source.start[1]+dz], end: [source.end[0]+dx,source.end[1]+dz] } };
});
let serial = 0;
const execute = (store, operations) => store.execute({ id: `multi-${serial++}`, source: 'human', label: 'Move selection', baseRevision: store.revision, operations }, true);
const good = result => assert.equal(result.ok, true, result.errors.join(' '));
const byId = (scene, id) => scene.walls.find(wall => wall.id === id);
const near = (actual, expected) => assert.ok(Math.abs(actual-expected)<1e-8, `${actual} != ${expected}`);

test('adjacent selected walls move from the original junctions exactly once, independently of order', () => {
  const input = shell([wall('south',[0,0],[4,0]), wall('east',[4,0],[4,4]), wall('north',[4,4],[0,4]), wall('west',[0,4],[0,0])]);
  input.rooms[0].polygon = [[0,0],[4,0],[4,4],[0,4]];
  let expected;
  for (const ids of [['south','east'],['east','south']]) {
    const store = new EditorStore(input, []), original = store.scene;
    good(execute(store, rawWallOps(original, ids, [.5,-.5])));
    assert.deepEqual(byId(store.scene,'south').start,[.5,-.5]);
    assert.deepEqual(byId(store.scene,'south').end,[4.5,-.5]);
    assert.deepEqual(byId(store.scene,'east').end,[4.5,3.5]);
    assert.deepEqual(byId(store.scene,'north').start,[4.5,3.5]);
    assert.deepEqual(byId(store.scene,'west').end,[.5,-.5]);
    assert.deepEqual(store.scene.rooms[0].polygon,[[.5,-.5],[4.5,-.5],[4.5,3.5],[0,4]]);
    if (expected) assert.deepEqual(store.scene, expected);
    expected = store.scene;
    good(store.undo()); assert.deepEqual(store.scene,original); assert.equal(store.canUndo,false);
    good(store.redo()); assert.deepEqual(store.scene,expected);
  }
});

test('collinear selection inserts room junctions once and a T branch follows the original host', () => {
  const input = shell([wall('left',[0,0],[2,0]),wall('middle',[2,0],[4,0]),wall('right',[4,0],[6,0]),wall('branch',[3,0],[3,3])]);
  input.rooms[0].polygon = [[0,0],[6,0],[6,4],[0,4]];
  for (const ids of [['left','middle'],['middle','left']]) {
    const store = new EditorStore(input, []);
    good(execute(store,rawWallOps(input,ids,[0,-1])));
    assert.deepEqual(store.scene.rooms[0].polygon,[[0,-1],[2,-1],[4,-1],[6,0],[6,4],[0,4]]);
    assert.deepEqual(byId(store.scene,'branch').start,[3,-1]);
    assert.deepEqual(byId(store.scene,'branch').end,[3,3]);
    assert.deepEqual(byId(store.scene,'right').start,[4,-1]);
  }
  const tee = new EditorStore(input, []);
  good(execute(tee,rawWallOps(input,['middle','branch'],[0,-1])));
  assert.deepEqual(byId(tee.scene,'branch').start,[3,-1]);
  assert.deepEqual(byId(tee.scene,'branch').end,[3,2]);
});

test('multi-wall movement preserves hosts and routes and invalidates affected evidence', () => {
  const input = shell([wall('south',[0,0],[4,0]),wall('east',[4,0],[4,4])]);
  input.project.mode = 'renovate';
  input.walls[0].openings.push({id:'door',kind:'door',offset:1,width:.8,height:2,sill:0});
  input.project.components.push({id:'outlet',name:'Outlet',kind:'outlet',position:[0,0,0],dimensions:[.1,.1,.05],rotation:0,color:'#ffffff',phase:'existing',host:{wallId:'south',offset:3,elevation:1,side:1}});
  input.project.routes.push({id:'wire',name:'Wire',system:'electrical',diameter:.01,phase:'existing',from:'outlet',points:[componentPosition(input,input.project.components[0]),[0,1,3]]});
  for (const entityId of ['south','east','door','outlet','wire']) input.project.assumptions.push({id:`assumption-${entityId}`,entityId,property:'position',value:'Observed',status:'accepted',sourceKind:'observed',sourceIds:[],rationale:'Original position',alternatives:[]});
  const before = componentPosition(input,input.project.components[0]);
  const store = new EditorStore(input, []);
  good(execute(store,rawWallOps(input,['south','east'],[.5,-.5])));
  assert.deepEqual(store.scene.project.components,input.project.components);
  assert.deepEqual(store.scene.walls[0].openings,input.walls[0].openings);
  assert.deepEqual(store.scene.project.routes[0].points,[[before[0]+.5,before[1],before[2]-.5],[0,1,3]]);
  assert.ok(store.scene.project.assumptions.every(value=>value.status==='stale'));
  assert.equal(store.scene.project.metadata.south.review,'required');
  assert.equal(store.scene.project.metadata.east.phase,'replace');
});

test('locks on selected and dependent geometry reject a whole multi-wall command atomically', () => {
  for (const id of ['south','east','north','room','outlet']) {
    const input = shell([wall('south',[0,0],[4,0]),wall('east',[4,0],[4,4]),wall('north',[4,4],[0,4])]);
    input.rooms[0].polygon = [[0,0],[4,0],[4,4],[0,4]];
    input.project.components.push({id:'outlet',name:'Outlet',kind:'outlet',position:[0,0,0],dimensions:[.1,.1,.05],rotation:0,color:'#ffffff',phase:'existing',host:{wallId:'south',offset:3,elevation:1,side:1}});
    input.project.metadata[id] = {...input.project.metadata[id],locked:true};
    const store = new EditorStore(input, []), original = store.scene;
    const result = execute(store,rawWallOps(input,['south','east'],[.5,-.5]));
    assert.equal(result.ok,false,id); assert.match(result.errors.join(' '),/locked/);
    assert.equal(store.scene,original); assert.equal(store.revision,0); assert.equal(store.canUndo,false);
  }
});

test('wall selection rejects room reversal, disconnected T hosts and shortened opening bounds', () => {
  const reversed = shell([wall('south',[0,0],[4,0]),wall('east',[4,0],[4,4])]);
  reversed.rooms[0].polygon = [[0,0],[4,0],[4,4],[0,4]];
  const host = shell([wall('a',[0,0],[0,4]),wall('b',[0,4],[2,4]),wall('host',[-5,0],[5,0])]);
  const opening = shell([wall('a',[0,0],[0,4]),wall('b',[0,4],[2,4]),wall('neighbour',[0,2],[3,2])]);
  opening.walls[2].openings.push({id:'door',kind:'door',offset:1,width:1.5,height:2,sill:0});
  for (const [input,ids,delta,reason] of [[reversed,['south','east'],[-9,9],/collapse|reverse/],[host,['a','b'],[6,0],/disconnect/],[opening,['a','b'],[1,0],/opening outside/]]) {
    const store = new EditorStore(input, []), original = store.scene;
    const result = execute(store,rawWallOps(input,ids,delta));
    assert.equal(result.ok,false); assert.match(result.errors.join(' '),reason); assert.equal(store.scene,original);
  }
});

test('walls and rooms on a separate level stay fixed during batch translation', () => {
  const input = shell([wall('south',[0,0],[4,0]),wall('east',[4,0],[4,4]),wall('upper',[0,0],[4,0]),wall('raised',[4,4],[0,4])]);
  input.rooms[0].polygon = [[0,0],[4,0],[4,4],[0,4]];
  input.rooms.push({...structuredClone(input.rooms[0]),id:'upper-room'});
  input.project.metadata.upper = {elevation:2.7,locked:true};
  input.project.metadata['upper-room'] = {elevation:2.7,ceilingHeight:2.7,locked:true};
  input.project.metadata.raised.elevation = .5;
  const store = new EditorStore(input, []);
  good(execute(store,rawWallOps(input,['south','east'],[.5,-.5])));
  assert.deepEqual(byId(store.scene,'upper'),byId(input,'upper'));
  assert.deepEqual(store.scene.rooms[1],input.rooms[1]);
  assert.deepEqual(byId(store.scene,'raised').start,[4.5,3.5]);
});

test('batch room connections use the original inferred ceiling height before walls move', () => {
  const input = shell([wall('low',[0,0],[4,0]),wall('high',[4,4],[0,4])]);
  input.rooms[0].polygon = [[0,0],[4,0],[4,4],[0,4]];
  for (const wall of input.walls) wall.height = 1;
  input.project.metadata.high.elevation = 2;
  for (const ids of [['low','high'],['high','low']]) {
    const store = new EditorStore(input,[]);
    good(execute(store,rawWallOps(input,ids,[0,-1])));
    assert.deepEqual(byId(store.scene,'low').start,[0,-1]);
    assert.deepEqual(byId(store.scene,'high').start,[4,3]);
    assert.deepEqual(store.scene.rooms[0].polygon,[[0,-1],[4,-1],[4,4],[0,4]],
      'The elevated wall cannot acquire a connection when the original low wall leaves the room boundary');
  }
});

test('batch recognition cannot sanitize malformed endpoints into an accepted command', () => {
  const input = shell([wall('a',[0,0],[4,0]),wall('b',[4,0],[4,4])]);
  for (const malformed of [[.5,-.5,9],['0.5',-.5],{0:.5,1:-.5}]) {
    const store = new EditorStore(input,[]), original = store.scene;
    const operations = rawWallOps(input,['a','b'],[.5,-.5]);
    operations[0].patch.start = malformed;
    assert.equal(execute(store,operations).ok,false);
    assert.equal(store.scene,original); assert.equal(store.canUndo,false);
  }
});

const catalog = [{id:'chair',name:'Chair',kind:'chair',category:'Chair',dimensions:[.5,.5,.5],color:'#ffffff',price:10,source:{type:'procedural'}}];
const furniture = () => {
  const scene = shell([]);
  scene.objects = [[0,0,0],[2,0,0],[0,0,3],[2,0,3],[0,0,6]].map((position,index)=>({id:`item-${index}`,name:`Item ${index}`,assetId:'chair',position,rotation:index*.1,scale:[1,1,1]}));
  return scene;
};

test('temporary furniture selection translates and rotates loose pieces without changing membership', () => {
  assert.equal(typeof api.selectionTransformOperations,'function','Selection transform API must exist');
  const input = furniture(), store = new EditorStore(input,catalog);
  const ids = ['item-0','item-1'];
  const patch = {position:[1,0,1],rotation:Math.PI/2};
  const operations = api.selectionTransformOperations(input,'item-0',patch,ids);
  assert.equal(operations.length,2);
  good(execute(store,operations));
  assert.deepEqual(store.scene.objects[0].position,[1,0,1]);
  near(store.scene.objects[1].position[0],1); near(store.scene.objects[1].position[2],-1);
  near(store.scene.objects[1].rotation,Math.PI/2+.1);
  assert.deepEqual(store.scene.objects.slice(2),input.objects.slice(2));
  assert.deepEqual(store.scene.objects.map(object=>object.groupId),input.objects.map(object=>object.groupId));
  assert.deepEqual(api.selectionFurnitureUpdates(input,'item-0',patch,ids),store.scene.objects.slice(0,2));
  good(store.undo()); assert.deepEqual(store.scene,input); good(store.redo());
});

test('two persistent furniture groups and a loose object receive one rigid transform apiece', () => {
  assert.equal(typeof api.selectionTransformOperations,'function');
  const input = furniture();
  input.objects[0].groupId = input.objects[1].groupId = 'first-group';
  input.objects[2].groupId = input.objects[3].groupId = 'second-group';
  const ids = ['item-0','item-1','item-2','item-4'];
  const patch = {position:[1,0,1],rotation:Math.PI/2};
  const operations = api.selectionTransformOperations(input,'item-0',patch,ids);
  assert.equal(operations.length,3,'One command per group or loose object');
  const store = new EditorStore(input,catalog); good(execute(store,operations));
  const preview = api.selectionFurnitureUpdates(input,'item-0',patch,ids);
  for (const object of store.scene.objects) {
    const before = input.objects.find(item=>item.id===object.id);
    near(object.position[0],1+before.position[2]); near(object.position[2],1-before.position[0]);
    near(object.rotation,before.rotation+Math.PI/2);
    assert.equal(object.groupId,before.groupId);
    const visual = preview.find(item=>item.id===object.id);
    visual.position.forEach((value,index)=>near(value,object.position[index]));
  }
});

test('selection previews use checked commit semantics including normalization, bounds and member locks', () => {
  assert.equal(typeof api.previewSelectionOperations,'function');
  const input = shell([wall('a',[0,0],[4,0]),wall('b',[4,0],[4,4]),wall('neighbour',[2,0],[2,2])]);
  const store = new EditorStore(input,[],normalizeWallJunctions), original = store.scene;
  const ids = store.scene.walls.filter(wall=>wall.id==='a'||wall.id.startsWith('a~')||wall.id==='b').map(wall=>wall.id);
  const operations = api.wallSelectionOperations(store.scene,ids,[.5,-.5]);
  const preview = api.previewSelectionOperations(store.scene,operations,[],normalizeWallJunctions);
  assert.equal(store.scene,original); assert.equal(store.canUndo,false);
  good(execute(store,operations)); assert.deepEqual(preview,store.scene);
  assert.throws(()=>api.previewSelectionOperations(input,api.wallSelectionOperations(input,['a','b'],[101,0]),[]));
  const pieces = furniture(); pieces.project.metadata['item-1'] = {locked:true};
  assert.throws(()=>api.selectionTransformOperations(pieces,'item-0',{position:[1,0,1]},['item-0','item-1']),/locked|Unlock/);
  assert.throws(()=>api.selectionTransformOperations(furniture(),'item-0',{scale:[2,2,2]},['item-0','item-1']),/resiz|scale|Scale/);
});
