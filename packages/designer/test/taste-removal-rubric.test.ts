import {test,expect} from 'vitest';
import {seatingRubric} from '../eval/taste-rubric.js';
const request=['put any kind of couch in the middle of the living room','remove the couch, and remake the living room in minimalistic style but make sure it is also cozy'];
test('Ashot rubric rejects the old sofa after-shot and accepts alternative chair seating',()=>{
 expect(seatingRubric([{kind:'sofa',size:[2,.8,.8]}],request)).toEqual({seating:true,removed_kinds:false});
 expect(seatingRubric([{kind:'chair',size:[.8,.8,.8]},{kind:'chair',size:[.8,.8,.8]}],request)).toEqual({seating:true,removed_kinds:true});
 expect(seatingRubric([{kind:'chair',size:[.8,.8,.8]}],request).seating).toBe(false);
});
