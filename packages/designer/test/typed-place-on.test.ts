import {test,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTypedServer} from '../src/typed-tools.js';
import type {Scene,Item} from '../src/scene.js';

const polygon:[number,number][]=[[0,0],[5,0],[5,5],[0,5]];
const stand:Item={id:'stand',room_id:'living',kind:'cabinet',name:'TV stand',pos:[2.5,.4],rot:0,size:[1.4,.45,.5],keep:false};
const floorTv:Item={id:'tv',room_id:'living',kind:'tv',name:'43" TV',pos:[1,2.5],rot:0,size:[.97,.18,.64],keep:false,sku:'tv-43',price:180000};
const scene=(items:Item[]):Scene=>({rooms:[{id:'living',name:'Living room',polygon}],walls:polygon.map((a,i)=>({id:'w'+i,room_id:'living',a,b:polygon[(i+1)%4]!,height:2.7})),openings:[{id:'door',wall_id:'w2',kind:'door',offset:1,width:.9,height:2.1,sill:0}],items,fixed:[]});
const query=async(p:{kind?:string})=>({results:p.kind==='tv'?[{id:'tv-55',kind:'tv',name:'55" TV',size_m:[1.23,.12,.76],price:300000,currency:'AMD',size_status:'confirmed',styles:['modern'],colors_image:['black']}]:[]});
const images=async(ids:string[])=>({content:[{type:'image' as const,mimeType:'image/png',data:'cHJldmlldw=='},{type:'text' as const,text:ids.map((id,i)=>`${i+1}. ${id} | photo`).join('\n')}]});
async function connect(input:Scene,dir?:string){
 const server=createTypedServer(input,{catalogQuery:query,images,proposalsDir:dir}),client=new Client({name:'t',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 return {client,close:async()=>{await client.close();await server.close();}};
}
const value=(r:any)=>JSON.parse(r.content.find((c:any)=>c.type==='text').text);

test('an owned TV is put on the TV stand with place_on and proposed as a supported move',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'place-on-')),c=await connect(scene([stand,floorTv]),dir);
 try{
  const staged=value(await c.client.callTool({name:'place_on',arguments:{piece_or_catalog_id:'tv',support_id:'stand'}}));
  expect(staged.ok).toBe(true);
  const saved=value(await c.client.callTool({name:'propose',arguments:{}}));expect(saved.ok).toBe(true);
  const proposal=JSON.parse(await readFile(join(dir,(await readdir(dir)).find(f=>f.endsWith('.json'))!),'utf8'));
  expect(proposal.ops).toEqual([expect.objectContaining({type:'move',id:'tv',on:'stand'})]);
 }finally{await c.close();}
});
test('place_on refuses seats as supports and furniture that cannot stack',async()=>{
 const sofa:Item={id:'sofa',room_id:'living',kind:'sofa',name:'Sofa',pos:[2.5,3.5],rot:180,size:[2,.9,.8],keep:false};
 const c=await connect(scene([stand,floorTv,sofa]));
 try{
  expect((await c.client.callTool({name:'place_on',arguments:{piece_or_catalog_id:'tv',support_id:'sofa'}})).isError).toBe(true);
  expect((await c.client.callTool({name:'place_on',arguments:{piece_or_catalog_id:'sofa',support_id:'stand'}})).isError).toBe(true);
 }finally{await c.close();}
});
test('searching for a TV offers the TV unit top, never the floor',async()=>{
 const c=await connect(scene([stand]));
 try{
  const found=value(await c.client.callTool({name:'search_catalog',arguments:{room_id:'living',queries:[{kind:'tv'}]}}));
  expect(found.candidates).toEqual([expect.objectContaining({catalog_id:'tv-55',on:'stand'})]);
  const bare=value(await c.client.callTool({name:'search_catalog',arguments:{room_id:'living',queries:[{kind:'tv'}]}}));expect(bare.candidates.length).toBe(1);
 }finally{await c.close();}
 const empty=await connect(scene([]));
 try{expect(value(await empty.client.callTool({name:'search_catalog',arguments:{room_id:'living',queries:[{kind:'tv'}]}})).candidates).toEqual([]);}finally{await empty.close();}
});
