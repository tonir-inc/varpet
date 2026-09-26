import {test,expect} from 'vitest';
import {requestPolicy} from '../src/request-policy.js';
test('new catalog kinds preserve their own removal identities',()=>{
 for(const [noun,kind] of [['desks','desk'],['wardrobes','wardrobe'],['dressers','dresser'],['nightstands','nightstand'],['stools','stool'],['ottomans','ottoman'],['benches','bench'],['plants','plant']]){
  expect(requestPolicy([`remove the ${noun}`]).blocked_kinds).toEqual([kind]);
  expect(requestPolicy([`remove the ${noun}`,`add a ${kind} again`]).blocked_kinds).toEqual([]);
 }
});
