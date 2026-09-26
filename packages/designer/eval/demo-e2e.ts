/** Real HTTP → real Designer → bridge → real editor store. No model stubs. */
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AgentProposal, SceneDocument } from '../../../apps/editor/src/contracts.js';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../../..');
export const requests = [
  {id:'rearrange',request:'Make the living room feel bigger'},
  {id:'colour',request:'Paint the bedroom walls a soft sage green'},
  {id:'catalog',request:'Add an armchair for reading by the window'},
  {id:'question',request:'Make it cozier'},
  {id:'decline',request:'Knock down the wall between the kitchen and living room'},
] as const;
type Json = Record<string, any>;
export const elapsedSeconds = (startMs: number, endMs: number) => Math.round(endMs-startMs)/1000;

export function checkDemoReply(id: string, reply: Json) {
  const baseline = validateScene(demoScene, localCatalog);
  let store_result: ReturnType<EditorStore['execute']> | undefined;
  let validation_after: ReturnType<typeof validateScene> | undefined;
  let scene_after: SceneDocument | undefined;
  let reason = '', pass = false;
  if (['rearrange','colour','catalog'].includes(id)) {
    if (reply.type !== 'proposal') reason = `Expected proposal, received ${reply.type ?? 'missing'}: ${reply.message ?? reply.question ?? ''}`;
    else {
      try {
        const store = new EditorStore(demoScene, localCatalog);
        store_result = store.execute((reply.proposal as AgentProposal).command, true);
        scene_after = structuredClone(store.scene);
        validation_after = validateScene(store.scene, localCatalog);
        pass = store_result.ok && validation_after.ok;
        if (!pass) reason = [...store_result.errors,...validation_after.errors].join('; ');
      } catch(error) { reason = error instanceof Error ? error.message : String(error); }
    }
  } else if (id === 'question') {
    pass = reply.type === 'question' && typeof reply.question === 'string' && !!reply.question.trim();
    if (!pass) reason = `Expected a nonempty question, received ${reply.type ?? 'missing'}`;
  } else {
    const message = typeof reply.message === 'string' ? reply.message : '';
    pass = reply.type === 'decline' && /wall|structur|demoli/i.test(message)
      && /cannot|can't|can’t|outside|out of scope|not.*scope|don't|do not|unable/i.test(message)
      && /sorry|please|can help|can offer|instead|happy to/i.test(message);
    if (!pass) reason = `Expected a polite structural-scope decline, received ${reply.type ?? 'missing'}: ${message}`;
  }
  return {pass,reason,baseline_validation:baseline,store_result,validation_after,scene_after};
}

function telemetry(path: string) {
  let records: Json[] = [];
  try { records = readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)); } catch { /* Preserve unavailable telemetry. */ }
  const stdout = records.filter(r=>r.kind==='process_output'&&r.stage==='worker'&&r.channel==='stdout').map(r=>r.chunk).join('');
  const events: Json[] = stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  let usage: Json | null = null;
  for (const event of events) {
    if(event.method==='thread/tokenUsage/updated') usage=event.payload?.tokenUsage?.total??usage;
    if(event.kind==='worker_summary') usage=event.total_usage??usage;
  }
  return {tokens:usage?.totalTokens??null,usage,thread:events.find(e=>e.kind==='thread')??null,
    bridge_stages:records.filter(r=>r.kind==='process_end').map(r=>({stage:r.stage,seconds:r.seconds,returncode:r.returncode}))};
}

