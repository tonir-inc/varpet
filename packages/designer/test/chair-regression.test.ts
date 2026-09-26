import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {parseScene} from '../src/adapter.js';
import {createTypedServer} from '../src/typed-tools.js';
import {fitProducts,type RawProduct} from '../src/catalog-acceleration.js';
import {DesignerSession} from '../src/session.js';
import {intentFor} from '../src/incremental-room.js';
import {functionClearances} from '../src/metrics/function.js';
import type {CatalogQuery} from '../src/catalog.js';

// QA 26 Sept: the Balcony flat's living room (3.71 x 6.37 m) furnished by plan_room with a sofa, rug and lamp.
// Every chair search answered "No checked product fit found" after 3.6-14 s. Chair rows are the live catalog's
// answers to {kind:'chair'} and {text:'simple dining chair'} that day.
const scene=parseScene(JSON.parse(readFileSync(new URL('./fixtures/chair-slot-scene.json',import.meta.url),'utf8')));
const rows:(RawProduct&{query:string})[]=JSON.parse(readFileSync(new URL('./fixtures/chair-slot-products.json',import.meta.url),'utf8'));
const query:CatalogQuery=async p=>({results:rows.filter(r=>p.text?r.query==='dining':r.query==='chair6').slice(0,p.limit??10)});
const images=async(ids:string[])=>({content:[{type:'image',mimeType:'image/png',data:'preview'},{type:'text',text:ids.map((id,i)=>`${i+1}. ${id} | photo`).join('\n')}]});
const value=(r:any)=>JSON.parse(r.content.find((c:any)=>c.type==='text').text);
const room_id='room-living';

for(const q of [{kind:'chair',limit:1},{kind:'chair',limit:6},{text:'simple dining chair',limit:6}])test(`search_catalog finds a checked chair for ${JSON.stringify(q)}`,async()=>{
 const server=createTypedServer(scene,{catalogQuery:query,images});
 const client=new Client({name:'chair-regression',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(a);await client.connect(b);
 try{
  const started=performance.now();
  const result=value(await client.callTool({name:'search_catalog',arguments:{room_id,queries:[q]}}));
  const elapsed=performance.now()-started;
  expect(result.ok,JSON.stringify(result)).toBe(true);
  // Every offered product has its own slot; a busy CI machine is slower, so this bound is loose.
  expect(result.candidates.length).toBe(Math.min(q.limit,4));
  expect(elapsed).toBeLessThan(q.limit*6000);
  const candidate=result.candidates[0];
  expect(value(await client.callTool({name:'place',arguments:{piece_or_catalog_id:candidate.catalog_id,slot_id:candidate.slot_id}})).ok).toBe(true);
  expect(value(await client.callTool({name:'propose',arguments:{}})).ok).toBe(true);
 }finally{await client.close();await server.close();}
},60000);

test('accelerated catalog fitting finds chair slots with its two-check budget',()=>{
 const fitted=fitProducts(scene,rows.filter(r=>r.query==='chair6').slice(0,2),room_id,2);
 expect(fitted.length).toBe(2);
 for(const row of fitted)for(const slot of row.fit_slots){
  const session=new DesignerSession(scene);session.setIntent(intentFor(scene,slot.ops,{room_id}));
  expect(session.propose(slot.ops,'Checked chair placement.').ok).toBe(true);
 }
},60000);

test('a fitted chair keeps pull-out room behind it and sits within conversation distance of the sofa',()=>{
 const [row]=fitProducts(scene,rows.slice(0,1),room_id,16);
 const op=row.fit_slots[0].ops[0],chair=op.item;
 const after={...scene,items:[...scene.items,chair]};
 const pullout=functionClearances(after).find(c=>c.item_id===chair.id&&c.function==='chair_pullout')!;
 expect(pullout.deficit_m).toBe(0);
 const sofa=scene.items.find(i=>i.kind==='sofa')!;
 expect(Math.hypot(chair.pos[0]-sofa.pos[0],chair.pos[1]-sofa.pos[1])).toBeLessThan(3.5);
},60000);
