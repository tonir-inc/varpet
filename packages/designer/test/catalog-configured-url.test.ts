import {afterEach,expect,test} from 'vitest';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {catalogImages} from '../src/catalog-vision.js';
import {catalogUrl,DEFAULT_CATALOG_URL,mapLimited,searchCatalog} from '../src/catalog.js';
import {createTypedServer} from '../src/typed-tools.js';
import type {Scene} from '../src/scene.js';

const saved=process.env.VARPET_CATALOG_URL,servers:Server[]=[];
afterEach(async()=>{
 if(saved===undefined)delete process.env.VARPET_CATALOG_URL;else process.env.VARPET_CATALOG_URL=saved;
 await Promise.all(servers.splice(0).map(s=>new Promise(done=>{s.closeAllConnections();s.close(done);})));
});
async function listen(handler:(path:string)=>boolean){
 const server=createServer((req,res)=>{if(handler(req.url??''))res.writeHead(500).end('{}');});servers.push(server);
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 return `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
}

test('the configured catalog URL wins; an empty setting falls back to the documented default',()=>{
 process.env.VARPET_CATALOG_URL='http://127.0.0.1:8765/mcp';expect(catalogUrl()).toBe('http://127.0.0.1:8765/mcp');
 process.env.VARPET_CATALOG_URL='';expect(catalogUrl()).toBe(DEFAULT_CATALOG_URL);
 delete process.env.VARPET_CATALOG_URL;expect(catalogUrl()).toBe(DEFAULT_CATALOG_URL);
});

test('product previews go to VARPET_CATALOG_URL, not the tailnet default',async()=>{
 const hits:string[]=[];process.env.VARPET_CATALOG_URL=await listen(path=>{hits.push(path);return true;});
 await expect(catalogImages(['sku-a'])).rejects.toThrow();
 expect(hits[0]).toBe('/mcp');
});

test('a preview timeout is a clear retryable message, not a connection failure',async()=>{
 process.env.VARPET_CATALOG_URL=await listen(()=>false);
 await expect(catalogImages(['sku-a'],undefined,200)).rejects.toThrow(/busy.*retry/);
});

test('a timed-out search is retryable; other failures keep the unavailable reason',async()=>{
 const busy=await searchCatalog({kind:'chair'},async()=>{throw new Error('Catalog request timed out');});
 expect(busy).toMatchObject({status:'unavailable',retryable:true});expect(busy.reason).toMatch(/retry/);
 const down=await searchCatalog({kind:'chair'},async()=>{throw new Error('ECONNREFUSED');});
 expect(down.retryable).toBeUndefined();expect(down.reason).toMatch(/Catalog unavailable/);
});

test('catalog fan-out is bounded and keeps order',async()=>{
 let active=0,peak=0;
 const out=await mapLimited([1,2,3,4,5],2,async n=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return n*10;});
 expect(out).toEqual([10,20,30,40,50]);expect(peak).toBe(2);
});

test('search keeps checked slots when previews time out, and propose still requires inspection',async()=>{
 const scene:Scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[6,0],[6,6],[0,6]]}],walls:[],openings:[],items:[],fixed:[]};
 const calls:string[]=[];
 const server=createTypedServer(scene,{catalogQuery:async q=>{calls.push(JSON.stringify(q));return {results:[{id:'chair-1',kind:'chair',name:'Chair',size_m:[.6,.6,.8],price:100,currency:'AMD',size_status:'confirmed',styles:['Modern'],colors_image:['beige']}]};},
  images:async()=>{throw new Error('Product previews: The catalog is slow or busy right now (the request timed out). This is temporary: retry the same call in a moment.');}});
 const client=new Client({name:'t',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 try{
  const result=await client.callTool({name:'search_catalog',arguments:{room_id:'living',queries:[{kind:'chair'},{kind:'chair'}]}});
  const body=JSON.parse((result.content as any[])[0].text);
  expect(result.isError).toBeFalsy();expect(body.ok).toBe(true);expect(body.retryable).toBe(true);expect(body.reason).toMatch(/show_candidates/);
  expect(calls).toHaveLength(1);
  const refused=await client.callTool({name:'propose',arguments:{option_id:body.candidates[0].option_id}});
  expect(refused.isError).toBe(true);expect(JSON.stringify(refused.content)).toMatch(/show_candidates/);
 }finally{await client.close();await server.close();}
});
