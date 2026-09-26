import {test,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTypedServer} from '../src/typed-tools.js';
import type {Scene} from '../src/scene.js';
import {planIncrementally} from '../src/incremental-room.js';
const scene:Scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]]}],walls:[],openings:[],items:[],fixed:[]};
const sizes:Record<string,number[]>={sofa:[2,.85,.8],chair:[.8,.8,.8],rug:[3,3,.02],lamp:[.3,.3,1.4],table:[1,.5,.4],shelf:[1,.3,1.2]};
const query=async(p:{kind?:string})=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind!],price:100,currency:'AMD',size_status:'confirmed',styles:['Scandinavian'],colors_image:['beige']}]});
async function connect(options:Parameters<typeof createTypedServer>[1]={},input=scene){
 const server=createTypedServer(input,options),client=new Client({name:'typed-tests',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 return {client,close:async()=>{await client.close();await server.close();}};
}
const value=(r:any)=>JSON.parse(r.content.find((c:any)=>c.type==='text').text);
test('layout inspection retains measured facts while omitting detailed route coordinates',async()=>{
 const polygon=scene.rooms[0]!.polygon;
 const input={...scene,walls:polygon.map((a,i)=>({id:'w'+i,room_id:'living',a,b:polygon[(i+1)%4]!,height:2.7})),openings:[0,2].map(i=>({id:'door'+i,wall_id:'w'+i,kind:'door' as const,offset:1,width:1,height:2,sill:0}))};
 const c=await connect({},input);try{
  const result=value(await c.client.callTool({name:'inspect_layout',arguments:{room_id:'living'}}));
  expect(result.free_area_m2).toBeGreaterThan(0);expect(result.walkways.length).toBeGreaterThan(0);
  expect(JSON.stringify(result)).not.toContain('"path":');expect(JSON.stringify(result).length).toBeLessThanOrEqual(3000);
 }finally{await c.close();}
});
test('typed inventory cannot accept coordinates, dimensions or operations',async()=>{
 const c=await connect();try{
  const list=(await c.client.listTools()).tools;
  expect(list.map(t=>t.name)).toEqual(expect.arrayContaining(['plan_room','place','move','remove','paint','propose','show_candidates']));
  for(const t of list)expect(JSON.stringify(t.inputSchema)).not.toMatch(/"(?:pos|ops|rot|size|item)":/);
  const bad=await c.client.callTool({name:'propose',arguments:{ops:[{type:'remove',id:'x'}]}});expect(bad.isError).toBe(true);
 }finally{await c.close();}
});
test('complete plans carry images; compact proposal receipts persist full checked evidence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'typed-tools-'));const c=await connect({catalogQuery:query,proposalsDir:dir,images:async ids=>({content:[{type:'image',mimeType:'image/png',data:'preview'},{type:'text',text:ids.map((id,i)=>`${i+1}. ${id} | photo`).join('\n')}]})});
 try{
  const plan=await c.client.callTool({name:'plan_room',arguments:{room_id:'living',program:'living',style:'Scandinavian'}});const p=value(plan);
  expect(p.options.length).toBeGreaterThan(0);expect(p.options.length).toBeLessThanOrEqual(3);expect(JSON.stringify(p)).not.toContain('"pos"');
  expect((plan.content as any[]).some(c=>c.type==='image')).toBe(true);
  const result=await c.client.callTool({name:'propose',arguments:{option_id:p.options[0].option_id}});const receipt=value(result);
  expect(receipt.ok).toBe(true);expect(JSON.stringify(receipt).length).toBeLessThanOrEqual(3000);
  const full=JSON.parse(await readFile(join(dir,receipt.proposal_id+'.json'),'utf8'));
  expect(full.checks.ok).toBe(true);expect(full.request_check.ok).toBe(true);expect(full.requires_user_acceptance).toBe(true);
  expect(full.ops.filter((o:any)=>o.type==='add').map((o:any)=>o.item.kind)).toEqual(expect.arrayContaining(['sofa','rug','lamp','shelf','table']));
  expect(scene.items).toEqual([]);
 }finally{await c.close();await rm(dir,{recursive:true});}
});
test('unknown options and kept furniture are refused without mutating the source',async()=>{
 const input={...scene,items:[{id:'kept',room_id:'living',name:'chair',kind:'chair',pos:[1,1] as [number,number],size:[.5,.5,.5] as [number,number,number],rot:0,keep:true}]};const c=await connect({},input);
 try{for(const [name,args] of [['remove',{item_id:'kept'}],['propose',{option_id:'invented'}]] as const){const r=await c.client.callTool({name,arguments:args});expect(r.isError).toBe(true);}expect(input.items).toHaveLength(1);}finally{await c.close();}
});
test('an anchor fit survives missing later products as an honest partial layout',async()=>{
 const plan=await planIncrementally(scene,{room_id:'living',program:'living',style:'Scandinavian'},async p=>p.kind==='sofa'?query(p):{results:[]});
 expect(plan.ops.some(o=>o.type==='add'&&o.item.kind==='sofa')).toBe(true);
 expect(plan.complete).toBe(false);expect(plan.missing.some(m=>m.startsWith('rug'))).toBe(true);
});
test('existing pieces cannot fill two roles and a single bed does not satisfy a requested double bed',async()=>{
 const item={id:'bed',room_id:'living',name:'bed',kind:'bed',pos:[2,2] as [number,number],size:[1,2,.5] as [number,number,number],rot:0,keep:true};
 // Generic bedrooms prefer a double but accept a single (bed-regression.test.ts); an explicit double request still refuses one.
 const one=await planIncrementally({...scene,items:[item]},{room_id:'living',program:'bedroom',history:['a double bed please']},async()=>({results:[]}));
 expect(one.missing.some(m=>m.startsWith('bed '))).toBe(true);
 const cabinet={...item,id:'cabinet',kind:'cabinet',name:'cabinet',pos:[5,5] as [number,number],size:[.4,.4,.6] as [number,number,number]};
 const two=await planIncrementally({...scene,items:[{...item,size:[1.5,2,.5]},cabinet]},{room_id:'living',program:'bedroom'},async()=>({results:[]}));
 expect(two.missing.some(m=>m.startsWith('storage'))).toBe(true);
});
test('an edit while planning is pending cannot be silently replaced by the older plan',async()=>{
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>started=r);
 const input={...scene,items:[{id:'plant',room_id:'living',kind:'plant',name:'plant',pos:[7,7] as [number,number],size:[.2,.2,.5] as [number,number,number],keep:false,rot:0}]};
 const c=await connect({catalogQuery:async p=>{started();await gate;return query(p);}},input);
 try{
  const pending=c.client.callTool({name:'plan_room',arguments:{room_id:'living',program:'living'}});await entered;
  const removed=value(await c.client.callTool({name:'remove',arguments:{item_id:'plant'}}));expect(removed.ok).toBe(true);release();
  const old=await pending;expect(old.isError).toBe(true);expect(value(old).message).toMatch(/changed during/);
  const first=value(await c.client.callTool({name:'propose',arguments:{}}));const second=value(await c.client.callTool({name:'propose',arguments:{}}));
  expect(first.ok).toBe(true);expect(second.ok).toBe(true);expect(first.proposal_id).not.toEqual(second.proposal_id);
 }finally{release();await c.close();}
});
