import {test,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createTypedServer} from '../src/typed-tools.js';
import type {Scene,Item} from '../src/scene.js';

const polygon:[number,number][]=[[0,0],[6,0],[6,5],[0,5]];
const piece=(id:string,kind:string,pos:[number,number],rot:number,size:[number,number,number],name=id):Item=>({id,room_id:'r',kind,name,pos,rot,size,keep:false});
// A living room that already has its program: sofa facing a media console across a rug, table and lamp at hand.
const furnished:Scene={rooms:[{id:'r',name:'Living room',polygon}],walls:polygon.map((a,i)=>({id:`w${i}`,room_id:'r',a,b:polygon[(i+1)%4]!,thickness:.1,height:2.7})),
 openings:[{id:'door',wall_id:'w0',kind:'door',offset:4.8,width:.9,height:2.1,sill:0,swing:'none'}],fixed:[],north_deg:0,
 items:[piece('sofa','sofa',[3,4.5],180,[2,.9,.8]),piece('rug','rug',[3,3.6],180,[2.4,1.7,.01]),piece('coffee','table',[3,3.4],180,[.6,.6,.4],'Coffee table'),
  piece('lamp','lamp',[1.7,4.6],180,[.3,.3,1.6]),piece('media','cabinet',[3,.35],0,[1.4,.45,.6],'Media console')]};
const catalog:Record<string,{id:string;name:string;size:[number,number,number];price:number}[]>={
 plant:[{id:'fig',name:'Fiddle-leaf fig',size:[.5,.5,1.4],price:40000}],vase:[{id:'vase',name:'Tulips in vase',size:[.2,.2,.4],price:10000}],
 wall_art:[{id:'print',name:'Framed print',size:[.6,.03,.5],price:13000}],
};
const query=async(p:{kind?:string})=>({results:(catalog[p.kind!]??[]).map(x=>({...x,kind:p.kind,size_m:x.size,currency:'AMD',size_status:'confirmed',styles:['Modern'],colors_image:['beige']}))});
const images=async(ids:string[])=>({content:[{type:'image' as const,mimeType:'image/png',data:'cHJldmlldw=='},{type:'text' as const,text:ids.map((id,i)=>`${i+1}. ${id} | photo`).join('\n')}]});
const value=(r:any)=>JSON.parse(r.content.find((c:any)=>c.type==='text').text);

test('plan_room in fill mode adds to a furnished room instead of reporting no anchor',async()=>{
 const server=createTypedServer(furnished,{catalogQuery:query,images}),client=new Client({name:'t',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(a);await client.connect(b);
 try{
  const plan=value(await client.callTool({name:'plan_room',arguments:{room_id:'r',program:'living',mode:'fill'}}));
  expect(plan.ok).toBe(true);
  expect(plan.options[0].note).toMatch(/Filled the room further/);
  expect(value(await client.callTool({name:'propose',arguments:{option_id:plan.options[0].option_id}})).ok).toBe(true);
 }finally{await client.close();await server.close();}
},120000);
