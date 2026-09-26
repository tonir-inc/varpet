import { test, expect } from 'vitest';
import type { Scene } from '../src/scene.js';
import { DesignerSession } from '../src/session.js';

function rearrange():Scene {
  return {rooms:[{id:'room',polygon:[[0,0],[6,0],[6,6],[0,6]]}],walls:[],openings:[],fixed:[],items:[{id:'desk',room_id:'room',kind:'desk',name:'Desk',pos:[3,3],rot:45,size:[1.2,0.6,0.75],keep:false}]};
}

test('legal layout ignoring requested kind is refused with the missing kind named',()=>{
  const session=new DesignerSession(rearrange());
  session.setIntent({room_id:'room',add:[{kinds:['crib'],count:1}]});
  const result=session.propose([],'Keep the current layout.');
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).toMatch(/crib/);
  expect(session.listProposals()).toEqual([]);
});

test('moves of kept items are refused without storing a proposal or changing the scene',()=>{
  const scene=rearrange();scene.items[0]!.keep=true;
  const session=new DesignerSession(scene);session.setIntent({});
  const result=session.propose([{type:'move',id:'desk',pos:[2,2]}],'Move the desk.');
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).toMatch(/keep|kept/i);
  expect(session.getScene()).toEqual(scene);
  expect(session.listProposals()).toEqual([]);
});

test('correct rearrange stores a stable proposal and scores more open raster floor and rectangle',()=>{
  const scene=rearrange(),session=new DesignerSession(scene);session.setIntent({});
  const result=session.propose([{type:'move',id:'desk',pos:[3,3],rot:0}],'Align the desk to open more usable floor.');
  expect(result.ok).toBe(true);
  if(!result.ok) throw new Error(JSON.stringify(result));
  expect(result.proposal_id).toMatch(/^proposal-/);
  expect(result.score.after.space.free_area_m2).toBeGreaterThan(result.score.before.space.free_area_m2);
  expect(result.score.after.space.rooms[0]!.largest_free_rectangle!.area_m2).toBeGreaterThan(result.score.before.space.rooms[0]!.largest_free_rectangle!.area_m2);
  expect(result.score.cost_dram).toBe(0);
  expect(session.getScene()).toEqual(scene);
  expect(session.getProposal(result.proposal_id)!.ops).toEqual([{type:'move',id:'desk',pos:[3,3],rot:0}]);
  const copy=session.getProposal(result.proposal_id)!;
  copy.ops.length=0;
  expect(session.getProposal(result.proposal_id)!.ops).toHaveLength(1);
  const empty=session.propose([],'Keep this as another option.');
  expect(empty.ok).toBe(false);
  expect(JSON.stringify(empty)).toMatch(/empty_proposal/);
  expect(session.listProposals()).toHaveLength(1);
  const second=session.propose([{type:'move',id:'desk',pos:[2,2],rot:0}],'Move the desk as another option.');
  expect(second.ok).toBe(true);
  if(second.ok) expect(second.proposal_id).not.toBe(result.proposal_id);
});

test('intent is required, validates rooms, and is stored independently of caller mutation',()=>{
  const session=new DesignerSession(rearrange());
  expect(session.propose([],'No changes.').ok).toBe(false);
  expect(()=>session.setIntent({room_id:'missing'})).toThrow(/room/i);
  const intent={keeps:['desk']};session.setIntent(intent);intent.keeps.length=0;
  expect(session.propose([{type:'move',id:'desk',pos:[1,1]}],'Move desk.').ok).toBe(false);
  expect(session.propose([],'').ok).toBe(false);
  expect(session.getProposal('missing')).toBeUndefined();
});

test('failed checks and over-budget requests do not allocate proposal ids',()=>{
  const session=new DesignerSession(rearrange());
  session.setIntent({add:[{kinds:['chair'],count:1}],budget_dram:100});
  const add={type:'add' as const,item:{id:'chair',room_id:'room',kind:'chair',name:'Chair',pos:[1,1] as [number,number],rot:0,size:[0.5,0.5,0.8] as [number,number,number],keep:false,price:101}};
  expect(session.propose([add],'Add chair.').ok).toBe(false);
  expect(session.listProposals()).toEqual([]);
  const allowed={...add,item:{...add.item,price:100}};
  const result=session.propose([allowed],'Add the chair within budget.');
  expect(result.ok).toBe(true);
  if(result.ok) expect(result.proposal_id).toBe('proposal-1');
});
