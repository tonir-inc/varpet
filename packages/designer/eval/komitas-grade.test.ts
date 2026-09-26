import {test,expect} from 'vitest';
import {semanticKind,warmWhite,worsened,budgetHeld,facesWindow,grade,flatContext} from './komitas-grade.js';
test('catalog identity distinguishes desk, nightstand and wardrobe from generic furniture',()=>{
  expect(semanticKind({kind:'table',name:'Oak writing desk'})).toBe('desk');
  expect(semanticKind({kind:'cabinet',name:'Two door wardrobe'})).toBe('wardrobe');
  expect(semanticKind({kind:'cabinet',name:'Bedside nightstand'})).toBe('nightstand');
  expect(semanticKind({kind:'table',name:'Dining table'})).toBe('table');
  expect(semanticKind({kind:'chair',name:'Office desk chair'})).toBe('chair');
  expect(semanticKind({kind:'lamp',name:'Bedside nightstand lamp'})).toBe('lamp');
});
test('warm white excludes green and cold blue; accepts warm off-white boundary',()=>{
  expect(warmWhite('#f5f0e6')).toBe(true);expect(warmWhite('#ffffff')).toBe(false);
  expect(warmWhite('#d9efdf')).toBe(false);expect(warmWhite('#e0efff')).toBe(false);
});
test('only new or numerically worsened deficits fail, not unchanged baseline',()=>{
  expect(worsened([{key:'a',deficit:.2}],[{key:'a',deficit:.2}])).toEqual([]);
  expect(worsened([{key:'a',deficit:.2}],[{key:'a',deficit:.21},{key:'b',deficit:.1}])).toHaveLength(2);
  expect(worsened([],[{key:'a',deficit:0}])).toEqual([]);
});
test('budget includes the boundary and refuses unknown costs',()=>{
  expect(budgetHeld(300000,300000)).toBe(true);expect(budgetHeld(300001,300000)).toBe(false);
  expect(budgetHeld(null,300000)).toBe(false);expect(budgetHeld(0,300000)).toBe(true);
});

test('facing checks the whole window span, including rays between midpoint and end',()=>{
  const scene:any={walls:[{id:'w',room_id:'r',a:[-3,-.5],b:[3,-.5]}],openings:[{kind:'window',wall_id:'w',offset:0,width:6}]};
  expect(facesWindow(scene,{room_id:'r',pos:[0,0],rot:63.4349488} as any)).toBe(true);
  expect(facesWindow(scene,{room_id:'r',pos:[0,0],rot:180} as any)).toBe(false);
});
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
test('bedroom grade refuses a missing second nightstand and measures wardrobe fronts',()=>{
  const result=grade('bedroom',demoScene,demoScene,localCatalog,{type:'proposal',proposal:{command:{operations:[]}}},true);
  expect(result.request_match).toBe(false);
  expect(result.measurements_after.some((v:any)=>v.measurement.function==='storage_front')).toBe(true);
});
test('structural grade requires an actual refusal, not merely mentioning an engineer',()=>{
  expect(grade('structural',demoScene,demoScene,localCatalog,{type:'decline',message:'I can remove the wall after an engineer checks it.'},null).pass).toBe(false);
  expect(grade('structural',demoScene,demoScene,localCatalog,{type:'decline',message:"I cannot remove walls. Please consult a structural engineer."},null).pass).toBe(true);
});

test('marketed three-room input never silently skips kids if role is unresolved',()=>{
  const context=flatContext({rooms:[{id:'r1',name:'Room 1'},{id:'r2',name:'Room 2'}]},{room_count:3});
  expect(context.kids_required).toBe(true);expect(context.roles.kids).toBeUndefined();
  expect(flatContext(demoScene,{room_count:2}).kids_required).toBe(false);
  expect(flatContext({rooms:[{id:'l',name:'Living'},{id:'b',name:'Bedroom'},{id:'k',name:'Children'}]}).roles.kids).toBe('k');
});
