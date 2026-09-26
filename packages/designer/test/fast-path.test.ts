import { test, expect } from 'vitest';
import type { Scene } from '../src/scene.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { localGeometryErrors } from '../src/local-checks.js';
import { applyOps } from '../src/adapter.js';

// Missing module is an explicit feature assertion during the first red run.
const modules = import.meta.glob('../src/fast-path.ts', { eager: true });
function api(): any { const value = Object.values(modules)[0]; expect(value, 'fast path API exists').toBeDefined(); return value; }
function room(): Scene {
  return {rooms:[{id:'living',name:'Living room',polygon:[[0,0],[6,0],[6,5],[0,5]]}],
    walls:[{id:'south',room_id:'living',a:[0,0],b:[6,0],thickness:.2},{id:'east',room_id:'living',a:[6,0],b:[6,5],thickness:.2},
      {id:'north',room_id:'living',a:[6,5],b:[0,5],thickness:.2},{id:'west',room_id:'living',a:[0,5],b:[0,0],thickness:.2}],
    openings:[{id:'door',wall_id:'south',kind:'door',offset:.5,width:.9,height:2.1,sill:0,swing:'inward-left'},
      {id:'window',wall_id:'east',kind:'window',offset:1,width:2,height:1.5,sill:.8}],items:[],fixed:[],north_deg:0};
}
const sofa = {id:'catalog-sofa',kind:'sofa',name:'Sofa',category:'Sofas',dimensions:[2,.8,.9],price:50000,color:'#888888',source:{type:'procedural'}};

test.each([
  ['Furnish the living room','furnish.living'],
  ['Furnish the bedroom: a double bed, two nightstands and a wardrobe','furnish.bedroom'],
  ['Add a desk by the window for working from home','add.desk-window'],
  ['Move the sofa so it faces the window','move.face-window'],
  ['Paint the bedroom walls warm white','appearance.walls'],
  ['Make the living room feel bigger.','rearrange.open-floor'],
  ['Knock down the wall between the kitchen and the living room','scope.structural'],
  ['',null],['Make it nice',null],['Do not move the sofa; add a skylight',null],
  ['Furnish the living room but remove the radiator',null],
])('routes conservatively: %s', (text, expected) => expect(api().classifyRequest(text)?.classId ?? null).toBe(expected));

test('cache fingerprints include openings, furniture, keeps, north and catalog dimensions; callers cannot poison cache', () => {
  const cache = new (api().SceneAnalysisCache)(), scene=room();
  const original=cache.analyze(scene,[sofa]), repeat=cache.analyze(structuredClone(scene),[sofa]);
  expect(repeat.fingerprint).toBe(original.fingerprint); expect(cache.stats.hits).toBe(1);
  original.rooms.length=0; expect(cache.analyze(scene,[sofa]).rooms).toHaveLength(1);
  const changed=structuredClone(scene); changed.openings[0]!.width=1;
  expect(cache.analyze(changed,[sofa]).fingerprint).not.toBe(repeat.fingerprint);
  expect(cache.analyze(scene,[{...sofa,dimensions:[3,.8,.9]}]).fingerprint).not.toBe(repeat.fingerprint);
  expect(cache.analyze({...scene,north_deg:90},[sofa]).fingerprint).not.toBe(repeat.fingerprint);
});

test('candidate slots clear physical walls and door sweeps; selection cannot inject coordinates or alien IDs', () => {
  const scene=room(), cache=new (api().SceneAnalysisCache)();
  const slots=cache.slots(scene,[sofa],{roomId:'living',catalogId:sofa.id});
  expect(slots.length).toBeGreaterThan(0); expect(slots.length).toBeLessThanOrEqual(24);
  for(const slot of slots) expect(localGeometryErrors(applyOps(scene,slot.ops))).toEqual([]);
  const prepared=api().prepareFastRequest(scene,'Add a sofa to the living room',[sofa],cache);
  expect(prepared.type).toBe('candidates');
  expect(()=>api().selectFastCandidate(scene,prepared,{slot_id:'invented',catalog_ids:[]})).toThrow();
  expect(()=>api().selectFastCandidate(scene,prepared,{slot_id:prepared.candidates[0].id,catalog_ids:[sofa.id],x:1})).toThrow();
  const selection={slot_id:prepared.candidates[0].id,catalog_ids:[sofa.id]};
  expect(api().selectFastCandidate(scene,prepared,selection).ok).toBe(true);
  const stale=structuredClone(scene); stale.items.push({...prepared.candidates[0].ops[0].item,id:'obstruction'});
  expect(()=>api().selectFastCandidate(stale,prepared,selection)).toThrow(/stale|fingerprint/i);
});

test('impossibility needs a proof and nearest alternative; a search cap is not a proof', () => {
  const scene=room(), giant={...sofa,dimensions:[20,1,20]};
  const result=api().prepareFastRequest(scene,'Add a sofa to the living room',[giant]);
  expect(result.type).toBe('decline'); expect(result.reason).toMatch(/fit|dimension|area/i); expect(result.alternative.length).toBeGreaterThan(10);
  const missing=api().prepareFastRequest({...scene,openings:scene.openings.filter(o=>o.kind!=='window')},'Add a desk by the window for working from home',[]);
  expect(missing.type).toBe('decline'); expect(missing.reason).toMatch(/window/i);
  expect(api().prepareFastRequest(scene,'Add a sofa to the living room',[sofa],undefined,{maxChecks:0}).type).toBe('fallback');
});

test('Avani exact paint goes through propose, bridge and editor approval, preserving furniture', () => {
  const input=structuredClone(demoScene),scene=editorToDesigner(input,{catalog:localCatalog,groupPolicy:'move-together'});
  const prepared=api().prepareFastRequest(scene,'Make the living room west wall blue, exactly #3366cc. Keep all furniture, geometry and other colours unchanged. Propose the colour edit; do not claim that paint or labour has been priced.',localCatalog);
  expect(prepared.type).toBe('candidates');
  const result=api().selectFastCandidate(scene,prepared,{slot_id:prepared.candidates[0].id,catalog_ids:[]});
  expect(result.ok).toBe(true);
  const store=new EditorStore(input,localCatalog),proposal=proposalToEditor(result.proposal,input,0,{catalog:localCatalog,groupPolicy:'move-together'});
  expect(store.execute(proposal.command,false).ok).toBe(false); expect(store.scene).toEqual(input);
  expect(store.execute(proposal.command,true).ok).toBe(true);
  expect(store.scene.walls.find(w=>w.id==='wall-west')!.color).toBe('#3366cc'); expect(store.scene.objects).toEqual(input.objects);
});
