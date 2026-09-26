import {test,expect} from 'vitest';
import {assertComplete,scopeFailures,hasPlaySquare} from '../eval/taste-komitas-grade.js';
const object=(id:string)=>({id,assetId:'sofa',name:id,position:[2,0,2],rotation:0,scale:[1,1,1]});
const empty={format:'varpet.editor',version:1,id:'test',name:'test',units:'m',upAxis:'Y',rooms:[{id:'living',name:'Living',color:'#ffffff',polygon:[[0,0],[5,0],[5,5],[0,5]]}],walls:[],objects:[]};
test('add-sofa rubric rejects extra purchases, collateral edits, wrong room and resized products',()=>{
 const after={...empty,objects:[object('new')]},inventory=[{id:'new',room_id:'living',kind:'sofa'}],reply={proposal:{command:{operations:[{type:'add',object:after.objects[0]}]}}};
 expect(scopeFailures(empty,after,'sofa','living',inventory,reply)).toEqual([]);
 expect(scopeFailures(empty,{...after,objects:[...after.objects,object('extra')]},'sofa','living',[...inventory,{id:'extra',room_id:'living',kind:'lamp'}],reply)).toContain('sofa_scope_mismatch');
 expect(scopeFailures(empty,{...after,walls:[{id:'changed'}]},'sofa','living',inventory,reply)).toContain('unrequested_shell_edit');
 expect(scopeFailures(empty,after,'sofa','bedroom',inventory,reply)).toContain('addition_outside_target');
 expect(scopeFailures(empty,{...after,objects:[{...object('new'),scale:[.5,1,1]}]},'sofa','living',inventory,reply)).toContain('unrequested_catalog_resize');
});
test('final grading refuses missing, duplicate or unexpected cohort cases',()=>{
 const rows=['normal','fast'].flatMap(path=>['living','bedroom','kids','sofa'].map(kind=>({flat:'flat',path,kind})));
 expect(assertComplete(rows,['flat'])).toBe(true);
 expect(()=>assertComplete(rows.slice(1),['flat'])).toThrow(/Incomplete/);
 expect(assertComplete(rows.slice(1),['flat'],true)).toBe(false);
 expect(()=>assertComplete([...rows,rows[0]!],['flat'],true)).toThrow(/duplicate/);
});
test('independent play rubric finds a square and rejects narrow leftover strips',()=>{
 expect(hasPlaySquare(empty,[],'living')).toBe(true);
 const catalog=[{id:'block',name:'Block',kind:'cabinet',category:'Storage',dimensions:[4,2,4],price:100,color:'#ffffff',source:{type:'procedural'}}];
 expect(hasPlaySquare({...empty,objects:[{...object('block'),assetId:'block',position:[2.5,0,2.5]}]},catalog,'living')).toBe(false);
});
