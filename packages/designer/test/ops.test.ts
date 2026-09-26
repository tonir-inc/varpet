import { test, expect } from 'vitest';
import bedroom from './fixtures/bedroom.json';
import { applyOps, parseScene } from '../src/adapter.js';

test('hypothetical moves, adds and removals affect only a copy', () => {
  const scene = parseScene(bedroom), original = JSON.stringify(scene);
  const next = applyOps(scene, [
    { type: 'move', id: 'desk', pos: [2,1], rot: 180 },
    { type: 'remove', id: 'chair' },
    { type: 'add', item: { id:'new-chair', room_id:'bedroom', name:'Chair', kind:'chair', pos:[2,2], rot:0, size:[0.5,0.5,0.8], keep:false } },
  ]);
  expect(next.items.find(i=>i.id==='desk')!.pos).toEqual([2,1]);
  expect(next.items.some(i=>i.id==='chair')).toBe(false);
  expect(next.items.some(i=>i.id==='new-chair')).toBe(true);
  expect(JSON.stringify(scene)).toBe(original);
  expect(applyOps(scene, [])).toEqual(scene);
  expect(applyOps(scene, [])).not.toBe(scene);
});

test('ops reject kept changes, duplicate ids, fixed changes and unknown targets', () => {
  const scene = parseScene(bedroom);
  expect(()=>applyOps(scene,[{type:'move',id:'bed',pos:[1,1]}])).toThrow(/keep|kept/i);
  expect(()=>applyOps(scene,[{type:'remove',id:'missing'}])).toThrow(/unknown/i);
  expect(()=>applyOps(scene,[{type:'add',item:scene.items[0]!}])).toThrow(/duplicate/i);
  expect(()=>applyOps({...scene, fixed:[{...scene.items[1]!,id:'radiator'}]},[{type:'remove',id:'radiator'}])).toThrow(/fixed|unknown/i);
});

test('ops reject nonfinite poses and nonexistent room assignments', () => {
  const scene = parseScene(bedroom);
  expect(()=>applyOps(scene,[{type:'move',id:'desk',pos:[Infinity,1]}])).toThrow();
  expect(()=>applyOps(scene,[{type:'move',id:'desk',pos:[1,1],room_id:'missing'}])).toThrow(/room/i);
});
