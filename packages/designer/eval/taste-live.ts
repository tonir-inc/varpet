import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {tasteCases} from './taste-cases.js';
const arg=(k:string,d:string)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]!:d;
const output=resolve(arg('--output','eval/taste-runs/before')),endpoint=arg('--service','http://127.0.0.1:8804');
const catalogPayload=JSON.parse(readFileSync(arg('--catalog',new URL('./taste-runs/input-catalog.json',import.meta.url).pathname),'utf8'));
const remote=catalogPayload.assets??catalogPayload;
const catalog=[...localCatalog,...remote.filter((a:any)=>!localCatalog.some(b=>b.id===a.id))];
mkdirSync(output,{recursive:true});
const save=(id:string,data:unknown)=>writeFileSync(`${output}/${id}.json`,JSON.stringify(data,null,2));
async function run(row:typeof tasteCases[number]){
 const [id,initial,...requests]=row;if(existsSync(`${output}/${id}.json`))return;
 const scene=structuredClone(demoScene);if(initial==='empty')scene.objects=[];
 const store=new EditorStore(scene,catalog);let conversationId:string|undefined;
 const evidence:any={id,initial,requests,service_source:arg('--service-source','unverified'),runner_source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),started_at:execFileSync('date',['-u','+%Y-%m-%dT%H:%M:%SZ'],{encoding:'utf8'}).trim(),turns:[]};
 for(const [turn,request] of requests.entries()){
  const started=performance.now();const body={scene:store.scene,catalog,revision:store.revision,northDeg:0,catalogCurrency:'AMD',request,conversationId,_evalRunId:`taste-${id}-${turn}`};
  try {
  const response=await fetch(`${endpoint}/designer/propose`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(360000)});
  const raw=await response.text();writeFileSync(`${output}/${id}-${turn}.ndjson`,raw);
  const reply=raw.split('\n').filter(Boolean).map(s=>JSON.parse(s)).filter(r=>r.type!=='progress').at(-1);
  conversationId=reply?.conversationId;const accepted=reply?.type==='proposal'?store.execute(reply.proposal.command,true):null;
  evidence.turns.push({request,reply,accepted,seconds:(performance.now()-started)/1000});
  console.log(JSON.stringify({id,turn,outcome:reply?.type,accepted:accepted?.ok,seconds:evidence.turns.at(-1).seconds}));
  if(/usage limit/i.test(reply?.message??'')){evidence.scene=store.scene;evidence.catalog=catalog;save(id,evidence);throw new Error('USAGE LIMIT: stop batch');}
  }catch(error){
   if(String(error).includes('USAGE LIMIT'))throw error;
   evidence.turns.push({request,reply:{type:'error',message:String(error)},accepted:null,seconds:(performance.now()-started)/1000});
   break;
  }
 }
 evidence.scene=store.scene;evidence.catalog=catalog;save(id,evidence);
}
// Independent requests in code; each two-turn case keeps its own real conversation.
const selected=tasteCases.filter(row=>!arg('--ids','')||arg('--ids','').split(',').includes(row[0]));
for(let i=0;i<selected.length;i+=2)await Promise.all(selected.slice(i,i+2).map(run));
