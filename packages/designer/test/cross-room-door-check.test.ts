import { expect, test } from 'vitest';
import { localGeometryErrors } from '../src/local-checks.js';
import { DesignerSession } from '../src/session.js';
import type { Scene } from '../src/scene.js';

function adjacentRooms():Scene {
  return {
    rooms:[{id:'a',polygon:[[0,0],[4,0],[4,3],[0,3]]},{id:'b',polygon:[[0,-3],[4,-3],[4,0],[0,0]]}],
    walls:[{id:'shared',room_id:'a',a:[0,0],b:[4,0]}],
    openings:[{id:'door',wall_id:'shared',kind:'door',offset:1,width:1,height:2,sill:0,swing:'outward-left'}],
    items:[{id:'cabinet',room_id:'b',kind:'cabinet',name:'Cabinet',pos:[3,-2],size:[0.4,0.4,1],rot:0,keep:false}],fixed:[],
  };
}

test('both outward hinges reject movable and fixed objects in the adjacent room sweep',()=>{
  for(const swing of ['outward-left','outward-right'] as const) {
    const scene=adjacentRooms();scene.openings[0]!.swing=swing;
    expect(localGeometryErrors(scene)).toEqual([]);
    scene.items[0]!.pos=[1.5,-0.5];
    const error=localGeometryErrors(scene).find(error=>error.check==='door_swing');
    expect(error).toMatchObject({item_ids:['cabinet'],at:[1.5,-0.5]});
    expect(error!.deficit_m).toBeGreaterThan(0);
    scene.fixed=scene.items;scene.items=[];
    expect(localGeometryErrors(scene).some(error=>error.check==='door_swing')).toBe(true);
  }
});

test('propose refuses a requested move into another room door swing without mutating the base',()=>{
  const scene=adjacentRooms(),before=structuredClone(scene),session=new DesignerSession(scene);
  session.setIntent({room_id:'b',move:[{kinds:['cabinet'],count:1}]});
  const result=session.propose([{type:'move',id:'cabinet',pos:[1.5,-0.5]}],'Move the cabinet toward the shared door.');
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).toMatch(/door_swing/);
  expect(session.listProposals()).toEqual([]);
  expect(session.getScene()).toEqual(before);
  expect(scene).toEqual(before);
});

test('outward sweep does not block furniture inside its source room',()=>{
  const scene=adjacentRooms();scene.items[0]!.room_id='a';scene.items[0]!.pos=[1.5,0.5];
  expect(localGeometryErrors(scene)).toEqual([]);
});
