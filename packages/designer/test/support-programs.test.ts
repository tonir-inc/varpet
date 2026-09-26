import {test,expect} from 'vitest';
import {planIncrementally,pieceOps} from '../src/incremental-room.js';
import {SceneAnalysisCache} from '../src/fast-path.js';
import {applyOps} from '../src/adapter.js';
import {scoreComposition} from '../src/taste/composition.js';
import {railingSegments,railingGap,isOutdoorRoom} from '../src/balcony.js';
import {inferRoomProgram} from '../knowledge/room-programs.js';
import type {Scene,Item,Vec2} from '../src/scene.js';
import type {CatalogProduct} from '../src/catalog.js';

const product=(kind:string,size:[number,number,number],sku=kind):CatalogProduct=>({sku,kind,name:kind,size,price:100,currency:'AMD',vendor:null,source:null,price_source:null,size_status:'confirmed',size_evidence:null,wd_swapped:false,colors_listing:[],colors_image:['beige'],styles:['Scandinavian'],item:{id:sku,kind,name:kind,size,sku,price:100}});
const walled=(id:string,name:string,polygon:Vec2[],door?:{wall:number;offset:number}):Scene=>({rooms:[{id,name,polygon}],walls:polygon.map((a,i)=>({id:`${id}-w${i}`,room_id:id,a,b:polygon[(i+1)%polygon.length]!,height:2.7})),openings:door?[{id:`${id}-door`,wall_id:`${id}-w${door.wall}`,kind:'door',offset:door.offset,width:.9,height:2.1,sill:0}]:[],items:[],fixed:[]});
const catalog=(sizes:Record<string,[number,number,number][]>,names:Record<string,string>={})=>async(p:{kind?:string;max_h?:number})=>({results:(sizes[p.kind!]??[]).filter(s=>p.max_h===undefined||s[2]<=p.max_h).map((size,i)=>({id:`${p.kind}-${i}`,kind:p.kind,name:names[p.kind!]??p.kind,size_m:size,price:100,currency:'AMD',size_status:'confirmed',styles:['Scandinavian'],colors_image:['beige']}))});

test('a table lamp for a bedside is offered only on the nightstand on that side of the bed',()=>{
 const bed:Item={id:'bed',room_id:'r',kind:'bed',name:'bed',pos:[2.5,3.9],rot:0,size:[1.4,2,.5],keep:false};
 const stand=(id:string,x:number):Item=>({id,room_id:'r',kind:'nightstand',name:id,pos:[x,4.7],rot:0,size:[.45,.4,.55],keep:false});
 const scene={...walled('r','Bedroom',[[0,0],[5,0],[5,5],[0,5]]),items:[bed,stand('left',1.5),stand('right',3.5)]};
 for(const [index,support] of [[0,'left'],[1,'right']] as const){
  const ops=[...pieceOps(scene,product('lamp',[.25,.25,.45]),'r',new SceneAnalysisCache(),'bedside_lights',bed,index,true)];
  expect(ops.length).toBeGreaterThan(0);
  expect(ops.every(o=>o.type==='add'&&o.item.on===support)).toBe(true);
  const after=applyOps(scene,[ops[0]!]);
  expect(after.items.at(-1)!.on).toBe(support);
 }
 // A floor lamp still gets floor candidates; a table lamp never does.
 expect([...pieceOps(scene,product('lamp',[.25,.25,.45]),'r',new SceneAnalysisCache(),'bedside_lights',bed,0,false)].every(o=>o.type==='add'&&o.item.on)).toBe(true);
});

test('a bedroom plan puts bedside table lamps on both nightstands and passes the room program',async()=>{
 const scene=walled('r','Bedroom',[[0,0],[4.5,0],[4.5,4.5],[0,4.5]],{wall:0,offset:3.3});
 const query=catalog({bed:[[1.4,2,.5]],nightstand:[[.45,.4,.55]],lamp:[[.25,.25,.45]],wardrobe:[[1.2,.55,2]]},{nightstand:'bedside nightstand',wardrobe:'wardrobe'});
 const plan=await planIncrementally(scene,{room_id:'r',program:'bedroom',style:'Scandinavian'},query);
 const lamps=plan.ops.filter(o=>o.type==='add'&&o.item.kind==='lamp');
 expect(lamps).toHaveLength(2);
 expect(lamps.every(o=>o.type==='add'&&o.item.on!==undefined)).toBe(true);
 const after=applyOps(scene,plan.ops);
 expect(scoreComposition(after,'r',{program:'bedroom'}).issues.map(i=>i.code)).not.toContain('light_each_bedside');
},60000);

