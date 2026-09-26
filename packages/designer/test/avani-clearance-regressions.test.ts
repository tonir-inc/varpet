import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {editorToDesigner} from '../src/editor-bridge.js';
import {DesignerSession} from '../src/session.js';
import type {Op} from '../src/scene.js';

// Keep the captured customer inputs and rubric immutable: these are the two
// EditorStore-accepted proposals BENCH independently found to worsen access.
const capture=new URL('../eval/komitas-runs/avani-check/',import.meta.url);
const read=(name:string)=>JSON.parse(readFileSync(new URL(name,capture),'utf8'));
function replay(kind:string) {
  const request=read(`${kind}-request.json`),after=read(`${kind}-after.json`);
  const options={catalog:request.catalog,catalogCurrency:'AMD' as const,northDeg:request.northDeg,groupPolicy:'move-together' as const};
  const scene=editorToDesigner(request.scene,options),next=editorToDesigner(after.scene,options);
  const row=read('run.json').rows.find((row:{kind:string})=>row.kind===kind);
  const ops:Op[]=row.reply.proposal.command.operations.map((op:any)=>op.type==='update'
    ? {type:'move',id:op.id,pos:[op.patch.position[0],-op.patch.position[2]],rot:op.patch.rotation*180/Math.PI}
    : {type:'add',item:{...next.items.find(item=>item.id===op.object.id)!,price:request.catalog.find((asset:any)=>asset.id===op.object.assetId).price}});
  const session=new DesignerSession(scene);session.setIntent({add:ops.filter(op=>op.type==='add').map(op=>({kinds:[op.item.kind],count:1}))});
  return {scene,session,ops};
}

test('Avani furniture functions come from catalog metadata, independent of editable object labels',()=>{
  const input=read('living-request.json');
  for(const object of input.scene.objects)object.name='Desk wardrobe coffee table';
  const scene=editorToDesigner(input.scene,{catalog:input.catalog});
  expect(scene.items.find(item=>item.id==='coffee-table')!.kind).toBe('coffee_table');
  expect(scene.items.find(item=>item.id==='bedside-table')!.kind).toBe('nightstand');
  expect(scene.items.find(item=>item.id==='bedroom-wardrobe')!.kind).toBe('wardrobe');
  expect(scene.items.find(item=>item.id==='dining-table')!.kind).toBe('table');
});

test.each(['living','bedroom'])('refuses captured %s proposal with a new/worsened functional clearance',kind=>{
  const {session,ops}=replay(kind);
  const result=session.propose(ops,'Replay the captured customer proposal.');
  expect(result.ok).toBe(false);
  if(result.ok)throw new Error('Captured access regression was accepted');
  expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({check:'function_clearance',severity:'hard'})]));
  expect(session.listProposals()).toEqual([]);
});

test('existing Avani access deficits still allow a paint-only proposal',()=>{
  const {session}=replay('living');
  session.setIntent({colors:[{target:'item',id:'coffee-table',color:'#556677'}]});
  const result=session.propose([{type:'color',target:'item',id:'coffee-table',color:'#556677'}],'Refresh the table colour.');
  expect(result.ok).toBe(true);
  if(result.ok)expect(result.proposal.checks.notes?.some(note=>note.baseline)).toBe(true);
});
