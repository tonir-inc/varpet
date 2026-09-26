import {expect,test} from 'vitest';
import * as fast from '../src/fast-path.js';
import {createEditorDemoInput} from '../eval/editor-demo.js';
import {DesignerSession} from '../src/session.js';

const empty = () => {const {scene}=createEditorDemoInput();scene.items=[];return scene;};
test('live furnishing discovers real products even when the editor has registered none',async()=>{
  expect(fast).toHaveProperty('discoverFastCatalog');
  const calls:string[]=[];
  const query=async(input:{kind?:string})=>{calls.push(input.kind!);return {results:[{id:`abo:${input.kind}`,kind:input.kind,name:`Catalog ${input.kind}`,currency:'AMD',price:45000,
    fit_size_m:input.kind==='sofa'?[1.8,.8,.8]:[.8,.5,.4],license:'CC BY 4.0',glb_url:`https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/1/${input.kind}.glb`}]};};
  const discover=fast.discoverFastCatalog;
  const catalog=await discover(empty(),'Furnish the living room',[],query);
  expect(calls.sort()).toEqual(['sofa','table']);
  expect(catalog.map(a=>a.kind).sort()).toEqual(['sofa','table']);
  const prepared=fast.prepareFastRequest(empty(),'Furnish the living room',catalog);
  expect(prepared.type).toBe('candidates');
  if(prepared.type==='candidates')expect(prepared.candidates.every(c=>c.ops.length===2)).toBe(true);
  const owned={...catalog[0]!,name:'Immutable registered identity'};
  expect((await discover(empty(),'Furnish the living room',[owned],query)).find(a=>a.id===owned.id)).toEqual(owned);
  await expect(discover(empty(),'Furnish the living room',[],async()=>{throw Error('catalog offline');})).rejects.toThrow('catalog offline');
});
test('empty living room gives an honest answer instead of an empty proposal or unsolicited paint',()=>{
 const result=fast.prepareFastRequest(empty(),'Make the living room feel bigger');
 expect(result.type).toBe('decline');
 if(result.type==='decline'){expect(result.reason).toMatch(/nothing|no.*furniture/i);expect(result.alternative).toMatch(/furnish/i);}
 const session=new DesignerSession(empty());session.setIntent({});
 expect(session.propose([],'No furniture to rearrange.').ok).toBe(false);
});
test.each(['destroy the wall between the kitchen and the other room','Demolish the wall between the kitchen and living room','Remove a wall','Tear down the bathroom wall'])('structural phrase is code-routed: %s',request=>{
 expect(fast.classifyRequest(request)?.classId).toBe('scope.structural');
 expect(fast.prepareFastRequest(empty(),request).type).toBe('decline');
});
test('double-bed access contradiction is measured, not inferred from the bathroom label',()=>{
 const scene=empty();const result=fast.prepareFastRequest(scene,'Put a double bed in the bathroom');
 expect(result.type).toBe('decline');
 if(result.type==='decline'){expect(result.reason).toMatch(/1.6/);expect(result.reason).toMatch(/access/);expect(result.alternative).toMatch(/bedroom/);}
 const wide=empty();wide.rooms.find(r=>r.name==='Bathroom')!.polygon=[[10,0],[15,0],[15,5],[10,5]];
 expect(fast.prepareFastRequest(wide,'Put a double bed in the bathroom').type).not.toBe('decline');
});
test.each(['Paint the apartment red','Paint all walls red'])('whole-flat paint includes all solid walls: %s',request=>{
 const scene=empty(),result=fast.prepareFastRequest(scene,request);
 expect(result.type).toBe('candidates');
 if(result.type==='candidates'){
  expect(result.candidates[0]!.ops).toHaveLength(scene.walls.filter(w=>!w.open).length);
  expect(result.candidates[0]!.ops.every(o=>o.type==='color'&&o.color==='#ff0000')).toBe(true);
  expect(fast.selectFastCandidate(scene,result,{slot_id:result.candidates[0]!.id,catalog_ids:[]}).ok).toBe(true);
 }
});
test.each(['Do not remove a wall','Remove a wall painting','Paint all walls red except the bedroom','Put a double bed in the bathroom and paint it blue'])('qualified or unrelated request preserves general interpretation: %s',request=>{
 expect(fast.classifyRequest(request)).toBeUndefined();
});
test('whole-flat paint never scopes itself to the only windowed room',()=>{
 const scene=empty();scene.openings=scene.openings.filter(o=>o.kind!=='window'||scene.walls.find(w=>w.id===o.wall_id)?.room_id==='room-living');
 const prepared=fast.prepareFastRequest(scene,'Paint all walls red');expect(prepared.type).toBe('candidates');
 if(prepared.type==='candidates')expect(fast.selectFastCandidate(scene,prepared,{slot_id:prepared.candidates[0]!.id,catalog_ids:[]}).ok).toBe(true);
});
test('another option excludes the exact earlier candidate instead of simply reordering it',()=>{
 expect(fast).toHaveProperty('excludeFastOptions');
 const scene=empty(),prepared=fast.prepareFastRequest(scene,'Paint all walls red');
 if(prepared.type!=='candidates')throw Error('Expected paint candidate');
 const selected=fast.selectFastCandidate(scene,prepared,{slot_id:prepared.candidates[0]!.id,catalog_ids:[]});
 if(!selected.ok)throw Error('Expected accepted paint');
 const filtered=fast.excludeFastOptions(prepared,[selected.proposal.ops]);
 expect(filtered.type).not.toBe('candidates');
});
test('sampled catalog misses do not become global absence or physical-impossibility claims',()=>{
 const scene=empty();
 const missing=fast.prepareFastRequest(scene,'Furnish the living room',[],undefined,{catalogComplete:false});
 expect(missing.type).toBe('fallback');
 const ambiguous=empty();ambiguous.rooms.push({...ambiguous.rooms.find(r=>r.id==='room-bedroom')!,id:'second-bedroom'});
 const result=fast.prepareFastRequest(ambiguous,'Put a double bed in the bedroom',[],undefined,{catalogComplete:false});
 expect(result.type).toBe('fallback');
});
