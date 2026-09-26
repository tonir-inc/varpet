import { expect, test } from 'vitest';
import { functionClearances } from '../src/metrics/function.js';
import type { Opening, Scene } from '../src/scene.js';

function adjacentRooms(swing:Opening['swing']):Scene {
  return {
    rooms:[
      {id:'south',polygon:[[0,0],[3,0],[3,3],[0,3]]},
      {id:'north',polygon:[[0,3],[3,3],[3,6],[0,6]]},
    ],
    walls:[{id:'shared',room_id:'south',a:[3,3],b:[0,3]}],
    openings:[{id:'door',wall_id:'shared',kind:'door',offset:1,width:1,height:2,sill:0,swing}],
    // The physical wardrobe is clear of the swing, but its front access strip is not.
    items:[{id:'wardrobe',room_id:'north',kind:'wardrobe',name:'Wardrobe',pos:[1.5,4.5],size:[1,0.5,2],rot:0,keep:false}],
    fixed:[],
  };
}

test.each(['outward-left','outward-right'] as const)('a neighboring room %s door sweep reduces full-front wardrobe access',swing=>{
  const clearance=functionClearances(adjacentRooms(swing))[0]!;
  expect(clearance.item_id).toBe('wardrobe');
  // The ideal 1 m sweep ends at y=4; conservative arc approximation stays within 1 cm.
  expect(clearance.clearance_m).toBeGreaterThan(0.24);
  expect(clearance.clearance_m).toBeLessThanOrEqual(0.25);
  expect(clearance.deficit_m).toBeGreaterThanOrEqual(0.65);
  expect(clearance.status).toBe('warn');
});

test.each(['none','inward-left','inward-right'] as const)('a %s sweep outside the access strip leaves the adjacent wardrobe clearance unchanged',swing=>{
  const clearance=functionClearances(adjacentRooms(swing))[0]!;
  expect(clearance.clearance_m).toBe(1.25);
  expect(clearance.status).toBe('good');
});

test('an outward sweep touching the wardrobe access edge gives only millimetres of clearance',()=>{
  const scene=adjacentRooms('outward-left');
  scene.items[0]!.pos[1]=4.252;
  const clearance=functionClearances(scene)[0]!;
  expect(clearance.clearance_m).toBeGreaterThanOrEqual(0);
  expect(clearance.clearance_m).toBeLessThan(0.003);
  expect(clearance.status).toBe('warn');
});
