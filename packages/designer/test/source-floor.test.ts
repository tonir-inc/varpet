import {test,expect} from 'vitest';
import {localGeometryErrors} from '../src/local-checks.js';
import type {Scene} from '../src/scene.js';

test('room-face reconciliation cannot create floor support outside the editor polygon',()=>{
 const scene:Scene={rooms:[{id:'room',polygon:[[0,0],[4.05,0],[4.05,4],[0,4]]}],walls:[],openings:[],fixed:[],items:[{id:'wardrobe',name:'Wardrobe',kind:'wardrobe',room_id:'room',pos:[3.53,2],rot:0,size:[1,.5,1.9],keep:false}],geometry_audit:{tolerance_m:.053,adjustments:[{room_id:'room',vertex:1,before:[4,0],after:[4.05,0],distance_m:.05},{room_id:'room',vertex:2,before:[4,4],after:[4.05,4],distance_m:.05}],warnings:[],obstacle_wall_ids:[],opening_room_ids:{}}};
 expect(localGeometryErrors({...scene,geometry_audit:undefined})).toEqual([]);
 expect(localGeometryErrors(scene)).toEqual(expect.arrayContaining([expect.objectContaining({check:'inside',item_ids:['wardrobe']})]));
});
