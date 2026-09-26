import { expect, test } from 'vitest';
import type { Item, Scene } from '../src/scene.js';
import { checkLayout, scoreLayout } from '../src/layout.js';

function room(): Scene {
  return { rooms: [{ id: 'r', polygon: [[0,0],[5,0],[5,5],[0,5]] }], walls: [], openings: [], items: [], fixed: [] };
}
function item(id: string, x: number, y: number, extra: Partial<Item> = {}): Item {
  return { id, room_id: 'r', kind: 'box', name: id, pos: [x,y], rot: 0, size: [1,1,1], keep: false, ...extra };
}

test('legal empty and touching layouts pass local checks with zero purchase cost and engine availability explicit', () => {
  expect(checkLayout(room(), []).ok).toBe(true);
  const scene = room(); scene.items = [item('a',1,1), item('b',2,1)];
  const result = checkLayout(scene, []);
  expect(result.ok).toBe(true);
  expect(result.price.cost_dram).toBe(0);
  expect(result.checks.some(check => check.check === 'engine' && check.status === 'unavailable')).toBe(true);
  expect(result.metrics?.daylight.status).toBe('unknown');
});

test('overlaps fail with item ids, coordinates and the penetration depth before soft function warnings', () => {
  const scene = room(); scene.items = [item('a',1,1), item('b',1.75,1), item('closet',4.5,0.5,{kind:'wardrobe'})];
  const result = checkLayout(scene, []);
  expect(result.ok).toBe(false);
  const overlap = result.errors.find(error => error.check === 'collision');
  expect(overlap?.item_ids).toEqual(['a','b']);
  expect(overlap?.overlap_depth_m).toBeCloseTo(0.25,8);
  expect(overlap?.at).toHaveLength(2);
  expect(result.errors[0]?.severity).toBe('hard');
  expect(result.errors.some(error => error.severity === 'soft')).toBe(true);
});

test('outside footprints and a blocked required door path fail with actionable geometry', () => {
  const outside = room(); outside.items.push(item('outside',0,1));
  expect(checkLayout(outside, []).errors.some(error => error.check === 'containment' && error.item_ids.includes('outside'))).toBe(true);
  const scene = room();
  scene.walls = [{ id:'s',room_id:'r',a:[0,0],b:[5,0] }, { id:'n',room_id:'r',a:[5,5],b:[0,5] }];
  scene.openings = ['s','n'].map(id=>({id:`door-${id}`,wall_id:id,kind:'door' as const,offset:2,width:1,height:2,sill:0,swing:'none' as const}));
  scene.items = [item('barrier',2.5,2.5,{size:[5,0.5,1]})];
  const result = checkLayout(scene, []);
  expect(result.ok).toBe(false);
  expect(result.errors.some(error => error.check === 'walkway' && error.deficit_m! > 0 && error.at.length === 2)).toBe(true);
});

test('kept changes and invalid operations fail without mutating the original scene', () => {
  const scene = room(); scene.items.push(item('kept',1,1,{keep:true}));
  const original = structuredClone(scene);
  expect(checkLayout(scene,[{type:'move',id:'kept',pos:[2,2]}]).ok).toBe(false);
  expect(checkLayout(scene,[{type:'remove',id:'missing'}]).errors[0]?.message).toMatch(/unknown/i);
  expect(scene).toEqual(original);
});

test('incremental purchase prices are whole nonnegative dram, zero rearranging and no removal refunds', () => {
  const scene = room(); scene.items.push(item('owned',1,1,{price:10000}));
  expect(checkLayout(scene,[{type:'move',id:'owned',pos:[2,2]}]).price.cost_dram).toBe(0);
  expect(checkLayout(scene,[{type:'remove',id:'owned'}]).price.cost_dram).toBe(0);
  const free = checkLayout(room(),[{type:'add',item:item('free',1,1,{price:0})}]);
  expect(free.ok).toBe(true); expect(free.price.cost_dram).toBe(0);
  const paid = checkLayout(room(),[{type:'add',item:item('paid',1,1,{price:12500})}]);
  expect(paid.price.cost_dram).toBe(12500);
  for (const price of [undefined,-1,0.5]) {
    const result = checkLayout(room(),[{type:'add',item:item('unknown',1,1,{price})}]);
    expect(result.ok).toBe(false); expect(result.price.cost_dram).toBeNull();
    expect(result.errors.some(error => error.check === 'price')).toBe(true);
  }
});

test('score reports repeatable metrics before/after and increased open floor after removal on a copy', () => {
  const scene = room(); scene.items.push(item('owned',1,1));
  const original = structuredClone(scene), ops = [{type:'remove' as const,id:'owned'}];
  const score = scoreLayout(scene,ops);
  expect(score.before.space.free_area_m2).toBe(24);
  expect(score.after.space.free_area_m2).toBe(25);
  expect(score.after.function_clearances).toEqual([]);
  expect(score.before.daylight.status).toBe('unknown');
  expect(score.cost_dram).toBe(0);
  expect(scoreLayout(scene,ops)).toEqual(score);
  expect(scene).toEqual(original);
});

test('function clearances measure a wardrobe whole front span, not only its centre ray', () => {
  const scene = room();
  scene.items = [item('closet',2.5,3,{kind:'wardrobe',size:[3,1,2]}),item('box',1.25,2,{size:[0.5,0.5,1]})];
  const clearance = scoreLayout(scene,[]).after.function_clearances.find(metric => metric.item_id === 'closet');
  expect(clearance?.clearance_m).toBeCloseTo(0.25,8);
  expect(clearance?.minimum_m).toBe(0.9);
  expect(clearance?.status).toBe('warn');
});

test('bed side and table wall clearances report exact threshold and deficit without inventing hard failure', () => {
  const bedScene = room(); bedScene.items = [item('bed',1.1,2.5,{kind:'bed'})];
  const side = scoreLayout(bedScene,[]).after.function_clearances.find(metric => metric.item_id === 'bed' && metric.side === 'left');
  expect(side?.clearance_m).toBeCloseTo(0.6,8); expect(side?.status).toBe('good');
  const tableScene = room(); tableScene.items = [item('table',1.3,2.5,{kind:'dining_table'})];
  const metric = scoreLayout(tableScene,[]).after.function_clearances.find(clearance => clearance.item_id === 'table' && clearance.side === 'left');
  expect(metric?.clearance_m).toBeCloseTo(0.8,8); expect(metric?.deficit_m).toBeCloseTo(0.1,8);
  expect(checkLayout(tableScene,[]).ok).toBe(true);
});
