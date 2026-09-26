import {expect,test} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/server.js';

test('conversation tools ask one question and return catalog-grounded placement descriptions',async()=>{
  const server=createServer({rooms:[],walls:[],openings:[],items:[],fixed:[]},{catalogQuery:async()=>({results:[{id:'sku-crib',kind:'crib',name:'Test crib',size_m:[1.2,0.7,0.9],price:50000,currency:'AMD',source:'test',price_source:'test quotation'}]})});
  const client=new Client({name:'conversation-tools',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  const call=async(name:string,args:Record<string,unknown>)=>{
    const result=await client.callTool({name,arguments:args});
    expect(result.isError).not.toBe(true);
    return JSON.parse((result.content as {text:string}[])[0]!.text);
  };
  try {
    const question=await call('ask',{question:'Would you prefer a reading corner or a more open center?',options:['Reading corner','Open center']});
    expect(question.type).toBe('question');expect(question.awaiting_answer).toBe(true);
    const catalog=await call('search_catalog',{kind:'crib',price_max:60000});
    expect(catalog.results[0].item).toMatchObject({id:'sku-crib',sku:'sku-crib',size:[1.2,0.7,0.9],price:50000});
    expect(catalog.results[0].price_source).toBe('test quotation');
  } finally {await client.close();await server.close();}
});