const escape = (text: unknown) => String(text??'').replaceAll('|','\\|').replaceAll('\n',' ');
export function report(batch: string, manifest: Json, rows: Json[]) {
  const link = relative(HERE,batch);
  const text = ['# M2: live editor demo end-to-end test','',
    `[measured] Source \`${manifest.source_revision}\`; model gpt-6-astra, medium; ${rows.filter(r=>r.pass).length}/${requests.length} passed. Started ${manifest.started_at}; finished ${manifest.finished_at??'running'}.`,
    '',`[Manifest and source hashes](${link}/manifest.json). [Exact editor demo snapshot](${link}/editor-input.json).`,
    '', '[measured] Each exact request uses a fresh demo scene, revision 0 and conversation. Path: HTTP /designer/propose → production DesignerService → real harness/designer.py SDK thread → production MCP and bridge CLI → editor validateScene and EditorStore.execute(command, true). The eval wrapper only records subprocess output and saved proposals. No model, bridge, HTTP service or editor-store stub is used.',
    '', '[assumed] Test approval applies only to an isolated in-memory editor store. The normal editor payload omits north, door swings, external catalog assets and catalogCurrency; the benchmark does likewise and does not invent them to make a request pass. Catalog endpoint comes from the existing laptop settings. At most four requests run concurrently, with a 180 s worker no-output watchdog and a 600 s HTTP deadline. No retries; individual failures are recorded and the remaining requests continue.',
    '', '| Request | Outcome | Pass | Seconds | Tokens | Description / answer | Failure reason | Evidence |',
    '|---|---|---|---:|---:|---|---|---|'];
  for(const request of requests) {
    const row=rows.find(r=>r.id===request.id);
    if(!row) {text.push(`| ${request.request} | pending | no | N/A | N/A | | Not run | |`);continue;}
    text.push(`| ${request.request} | ${escape(row.outcome)} | ${row.pass?'yes':'no'} | ${row.seconds?.toFixed(3)??'N/A'} | ${row.tokens??'N/A'} | ${escape(row.outcome==='error'?'No editor proposal returned.':row.description)} | ${escape(row.reason)} | [HTTP](${link}/${row.id}.http.ndjson), [SDK/bridge](${link}/${row.id}.events.jsonl), [result](${link}/${row.id}.json) |`);
  }
  text.push('', '[measured] Seconds cover the HTTP request through editor store validation. Tokens are the last cumulative SDK total for that fresh thread (including cached input), not a billing estimate. Missing usage remains N/A. Proposal descriptions above are returned text, not benchmark claims. Every proposal result includes store acceptance and post-application validation; failed additions do not trigger a catalog or bridge workaround. Error rows returned no editor proposal or description; their saved Designer rationale remains in the SDK/bridge transcript.',
    '', '[derived] Pass is the milestone criterion: store acceptance and valid resulting scene for requests 1–3; a question for request 4; a polite structural-scope decline for request 5. This is not a human judgement of colour or room aesthetics. Browser rendering is not tested.',
    '', ...(manifest.timing_correction ? ['[derived] '+manifest.timing_correction,''] : []),
    ...(manifest.observations??[]).flatMap((entry:string)=>[entry,'']),
    'Run from the repository root:', '', '```sh', 'pnpm --filter @varpet/designer exec tsx eval/demo-e2e.ts',
    `pnpm --filter @varpet/designer exec tsx eval/demo-e2e.ts --report ${relative(join(ROOT,'packages/designer'),batch)}`, '```', '');
  writeFileSync(join(HERE,'demo-e2e.md'),text.join('\n'));
}

