import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseScene} from '../src/adapter.js';
import {SceneAnalysisCache} from '../src/fast-path.js';
import {intentFor} from '../src/incremental-room.js';
import {DesignerSession} from '../src/session.js';
import {spaceMetrics,walkwayRegressions} from '../src/metrics/space.js';
import type {Item} from '../src/scene.js';

// Extracted from debug-bed116/scene.json. Neighbour-owned doorway walls are reversed
// into bed116 ownership, preserving their physical segments and opening positions.
const scene=parseScene(JSON.parse(readFileSync(new URL('./fixtures/bed116.json',import.meta.url),'utf8')));
for(const [kind,size] of [['bed',[.7874,1.905,.3556]],['dresser',[1,.45,.8]],['nightstand',[.4,.4,.4]]] as const){
 test(`${kind} has a checked slot through the existing 0.74879 m doorway`,()=>{
  const asset={category:kind,color:"#aaaaaa",source:{type:"procedural" as const},id:kind,name:kind,kind:kind==='bed'?'bed' as const:'cabinet' as const,dimensions:[size[0],size[2],size[1]] as [number,number,number],price:0};
  const slots=new SceneAnalysisCache().slots(scene,[asset],{roomId:'bed116',catalogId:kind,solidHeadboard:kind==='bed',maxChecks:16});
  expect(slots.length).toBeGreaterThan(0);
  for(const slot of slots){
   const session=new DesignerSession(scene);session.setIntent(intentFor(scene,slot.ops,{room_id:'bed116'}));
   expect(session.propose(slot.ops,'Checked placement').ok).toBe(true);
  }
 },30000);
}
test('a pose blocking a door path below 0.60 m is rejected',()=>{
 const item:Item={id:'blocker',room_id:'bed116',kind:'cabinet',name:'Blocker',pos:[18.55,-3.1],rot:0,size:[3.3,.4,.8],keep:false,price:0};
 const ops=[{type:'add' as const,item}];
 expect(spaceMetrics(scene,ops).rooms[0]!.walkways.some(p=>p.width_m<.6)).toBe(true);
 const session=new DesignerSession(scene);session.setIntent(intentFor(scene,ops,{room_id:'bed116'}));
 const result=session.propose(ops,'Blocked path');
 expect(result.ok).toBe(false);
 if(!result.ok)expect(JSON.stringify(result.errors)).toContain('walkway');
});

for(const gap of [.55,.7,.8])test(`a placement leaving ${gap} m circulation respects the hard and preferred limits`,()=>{
 const before=parseScene({rooms:[{id:'r',polygon:[[0,0],[4,0],[4,5],[0,5]]}],walls:[{id:'south',room_id:'r',a:[0,0],b:[4,0]}],openings:[{id:'door',wall_id:'south',kind:'passage',offset:3,width:.9,height:2,sill:0}],fixed:[],items:[{id:'target',name:'Target',room_id:'r',kind:'cabinet',pos:[3.5,4.5],rot:0,size:[.4,.4,.5],keep:false}]});
 const after={...before,items:[...before.items,{id:'barrier',name:'Barrier',room_id:'r',kind:'cabinet',pos:[(4-gap)/2,2.5] as [number,number],rot:0,size:[4-gap,.4,.5] as [number,number,number],keep:false}]};
 const paths=spaceMetrics(after).rooms[0]!.walkways;
 const target=paths.find(p=>p.to==='item:target')!;
 expect(target.width_m).toBeLessThanOrEqual(gap+1e-6);
 expect(walkwayRegressions(before,after).some(p=>p.to==='item:target')).toBe(gap<.75);
});
