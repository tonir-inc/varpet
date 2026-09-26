/** Run with --live only after authorizing a real model call; default is REST preflight. */
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {appendFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import type {AgentProposal,CatalogAsset,SceneDocument} from '../../../apps/editor/src/contracts.js';
import {createCatalogHttpAdapter,mergeCatalogs} from '../../../apps/editor/src/adapters/catalog-http.js';
import {createDesignerHttpAdapter} from '../../../apps/editor/src/adapters/designer-http.js';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {validateScene} from '../../../apps/editor/src/core/validation.js';
import {editorToDesigner} from '../src/editor-bridge.js';
import {checkRequest} from '../src/request.js';
import type {Op} from '../src/scene.js';

export const CUSTOMER_REQUEST='add an armchair for reading by the window';
const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'../../..');
type Json=Record<string,any>;
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

export function checkPurchase(scene:SceneDocument,catalog:CatalogAsset[],remote:CatalogAsset[],proposal:AgentProposal){
  const reasons:string[]=[],added_assets:{object_id:string;asset:CatalogAsset}[]=[];
  let store_result:ReturnType<EditorStore['execute']>|undefined,validation_after:ReturnType<typeof validateScene>|undefined,request_check:ReturnType<typeof checkRequest>|undefined,approval_required=false;
  try{
    if(proposal.command.source!=='designer'||proposal.command.baseRevision!==0)throw new Error('Expected a designer proposal at revision zero');
    const adds=proposal.command.operations.filter(op=>op.type==='add');
    if(adds.length!==1)throw new Error('Expected exactly one added catalog armchair');
    for(const op of adds){
      const asset=remote.find(asset=>asset.id===op.object.assetId);
      if(!asset||asset.kind!=='chair'||localCatalog.some(local=>local.id===asset.id))throw new Error('Added armchair is not a remote catalog chair');
      if(!same(catalog.find(entry=>entry.id===asset.id),asset)||!same(op.object.scale,[1,1,1]))throw new Error('Added catalog dimensions or record were changed');
      if(!Number.isSafeInteger(asset.price)||asset.price<0)throw new Error('Catalog price is not a whole nonnegative AMD value');
      added_assets.push({object_id:op.object.id,asset});
    }
    const store=new EditorStore(scene,catalog);
    approval_required=!store.execute(proposal.command,false).ok;
    store_result=store.execute(proposal.command,true);validation_after=validateScene(store.scene,catalog);
    if(!store_result.ok||!validation_after.ok)throw new Error([...store_result.errors,...validation_after.errors].join('; '));
    if(scene.objects.some(object=>!store.scene.objects.some(next=>next.id===object.id))||store.scene.objects.length!==scene.objects.length+1)throw new Error('Purchase must retain every owned object and add exactly one');
    const before=editorToDesigner(scene,{catalog,groupPolicy:'move-together'}),after=editorToDesigner(store.scene,{catalog,groupPolicy:'move-together'});
    const item=after.items.find(item=>item.id===added_assets[0]!.object_id)!;
    const ops:Op[]=[{type:'add',item:{...item,price:added_assets[0]!.asset.price}}];
    request_check=checkRequest(before,after,ops,{add:[{kinds:['chair'],count:1}],preferences:[{type:'near_window',item_id:item.id,max_distance_m:1.5}]},added_assets[0]!.asset.price);
    if(!request_check.ok)throw new Error(request_check.errors.map(issue=>issue.message).join('; '));
  }catch(error){reasons.push(error instanceof Error?error.message:String(error));}
  return {pass:reasons.length===0,reasons,approval_required,store_result,validation_after,request_check,added_assets};
}

