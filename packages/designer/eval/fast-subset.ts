/** Extra paired class repetitions and zero-model service check; BENCH owns the grader. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {localCatalog} from '../../../apps/editor/src/core/demo.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {createCatalogHttpAdapter,mergeCatalogs} from '../../../apps/editor/src/adapters/catalog-http.js';
import {requests,grade,flatContext,groundTruthForFlat} from './komitas-grade.js';
const option=(name:string,fallback:string)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]!:fallback;
const arm=option('--arm','after'),endpoint=option('--service','http://127.0.0.1:8800'),flats=option('--flats','b25-t72').split(','),kinds=option('--kinds','kids').split(','),repetitions=Number(option('--repetitions','3'));
const out=new URL(`./fast-runs/${option('--output','subset-'+arm)}/`,import.meta.url);mkdirSync(out,{recursive:true});
const remote=await createCatalogHttpAdapter({url:'http://localhost:8765/editor/assets'}).list(),catalog=mergeCatalogs(localCatalog,remote);
const truth=JSON.parse(readFileSync(new URL('./komitas/ground-truth.json',import.meta.url),'utf8')),rows:any[]=[];
for(const flat of flats)for(const kind of kinds)for(let repetition=1;repetition<=repetitions;repetition++){
 const initialScene=process.argv.includes('--replay-before')?null:JSON.parse(readFileSync(new URL(`./komitas/${flat}.scene.json`,import.meta.url),'utf8'));
 let input:any={scene:initialScene,catalog,revision:0,catalogCurrency:'AMD',northDeg:0,request:requests.find(r=>r[0]===kind)![1]},source:string|undefined;
 if(process.argv.includes('--replay-before')){
  const report=JSON.parse(readFileSync(new URL('./fast-runs/promotion-report.json',import.meta.url),'utf8'));
  const row=report.rows.find((r:any)=>r.arm==='before'&&r.case===`${flat}-${kind}`);
  source=resolve(dirname(row.evidence),`${kind}-request.json`);input=JSON.parse(readFileSync(source,'utf8'));
  delete input.conversationId;delete input._evalRunId;input.revision=0;
 }
 const scene=input.scene,activeCatalog=input.catalog,store=new EditorStore(scene,activeCatalog),request=input.request;
 input._evalRunId=`${arm}-${flat}-${kind}-${repetition}-${Date.now()}`;
 writeFileSync(new URL(`${flat}-${kind}-${repetition}-request.json`,out),JSON.stringify(input,null,2)+'\n');
 const started=performance.now();let reply:any,accepted:boolean|null=null;
 try{
  const response=await fetch(endpoint+'/designer/propose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(300000)});
  const text=await response.text();writeFileSync(new URL(`${flat}-${kind}-${repetition}.ndjson`,out),text);
  reply=text.trim().split('\n').map(s=>JSON.parse(s)).filter(v=>v.type!=='progress').at(-1);
  if(reply?.type==='proposal')accepted=store.execute(reply.proposal.command,true).ok;
 }catch(error){reply={type:'error',message:String(error)};}
 const seconds=(performance.now()-started)/1000,context=flatContext(scene,groundTruthForFlat(truth,flat)),graded=grade(kind,scene,store.scene,activeCatalog,reply,accepted,context.roles);
 rows.push({arm,flat,kind,repetition,request,source,input_sha256:createHash('sha256').update(JSON.stringify({scene,catalog:activeCatalog})).digest('hex'),seconds,reply,editor_accepted:accepted,...graded});
 writeFileSync(new URL('run.json',out),JSON.stringify({model:'gpt-6-astra',effort:'low',cohort:'isolated class repetitions; fresh scene each turn',rows},null,2)+'\n');console.log(JSON.stringify({arm,flat,kind,repetition,seconds,pass:graded.pass}));
}
