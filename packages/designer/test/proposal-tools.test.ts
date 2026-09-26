import {test,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/server.js';

test('MCP intent, checks, scoring and propose share a session while keeping scene unchanged',async()=>{
  const scene={rooms:[{id:'room',polygon:[[0,0],[6,0],[6,6],[0,6]] as [number,number][]}],walls:[],openings:[],fixed:[],items:[]};
  const server=createServer(scene),client=new Client({name:'proposal-contract',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  const call=(name:string,args:Record<string,unknown>)=>client.callTool({name,arguments:args});
  const data=(r:Awaited<ReturnType<typeof call>>)=>JSON.parse((r.content as {text:string}[])[0]!.text);
  try {
    expect((await call('set_intent',{add:[{kinds:['crib'],count:1}]})).isError).not.toBe(true);
    const ignored=await call('propose',{ops:[],rationale:'No changes.'});
    expect(ignored.isError).toBe(true);expect(JSON.stringify(ignored)).toMatch(/crib/);
    await call('set_intent',{});
    const checked=await call('check_layout',{ops:[]});expect(checked.isError).not.toBe(true);expect(data(checked).ok).toBe(true);
    const score=await call('score_layout',{ops:[]});expect(data(score).after.space.free_area_m2).toBe(36);
    const proposed=await call('propose',{ops:[],rationale:'Keep the open room.'});expect(proposed.isError).not.toBe(true);expect(data(proposed).proposal_id).toMatch(/^proposal-/);
    expect(data(await call('scene_summary',{})).items).toEqual([]);
    expect((await call('check_layout',{ops:[{type:'move',id:'unknown',pos:[1,1]}]})).isError).toBe(true);
    expect((await call('propose',{ops:[],rationale:''})).isError).toBe(true);
  } finally {await client.close();await server.close();}
});
