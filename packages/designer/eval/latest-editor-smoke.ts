/** Current editor database path; model calls require an explicit --live. */
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {appendFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import type {AgentProposal,CatalogAsset,SceneDocument,Vec3} from '../../../apps/editor/src/contracts.js';
import {databaseCatalog,type CatalogProduct} from '../../../apps/editor/src/adapters/database-catalog.js';
import {createCatalogHttpAdapter} from '../../../apps/editor/src/adapters/catalog-http.js';
import {createDesignerHttpAdapter} from '../../../apps/editor/src/adapters/designer-http.js';
import {createInitialScene} from '../../../apps/editor/src/core/initial-scene.js';
import {createApartmentStore} from '../../../apps/editor/src/core/apartment-store.js';
import {defaultCeilingDesign} from '../../../apps/editor/src/core/ceiling-design.js';
import {projectSnapshot} from '../../../apps/editor/src/core/renovation.js';
import {mergeDesignerProducts,DesignerProposalCatalog} from '../../../apps/editor/src/core/designer-catalog.js';
import {validateScene} from '../../../apps/editor/src/core/validation.js';
import {editorToDesigner} from '../src/editor-bridge.js';
import {spaceMetrics} from '../src/metrics/space.js';
import {checkPurchase} from './catalog-armchair-smoke.js';

export const REQUESTS=[{id:'paint',request:'paint the bedroom walls sage'},{id:'bigger',request:'make the living room feel bigger'},{id:'armchair',request:'add an armchair for reading by the window'}] as const;
type RequestId=typeof REQUESTS[number]['id'];
type Json=Record<string,any>;
const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'../../..');
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const choices=[
  {id:'db-sofa',sku:'abo:B07BW8P2F7',kind:'sofa',position:[-2.2,0,1.8],rotation:Math.PI},
  {id:'db-table',sku:'abo:B07DBFQFGS',kind:'table',position:[-2.2,0,.6],rotation:0},
  {id:'db-chair',sku:'abo:B07HPFP4SZ',kind:'chair',position:[-3.9,0,1.4],rotation:Math.PI/2},
  {id:'db-bed',sku:'abo:B07B4Y45H5',kind:'bed',position:[2.6,0,2.5],rotation:Math.PI},
  {id:'db-cabinet',sku:'abo:B074KLJQKV',kind:'cabinet',position:[4.4,0,3.1],rotation:0},
] as const;

/** Poses are an assumed test furnishing, never claimed as the photographed apartment. */
export function buildInput(available:CatalogProduct[]){
  const products=choices.map(choice=>{
    const product=available.find(product=>product.asset.id===choice.sku);
    if(!product||product.asset.kind!==choice.kind||product.asset.source.type!=='gltf'||!product.asset.id.startsWith('abo:'))throw new Error(`Missing real ${choice.kind} ${choice.sku}`);
    return structuredClone(product);
  });
  const store=createApartmentStore(createInitialScene(),[]);
  store.registerCatalogAssets(products.map(product=>product.asset));
  const result=store.execute({id:'assumed-test-furnishing',label:'Assumed furniture positions for live evidence',source:'human',baseRevision:0,operations:choices.map((choice,index)=>({type:'add',object:{id:choice.id,assetId:choice.sku,name:products[index]!.asset.name,position:[...choice.position] as Vec3,rotation:choice.rotation,scale:[1,1,1]}}))},true);
  if(!result.ok)throw new Error(result.errors.join('; '));
  const scene=structuredClone(store.scene),project=scene.project!;
  project.metadata['room-living']={...project.metadata['room-living'],ceilingDesign:defaultCeilingDesign('soft-glow'),notes:'Conceptual ceiling treatment retained from the current project.'};
  project.metadata['room-bedroom']={...project.metadata['room-bedroom'],ceilingDesign:defaultCeilingDesign('quiet'),notes:'Existing bedroom ceiling treatment.'};
  project.sources.push({id:'smoke-layout-assumptions',kind:'document',name:'Assumed live-test furniture poses',notes:'Catalog identities and dimensions are measured database records; poses are a synthetic test arrangement in the current Avani shell.'});
  project.baseline=projectSnapshot(scene);
  project.options.push({id:'smoke-archive',name:'Furnished input before the request',snapshot:projectSnapshot(scene)});
  const fresh=createApartmentStore(scene,products.map(product=>product.asset));
  return {scene:structuredClone(fresh.scene),products,revision:fresh.revision,setup:choices.map(choice=>({...choice,claim:'assumed test position; exact registered database SKU'}))};
}

