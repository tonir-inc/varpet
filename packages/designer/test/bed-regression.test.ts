import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {parseScene} from '../src/adapter.js';
import {createTypedServer} from '../src/typed-tools.js';
import {planIncrementally} from '../src/incremental-room.js';
import {fitProducts,type RawProduct} from '../src/catalog-acceleration.js';
import {DesignerSession} from '../src/session.js';
import {intentFor} from '../src/incremental-room.js';
import type {CatalogQuery} from '../src/catalog.js';

// Original scene geometry and three single-bed rows copied from catalog/data/debug-bed/.
const scene=parseScene(JSON.parse(readFileSync(new URL('./fixtures/bed-slot-scene.json',import.meta.url),'utf8')));
const beds:RawProduct[]=JSON.parse(readFileSync(new URL('./fixtures/bed-slot-products.json',import.meta.url),'utf8')).map((p:RawProduct)=>({...p,currency:'AMD'}));
const query:CatalogQuery=async p=>({results:p.kind==='bed'?beds:[]});
const images=async(ids:string[])=>({content:[{type:'image',mimeType:'image/png',data:'preview'},{type:'text',text:ids.map((id,i)=>`${i+1}. ${id} | photo`).join('\n')}]});
const value=(r:any)=>JSON.parse(r.content.find((c:any)=>c.type==='text').text);
for(const room_id of ['room-bedroom-large','room-bedroom-small']){
 test(`search_catalog and place return a checked bed in ${room_id}`,async()=>{
  const server=createTypedServer(scene,{catalogQuery:query,images});
  const client=new Client({name:'bed-regression',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  try{
   const result=value(await client.callTool({name:'search_catalog',arguments:{room_id,queries:[{kind:'bed',limit:3}]}}));
   expect(result.ok,JSON.stringify(result)).toBe(true);
   expect(result.candidates.length).toBeGreaterThan(0);
   const candidate=result.candidates[0];
   expect(value(await client.callTool({name:'place',arguments:{piece_or_catalog_id:candidate.catalog_id,slot_id:candidate.slot_id}})).ok).toBe(true);
   expect(value(await client.callTool({name:'propose',arguments:{}})).ok).toBe(true);
  }finally{await client.close();await server.close();}
 },30000);
 test(`accelerated catalog fitting checks bed slots in ${room_id}`,()=>{
  const rows=fitProducts(scene,beds,room_id,16);
  expect(rows.length).toBeGreaterThan(0);
  for(const row of rows)for(const slot of row.fit_slots){
   const session=new DesignerSession(scene);session.setIntent(intentFor(scene,slot.ops,{room_id}));
   expect(session.propose(slot.ops,'Checked bed placement.').ok).toBe(true);
  }
 },30000);
}
test('bedroom planner places an available single bed',async()=>{
 const plan=await planIncrementally(scene,{room_id:'room-bedroom-large',program:'bedroom'},query);
 expect(plan.ops.some(o=>o.type==='add'&&o.item.kind==='bed'&&o.item.size[0]<1.4)).toBe(true);
 const session=new DesignerSession(scene);session.setIntent(plan.intent);
 expect(session.propose(plan.ops,plan.reason).ok).toBe(true);
},30000);
for(const size of ['double','queen','king'])test(`explicit ${size} bed request does not fall back to a single`,async()=>{
 const plan=await planIncrementally(scene,{room_id:'room-bedroom-large',program:'bedroom'},query,[`Furnish the bedroom with a ${size} bed.`]);
 expect(plan.ops.some(o=>o.type==='add'&&o.item.kind==='bed')).toBe(false);
},30000);

// Synthetic double exercises preference independently of the captured single-only catalog.
const double={...beds[0]!,id:'test-double',name:'Double bed',size_m:[1.5,2,.5],styles:['modern'],colors_image:['beige']};
const mixed:CatalogQuery=async p=>({results:p.kind==='bed'?[...beds,double]:[]});
function emptyBedroom(width:number,depth:number){
 const polygon:[number,number][]=[[0,0],[width,0],[width,depth],[0,depth]];
 return parseScene({rooms:[{id:'bedroom',name:'Bedroom',polygon}],walls:polygon.map((a,i)=>({id:`wall-${i}`,room_id:'bedroom',a,b:polygon[(i+1)%4],height:2.7})),openings:[],items:[],fixed:[]});
}
test('a checked double is preferred over cheaper available singles',async()=>{
 const plan=await planIncrementally(emptyBedroom(6,6),{room_id:'bedroom',program:'bedroom'},mixed);
 expect(plan.products.find(p=>p.kind==='bed')?.sku).toBe('test-double');
},30000);
test('a double with no checked fit permits the single fallback',async()=>{
 const plan=await planIncrementally(emptyBedroom(2.5,2.8),{room_id:'bedroom',program:'bedroom'},mixed);
 expect(plan.products.find(p=>p.kind==='bed')?.size[0]).toBeLessThan(1.4);
},30000);

test('plan_room exposes a checked single-bed option for a single-only catalog',async()=>{
 const server=createTypedServer(scene,{catalogQuery:query,images});
 const client=new Client({name:'bed-plan-regression',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(a);await client.connect(b);
 try{
  const result=value(await client.callTool({name:'plan_room',arguments:{room_id:'room-bedroom-large',program:'bedroom'}}));
  expect(result.ok,JSON.stringify(result)).toBe(true);
  const option=result.options[0];
  expect(option.products.some((p:{catalog_id:string})=>beds.some(b=>b.id===p.catalog_id))).toBe(true);
  expect(value(await client.callTool({name:'propose',arguments:{option_id:option.option_id}})).ok).toBe(true);
 }finally{await client.close();await server.close();}
},30000);

test('an owned single satisfies a generic bedroom but not an explicit double request',async()=>{
 const owned=emptyBedroom(6,6);
 owned.items.push({id:'owned-single',room_id:'bedroom',kind:'bed',name:'Single bed',pos:[3,5],rot:0,size:[1,2,.5],keep:true});
 const generic=await planIncrementally(owned,{room_id:'bedroom',program:'bedroom'},async()=>({results:[]}));
 expect(generic.missing.some(m=>m.startsWith('bed '))).toBe(false);
 const explicit=await planIncrementally(owned,{room_id:'bedroom',program:'bedroom'},async()=>({results:[]}),['I want a double bed.']);
 expect(explicit.missing.some(m=>m.startsWith('bed '))).toBe(true);
},30000);
