/** Explicit opt-in catalog image passthrough. No preview network calls on the fast path. */
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
const idsSchema=z.array(z.string().min(1).max(200)).min(1).max(12);
const responseSchema=z.object({isError:z.boolean().optional(),content:z.array(z.union([
 z.object({type:z.literal('text'),text:z.string().max(40_000)}),
 z.object({type:z.literal('image'),mimeType:z.enum(['image/png','image/jpeg']),data:z.string().max(4_000_000)}),
]))});
export async function catalogImages(ids:string[]):Promise<unknown>{
 const url=new URL(process.env.VARPET_CATALOG_URL??'http://100.107.246.46:8765/mcp');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8_000);
 const transport=new StreamableHTTPClientTransport(url,{fetch:(target,init)=>fetch(target,{...init,signal:abort.signal})});
 const client=new Client({name:'varpet-designer-vision',version:'1'});
 try {await client.connect(transport,{signal:abort.signal,timeout:8_000});return await client.callTool({name:'show_candidates',arguments:{item_ids:ids,columns:4}},undefined,{signal:abort.signal,timeout:8_000});}
 finally{clearTimeout(timer);abort.abort();await client.close();await transport.close();}
}
export async function candidateSheet(input:unknown,call:(ids:string[])=>Promise<unknown>=catalogImages){
 const ids=[...new Set(idsSchema.parse(input))],response=responseSchema.parse(await call(ids));
 if(response.isError||!response.content.some(c=>c.type==='image'))throw new Error('Catalog returned no usable preview image');
 const legend=response.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
 for(const id of ids)if(!legend.split('\n').some(line=>line.includes('. '+id+' |')))throw new Error(`Catalog preview is missing requested ID ${id}`);
 return response;
}
