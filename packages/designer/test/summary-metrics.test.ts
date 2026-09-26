import { test, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

test('scene summary exposes current room metrics and honors empty room filters', async () => {
  const server=createServer({rooms:[{id:'room',polygon:[[0,0],[4,0],[4,3.5],[0,3.5]]}],walls:[],openings:[],items:[],fixed:[]});
  const client=new Client({name:'summary-metrics',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    for (const room_ids of [undefined,[]]) {
      const result=await client.callTool({name:'scene_summary',arguments:room_ids===undefined?{}:{room_ids}});
      expect(result.isError).not.toBe(true);
      const data=JSON.parse((result.content as {text:string}[])[0]!.text);
      expect(data.metrics.free_area_m2).toBe(room_ids===undefined?14:0);
      expect(data.metrics.rooms).toHaveLength(room_ids===undefined?1:0);
    }
  } finally { await client.close(); await server.close(); }
});
