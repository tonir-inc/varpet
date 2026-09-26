/** Shared catalog image passthrough; production purchases inspect exact product models. */
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import {catalogUrl,catalogTimedOut,CATALOG_BUSY} from './catalog.js';
const idsSchema=z.array(z.string().min(1).max(200)).min(1).max(12);
const responseSchema=z.object({isError:z.boolean().optional(),content:z.array(z.union([
 z.object({type:z.literal('text'),text:z.string().max(40_000)}),
 z.object({type:z.literal('image'),mimeType:z.enum(['image/png','image/jpeg']),data:z.string().max(4_000_000)}),
]))});
export async function catalogImages(ids:string[],url=catalogUrl(),timeoutMs=12_000):Promise<unknown>{
 // The catalog spends up to eight seconds assembling the sheet. Allow its
 // partial/missing-tile response to arrive instead of aborting at that boundary.
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeoutMs);
 const transport=new StreamableHTTPClientTransport(new URL(url),{fetch:(target,init)=>fetch(target,{...init,signal:abort.signal})});
 const client=new Client({name:'varpet-designer-vision',version:'1'});
 try {await client.connect(transport,{signal:abort.signal,timeout:timeoutMs});return await client.callTool({name:'show_candidates',arguments:{item_ids:ids,columns:4}},undefined,{signal:abort.signal,timeout:timeoutMs});}
 catch(error){if(abort.signal.aborted||catalogTimedOut(error))throw new Error('Product previews: '+CATALOG_BUSY,{cause:error});throw error;}
 finally{clearTimeout(timer);abort.abort();await client.close();await transport.close();}
}
export async function candidateSheet(input:unknown,call:(ids:string[])=>Promise<unknown>=catalogImages){
 const ids=[...new Set(idsSchema.parse(input))],response=responseSchema.parse(await call(ids));
 if(response.isError||!response.content.some(c=>c.type==='image'))throw new Error('Catalog returned no usable preview image');
 const legend=response.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
 for(const id of ids)if(!legend.split('\n').some(line=>line.includes('. '+id+' |')))throw new Error(`Catalog preview is missing requested ID ${id}`);
 return response;
}
