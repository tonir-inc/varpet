import { expect, test } from 'vitest';
import { checkLayout } from '../src/layout.js';
import type { Op, Scene } from '../src/scene.js';

const scene:Scene={rooms:[{id:'r',polygon:[[0,0],[5,0],[5,5],[0,5]]}],walls:[],openings:[],fixed:[],items:[{id:'bed',kind:'bed',name:'Bed',room_id:'r',pos:[2,2],rot:0,size:[1,1,1],keep:true}]};

test('operation failure identifies the kept object and attempted coordinates',()=>{
  const result=checkLayout(scene,[{type:'move',id:'bed',pos:[3,3]}]);
  expect(result.errors[0]?.item_ids).toEqual(['bed']);
  expect(result.errors[0]?.at).toEqual([3,3]);
});

test('malformed price/pose failures still return finite coordinates instead of invalid JSON numbers',()=>{
  const result=checkLayout(scene,[{type:'add',item:{id:'bad',pos:[Infinity,1]}}] as unknown as Op[]);
  expect(result.ok).toBe(false);
  expect(result.errors.every(error=>error.at.length===2&&error.at.every(Number.isFinite))).toBe(true);
});
