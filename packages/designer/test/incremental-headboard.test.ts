import {test,expect} from 'vitest';
import {SceneAnalysisCache} from '../src/fast-path.js';
import type {Scene} from '../src/scene.js';

test('bounded bed slots reserve side access and support the whole headboard',()=>{
 const polygon:Scene['rooms'][number]['polygon']=[[0,0],[4,0],[4,4],[0,4]];
 const scene:Scene={rooms:[{id:'bedroom',name:'Bedroom',polygon}],walls:polygon.map((a,i)=>({id:'w'+i,room_id:'bedroom',a,b:polygon[(i+1)%4]!,height:2.7,thickness:.1})),openings:[],items:[],fixed:[]};
 const candidates=new SceneAnalysisCache().slots(scene,[{id:'double',name:'Double bed',kind:'bed',category:'bed',dimensions:[1.5,.6,2],price:100,color:'#ffffff',source:{type:'procedural'}}],{roomId:'bedroom',catalogId:'double',maxChecks:8,solidHeadboard:true});
 expect(candidates.length).toBeGreaterThan(0);
 for(const c of candidates){const o=c.ops[0]!;expect(o.type).toBe('add');if(o.type!=='add')continue;
  const b=o.item,t=b.rot*Math.PI/180,head=[b.pos[0]-Math.sin(t),b.pos[1]+Math.cos(t)];
  expect(Math.min(head[0]!,4-head[0]!,head[1]!,4-head[1]!)).toBeCloseTo(.05,4);
 }
});