test('a balcony named after the living room gets the balcony program and keeps clear of its railing',async()=>{
 // The balcony's west edge meets the living room; the other three edges are railing.
 const living=walled('living','Living room',[[0,0],[4,0],[4,3],[0,3]]),balcony=walled('balcony','Balcony · living room',[[4.2,0],[5.7,0],[5.7,3],[4.2,3]]);
 const scene:Scene={rooms:[...living.rooms,...balcony.rooms],walls:[...living.walls,...balcony.walls.filter(w=>w.id==='balcony-w3')],openings:[{id:'door',wall_id:'balcony-w3',kind:'door',offset:2,width:.8,height:2.1,sill:0}],items:[],fixed:[]};
 expect(isOutdoorRoom(scene.rooms[1]!)).toBe(true);expect(inferRoomProgram('Balcony · living room')).toBe('balcony');
 const railings=railingSegments(scene,'balcony');expect(railings).toHaveLength(3);
 const query=catalog({sofa:[[1.8,.85,.8]],rug:[[1.6,1.2,.01]],lamp:[[.3,.3,1.6]],shelf:[[1,.3,.5]],chair:[[.5,.55,.8]],bench:[[1,.4,.45]],table:[[.5,.5,.7]],plant:[[.3,.3,.8]]});
 const plan=await planIncrementally(scene,{room_id:'balcony',program:'living'},query);
 const kinds=plan.ops.flatMap(o=>o.type==='add'?[o.item.kind]:[]);
 expect(kinds).not.toContain('sofa');expect(kinds).not.toContain('rug');
 expect(kinds.some(k=>['chair','bench'].includes(k))).toBe(true);
 const after=applyOps(scene,plan.ops);
 for(const item of after.items)expect(railingGap(item,railings)).toBeGreaterThanOrEqual(.3-1e-9);
 expect(plan.reason).toMatch(/balcony/i);
 expect(plan.reason).not.toMatch(/\d\/\d|Needs \d|Every seat must|_/);
},60000);

test('a desk lamp goes on the desk top toward the back, and never onto the floor without a desk',()=>{
 const desk:Item={id:'desk',room_id:'r',kind:'desk',name:'desk',pos:[2,.4],rot:180,size:[1,.55,.75],keep:false};
 const bed:Item={id:'bed',room_id:'r',kind:'bed',name:'bed',pos:[2,3.5],rot:0,size:[.9,1.9,.4],keep:false};
 const scene={...walled('r','Kids',[[0,0],[4,0],[4,4.5],[0,4.5]]),items:[desk,bed]};
 const lamp=product('lamp',[.2,.2,.4]);
 const onDesk=[...pieceOps(scene,lamp,'r',new SceneAnalysisCache(),'task_light',desk,0)];
 expect(onDesk.length).toBeGreaterThan(0);
 expect(onDesk.every(o=>o.type==='add'&&o.item.on==='desk')).toBe(true);
 // Rotated 180 degrees, the desk's front faces +y, so its back half is toward y=0.
 const first=onDesk[0]!;if(first.type!=='add')throw new Error('add expected');
 expect(first.item.pos[1]).toBeLessThan(desk.pos[1]);
 expect([...pieceOps(scene,lamp,'r',new SceneAnalysisCache(),'task_light',bed,0)]).toEqual([]);
});

test('a partial plan explains missing pieces in customer words, not rule codes',async()=>{
 const scene=walled('r','Living',[[0,0],[5,0],[5,5],[0,5]],{wall:0,offset:2});
 const plan=await planIncrementally(scene,{room_id:'r',program:'living',style:'Scandinavian'},catalog({sofa:[[2,.9,.8]],table:[[.45,.45,.4]],lamp:[[.2,.2,1.4]],shelf:[[1,.3,1.2]]}));
 expect(plan.complete).toBe(false);
 expect(plan.reason.startsWith('Partial layout:')).toBe(true);
 expect(plan.reason).toContain('a rug');
 expect(plan.reason).not.toMatch(/rug 1\/1|Needs 1|One rug must|rug_anchor/);
 expect(plan.missing.some(m=>m.startsWith('rug 1/1'))).toBe(true);
},60000);
