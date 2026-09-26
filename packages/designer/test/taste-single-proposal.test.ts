import {test,expect,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/server.js';
import * as design from '../src/taste/design.js';
import type {Scene} from '../src/scene.js';
test('singleton no-alternative disclosure survives into the saved customer proposal',async()=>{
 const scene:Scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]]}],walls:[],openings:[],items:[],fixed:[]};
 const sizes:Record<string,number[]>={sofa:[2,.85,.8],chair:[.8,.8,.8],rug:[3,3,.02],lamp:[.3,.3,1.4],table:[1,.5,.4],shelf:[1,.3,1.2]};
 const original=design.designRoom;
 const spy=vi.spyOn(design,'designRoom').mockImplementation(async(...args)=>{const result=await original(...args);return {...result,candidates:result.candidates.slice(0,1)};});
 const server=createServer(scene,{catalogQuery:async p=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind!],price:100,currency:'AMD',styles:['Modern'],colors_image:['beige']}]})});
 const client=new Client({name:'singleton',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 const read=(v:any)=>JSON.parse(v.content[0].text);
 try{
  const candidates=read(await client.callTool({name:'search_catalog',arguments:{room_id:'living',style_request:'modern'}}));
  expect(candidates.candidates).toHaveLength(1);
  const proposal=read(await client.callTool({name:'propose',arguments:{candidate_id:candidates.selected_id,rationale:'A complete seating group.'}}));
  expect(proposal.ok).toBe(true);
  expect(proposal.proposal.rationale).toMatch(/No alternative checked layout was found/);
 }finally{spy.mockRestore();await client.close();await server.close();}
});
