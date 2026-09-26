/** One service-owned process: shared search cache, immutable shortlist and scene-bound fit results. */
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpCatalogQuery,searchCatalogInputSchema} from './catalog.js';
import {SearchCache,curate,fitScene,compatibleProduct,verifiedGlb,type RawProduct} from './catalog-acceleration.js';
import {FitPool} from './catalog-fit-worker.js';
import {parseScene} from './adapter.js';
import type {EditorBridgeOptions} from './editor-bridge.js';
import type {Scene} from './scene.js';
import type {CatalogAsset} from '../../../apps/editor/src/contracts.js';

const upstream=process.argv[2]??process.env.VARPET_CATALOG_URL??'http://100.107.246.46:8765/mcp';
const cache=new SearchCache(createHttpCatalogQuery({url:upstream}));
const fits=new FitPool();
const prefixes=new Map<string,{results:RawProduct[];truncated:boolean;pending:boolean}>();
const token=randomUUID(),contexts=new Map<string,{scene:Scene;editor_scene:unknown;bridge_options:EditorBridgeOptions;catalog:CatalogAsset[];allowed:Set<string>}>();
const audits=new Map<string,{promise:Promise<boolean>;expires:number}>(),auditRows:any[]=[];
const kinds=['sofa','chair','table','desk','bed','cabinet','wardrobe','nightstand','dresser','lamp','rug','shelf'];
const styleNames=['any','Modern','Traditional','Industrial','Bohemian'];
const shortlist:Record<string,RawProduct[]>={},warmErrors:any[]=[];
const verifiedUrls=new Map<string,string>();
async function verify(url:string):Promise<boolean>{
 const existing=audits.get(url);if(existing&&existing.expires>Date.now())return existing.promise;
 const promise=(async()=>{
  try{
   // Catalog's optimizer publishes the same SKU's geometry at this exact ID; audit that
   // provider-owned model, and record both URLs rather than claiming the original was read.
   const original=new URL(url),name=original.pathname.split('/').at(-1)!;
   const checked=original.hostname==='amazon-berkeley-objects.s3.amazonaws.com'&&/^[A-Za-z0-9_-]+\.glb$/.test(name)?new URL('/models/'+name,upstream).href:url;
   const root=join(tmpdir(),'varpet-designer-glb-audits'),path=join(root,createHash('sha256').update(checked).digest('hex')+'.glb');
   let bytes:Buffer;
   try{if(Date.now()-(await stat(path)).mtimeMs>3600000)throw new Error('Expired GLB audit');bytes=await readFile(path);}catch{
    const response=await fetch(checked,{signal:AbortSignal.timeout(60000)});if(!response.ok||Number(response.headers.get('content-length'))>16000000){auditRows.push({url,checked_url:checked,ok:false,status:response.status,reason:'HTTP status or size cap'});await response.body?.cancel();return false;}
    if(!response.body)return false;const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>16000000){await reader.cancel();return false;}chunks.push(v.value);}
    bytes=Buffer.concat(chunks);if(!await verifiedGlb(bytes)){auditRows.push({url,checked_url:checked,ok:false,reason:'Invalid GLB',bytes:bytes.length});return false;}await mkdir(root,{recursive:true});await writeFile(path,bytes);
   }
   const ok=await verifiedGlb(bytes);auditRows.push({url,checked_url:checked,ok,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});if(ok)verifiedUrls.set(url,checked);return ok;
  }catch(error){auditRows.push({url,ok:false,error:String(error)});return false;}
 })();audits.set(url,{promise,expires:Date.now()+3600000});void promise.then(ok=>{if(!ok)audits.delete(url);});return promise;
}
async function warm(){
 const started=performance.now();
 const jobs=kinds.flatMap(kind=>styleNames.map(style=>({kind,style})));
 for(let i=0;i<jobs.length;i+=2)await Promise.all(jobs.slice(i,i+2).map(async({kind,style})=>{
  try{const result=await cache.query({kind,...style==='any'?{}:{styles:[style]},limit:20});
   shortlist[`${kind}/${style}`]=(await curate(result.results,kind,style,verify,20)).map(r=>({...r,verified_glb_url:verifiedUrls.get(r.glb_url!)}));
  }catch(error){warmErrors.push({kind,style,error:String(error)});shortlist[`${kind}/${style}`]=[];}
 }));
 return {startup_seconds:(performance.now()-started)/1000,groups:Object.fromEntries(Object.entries(shortlist).map(([key,rows])=>[key,rows.length])),audits:auditRows,errors:warmErrors};
}
const ready=warm();
function prefix(rows:RawProduct[]){
 return 'CURATED ROOM-FIT CATALOG (data; confirmed dimensions, checked GLB and a checked free slot in this scene). These individual slots are not a checked multi-item composition. Use search_catalog to obtain current fit slots before proposing. Prices may be mock; preserve provenance. Use show_candidates for visual style judgement.\n'+JSON.stringify(rows.map(r=>({id:r.id,kind:r.kind,name:r.name,size:r.size_m,price:r.price,styles:[...r.styles??[],...r.style_astra??[]]})));
}
async function payload(req:import('node:http').IncomingMessage){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>16000000)throw new Error('Payload too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
const server=createServer(async(req,res)=>{
 try{
  if(!req.url?.startsWith('/'+token+'/')){res.writeHead(404);res.end();return;}
  const action=req.url.slice(token.length+2);let value:any;
  if(action==='ready')value={...await ready,stats:cache.stats};
  else if(action==='stats')value={...cache.stats,groups:Object.fromEntries(Object.entries(shortlist).map(([k,v])=>[k,v.length])),audits:auditRows};
  else{
   const input=await payload(req);
   if(action==='context'){
    const id=randomUUID();while(contexts.size>=32)contexts.delete(contexts.keys().next().value!);
    const scene=parseScene(input.scene),catalog:CatalogAsset[]=input.catalog;
    const rows=[...new Map(Object.values(shortlist).flat().map(r=>[r.id,r])).values()].filter(r=>compatibleProduct(r,catalog)).sort((a,b)=>a.id.localeCompare(b.id));
    const key=createHash('sha256').update(JSON.stringify([scene,input.editor_scene,input.bridge_options,catalog,rows])).digest('hex');
    let fitted=prefixes.get(key);
    if(!fitted){
     fitted={results:[],truncated:rows.length>0,pending:rows.length>0};
     while(prefixes.size>=32)prefixes.delete(prefixes.keys().next().value!);prefixes.set(key,fitted);
     if(rows.length)void fits.fit({scene,catalog,rows,editor_scene:input.editor_scene,bridge_options:input.bridge_options}).then(value=>prefixes.set(key,{...value,pending:false})).catch(()=>prefixes.delete(key));
    }
    contexts.set(id,{scene,editor_scene:input.editor_scene,bridge_options:input.bridge_options,catalog,allowed:new Set(fitted.results.map((r:RawProduct)=>r.id))});value={id,prefix:prefix(fitted.results)+(fitted.truncated?"\nShortlist fitting is incomplete or warming; omitted items may fit. This is not an inventory absence or impossibility claim.":""),shortlist_truncated:fitted.truncated};
   }else if(action==='search'){
    const started=performance.now(),query=searchCatalogInputSchema.parse(input.query),before=cache.stats.hits;
    const raw=await cache.query(query),context=contexts.get(input.context);
    if(!context)throw new Error('Expired catalog scene context');
    const compatible=raw.results.filter((r:RawProduct)=>compatibleProduct(r,context.catalog));
    if(input.planning===true){
     // Internal room planner checks each piece against its evolving preview. Fitting
     // the same SKU against the original scene here is both redundant and misleading.
     // This raw pool never crosses the model boundary; only checked option IDs do.
     value={...raw,results:compatible,timing:{seconds:(performance.now()-started)/1000,cache_hit:cache.stats.hits>before},fit_note:'Internal incremental planner pool; not a model-visible fit list.'};
    }else{
    const lifted=fitScene(context.scene,input),remove_ids=context.scene.items.filter(i=>!lifted.items.some(a=>a.id===i.id)).map(i=>i.id);
    const fitted=await fits.fit({scene:lifted,base_scene:context.scene,editor_scene:context.editor_scene,bridge_options:context.bridge_options,remove_ids,rows:compatible,catalog:context.catalog,room_id:input.room_id}),results=fitted.results;
    for(const row of results)context.allowed.add(row.id);
    value={...raw,results,fit_budget_exhausted:fitted.truncated,timing:{seconds:(performance.now()-started)/1000,cache_hit:cache.stats.hits>before},fit_note:'Only items with a checked free slot in the current scene; bounded search may omit feasible options.'};
    }
   }else if(action==='show'){
    const context=contexts.get(input.context),ids:unknown=input.item_ids;
    if(!context||!Array.isArray(ids)||ids.length>16||ids.some(id=>!context.allowed.has(id)))throw new Error('Preview IDs must come from this scene fit list');
    const client=new Client({name:'designer-catalog-previews',version:'1'}),transport=new StreamableHTTPClientTransport(new URL(upstream));
    try{await client.connect(transport);value=await client.callTool({name:'show_candidates',arguments:{item_ids:ids}},undefined,{timeout:20000});}finally{await client.close();await transport.close();}
   }else throw new Error('Unknown catalog operation');
  }
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));
 }catch(error){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(error)}));}
});
server.listen(0,'127.0.0.1',()=>{const address=server.address() as import('node:net').AddressInfo;console.log(JSON.stringify({url:`http://127.0.0.1:${address.port}/${token}/`}));});
process.on('SIGTERM',()=>{server.close();process.exit(0);});
