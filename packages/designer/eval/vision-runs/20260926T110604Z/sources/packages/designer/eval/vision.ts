/** Paired live Avani experiment. No product UI wiring or model replacements. */
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEditorDemoInput} from './editor-demo.js';
import {measure} from './measure.js';
import {checkDemoReply,elapsedSeconds} from './demo-e2e.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {validateScene} from '../../../apps/editor/src/core/validation.js';

type Json=Record<string,any>;
const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'../../..');
const standing:Json[]=JSON.parse(readFileSync(join(HERE,'avani-benchmark-scenarios.json'),'utf8'));
const scenarios=[...standing,
  {id:'catalog',request:'Add an armchair for reading by the window',expect:{kind:'proposal'}},
  {id:'question',request:'Make it cozier',expect:{kind:'question'}},
  {id:'decline',request:'Knock down the wall between the kitchen and living room',expect:{kind:'decline'}},
  {id:'sofa-floor',request:'Does the sofa colour go with the floor? Explain why or why not, and suggest one small colour adjustment if useful. Do not change anything.',expect:{kind:'answer'}},
];

function trace(path:string){
  let records:Json[]=[];
  try{records=readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{}
  const stdout=records.filter(r=>r.kind==='process_output'&&r.stage==='worker'&&r.channel==='stdout').map(r=>r.chunk).join('');
  const events:Json[]=stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const summary=events.filter(r=>r.kind==='worker_summary').at(-1);
  const usage=summary?.total_usage??events.filter(r=>r.method==='thread/tokenUsage/updated').at(-1)?.payload?.tokenUsage?.total;
  const calls=events.filter(e=>e.method==='item/completed'&&e.payload?.item?.type==='mcpToolCall').map(e=>({name:e.payload.item.tool,arguments:e.payload.item.arguments,result:e.payload.item.result,isError:!!e.payload.item.error}));
  return {tokens:usage?.totalTokens??null,usage,thread:events.find(e=>e.kind==='thread'),
    image_input:events.find(e=>e.kind==='image_input'),tool_calls:calls,
    proposal:records.filter(r=>r.kind==='saved_proposal').at(-1)?.proposal,
    final:summary?.response??'',status:summary?.status??'failed'};
}

function grade(scenario:Json,reply:Json,bundle:ReturnType<typeof createEditorDemoInput>,telemetry:ReturnType<typeof trace>){
  let acceptance:boolean|null=null,validation:any=null,storeResult:any=null,measurement:any=null;
  const reasons:string[]=[];
  if(reply.type==='proposal'){
    try{
      const store=new EditorStore(bundle.editor_scene,bundle.catalog);
      storeResult=store.execute(reply.proposal.command,true);validation=validateScene(store.scene,bundle.catalog);
      acceptance=storeResult.ok&&validation.ok;
      if(!acceptance)reasons.push(...storeResult.errors,...validation.errors);
    }catch(error){acceptance=false;reasons.push(String(error));}
  }
  let pass=false;
  if(scenario.expected_intent){
    measurement=measure({scene:bundle.scene,scenario:scenario as any,proposal:telemetry.proposal,
      final:telemetry.final,tool_calls:telemetry.tool_calls,editor_scene:bundle.editor_scene,catalog:bundle.catalog});
    pass=acceptance===true&&measurement.pass;reasons.push(...measurement.reasons);
  }else if(scenario.id==='catalog'){
    const additions=reply.proposal?.command?.operations?.filter((op:Json)=>op.type==='add')??[];
    pass=acceptance===true&&additions.length>0;
    if(!pass)reasons.push('Requires an editor-accepted furniture addition.');
  }else if(scenario.id==='sofa-floor'){
    // Human review is recorded separately; never call a regex an aesthetic judgement.
    pass=false;reasons.push('Pending manual answer-quality judgement using the predeclared rubric.');
  }else{
    const check=checkDemoReply(scenario.id,reply);pass=check.pass;
    if(check.reason)reasons.push(check.reason);
  }
  if(reply.type==='error')reasons.push(reply.message??'Service error');
  if(telemetry.status!=='completed'){pass=false;reasons.push('Model turn did not complete.');}
  return {pass,editor_accepted:acceptance,store_result:storeResult,validation,measurement,reasons};
}

async function main(){
  const stamp=execFileSync('date',['-u','+%Y%m%dT%H%M%SZ'],{encoding:'utf8'}).trim();
  const batch=join(HERE,'vision-runs',stamp);mkdirSync(batch,{recursive:true});
  const sourcePaths=['harness/designer.py','harness/designer_service.py','harness/designer_profiles.py',
    'packages/designer/eval/vision.ts','packages/designer/eval/vision-service.py','packages/designer/eval/measure.ts',
    'packages/designer/src/editor-bridge.ts','apps/editor/src/core/demo.ts','apps/editor/src/core/store.ts','apps/editor/src/core/validation.ts'];
  const manifest:Json={started_at:new Date().toISOString(),source_revision:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    scenarios,repetitions:2,concurrency:4,model:'gpt-6-astra',effort:'low',profile:{placement:'without-place',context:'compact-base'},
    design:'Counterbalanced order: repetition 1 text then images, repetition 2 images then text; each request starts a fresh thread and scene. Four calls in flight, mixed conditions.',
    rubric:'Standing Avani requests use existing independent request/geometry grader AND EditorStore acceptance. Catalog needs an accepted addition. Cozier needs a question. Structural work needs a polite scope decline. Sofa-floor needs a direct colour-compatibility judgement, a grounded reason and a proportionate suggestion/caveat, without edits; manually reviewed for both conditions, no regex aesthetics score.',
    source_hashes:Object.fromEntries(sourcePaths.map(path=>[path,createHash('sha256').update(readFileSync(join(ROOT,path))).digest('hex')]))};
  writeFileSync(join(batch,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const child=spawn('uv',['run','--no-project','--with','openai-codex==0.157.1','python','-u',join(HERE,'vision-service.py'),'--output',batch],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
  const closed=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
  let stderr='',limited=false;const controllers=new Set<AbortController>();const rows:Json[]=[];
  child.stderr.on('data',chunk=>{const text=chunk.toString();appendFileSync(join(batch,'service.stderr.log'),text);stderr=(stderr+text).slice(-5000);
    if(stderr.includes('EVAL_USAGE_LIMIT')){limited=true;for(const controller of controllers)controller.abort();}});
  try{
    const ready=await new Promise<Json>((resolve,reject)=>{
      let stdout='';const timer=setTimeout(()=>reject(new Error('Service startup deadline: '+stderr)),120000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Service exited ${code}: ${stderr}`));});
      child.stdout.on('data',chunk=>{appendFileSync(join(batch,'service.stdout.log'),chunk);stdout+=chunk.toString();
        if(stdout.includes('\n')){try{const entry=JSON.parse(stdout.split('\n')[0]!);clearTimeout(timer);resolve(entry);}catch{}}});
    });
    manifest.service=ready;
    if(ready.effort!=='low'||ready.profile.placement!=='without-place'||ready.profile.context!=='compact-base')throw new Error('Production profile changed; do not silently compare a different profile');
    const jobs:Json[]=[];
    for(let repetition=1;repetition<=2;repetition++)for(const scenario of scenarios)
      for(const condition of repetition===1?['text','images']:['images','text'])jobs.push({scenario,repetition,condition,id:`${scenario.id}-${condition}-${repetition}`});
    manifest.order=jobs.map(job=>job.id);writeFileSync(join(batch,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    let next=0;
    await Promise.all(Array.from({length:4},async()=>{
      while(next<jobs.length&&!limited){
        const job=jobs[next++]!,bundle=createEditorDemoInput(job.scenario.scene_variant??'original');
        const started=performance.now(),controller=new AbortController();controllers.add(controller);
        const timer=setTimeout(()=>controller.abort(),600000);
        console.log('START '+job.id);let reply:Json={type:'error',message:'No final response'};
        try{
          const response=await fetch(`http://127.0.0.1:${ready.ports[job.condition]}/designer/propose`,{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({_evalRunId:job.id,scene:bundle.editor_scene,revision:0,request:job.scenario.request}),signal:controller.signal});
          if(!response.body)throw new Error('Empty HTTP response');
          const reader=response.body.getReader(),decoder=new TextDecoder();let body='';
          for(;;){const {value,done}=await reader.read();if(done)break;const chunk=decoder.decode(value,{stream:true});body+=chunk;appendFileSync(join(batch,job.id+'.http.ndjson'),chunk);}
          body+=decoder.decode();const finals=body.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(line=>line.type!=='progress');
          if(!response.ok||finals.length!==1)throw new Error(`HTTP ${response.status}; ${finals.length} final records`);
          reply=finals[0];
        }catch(error){reply={type:'error',message:String(error)};}
        finally{clearTimeout(timer);controllers.delete(controller);}
        const seconds=elapsedSeconds(started,performance.now()),telemetry=trace(join(batch,job.id+'.events.jsonl'));
        const result=grade(job.scenario,reply,bundle,telemetry);
        if(telemetry.image_input?.count!==(job.condition==='images'?2:0)){result.pass=false;result.reasons.push('Image exposure audit mismatch.');}
        const row={...job,...result,...telemetry,seconds,reply,outcome:reply.type,
          explanation:reply.proposal?.description??reply.question??reply.message??''};
        rows.push(row);writeFileSync(join(batch,job.id+'.json'),JSON.stringify(row,null,2)+'\n');
        console.log(`END ${job.id}: ${reply.type}; pass=${row.pass}; accepted=${row.editor_accepted}; ${seconds}s; ${row.tokens} tokens`);
      }
    }));
  }finally{
    for(const controller of controllers)controller.abort();child.kill('SIGTERM');await closed;
    manifest.finished_at=new Date().toISOString();manifest.usage_limit_stop=limited;manifest.completed=rows.length;
    writeFileSync(join(batch,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    writeFileSync(join(HERE,'vision-latest.json'),JSON.stringify({batch:relative(HERE,batch)},null,2)+'\n');
    console.log(`Recorded ${rows.length}/28 runs in ${batch}`);
  }
  if(rows.length!==28)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
