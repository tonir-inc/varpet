import {test,expect} from 'vitest';
import {prepareFastRequest} from '../src/fast-path.js';
import type {Scene} from '../src/scene.js';
test('unqualified paint does not choose the first of two bedrooms',()=>{
  const scene:Scene={rooms:[{id:'a',name:'Bedroom A',polygon:[[0,0],[3,0],[3,3],[0,3]]},{id:'b',name:'Bedroom B',polygon:[[4,0],[7,0],[7,3],[4,3]]}],
    walls:[{id:'wa',room_id:'a',a:[0,0],b:[3,0]},{id:'wb',room_id:'b',a:[4,0],b:[7,0]}],openings:[],items:[],fixed:[]};
  expect(prepareFastRequest(scene,'Paint the bedroom walls warm white').type).toBe('fallback');
});