async function main() {
  if(process.argv[2]==='--report') {
    if(!process.argv[3])throw new Error('--report requires a batch directory');
    const batch=resolve(process.argv[3]),manifest=JSON.parse(readFileSync(join(batch,'manifest.json'),'utf8'));
    const rows=requests.map(({id})=>JSON.parse(readFileSync(join(batch,id+'.json'),'utf8')));
    report(batch,manifest,rows);
    console.log(`Replayed ${rows.length}/5 recorded requests; ${rows.filter(row=>row.pass).length}/5 passed. No live calls.`);
    return;
  }
  const stamp=execFileSync('date',['-u','+%Y%m%dT%H%M%SZ'],{encoding:'utf8'}).trim();
  const batch=join(HERE,'demo-e2e-runs',stamp); mkdirSync(batch,{recursive:true});
  writeFileSync(join(batch,'editor-input.json'),JSON.stringify({scene:demoScene,catalog:localCatalog},null,2)+'\n');
  const sources=['harness/designer.py','harness/designer_service.py','harness/designer_prompt.md','packages/designer/src/editor-bridge.ts',
    'packages/designer/src/server.ts','apps/editor/src/core/demo.ts','apps/editor/src/core/store.ts','apps/editor/src/core/validation.ts',
    'apps/editor/src/contracts.ts','apps/editor/src/renovation-contracts.ts','packages/designer/eval/demo-e2e.ts','packages/designer/eval/demo-e2e-service.py'];
  const manifest: Json={source_revision:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),started_at:new Date().toISOString(),
    model:'gpt-6-astra',effort:'medium',concurrency:4,requests,idle_timeout_seconds:180,http_deadline_seconds:600,
    source_hashes:Object.fromEntries(sources.map(path=>[path,createHash('sha256').update(readFileSync(join(ROOT,path))).digest('hex')]))};
  const command=process.env.VARPET_EVAL_PYTHON??'uv';
  const args=process.env.VARPET_EVAL_PYTHON?['-u']:['run','--no-project','--with','openai-codex==0.157.1','python','-u'];
  args.push(join(HERE,'demo-e2e-service.py'),'--output',batch);
  const child=spawn(command,args,{cwd:ROOT,stdio:['ignore','pipe','pipe']});
  const closed=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
  const controllers=new Set<AbortController>(); let limited=false,stderr='';
  child.stderr.on('data',chunk=>{
    const text=chunk.toString();appendFileSync(join(batch,'service.stderr.log'),text);stderr=(stderr+text).slice(-5000);
    if(stderr.includes('EVAL_USAGE_LIMIT')){limited=true;for(const controller of controllers)controller.abort();}
  });
  const rows: Json[]=[];
  try {
    const ready=await new Promise<Json>((resolve,reject)=>{
      let stdout='';const timer=setTimeout(()=>reject(new Error('Service startup deadline: '+stderr)),120_000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Service exited ${code}: ${stderr}`));});
      child.stdout.on('data',chunk=>{appendFileSync(join(batch,'service.stdout.log'),chunk);stdout+=chunk.toString();
        if(stdout.includes('\n')){try{const entry=JSON.parse(stdout.split('\n')[0]!);clearTimeout(timer);resolve(entry);}catch{}}});
    });
    manifest.service=ready; writeFileSync(join(batch,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    const health=await fetch(`http://127.0.0.1:${ready.port}/designer/health`);
    if(!health.ok)throw new Error(`Health check failed ${health.status}`);
    let next=0;
    await Promise.all(Array.from({length:4},async()=>{
      while(next<requests.length&&!limited){
        const request=requests[next++]!;const started=performance.now();
        console.log(`START ${request.id}: ${request.request}`);
        const controller=new AbortController();controllers.add(controller);
        const timer=setTimeout(()=>controller.abort(),600_000);
        let reply: Json={type:'error',message:'No final response'},httpStatus:number|null=null;
        try{
          const response=await fetch(`http://127.0.0.1:${ready.port}/designer/propose`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'http://localhost:5173'},
            body:JSON.stringify({scene:demoScene,revision:0,request:request.request}),signal:controller.signal});
          httpStatus=response.status;
          if(!response.body)throw new Error('HTTP response has no body');
          const reader=response.body.getReader(),decoder=new TextDecoder();let body='';
          for(;;){const {value,done}=await reader.read();if(done)break;const chunk=decoder.decode(value,{stream:true});body+=chunk;appendFileSync(join(batch,request.id+'.http.ndjson'),chunk);}
          body+=decoder.decode();const entries=body.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
          const finals=entries.filter(entry=>entry.type!=='progress');
          if(!response.ok||finals.length!==1)throw new Error(`HTTP ${response.status}; ${finals.length} final records`);
          reply=finals[0];
        }catch(error){reply={type:'error',message:controller.signal.aborted?'HTTP deadline or usage-limit cancellation':error instanceof Error?error.message:String(error)};}
        finally{clearTimeout(timer);controllers.delete(controller);}
        const checked=checkDemoReply(request.id,reply);
        const row={...request,...checked,...telemetry(join(batch,request.id+'.events.jsonl')),reply,http_status:httpStatus,
          outcome:reply.type,seconds:elapsedSeconds(started,performance.now()),proposal_description:reply.proposal?.description??null,
          description:reply.type==='proposal'?reply.proposal?.description:reply.question??reply.message??''};
        rows.push(row);writeFileSync(join(batch,request.id+'.json'),JSON.stringify(row,null,2)+'\n');
        report(batch,manifest,rows);console.log(`END ${request.id}: ${row.outcome}; ${row.pass?'PASS':'FAIL'}; ${row.seconds}s; ${row.tokens} tokens${row.reason?'; '+row.reason:''}`);
        if(/usage limit/i.test(reply.message??''))limited=true;
      }
    }));
  }finally{
    for(const controller of controllers)controller.abort();child.kill('SIGTERM');await closed;
    manifest.finished_at=new Date().toISOString();manifest.usage_limit_stop=limited;
    writeFileSync(join(batch,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    report(batch,manifest,rows);
    console.log(`Recorded ${rows.length}/5 requests; ${rows.filter(row=>row.pass).length}/5 passed. Report: ${join(HERE,'demo-e2e.md')}`);
  }
  if(rows.length!==5)process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
