import {expect,test} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/server.js';

test('every published MCP schema uses homogeneous array items supported by Codex',async()=>{
  const server=createServer({rooms:[],walls:[],openings:[],items:[],fixed:[]});
  const client=new Client({name:'schema-contract',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  const tuplePaths=(value:unknown,path=''):string[]=>{
    if(!value||typeof value!=='object') return [];
    return Object.entries(value).flatMap(([key,child])=>[
      ...(key==='items'&&Array.isArray(child)?[path+'.items']:[]),
      ...tuplePaths(child,path+'.'+key),
    ]);
  };
  try {
    for(const tool of (await client.listTools()).tools) expect(tuplePaths(tool.inputSchema),tool.name).toEqual([]);
  } finally {await client.close();await server.close();}
});
