import { expect, test } from 'vitest';
import { measure, type Scenario } from './measure.js';
import type { Item, Scene } from '../src/scene.js';

test('bedside proximity grades the final pose after every op, in the same room', () => {
  const scene: Scene = {rooms:[{id:'room',polygon:[[0,0],[6,0],[6,6],[0,6]]}],walls:[],openings:[],
    items:[{id:'bed',kind:'bed',name:'Bed',room_id:'room',size:[1.6,2,.5],pos:[1.5,2],rot:0,keep:true}],fixed:[]};
  const item: Item = {id:'table',kind:'table',name:'Table',room_id:'room',size:[.4,.4,.5],pos:[2.6,2],rot:0,keep:false,price:100};
  const scenario: Scenario = {id:'bedside',category:'add-function',scene:'test',request:'Add a bedside table.',
    expected_intent:{add:[{kinds:['table'],count:1}]},expect:{kind:'proposal'}};
  const proposal = (start: [number,number], end: [number,number]) => ({id:'p',checks:{ok:true},request_check:{ok:true},
    ops:[{type:'add',item:{...item,pos:start}},{type:'move',id:'table',pos:end}]});
  expect(measure({scene,scenario,proposal:proposal([2.6,2],[5,5])}).pass).toBe(false);
  expect(measure({scene,scenario,proposal:proposal([5,5],[2.6,2])}).pass).toBe(true);
});
