import {expect,test} from 'vitest';
import type {Item,Scene} from '../src/scene.js';
import {spaceMetrics,workSurface} from '../src/metrics/space.js';

const scene=(items:Item[]):Scene=>({rooms:[{id:'r',polygon:[[0,0],[4,0],[4,4],[0,4]]}],walls:[{id:'south',room_id:'r',a:[0,0],b:[4,0]},{id:'north',room_id:'r',a:[4,4],b:[0,4]}],
 openings:[{id:'entry',wall_id:'south',kind:'door',offset:1.5,width:.9,height:2,sill:0,swing:'none'}],items,fixed:[],north_deg:0});
const piece=(id:string,kind:string,pos:[number,number],rot:number,size:[number,number,number]):Item=>({id,room_id:'r',kind,name:id,pos,rot,size,keep:false});
const desk=piece('desk','desk',[2,3.75],0,[1,.5,.75]);
const route=(s:Scene,id:string)=>spaceMetrics(s).rooms[0]!.walkways.find(w=>w.to===`item:${id}`)!;

test('a chair pulled up to the desk is part of its work zone: both are reached from behind the chair',()=>{
 const chair=piece('chair','chair',[2,3.2],180,[.5,.5,.9]);
 const s=scene([desk,chair]);
 expect(workSurface(chair,s.items)?.id).toBe('desk');
 for(const id of ['desk','chair']){const w=route(s,id);expect(w.reachable).toBe(true);expect(w.width_m).toBeGreaterThanOrEqual(.75);}
});

test('anything else in front of the desk still blocks its access',()=>{
 for(const blocker of [piece('box','cabinet',[2,3.2],180,[.5,.5,.9]),piece('chair','chair',[2,3.2],0,[.5,.5,.9])]){
  const s=scene([desk,blocker]);
  expect(workSurface(blocker,s.items)).toBeUndefined();
  const w=route(s,'desk');expect(!w.reachable||w.width_m<.75).toBe(true);
 }
});

test('a chair pulled up to the desk still needs its own 0.75 m route from behind',()=>{
 // A wardrobe right behind the chair leaves no way to draw it back.
 const chair=piece('chair','chair',[2,3.2],180,[.5,.5,.9]),wardrobe=piece('wardrobe','wardrobe',[2,2.6],0,[1.2,.6,1.9]);
 const s=scene([desk,chair,wardrobe]);
 for(const id of ['desk','chair']){const w=route(s,id);expect(!w.reachable||w.width_m<.75).toBe(true);}
});
