import { expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import type { Scene } from '../src/scene.js';

test('selected-room summary preserves neighboring swing occupancy and doorway circulation',async()=>{
  const scene:Scene={
    rooms:[{id:'upper',polygon:[[0,0],[4,0],[4,4],[0,4]]},{id:'lower',polygon:[[0,-4],[4,-4],[4,0],[0,0]]}],
    walls:[{id:'shared',room_id:'upper',a:[0,0],b:[4,0]}],
    openings:[{id:'door',wall_id:'shared',kind:'door',offset:1,width:1,height:2,sill:0,swing:'outward-left'}],
    items:[{id:'desk',room_id:'lower',kind:'desk',name:'Desk',pos:[1.5,-3],rot:180,size:[1,0.5,0.75],keep:false}],fixed:[],
  };
  const server=createServer(scene),client=new Client({name:'cross-room-summary',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  const summary=async(args:Record<string,unknown>)=>{
    const result=await client.callTool({name:'scene_summary',arguments:args});
    expect(result.isError).not.toBe(true);
    return JSON.parse((result.content as {text:string}[])[0]!.text);
  };
  try {
    const all=await summary({}),selected=await summary({room_ids:['lower']});
    expect(selected.metrics.rooms).toEqual(all.metrics.rooms.filter((room:{room_id:string})=>room.room_id==='lower'));
    expect(selected.metrics.rooms[0].walkways).toEqual(expect.arrayContaining([expect.objectContaining({from:'door:door',to:'item:desk'})]));
    expect(selected.metrics.free_area_m2).toBe(selected.metrics.rooms[0].free_area_m2);
    expect(selected.metrics.free_area_m2).toBeLessThan(16-0.5-Math.PI/4);
    expect((await summary({room_ids:[]})).metrics).toEqual({rooms:[],free_area_m2:0});
  } finally {await client.close();await server.close();}
});
