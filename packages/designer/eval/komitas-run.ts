/** Stateful customer conversation: real HTTP -> real thread -> bridge -> EditorStore. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {resolve,basename,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
import {execFileSync} from 'node:child_process';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {validateScene} from '../../../apps/editor/src/core/validation.js';
import {createCatalogHttpAdapter,mergeCatalogs} from '../../../apps/editor/src/adapters/catalog-http.js';
import {requests,grade,flatContext} from './komitas-grade.js';
const arg=(key:string,fallback:string)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]!:fallback;
const input=arg('--scene','avani'),id=arg('--id',input==='avani'?'avani':basename(input,'.scene.json'));
const output=resolve(ROOT,arg('--output',`packages/designer/eval/komitas-runs/${id}-${Date.now()}`));
const events=resolve(arg('--events','/tmp/varpet-komitas-events')),endpoint=arg('--service','http://127.0.0.1:8794');
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const save=(name:string,value:unknown)=>{const path=join(output,name);writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync(path+'.tmp',path);};
async function main(){
  if(existsSync(join(output,'run.json')))throw new Error('Refusing to overwrite a run');
  mkdirSync(output,{recursive:true});
  const scene=input==='avani'?structuredClone(demoScene):read(resolve(ROOT,input));
  const truthPath=arg('--truth','');
  const truth=truthPath?read(resolve(ROOT,truthPath)):{};
  const context=flatContext(scene,truth.flats?.find((flat:any)=>flat.id===id)??truth[id]??truth);
  const remote=await createCatalogHttpAdapter({url:'http://localhost:8765/editor/assets'}).list();
  const catalog=mergeCatalogs(localCatalog,remote),store=new EditorStore(scene,catalog),initial=validateScene(store.scene,catalog);
  if(!initial.ok)throw new Error(`Invalid initial scene: ${JSON.stringify(initial)}`);
  save('initial.json',{scene:store.scene,catalog});
  const run:any={id,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),started_at:new Date().toISOString(),scene_input:input,northDeg:0,catalogCurrency:'AMD',profile:{effort:'low',placement:'without-place',context:'compact-base'},...context,ground_truth:truth,rows:[]};
  save('run.json',run);let conversationId:string|undefined;
  for(const [kind,request] of requests){
    if(kind==='kids'&&!run.kids_required)continue;
    const runId=`${id}-${kind}-${Date.now()}`,body={scene:store.scene,revision:store.revision,catalog,catalogCurrency:'AMD',northDeg:0,request,conversationId,_evalRunId:runId};
    save(`${kind}-request.json`,body);const before=structuredClone(store.scene),start=performance.now();let reply:any,lines:any[]=[],accepted:boolean|null=null,result:any;
    console.log(JSON.stringify({flat:id,kind,stage:'start',revision:store.revision}));
    try{
      const response=await fetch(`${endpoint}/designer/propose`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(600000)});
      if(!response.body)throw new Error('HTTP response has no body');
      const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();let text='',lastProgress=0;
      for(;;){const {done,value}=await reader.read();if(done)break;text+=value;
        if(performance.now()-lastProgress>30000){console.log(JSON.stringify({flat:id,kind,stage:'http_progress',seconds:(performance.now()-start)/1000}));lastProgress=performance.now();}
      }
      writeFileSync(join(output,`${kind}-http.ndjson`),text);
      lines=text.split('\n').filter(Boolean).map(line=>JSON.parse(line));
      reply=lines.filter(v=>v.type!=='progress').at(-1)??{type:'error',message:'No final response'};
      if(reply.conversationId)conversationId=reply.conversationId;
      if(reply.type==='proposal'){result=store.execute(reply.proposal.command,true);accepted=result.ok;}
    }catch(error){reply={type:'error',message:String(error)};}
    const seconds=(performance.now()-start)/1000;
    const eventPath=join(events,`${runId}.events.jsonl`);
    let telemetry:any=null;
    if(existsSync(eventPath)){
      const raw=readFileSync(eventPath,'utf8');writeFileSync(join(output,`${kind}-sdk.events.jsonl`),raw);
      telemetry=raw.split('\n').filter(Boolean).map(v=>JSON.parse(v)).reverse().find(v=>v.kind==='turn_telemetry');
      if(telemetry?.conversation_id)conversationId=telemetry.conversation_id;
    }
    const usage=telemetry?.usage??null,tokens=usage?.totalTokens??(usage?.input_tokens!==undefined?usage.input_tokens+usage.output_tokens:null);
    let grading:any;try{grading=grade(kind,before,store.scene,catalog,reply,accepted,run.roles);}catch(error){grading={pass:false,request_match:false,reasons:['grader_error'],error:String(error),editor_accepted:accepted};}
    const actualProfile=telemetry?{model:telemetry.model,effort:telemetry.effort,...telemetry.profile}:null;
    if(actualProfile?.model!=='gpt-6-astra'||actualProfile?.effort!=='low'||actualProfile?.placement!=='without-place'||actualProfile?.context!=='compact-base'){grading.pass=false;grading.reasons.push('profile_unverified');}
    const row={kind,request,actual_profile:actualProfile,outcome:reply.type,seconds,tokens,usage,conversationId,description:reply.proposal?.description??reply.message??reply.question??'',reply,result,...grading};
    run.rows.push(row);save(`${kind}-after.json`,{scene:store.scene,catalog});save('final.json',{scene:store.scene,catalog});save('run.json',run);
    console.log(JSON.stringify({flat:id,kind,outcome:row.outcome,pass:row.pass,seconds:Math.round(seconds*1000)/1000,tokens,reasons:row.reasons}));
    if(telemetry?.usage_limited||/usage limit/i.test(reply.message??''))throw new Error('USAGE LIMIT: stop the batch');
    if(!conversationId)throw new Error('No real conversation ID; cannot continue this flat faithfully');
  }
  run.finished_at=new Date().toISOString();save('run.json',run);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