export function checkReply(id:RequestId,scene:SceneDocument,products:CatalogProduct[],proposal:AgentProposal){
  const reasons:string[]=[],catalog=products.map(product=>product.asset);
  const preservation={ceiling_designs:false,room_metadata:false,archived_options:false,baseline:false,project_fields:false,structure:false,input_snapshot:false};
  let store_result:ReturnType<ReturnType<typeof createApartmentStore>['execute']>|undefined,validation_after:ReturnType<typeof validateScene>|undefined;
  let approval_required=false,request_check:Json|undefined;const beforeText=JSON.stringify(scene);
  try{
    if(proposal.command.source!=='designer'||proposal.command.baseRevision!==0||!proposal.command.operations.length)throw new Error('Expected a nonempty Designer proposal at revision zero');
    const current=products.filter(product=>scene.objects.some(object=>object.assetId===product.asset.id));
    const store=createApartmentStore(scene,current.map(product=>product.asset));
    const retained=new DesignerProposalCatalog();retained.remember(proposal,products);
    store.registerCatalogAssets(retained.products(proposal,0).map(product=>product.asset));
    approval_required=!store.execute(proposal.command,false).ok;
    store_result=store.execute(proposal.command,true);validation_after=validateScene(store.scene,catalog);
    if(!store_result.ok||!validation_after.ok)throw new Error([...store_result.errors,...validation_after.errors].join('; '));
    const after=store.scene,roomIds=scene.rooms.map(room=>room.id),beforeProject=scene.project!,afterProject=after.project!;
    preservation.ceiling_designs=roomIds.every(room=>same(beforeProject.metadata[room]?.ceilingDesign,afterProject.metadata[room]?.ceilingDesign));
    preservation.room_metadata=roomIds.every(room=>same(beforeProject.metadata[room],afterProject.metadata[room]));
    preservation.archived_options=same(beforeProject.options,afterProject.options);
    preservation.baseline=same(beforeProject.baseline,afterProject.baseline);
    preservation.project_fields=['currency','mode','activeOptionId','components','routes','sources','assumptions','tasks'].every(key=>same((beforeProject as unknown as Json)[key],(afterProject as unknown as Json)[key]));
    preservation.structure=after.version===2&&same(scene.rooms,after.rooms)&&same(scene.walls.map(({color,...wall})=>wall),after.walls.map(({color,...wall})=>wall));
    preservation.input_snapshot=JSON.stringify(scene)===beforeText;
    for(const [key,value] of Object.entries(preservation))if(!value)reasons.push(`Preservation failed: ${key}`);
    if(id==='paint'){
      const bedroom=editorToDesigner(scene,{catalog,groupPolicy:'move-together'}).walls.filter(wall=>wall.room_id==='room-bedroom');
      const expected=[...new Set(bedroom.map(wall=>wall.source_id!))];
      const walls=expected.map(wallId=>({id:wallId,before:scene.walls.find(wall=>wall.id===wallId)!.color,after:after.walls.find(wall=>wall.id===wallId)!.color}));
      const changed=walls.filter(wall=>wall.before!==wall.after);
      request_check={bedroom_wall_ids:expected,wall_colors:walls,painted_bedroom_walls:changed.length,all_bedroom_walls_changed:changed.length===expected.length,objects_unchanged:same(scene.objects,after.objects)};
      if(!changed.length||!request_check.objects_unchanged)reasons.push('Expected bedroom wall colour changes without furniture changes');
      if(after.walls.some(wall=>!expected.includes(wall.id)&&!same(wall,scene.walls.find(before=>before.id===wall.id))))reasons.push('Paint changed a wall outside the bedroom boundary');
    }else if(id==='bigger'){
      const before=editorToDesigner(scene,{catalog,groupPolicy:'move-together'}),next=editorToDesigner(after,{catalog,groupPolicy:'move-together'});
      const metric=(input:typeof before)=>spaceMetrics(input).rooms.find(room=>room.room_id==='room-living');
      const beforeMetrics=metric(before)!,afterMetrics=metric(next)!;
      const changed=scene.objects.filter(object=>!same(object,after.objects.find(next=>next.id===object.id)));
      request_check={before:beforeMetrics,after:afterMetrics,changed_object_ids:changed.map(object=>object.id),objects_retained:scene.objects.length===after.objects.length&&scene.objects.every(object=>after.objects.some(next=>next.id===object.id&&next.assetId===object.assetId))};
      if(!changed.length||!request_check.objects_retained)reasons.push('Expected a nonempty rearrangement retaining every owned object');
      if((afterMetrics.largest_free_rectangle?.area_m2??0)<=(beforeMetrics.largest_free_rectangle?.area_m2??0))reasons.push('Largest free rectangle did not improve');
    }else{
      request_check=checkPurchase(scene,catalog,catalog,proposal);
      if(!request_check.pass)reasons.push(...request_check.reasons);
      for(const added of request_check.added_assets)if(!/armchair|accent chair|lounge chair|reading chair|recliner/i.test(added.asset.name))reasons.push(`Added chair identity needs armchair evidence: ${added.asset.name}`);
    }
  }catch(error){reasons.push(error instanceof Error?error.message:String(error));}
  return {pass:reasons.length===0,reasons,approval_required,store_result,validation_after,preservation,request_check};
}