function files(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(path,entry.name)):[join(path,entry.name)]);}
function terminateOwnedTree(child:ChildProcess){
  if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;
  const rows=execFileSync('ps',['-axo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
  const owned=[child.pid],seen=new Set(owned);
  for(let index=0;index<owned.length;index++)for(const [pid,parent] of rows)if(pid&&parent===owned[index]&&!seen.has(pid)){seen.add(pid);owned.push(pid);}
  // Snapshot ancestry before terminating anything; signal only this service's descendants.
  for(const pid of owned.reverse())try{process.kill(pid,'SIGKILL');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
}
function sourceHashes(){
  const paths=[...files(join(ROOT,'packages/designer/src')).filter(path=>path.endsWith('.ts')),
    ...files(join(ROOT,'apps/editor/src/core')).filter(path=>path.endsWith('.ts')&&!path.endsWith('-check.ts')),
    ...readdirSync(join(ROOT,'harness')).filter(name=>name.startsWith('designer')&&/\.(py|md)$/.test(name)&&!name.endsWith('_test.py')).map(name=>join(ROOT,'harness',name)),
    join(ROOT,'apps/editor/src/adapters/catalog-http.ts'),join(ROOT,'apps/editor/src/adapters/designer-http.ts'),
    join(HERE,'catalog-armchair-smoke.ts'),join(HERE,'catalog-armchair-smoke.py')];
  return Object.fromEntries(paths.map(path=>[relative(ROOT,path),sha(readFileSync(path))]));
}
function toolProducts(logs:string){
  const path=join(logs,'sdk.events.jsonl');if(!existsSync(path))return {products:[] as Json[],calls:0};
  const records:Json[]=readFileSync(path,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const output=records.filter(record=>record.kind==='process_output'&&record.stage==='worker'&&record.channel==='stdout').map(record=>record.chunk).join('');
  const products:Json[]=[];let calls=0;
  for(const line of output.split('\n')){
    let event:Json;try{event=JSON.parse(line);}catch{continue;}
    const item=event.payload?.item;
    if(event.method!=='item/completed'||item?.type!=='mcpToolCall'||item.server!=='varpet-designer'||item.tool!=='search_catalog'||item.status!=='completed'||item.error||item.result?.isError)continue;
    calls++;const values=[item.result?.structuredContent,...(item.result?.content??[]).flatMap((part:Json)=>{try{return part.type==='text'?[JSON.parse(part.text)]:[];}catch{return [];}})];
    for(const value of values)if(value?.status==='available'&&Array.isArray(value.results))products.push(...value.results);
  }
  return {products:[...new Map(products.map(product=>[JSON.stringify(product),product])).values()],calls};
}

async function main(){
  const args=process.argv.slice(2),value=(key:string,fallback:string)=>{const index=args.indexOf(key);if(index<0)return fallback;if(!args[index+1]||args[index+1]!.startsWith('--'))throw new Error(`${key} needs a value`);return args[index+1]!;};
  const live=args.includes('--live'),assetsUrl=value('--assets-url','http://localhost:8765/editor/assets'),mcpUrl=value('--mcp-url','http://localhost:8765/mcp');
  const logs=resolve(value('--logs',mkdtempSync('/tmp/varpet-catalog-armchair-'))),output=resolve(value('--output',join(HERE,'catalog-armchair-smoke.json'))),timeout=Number(value('--timeout','240'));
  if(!Number.isFinite(timeout)||timeout<=0)throw new Error('Timeout must be positive');
  if(live&&existsSync(output))throw new Error(`Refusing to overwrite evidence: ${output}`);
  mkdirSync(logs,{recursive:true});let catalogRaw='',catalogStatus=0;
  const remote=await createCatalogHttpAdapter({url:assetsUrl,fetch:async(url,init)=>{const response=await fetch(url,init);catalogStatus=response.status;catalogRaw=await response.text();writeFileSync(join(logs,'catalog-response.json'),catalogRaw);return new Response(catalogRaw,{status:response.status,headers:response.headers});}}).list();
  const catalog=mergeCatalogs(localCatalog,remote),scene=structuredClone(demoScene),body={scene,catalog,catalogCurrency:'AMD' as const,revision:0,request:CUSTOMER_REQUEST},bodyText=JSON.stringify(body);
  writeFileSync(join(logs,'request.json'),bodyText+'\n');
  const probe={http_status:catalogStatus,remote_assets:remote.length,merged_assets:catalog.length,catalog_response_sha256:sha(catalogRaw),catalog_sha256:sha(JSON.stringify(catalog)),scene_sha256:sha(JSON.stringify(scene)),request_sha256:sha(bodyText)};
  console.log(JSON.stringify({stage:'catalog',...probe,logs}));if(!live)return;
  const git=(...args:string[])=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
  const hashes=sourceHashes(),record:Json={schema_version:1,evidence_kind:'measured_live_catalog_purchase',started_at:new Date().toISOString(),source:{head:git('rev-parse','HEAD'),dirty:!!git('status','--porcelain'),hashes},request:CUSTOMER_REQUEST,revision:0,catalog_currency:'AMD',catalog_assets_url:assetsUrl,catalog_mcp_url:mcpUrl,input:probe,logs_directory:logs,total_http_deadline_seconds:timeout,pass:false};
  const command=process.env.VARPET_EVAL_PYTHON??'uv',pythonArgs=process.env.VARPET_EVAL_PYTHON?['-u']:['run','--no-project','--with','openai-codex==0.157.1','python','-u'];
  pythonArgs.push(join(HERE,'catalog-armchair-smoke.py'),'--output',logs);
  const child=spawn(command,pythonArgs,{cwd:ROOT,env:{...process.env,VARPET_CATALOG_URL:mcpUrl},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',limited=false;const controller=new AbortController(),closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));
  child.stderr.on('data',chunk=>{appendFileSync(join(logs,'service.stderr.log'),chunk);stderr=(stderr+chunk.toString()).slice(-16000);if(/CATALOG_SMOKE_USAGE_LIMIT|usage limit/i.test(stderr)){limited=true;controller.abort();}});
  child.stdout.on('data',chunk=>{appendFileSync(join(logs,'service.stdout.log'),chunk);stdout+=chunk.toString();});
  let requestStarted:number|undefined,timer:ReturnType<typeof setTimeout>|undefined;const progress:number[]=[];
  try{
    const port=await new Promise<number>((resolve,reject)=>{const start=Date.now();const poll=setInterval(()=>{const match=/http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout);if(match){clearInterval(poll);resolve(Number(match[1]));}else if(child.exitCode!==null||Date.now()-start>30000){clearInterval(poll);reject(new Error('Service failed to start: '+stderr));}},25);child.once('error',error=>{clearInterval(poll);reject(error);});});
    record.port=port;requestStarted=performance.now();timer=setTimeout(()=>controller.abort(),timeout*1000);
    const response=await fetch(`http://127.0.0.1:${port}/designer/propose`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/x-ndjson'},body:bodyText,signal:controller.signal});
    record.http_status=response.status;if(!response.ok||!response.body)throw new Error(`HTTP ${response.status}: no valid stream`);
    const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let pending='',final:Json|undefined,bytes=0;
    const consume=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line),seconds=Math.round(performance.now()-requestStarted!)/1000;appendFileSync(join(logs,'http.events.jsonl'),JSON.stringify({seconds,event})+'\n');if(event.type==='progress')progress.push(seconds);else{if(final)throw new Error('Multiple final records');final=event;}console.log(JSON.stringify({stage:'http',seconds,type:event.type,message:event.message??event.question??null}));};
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4_000_000)throw new Error('HTTP response exceeds 4 MB');const chunk=decoder.decode(value,{stream:true});appendFileSync(join(logs,'http.ndjson'),chunk);pending+=chunk;while(pending.includes('\n')){const index=pending.indexOf('\n');consume(pending.slice(0,index));pending=pending.slice(index+1);}}
    pending+=decoder.decode();if(pending.trim())consume(pending);if(!final)throw new Error('No final service record');
    record.seconds=Math.round(performance.now()-requestStarted)/1000;record.outcome=final.type;writeFileSync(join(logs,'final-response.json'),JSON.stringify(final,null,2)+'\n');
    if(final.type==='proposal'){
      const adapter=createDesignerHttpAdapter({request:CUSTOMER_REQUEST,catalog,catalogCurrency:'AMD',fetch:async()=>new Response(JSON.stringify(final)+'\n',{headers:{'Content-Type':'application/x-ndjson'}})});
      const proposal=await adapter.propose(scene,0);record.proposal=proposal;record.validation=checkPurchase(scene,catalog,remote,proposal);
      const catalogEvidence=toolProducts(logs);record.catalog_search_calls=catalogEvidence.calls;
      record.catalog_provenance=record.validation.added_assets.map(({asset}:Json)=>({asset_id:asset.id,matching_search_products:catalogEvidence.products.filter(product=>product.sku===asset.id&&product.kind===asset.kind&&product.price===asset.price&&same(product.size,[asset.dimensions[0],asset.dimensions[2],asset.dimensions[1]]))}));
      record.pass=record.validation.pass&&record.catalog_provenance.length===1&&record.catalog_provenance.every((entry:Json)=>entry.matching_search_products.length>0);
      record.editor_snapshot_unchanged=same(scene,demoScene);
    }else record.response=final;
  }catch(error){record.outcome??='error';record.error=error instanceof Error?error.message:String(error);record.seconds=requestStarted===undefined?null:Math.round(performance.now()-requestStarted)/1000;}
  finally{
    clearTimeout(timer);controller.abort();child.kill('SIGINT');
    let killTimer:ReturnType<typeof setTimeout>|undefined;
    await Promise.race([closed,new Promise<void>((resolve,reject)=>{killTimer=setTimeout(()=>{try{terminateOwnedTree(child);closed.then(resolve,reject);}catch(error){reject(error);}},10000);})]);clearTimeout(killTimer);
    record.usage_limited=limited;record.service_stopped=child.exitCode!==null||child.signalCode!==null;
    const summaries=stderr.split('\n').flatMap(line=>{try{const value=JSON.parse(line);return value.type==='service_summary'?[value]:[];}catch{return [];}});record.service_summary=summaries.at(-1)??null;
    record.actual_profile_matches=record.service_summary?.model==='gpt-6-astra'&&record.service_summary?.effort==='low'&&record.service_summary?.profile?.placement==='without-place'&&record.service_summary?.profile?.context==='compact-base';
    record.pass=record.pass&&record.actual_profile_matches&&!limited;
    record.progress={count:progress.length,max_gap_seconds:Math.max(0,...progress.slice(1).map((time,index)=>Math.round((time-progress[index]!)*1000)/1000))};
    record.source.head_at_end=git('rev-parse','HEAD');record.source.runtime_bytes_unchanged=Object.entries(hashes).every(([path,hash])=>sha(readFileSync(join(ROOT,path)))===hash);
    record.finished_at=new Date().toISOString();record.claim_scope='One real SDK request through the production HTTP service defaults and real catalog MCP. The observer only records subprocess output; it does not change profiles, tools or model behavior. REST and MCP prices may be mock catalog prices, not shop quotations. The independent near-window check uses the existing 1.5 m footprint-distance policy. Test approval applies only to a disposable editor store; browser rendering and GLB download were not tested.';
    writeFileSync(output,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({stage:'finished',pass:record.pass,outcome:record.outcome,seconds:record.seconds,evidence:output,logs}));
  }
  if(!record.pass)process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
