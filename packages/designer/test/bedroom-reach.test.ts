import {test,expect} from 'vitest';
import {scoreComposition} from '../src/taste/composition.js';
import type {Scene,Item} from '../src/scene.js';
test('bedside reach leaves an access strip, while remote tables and foot lamps fail',()=>{
 const item=(id:string,kind:string,x:number,y:number,size:Item['size']):Item=>({id,kind,room_id:'bedroom',name:id,pos:[x,y],rot:0,size,keep:false});
 const scene:Scene={rooms:[{id:'bedroom',polygon:[[-3,-3],[3,-3],[3,3],[-3,3]]}],walls:[],openings:[],fixed:[],items:[item('bed','bed',0,0,[1.6,2,.6]),item('left','lamp',-1.5,.15,[.2,.2,1.5]),item('right','lamp',1.5,.15,[.2,.2,1.5]),item('left-table','nightstand',-1.65,.65,[.4,.4,.5]),item('right-table','nightstand',1.65,.65,[.4,.4,.5])]};
 const issues=(s:Scene)=>scoreComposition(s,'bedroom',{program:'bedroom'}).issues.map(i=>i.code);
 expect(issues(scene)).not.toContain('light_each_bedside');expect(issues(scene)).not.toContain('nightstand_each_open_side');
 const bad={...scene,items:scene.items.map(i=>i.kind==='lamp'?{...i,pos:[i.pos[0],-.3] as [number,number]}:i.kind==='nightstand'?{...i,pos:[Math.sign(i.pos[0])*2,.65] as [number,number]}:i)};
 expect(issues(bad)).toEqual(expect.arrayContaining(['light_each_bedside','nightstand_each_open_side']));
});
