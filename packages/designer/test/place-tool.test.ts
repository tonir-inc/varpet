import { test, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

test('place MCP converts relations to checked poses without accepting raw coordinates or changing the scene', async()=>{
  const server=createServer({north_deg:0,rooms:[{id:'r',polygon:[[0,0],[4,0],[4,4],[0,4]]}],walls:[{id:'e',room_id:'r',a:[4,0],b:[4,4]}],openings:[{id:'w',wall_id:'e',kind:'window',offset:1.5,width:1,height:1.4,sill:0.9}],items:[],fixed:[]});
  const client=new Client({name:'place-contract',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  const args={room_id:'r',item:{id:'desk',kind:'desk',size:[1.2,0.6,0.75]},relations:[{type:'against_wall',compass:'east'},{type:'near_window'}]};
  try {
    const answer=await client.callTool({name:'place',arguments:args});
    expect(answer.isError).not.toBe(true);
    const data=JSON.parse((answer.content as {text:string}[])[0]!.text);
    expect(data.candidates.length).toBeGreaterThan(0);
    expect(data.candidates.length).toBeLessThanOrEqual(3);
    expect(data.candidates[0].op.type).toBe('add');
    expect(data.candidates[0].clearances).toHaveProperty('front_m');
    const bad=await client.callTool({name:'place',arguments:{...args,pos:[1,1]}});
    expect(bad.isError).toBe(true);
    const summary=await client.callTool({name:'scene_summary',arguments:{}});
    expect(JSON.parse((summary.content as {text:string}[])[0]!.text).items).toEqual([]);
  } finally {await client.close();await server.close();}
});
