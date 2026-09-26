import {expect,test} from 'vitest';
import {DesignerSession} from '../src/session.js';
import type {Item,Scene} from '../src/scene.js';

// 6 x 6 room, door in the south wall; a wall-to-wall partition piece cuts the north strip off.
const polygon:[number,number][]=[[0,0],[6,0],[6,6],[0,6]];
const box=(id:string,pos:[number,number],size:[number,number,number]):Item=>({id,room_id:'r',kind:'cabinet',name:id,pos,rot:0,size,keep:false,price:1000});
function scene(items:Item[]):Scene{
 return {rooms:[{id:'r',polygon}],walls:polygon.map((a,i)=>({id:'w'+i,room_id:'r',a,b:polygon[(i+1)%4]!,height:2.7})),
  openings:[{id:'door',wall_id:'w0',kind:'door',offset:1,width:.9,height:2,sill:0}],items,fixed:[]};
}
const shelf=box('shelf',[3,5.6],[1,.4,1.2]);
const partition=(id:string)=>box(id,[3,4],[6,.4,1]);

test('a proposal that newly blocks a walkway is rejected, naming the walkway',()=>{
 const session=new DesignerSession(scene([shelf]));session.setIntent({});
 const result=session.propose([{type:'add',item:partition('divider')}],'Divide the room.');
 expect(result.ok).toBe(false);
 if(!result.ok)expect(result.errors).toContainEqual(expect.objectContaining({check:'walkway',severity:'hard'}));
});

test('a walkway already blocked before the proposal is reported as pre-existing, not as a new failure',()=>{
 const session=new DesignerSession(scene([shelf,partition('existing-divider')]));session.setIntent({room_id:'r',add:[{kinds:['cabinet'],count:1}]});
 const result=session.propose([{type:'add',item:box('side',[1,1.5],[.5,.5,.6])}],'Add a small cabinet.');
 expect(result.ok).toBe(true);
 if(!result.ok)return;
 const blocked=result.proposal.checks.notes?.filter(note=>note.check==='walkway'&&note.walkway?.reachable===false)??[];
 expect(blocked.length).toBeGreaterThan(0);
 for(const note of blocked){expect(note.severity).toBe('soft');expect(note.message).toMatch(/^Pre-existing/);}
 expect(result.proposal.checks.errors.filter(error=>error.check==='walkway'&&error.severity==='hard')).toEqual([]);
});
