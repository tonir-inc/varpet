import { test, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { parseScene } from '../src/adapter.js';
import bedroom from './fixtures/bedroom.json';

test('sun MCP tool returns seasonal windows, explicit unknown north and invalid-id errors', async () => {
  for (const north of [0, undefined]) {
    const server = createServer(parseScene({...bedroom, north_deg:north}));
    const client = new Client({name:'sun-contract',version:'1'});
    const [a,b] = InMemoryTransport.createLinkedPair();
    await server.connect(a); await client.connect(b);
    try {
      const answer = await client.callTool({name:'sun',arguments:{room_id:'bedroom',date:'2026-06-21',hours:[9,12,15]}});
      expect(answer.isError).not.toBe(true);
      const data = JSON.parse((answer.content as {text:string}[])[0]!.text);
      expect(data.status).toBe(north === undefined ? 'unknown' : 'known');
      if (north !== undefined) {
        expect(data.windows).toHaveLength(1);
        expect(data.windows[0].window_id).toBe('window');
        const bad = await client.callTool({name:'sun',arguments:{window_id:'missing'}});
        expect(bad.isError).toBe(true);
      }
    } finally { await client.close(); await server.close(); }
  }
});
