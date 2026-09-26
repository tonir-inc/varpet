const assert = {
  ok(value: unknown, message = 'Expected truthy value') { if (!value) throw new Error(message); },
  equal(actual: unknown, expected: unknown, message = 'Values differ') { if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`); },
  deepEqual(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Values differ: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); },
};
import type { EditCommand, Operation, SceneDocument } from '../contracts';
import { EditorStore } from './store';
import { localCatalog } from './demo';
import { parseScene, serializeScene } from './persistence';
import { validateScene } from './validation';

const scene: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'group-test', name: 'Grouping test', units: 'm', upAxis: 'Y',
  rooms: [{ id: 'room', name: 'Room', polygon: [[-10,-10],[10,-10],[10,10],[-10,10]], color: '#ffffff' }], walls: [],
  objects: [
    { id: 'table', name: 'Table', assetId: localCatalog[0]!.id, position: [0,0,0], rotation: 0, scale: [1,1,1] },
    { id: 'chair', name: 'Chair', assetId: localCatalog[0]!.id, position: [3,0,0], rotation: Math.PI/4, scale: [1,1,1] },
    { id: 'other', name: 'Other', assetId: localCatalog[0]!.id, position: [0,0,5], rotation: 0, scale: [1,1,1] },
  ],
};
let serial = 0, checks = 0;
function check(name: string, test: () => void) { test(); checks++; console.log(`PASS ${name}`); }
function execute(store: EditorStore, operation: unknown, revision = store.revision, approved = true) {
  const command: EditCommand = { id: `command-${++serial}`, label: 'Group check', source: 'human', baseRevision: revision, operations: [operation as Operation] };
  return store.execute(command, approved);
}
function grouped() {
  const store = new EditorStore(scene, localCatalog);
  const result = execute(store, { type: 'group', id: 'dining', objectIds: ['table', 'chair'] });
  assert.equal(result.ok, true, `Grouping should be supported: ${result.errors.join(' ')}`);
  return store;
}
const groupId = (object: unknown) => (object as {groupId?:string}).groupId;
check('grouping preserves placement, migrates explicitly, and saves membership', () => {
  const store = grouped();
  assert.equal(store.scene.version, 2);
  assert.deepEqual(store.scene.objects.map(o => o.position), scene.objects.map(o => o.position));
  assert.deepEqual(store.scene.objects.map(groupId), ['dining','dining',undefined]);
  assert.deepEqual(parseScene(serializeScene(store.scene), localCatalog), store.scene);
  assert.equal(store.revision, 1);
  assert.equal(store.undo().ok, true); assert.deepEqual(store.scene, scene);
  assert.equal(store.redo().ok, true); assert.equal(groupId(store.scene.objects[0]), 'dining');
});
check('moving any member translates the whole group once and undo restores all', () => {
  const store = grouped(); const before = structuredClone(store.scene);
  assert.equal(execute(store, {type:'update', id:'chair', patch:{position:[4,0,2]}}).ok, true);
  assert.deepEqual(store.scene.objects.map(o => o.position), [[1,0,2],[4,0,2],[0,0,5]]);
  assert.equal(store.revision, 2);
  assert.equal(store.undo().ok, true); assert.deepEqual(store.scene, before);
  assert.equal(store.redo().ok, true); assert.deepEqual(store.scene.objects[0]!.position, [1,0,2]);
});
check('rotation orbits members about the selected piece without changing scale or spacing', () => {
  const store = grouped();
  assert.equal(execute(store, {type:'update', id:'table', patch:{rotation:Math.PI/2,position:[1,0,1]}}).ok, true);
  assert.ok(Math.abs(store.scene.objects[1]!.position[0]-1)<1e-9);
  assert.ok(Math.abs(store.scene.objects[1]!.position[2]+2)<1e-9);
  assert.ok(Math.abs(store.scene.objects[1]!.rotation-3*Math.PI/4)<1e-9);
  assert.deepEqual(store.scene.objects.map(o=>o.scale), scene.objects.map(o=>o.scale));
});
check('invalid, stale, unapproved and locked-member transforms are atomic', () => {
  const store = grouped(); const before = serializeScene(store.scene);
  for (const [patch, revision, approved] of [[{position:[101,0,0]},store.revision,true],[{position:[1,0,0]},0,true],[{position:[1,0,0]},store.revision,false],[{scale:[2,1,1]},store.revision,true]] as const) {
    assert.equal(execute(store,{type:'update',id:'table',patch},revision,approved).ok,false);
    assert.equal(serializeScene(store.scene), before);
  }
  assert.equal(execute(store,{type:'set-metadata',id:'chair',patch:{locked:true}}).ok,true);
  const locked = serializeScene(store.scene);
  assert.equal(execute(store,{type:'update',id:'table',patch:{position:[1,0,0]}}).ok,false);
  assert.equal(serializeScene(store.scene),locked);
});
check('invalid membership is rejected and regrouping requires complete existing groups', () => {
  for (const ids of [[],['table'],['table','table'],['table','missing'],['table','room']]) {
    const store = new EditorStore(scene,localCatalog);
    assert.equal(execute(store,{type:'group',id:'dining',objectIds:ids}).ok,false);
    assert.equal(store.revision,0);
  }
  const store=grouped();
  assert.equal(execute(store,{type:'group',id:'new-group',objectIds:['table','other']}).ok,false);
  assert.equal(execute(store,{type:'group',id:'new-group',objectIds:['table','chair','other']}).ok,true);
  assert.deepEqual(store.scene.objects.map(groupId),['new-group','new-group','new-group']);
});
check('ungroup preserves transforms and subsequent moves affect one piece', () => {
  const store=grouped(); const positions=store.scene.objects.map(o=>o.position);
  assert.equal(execute(store,{type:'ungroup',id:'missing'}).ok,false);
  assert.equal(execute(store,{type:'ungroup',id:'dining'}).ok,true);
  assert.deepEqual(store.scene.objects.map(o=>o.position),positions);
  assert.ok(store.scene.objects.every(o=>!groupId(o)));
  assert.equal(execute(store,{type:'update',id:'table',patch:{position:[1,0,0]}}).ok,true);
  assert.deepEqual(store.scene.objects[1]!.position,[3,0,0]);
});
check('delete dissolves singleton groups and undo restores membership', () => {
  const store=grouped();
  assert.equal(execute(store,{type:'delete',id:'chair'}).ok,true);
  assert.equal(groupId(store.scene.objects[0]),undefined);
  assert.equal(store.undo().ok,true);
  assert.deepEqual(store.scene.objects.map(groupId),['dining','dining',undefined]);
});
check('baseline and options retain independent group membership', () => {
  const store=grouped();
  assert.equal(execute(store,{type:'capture-baseline'}).ok,true);
  assert.equal(execute(store,{type:'create-option',id:'option-a',name:'A'}).ok,true);
  assert.equal(execute(store,{type:'create-option',id:'option-b',name:'B'}).ok,true);
  assert.equal(execute(store,{type:'ungroup',id:'dining'}).ok,true);
  assert.equal(execute(store,{type:'switch-option',id:'option-a'}).ok,true);
  assert.equal(groupId(store.scene.objects[0]),'dining');
  assert.equal(execute(store,{type:'switch-option',id:'option-b'}).ok,true);
  assert.equal(groupId(store.scene.objects[0]),undefined);
  assert.equal(execute(store,{type:'restore-baseline'}).ok,true);
  assert.equal(groupId(store.scene.objects[0]),'dining');
});
check('imports reject invalid group IDs, singleton groups and version 1 membership', () => {
  const store=grouped();
  for (const badId of ['',42,'__proto__','x'.repeat(101)]) {
    const broken=JSON.parse(serializeScene(store.scene)); broken.objects[0].groupId=badId;
    assert.equal(validateScene(broken,localCatalog).ok,false);
  }
  const singleton=JSON.parse(serializeScene(store.scene)); delete singleton.objects[1].groupId;
  assert.equal(validateScene(singleton,localCatalog).ok,false);
  const old=JSON.parse(JSON.stringify(scene)); old.objects[0].groupId='dining'; old.objects[1].groupId='dining';
  assert.equal(validateScene(old,localCatalog).ok,false);
  const snapshot=JSON.parse(serializeScene(store.scene));
  execute(store,{type:'capture-baseline'});
  snapshot.project=JSON.parse(serializeScene(store.scene)).project;
  delete snapshot.project.baseline.objects[1].groupId;
  assert.equal(validateScene(snapshot,localCatalog).ok,false);
});
console.log(`PASS ${checks} grouping checks`);
