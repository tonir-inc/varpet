import { expect, test } from 'vitest';
import { checkLayout, layoutPrice, scoreLayout } from '../src/layout.js';
import type { Item, Scene } from '../src/scene.js';

function item(id:string,kind:string,pos:[number,number],size:[number,number,number]=[1,1,1]):Item {
  return {id,kind,name:id,room_id:'r',pos,size,rot:0,keep:false};
}
function scene(items:Item[]):Scene {
  return {rooms:[{id:'r',polygon:[[0,0],[5,0],[5,5],[0,5]]}],walls:[],openings:[],items,fixed:[]};
}

test.each([[0.6,'good'],[0.59,'warn']] as const)('chair pullout uses the whole back edge and %s m has status %s',(gap,status)=>{
  const result=scoreLayout(scene([item('chair','chair',[2.5,4.5-gap])]),[]).after.function_clearances;
  expect(result[0]?.side).toBe('back');
  expect(result[0]?.clearance_m).toBeCloseTo(gap,6);
  expect(result[0]?.status).toBe(status);
});

test.each([[0.36,'good'],[0.46,'good'],[0.35,'warn'],[0.47,'warn']] as const)('sofa to coffee table %s m has status %s',(gap,status)=>{
  const result=scoreLayout(scene([item('sofa','sofa',[2.5,3],[2,1,1]),item('coffee','coffee_table',[2.5,2.25-gap],[1,0.5,1])]),[]).after.function_clearances;
  expect(result[0]?.function).toBe('sofa_coffee');
  expect(result[0]?.clearance_m).toBeCloseTo(gap,6);
  expect(result[0]?.status).toBe(status);
});

test('rotated storage measures its physical front and concave walls interrupt the entire table span',()=>{
  const closet=item('closet','wardrobe',[3.6,2.5]);closet.rot=90;
  expect(scoreLayout(scene([closet]),[]).after.function_clearances[0]?.clearance_m).toBeCloseTo(0.9,6);
  const concave=scene([item('table','table',[2.5,1.5],[3,0.5,1])]);
  concave.rooms[0]!.polygon=[[0,0],[5,0],[5,5],[3,5],[3,2],[2,2],[2,5],[0,5]];
  expect(scoreLayout(concave,[]).after.function_clearances.find(metric=>metric.side==='back')?.clearance_m).toBeCloseTo(0.25,6);
});

test('purchase churn never becomes a refund or a zero-cost bypass',()=>{
  const bought={...item('new','box',[1,1]),price:2000};
  expect(layoutPrice([{type:'add',item:bought},{type:'remove',id:'new'}]).cost_dram).toBe(2000);
  const result=checkLayout(scene([]),[{type:'add',item:item('unknown','box',[1,1])},{type:'remove',id:'unknown'}]);
  expect(result.ok).toBe(false);expect(result.price.cost_dram).toBeNull();
});
