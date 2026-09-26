import { test, expect } from 'vitest';
import { applyOps, parseScene, parseOps } from '../src/adapter.js';
import bedroom from './fixtures/bedroom.json';

test('ops parser accepts only supported fields and finite poses',()=>{
  const move={type:'move',id:'desk',pos:[1,2]};
  expect(parseOps([move])).toEqual([move]);
  expect(()=>parseOps([{...move,size:[5,5,1]}])).toThrow();
  expect(()=>parseOps([{...move,pos:[NaN,2]}])).toThrow();
  expect(()=>parseOps([{type:'edit',id:'desk'}])).toThrow();
  expect(()=>parseOps(null)).toThrow();
  expect(parseOps([])).toEqual([]);
});

test('applyOps fails closed on unsupported operation fields and excessive batches',()=>{
  const scene=parseScene(bedroom);
  expect(()=>applyOps(scene,[{type:'move',id:'desk',pos:[1,2],size:[5,5,1]}] as never)).toThrow();
  expect(()=>parseOps(Array.from({length:201},()=>({type:'remove',id:'chair'})))).toThrow();
});
