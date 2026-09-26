import {test,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/server.js';
const sizes:Record<string,number[]>={sofa:[2,.85,.8],chair:[.8,.8,.8],rug:[3,3,.02],lamp:[.3,.3,1.4],table:[1,.5,.4],shelf:[1,.3,1.2]};
test('production tools expose whole-room style candidates and propose only a checked ID',async()=>{
 const scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]] as [number,number][]}],walls:[],openings:[],items:[],fixed:[]};
 const server=createServer(scene,{catalogQuery:async(p)=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind!],price:100,currency:'AMD',size_status:'confirmed',styles:['Scandinavian'],colors_image:['beige']}]})});
 const client=new Client({name:'taste-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 const read=(v:any)=>JSON.parse(v.content[0].text);
 try{
  const result=read(await client.callTool({name:'search_catalog',arguments:{room_id:'living',style_request:'minimalistic cozy',remake:true}}));
  expect(result.candidates).toHaveLength(2);
  const invalid=read(await client.callTool({name:'propose',arguments:{candidate_id:'invented',rationale:'A complete room.'}}));expect(invalid.ok).toBe(false);
  const proposal=read(await client.callTool({name:'propose',arguments:{candidate_id:result.selected_id,rationale:'A complete cozy seating group.'}}));expect(proposal.ok).toBe(true);expect(proposal.proposal.ops.filter((o:any)=>o.type==='add')).toHaveLength(7);
 }finally{await client.close();await server.close();}
});
test('candidate selection cannot erase declared customer budget or keeps',async()=>{
 const scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]] as [number,number][]}],walls:[],openings:[],items:[],fixed:[]};
 const server=createServer(scene,{catalogQuery:async(p)=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind!],price:100,currency:'AMD',size_status:'confirmed',styles:['Scandinavian'],colors_image:['beige']}]})});
 const client=new Client({name:'taste-budget',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 const read=(v:any)=>JSON.parse(v.content[0].text);
 try{
  await client.callTool({name:'set_intent',arguments:{room_id:'living',budget_dram:0}});
  const result=read(await client.callTool({name:'search_catalog',arguments:{room_id:'living',style_request:'minimalistic cozy',remake:true}}));
  const proposal=read(await client.callTool({name:'propose',arguments:{candidate_id:result.selected_id,rationale:'A complete room.'}}));
  expect(proposal.ok).toBe(false);expect(JSON.stringify(proposal.errors)).toMatch(/budget/i);
 }finally{await client.close();await server.close();}
});