function files(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(path,entry.name)):[join(path,entry.name)]);}
function sourceHashes(){
  const paths=[...files(join(ROOT,'packages/designer/src')).filter(path=>path.endsWith('.ts')),...files(join(ROOT,'apps/editor/src/core')).filter(path=>path.endsWith('.ts')&&!path.endsWith('-check.ts')),...readdirSync(join(ROOT,'harness')).filter(name=>name.startsWith('designer')&&/\.(py|md)$/.test(name)&&!name.endsWith('_test.py')).map(name=>join(ROOT,'harness',name)),...['catalog-http','database-catalog','designer-http'].map(name=>join(ROOT,`apps/editor/src/adapters/${name}.ts`)),join(ROOT,'apps/editor/server/catalog.mjs'),join(HERE,'catalog-armchair-smoke.py'),join(HERE,'latest-editor-smoke.ts')];
  return Object.fromEntries(paths.map(path=>[relative(ROOT,path),sha(readFileSync(path))]));
}
function terminateOwnedTree(child:ChildProcess){
  if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;
  const rows=execFileSync('ps',['-axo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
  const owned=[child.pid],seen=new Set(owned);
  for(let index=0;index<owned.length;index++)for(const [pid,parent] of rows)if(pid&&parent===owned[index]&&!seen.has(pid)){seen.add(pid);owned.push(pid);}
  for(const pid of owned.reverse())try{process.kill(pid,'SIGKILL');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
}

async function main(){
  const args=process.argv.slice(2),arg=(key:string,fallback:string)=>{const index=args.indexOf(key);return index<0?fallback:args[index+1]??fallback;};
  const live=args.includes('--live'),mcpUrl=arg('--mcp-url','http://localhost:8765/mcp'),assetsUrl=arg('--assets-url','http://localhost:8765/editor/assets');
  const logs=resolve(arg('--logs',mkdtempSync('/tmp/varpet-latest-editor-'))),output=resolve(arg('--output',join(HERE,'latest-editor-smoke.json'))),timeout=Number(arg('--timeout','240'));
  if(live&&existsSync(output))throw new Error(`Refusing to overwrite evidence ${output}`);
  mkdirSync(logs,{recursive:true});
  const {createCatalogMiddleware}=await import(pathToFileURL(join(ROOT,'apps/editor/server/catalog.mjs')).href);
  const middleware=createCatalogMiddleware({url:mcpUrl});
  const proxy=createServer((request,response)=>void middleware(request,response,()=>{response.writeHead(404);response.end();}));
  await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const address=proxy.address();if(!address||typeof address==='string')throw new Error('Missing catalog proxy address');
  const origin=`http://127.0.0.1:${address.port}`,originalFetch=globalThis.fetch,catalogReads:Json[]=[];
  globalThis.fetch=async(input,init)=>{
    const mapped=typeof input==='string'&&input.startsWith('/api/catalog/')?origin+input:input;
    const response=await originalFetch(mapped,init);
    if(mapped!==input){const body=await response.clone().text();catalogReads.push({path:input,status:response.status,sha256:sha(body)});appendFileSync(join(logs,'catalog-api.jsonl'),JSON.stringify({path:input,status:response.status,body:JSON.parse(body)})+'\n');}
    return response;
  };
  try{
    const selected=await databaseCatalog.resolve(choices.map(choice=>choice.sku));
    const input=buildInput(selected);let rawDiscovery='';
    const remote=await createCatalogHttpAdapter({url:assetsUrl,fetch:async(url,init)=>{const response=await originalFetch(url,init);rawDiscovery=await response.text();writeFileSync(join(logs,'discovery.json'),rawDiscovery);return new Response(rawDiscovery,{status:response.status,headers:response.headers});}}).list();
    const products=mergeDesignerProducts(input.products,remote),catalog=products.map(product=>product.asset);
    writeFileSync(join(logs,'input.json'),JSON.stringify({...input,products,catalog},null,2)+'\n');
    const probe={scene_sha256:sha(JSON.stringify(input.scene)),catalog_sha256:sha(JSON.stringify(catalog)),discovery_sha256:sha(rawDiscovery),registered_assets:input.products.length,discovered_assets:remote.length,request_catalog_assets:products.length,walls:input.scene.walls.length,objects:input.scene.objects.length,revision:input.revision};
    console.log(JSON.stringify({stage:'prepared',...probe,logs}));if(!live)return;
    const git=(...args:string[])=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim(),hashes=sourceHashes();
    const evidence:Json={schema_version:1,evidence_kind:'measured_latest_editor_three_http_paths',started_at:new Date().toISOString(),source:{head:git('rev-parse','HEAD'),dirty:!!git('status','--porcelain'),hashes},input:probe,setup:{claim:'assumed furniture poses in actual normalized current Avani shell; all registered furniture identities/dimensions/prices measured from the live database',poses:input.setup,products:input.products,ceilings:input.scene.rooms.map(room=>({room_id:room.id,ceiling:input.scene.project!.metadata[room.id]?.ceilingDesign})),baseline:true,archived_options:1},catalog:{currency:'AMD',mcp_url:mcpUrl,same_origin_proxy:origin,discovery_url:assetsUrl,discovery_scope:'Configured VITE_CATALOG_ASSETS_URL path; database-only current products merged with live database discovery. This does not claim default discovery is configured.',api_reads:catalogReads},logs_directory:logs,rows:[],pass:false};
    let limited=false;const controllers=new Set<AbortController>();
    const run=async(request:typeof REQUESTS[number])=>{
      if(limited)return {id:request.id,request:request.request,pass:false,outcome:'not_run_usage_limit'};
      const directory=join(logs,request.id);mkdirSync(directory,{recursive:true});
      const body={scene:input.scene,catalog,catalogCurrency:'AMD',revision:0,request:request.request},bodyText=JSON.stringify(body);
      writeFileSync(join(directory,'request.json'),bodyText+'\n');
      const row:Json={id:request.id,request:request.request,request_sha256:sha(bodyText),pass:false};
      const command=process.env.VARPET_EVAL_PYTHON??'uv',pythonArgs=process.env.VARPET_EVAL_PYTHON?['-u']:['run','--no-project','--with','openai-codex==0.157.1','python','-u'];
      pythonArgs.push(join(HERE,'catalog-armchair-smoke.py'),'--output',directory);
      const child=spawn(command,pythonArgs,{cwd:ROOT,env:{...process.env,VARPET_CATALOG_URL:mcpUrl},stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';const controller=new AbortController();controllers.add(controller);
      const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));
      child.stdout.on('data',chunk=>{appendFileSync(join(directory,'service.stdout.log'),chunk);stdout+=chunk.toString();});
      child.stderr.on('data',chunk=>{appendFileSync(join(directory,'service.stderr.log'),chunk);stderr=(stderr+chunk.toString()).slice(-32000);if(/CATALOG_SMOKE_USAGE_LIMIT|usage limit/i.test(stderr)){limited=true;for(const active of controllers)active.abort();}});
      let started:number|undefined,timer:ReturnType<typeof setTimeout>|undefined;const progress:number[]=[];
      try{
        const port=await new Promise<number>((resolve,reject)=>{const start=Date.now();const poll=setInterval(()=>{const match=/http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout);if(match){clearInterval(poll);resolve(Number(match[1]));}else if(child.exitCode!==null||Date.now()-start>30000){clearInterval(poll);reject(new Error('Service failed to start: '+stderr));}},25);child.once('error',error=>{clearInterval(poll);reject(error);});});
        row.port=port;started=performance.now();timer=setTimeout(()=>controller.abort(),timeout*1000);
        const response=await originalFetch(`http://127.0.0.1:${port}/designer/propose`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/x-ndjson'},body:bodyText,signal:controller.signal});
        row.http_status=response.status;if(!response.ok||!response.body)throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let pending='',final:Json|undefined,bytes=0;
        const consume=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line),seconds=Math.round(performance.now()-started!)/1000;appendFileSync(join(directory,'http.events.jsonl'),JSON.stringify({seconds,event})+'\n');if(event.type==='progress')progress.push(seconds);else{if(final)throw new Error('Multiple final records');final=event;}console.log(JSON.stringify({stage:'http',id:request.id,seconds,type:event.type,message:event.message??event.question??null}));};
        for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4_000_000)throw new Error('HTTP response exceeds 4 MB');const chunk=decoder.decode(value,{stream:true});appendFileSync(join(directory,'http.ndjson'),chunk);pending+=chunk;while(pending.includes('\n')){const index=pending.indexOf('\n');consume(pending.slice(0,index));pending=pending.slice(index+1);}}
        pending+=decoder.decode();if(pending.trim())consume(pending);if(!final)throw new Error('No final service record');
        row.seconds=Math.round(performance.now()-started)/1000;row.outcome=final.type;writeFileSync(join(directory,'final-response.json'),JSON.stringify(final,null,2)+'\n');
        if(final.type==='proposal'){
          const adapter=createDesignerHttpAdapter({request:request.request,catalog,catalogCurrency:'AMD',fetch:async()=>new Response(JSON.stringify(final)+'\n',{headers:{'Content-Type':'application/x-ndjson'}})});
          const proposal=await adapter.propose(input.scene,0);row.proposal=proposal;row.validation=checkReply(request.id,input.scene,products,proposal);row.pass=row.validation.pass;
          if(request.id==='paint'&&!row.validation.request_check?.all_bedroom_walls_changed){row.pass=false;row.validation.reasons.push('Not every bedroom boundary wall changed');}
          const ids=proposal.command.operations.flatMap(op=>op.type==='add'?[op.object.assetId]:[]);
          if(ids.length){row.hydrated_added_products=await databaseCatalog.resolve(ids);row.retained_added_assets=products.filter(product=>ids.includes(product.asset.id));}
        }else row.response=final;
      }catch(error){row.outcome??='error';row.error=error instanceof Error?error.message:String(error);row.pass=false;}
      finally{
        clearTimeout(timer);controller.abort();controllers.delete(controller);child.kill('SIGINT');
        let killTimer:ReturnType<typeof setTimeout>|undefined;
        await Promise.race([closed,new Promise<void>((resolve,reject)=>{killTimer=setTimeout(()=>{try{terminateOwnedTree(child);closed.then(resolve,reject);}catch(error){reject(error);}},10000);})]);clearTimeout(killTimer);
        row.seconds??=started===undefined?null:Math.round(performance.now()-started)/1000;
        row.service_stopped=child.exitCode!==null||child.signalCode!==null;
        const summaries=stderr.split('\n').flatMap(line=>{try{const value=JSON.parse(line);return value.type==='service_summary'?[value]:[];}catch{return [];}});row.service_summary=summaries.at(-1)??null;
        row.actual_profile_matches=row.service_summary?.model==='gpt-6-astra'&&row.service_summary?.effort==='low'&&row.service_summary?.profile?.placement==='without-place'&&row.service_summary?.profile?.context==='compact-base';
        row.pass=row.pass&&row.actual_profile_matches&&!limited;row.progress={count:progress.length,max_gap_seconds:Math.max(0,...progress.slice(1).map((time,index)=>Math.round((time-progress[index]!)*1000)/1000))};
        writeFileSync(join(directory,'evidence.json'),JSON.stringify(row,null,2)+'\n');console.log(JSON.stringify({stage:'finished',id:request.id,pass:row.pass,outcome:row.outcome,seconds:row.seconds}));
      }
      return row;
    };
    // At most two real model requests. A usage limit aborts peers and stops queued work.
    evidence.rows.push(...await Promise.all([run(REQUESTS[0]),run(REQUESTS[1])]));
    evidence.rows.push(await run(REQUESTS[2]));
    evidence.usage_limited=limited;evidence.pass=!limited&&evidence.rows.every((row:Json)=>row.pass);
    evidence.source.head_at_end=git('rev-parse','HEAD');evidence.source.runtime_bytes_unchanged=Object.entries(hashes).every(([path,hash])=>sha(readFileSync(join(ROOT,path)))===hash);
    evidence.finished_at=new Date().toISOString();
    evidence.claim_scope='Measured three real HTTP service requests using current production defaults, real SDK and catalog MCP; exact same database-furnished current Avani shell at revision zero. The reused observer records output only. Poses and ceiling designs are assumed test data; product records are live database data, prices may be mock AMD values. Approval is applied only to disposable real editor stores. This exercises the same-origin catalog middleware and configured discovery/catalog-retention path; it does not claim browser rendering, GLB download, default discovery configuration, or photographed furnishings were tested.';
    writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({stage:'all-finished',pass:evidence.pass,evidence:output,logs}));if(!evidence.pass)process.exitCode=1;
  }finally{globalThis.fetch=originalFetch;proxy.closeAllConnections();await new Promise<void>(resolve=>proxy.close(()=>resolve()));}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
