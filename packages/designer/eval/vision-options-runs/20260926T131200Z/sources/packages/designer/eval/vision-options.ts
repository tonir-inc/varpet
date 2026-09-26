/** Counterbalanced paired options, three repetitions, real SDK + MCP + editor, four conversations at once. */
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {validateScene} from '../../../apps/editor/src/core/validation.js';
const root=process.cwd(),base='/tmp/designer-vision-eval',arg=(key:string,fallback:string)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]!:fallback;
const output=resolve(arg('--output','packages/designer/eval/vision-options-runs/'+new Date().toISOString().replace(/[:.]/g,'-')));mkdirSync(output,{recursive:true});
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),save=(p:string,v:unknown)=>writeFileSync(join(output,p),JSON.stringify(v,null,2)+'\n');
const remote=read(base+'/catalog-response.json'),catalog=[...localCatalog,...remote.filter((a:any)=>!localCatalog.some(b=>b.id===a.id))];save('catalog.json',catalog);
const scenarios=[
 {id:'ashot',flat:'avani',turns:['Remake the living room in minimalistic style but cozy.','The accent chairs look odd and are lined up against a wall. Replace them with visually simple, compatible seating and arrange a useful cozy conversation area. You may replace the living-room furniture; keep the other rooms unchanged.'],expect:'proposal'},
 {id:'floor',flat:'avani',turns:['Does the sofa colour go with the floor? Explain the visible palette and one optional small improvement. Do not change anything.'],expect:'answer'},
 {id:'corner',flat:'avani',turns:['Make THIS corner cozier with the furniture I own: turn the lounge chair toward the sofa to create a conversation corner, keeping the rug and sofa. No purchases.'],expect:'proposal'},
 {id:'accent',flat:'avani',turns:['Replace only the terracotta lounge chair with one visually simple, comfortable reading armchair in neutral fabric that suits the sage sofa and warm floor. Avoid bulky ornate shapes. Keep its useful seating relationship and everything else unchanged. Show a purchase preview; budget is unconfirmed.'],expect:'proposal'},
 {id:'bedroom',flat:'b20-t11',turns:['Furnish the bedroom in a calm, cozy Scandinavian style. Include the sleeping and bedside essentials, visually light wood and neutral upholstery. Show a coherent purchase preview; budget is unconfirmed.'],expect:'proposal'},
 {id:'reading',flat:'b28-t31',turns:['Make the living room a cozy place to read with one comfortable, visually simple armchair and a book shelf. Keep the rest of the apartment empty. Use the developer’s drawn furniture as a starting idea if the plan is available; show a purchase preview with budget unconfirmed.'],expect:'proposal'},
];
const arms=['text','view','products','selfcheck','plan'];
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sources=['harness/designer.py','harness/designer_service.py','harness/designer_vision.py','harness/designer_vision_render.py','packages/designer/src/server.ts','packages/designer/src/catalog-vision.ts','packages/designer/eval/vision-options.ts','packages/designer/eval/vision-options-service.py'];
const manifest={started_at:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scenarios,arms,repetitions:3,concurrency:4,model:'gpt-6-astra',effort:'low',profile:{placement:'without-place',context:'compact-base'},assumptions:'Ashot first-turn wording is supplied; second turn is a reconstructed correction from his reported failure, not an exact recovered transcript. JSON/source geometry, catalog and prompts stay paired. Plan bytes are local external inputs, never committed.',rubric:'Independent EditorStore/validateScene acceptance and request-specific operation checks; style/appearance is separately blind-reviewed from rendered results and answer text. Declines, clarification, render failure and timeouts do not pass actionable requests. No same-model critic is used as the evaluation grader.',source_hashes:Object.fromEntries(sources.map(p=>[p,hash(p)]))};save('manifest.json',manifest);
const child=spawn('uv',['run','--no-project','--with','openai-codex==0.157.1','--with','playwright','python','-u','packages/designer/eval/vision-options-service.py','--output',output],{cwd:root,env:{...process.env,VARPET_CATALOG_URL:'http://localhost:8765/mcp'},stdio:['ignore','pipe','pipe'],detached:true});
let limited=false,lastOutput=Date.now(),stderr='';const controllers=new Set<AbortController>();
const stop=()=>{for(const c of controllers)c.abort();try{process.kill(-child.pid!,'SIGTERM');}catch{}};
const watchdog=setInterval(()=>{if(Date.now()-lastOutput>240_000){appendFileSync(join(output,'batch.log'),'Service silent for 240s; killed process group\n');stop();}},5000);
child.stderr.on('data',chunk=>{lastOutput=Date.now();appendFileSync(join(output,'service.stderr.log'),chunk);stderr=(stderr+chunk).slice(-8000);if(/usage limit|EVAL_USAGE_LIMIT/i.test(stderr)){limited=true;stop();}});
const ready=await new Promise<any>((resolve,reject)=>{let data='';child.on('error',reject);child.on('exit',code=>reject(new Error('Service exited '+code+': '+stderr)));child.stdout.on('data',chunk=>{lastOutput=Date.now();appendFileSync(join(output,'service.stdout.log'),chunk);data+=chunk;if(data.includes('\n')){try{resolve(JSON.parse(data.split('\n')[0]!));}catch{}}if(/EVAL_USAGE_LIMIT/.test(String(chunk))){limited=true;stop();}});});
function trace(id:string){
 const path=join(output,id+'.events.jsonl');if(!existsSync(path))return {tokens:null,visual:null,tools:[],model_seconds:null};
 const records=readFileSync(path,'utf8').split('\n').filter(Boolean).map(v=>JSON.parse(v));
 const events=records.filter((v:any)=>v.kind==='process_output'&&v.channel==='stdout').map((v:any)=>v.chunk).join('').split('\n').filter(Boolean).flatMap((s:string)=>{try{return [JSON.parse(s)];}catch{return [];}});
 const usage=events.filter((v:any)=>v.kind==='worker_summary').at(-1)?.total_usage;
 const visual=records.find((v:any)=>v.kind==='visual_confirmation');
 return {tokens:usage?.totalTokens??null,visual,tools:events.filter((e:any)=>e.method==='item/completed'&&e.payload?.item?.type==='mcpToolCall').map((e:any)=>({name:e.payload.item.tool,status:e.payload.item.status,arguments:e.payload.item.arguments})),model_seconds:records.filter((r:any)=>r.kind==='process_end'&&r.stage==='worker').reduce((n:number,r:any)=>n+r.seconds,0)};
}
async function render(input:any,directory:string){
 mkdirSync(directory,{recursive:true});const path=join(directory,'input.json');writeFileSync(path,JSON.stringify(input));
 await new Promise<void>((resolve,reject)=>{const p=spawn('uv',['run','--no-project','--with','playwright','python','harness/designer_vision_render.py','--input',path,'--output',directory],{stdio:['ignore','pipe','pipe'],detached:true});let log='';p.stdout.on('data',b=>{log+=b;});p.stderr.on('data',b=>{log+=b;});const timer=setTimeout(()=>{try{process.kill(-p.pid!,'SIGTERM');}catch{}},45000);p.on('exit',code=>{clearTimeout(timer);writeFileSync(join(directory,'render.log'),log);code===0?resolve():reject(new Error('Render failed: '+log.slice(-500)));});});
}
const jobs:any[]=[];for(let rep=1;rep<=3;rep++)for(const scenario of scenarios)for(const arm of [...arms.slice(rep-1),...arms.slice(0,rep-1)])jobs.push({rep,scenario,arm});
if(arg('--smoke','0')==='1')jobs.splice(0,jobs.length,{rep:0,scenario:scenarios[2],arm:'view'},{rep:0,scenario:scenarios[3],arm:'products'},{rep:0,scenario:scenarios[2],arm:'selfcheck'});
const rows:any[]=[];let next=0;
async function worker(){while(next<jobs.length&&!limited){const {rep,scenario,arm}=jobs[next++];const initial=scenario.flat==='avani'?structuredClone(demoScene):read(`packages/designer/eval/komitas/${scenario.flat}.scene.json`),store=new EditorStore(initial,catalog);let conversationId:string|undefined,lastTokens:number|null=0;
 for(let turn=0;turn<scenario.turns.length&&!limited;turn++){
  const id=`${scenario.id}-${arm}-${rep}-${turn+1}`,request=scenario.turns[turn],before=structuredClone(store.scene),revision=store.revision,vision:any={};
  try{
   if(arm==='view'){
    let dir=base+'/'+scenario.flat+'-images';if(turn>0){dir=join(output,id+'-before-view');await render({scene:before,catalog},dir);}
    vision.view={dataUrl:'data:image/png;base64,'+readFileSync(dir+'/perspective.png').toString('base64'),sceneId:before.id,revision,...(scenario.id==='corner'?{selectedIds:['lounge-chair']}:{})};
   }
   if(arm==='plan'){const path=scenario.flat==='avani'?base+'/avani-images/top.png':`${process.env.HOME}/AshProjects/tonir/apartment/komitas-park/data/plans/${scenario.flat}.png`;vision.plan={dataUrl:'data:image/png;base64,'+readFileSync(path).toString('base64')};}
   if(arm==='products')vision.products=true;if(arm==='selfcheck')vision.selfCheck=true;
   save(id+'-before.json',{scene:before});
   const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),360000),start=performance.now();let reply:any,raw='';
   console.log(JSON.stringify({id,stage:'start'}));
   try{const response=await fetch(`http://127.0.0.1:${ready.port}/designer/propose`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scene:before,revision,catalog,catalogCurrency:'AMD',northDeg:0,request,conversationId,_evalRunId:id,...(arm==='text'?{}:{vision})}),signal:controller.signal});raw=await response.text();reply=raw.split('\n').filter(Boolean).map(s=>JSON.parse(s)).filter(v=>v.type!=='progress').at(-1)??{type:'error',message:'No final response'};}catch(error){reply={type:'error',message:String(error)};}finally{clearTimeout(timer);controllers.delete(controller);}
   const seconds=(performance.now()-start)/1000;if(reply.conversationId)conversationId=reply.conversationId;
   writeFileSync(join(output,id+'.http.ndjson'),raw);let accepted:null|boolean=null,validation:any=null,result:any=null;
   if(reply.type==='proposal'){result=store.execute(reply.proposal.command,true);validation=validateScene(store.scene,catalog);accepted=result.ok&&validation.ok;}
   const telemetry=trace(id),cumulative=telemetry.tokens;telemetry.tokens=cumulative===null||lastTokens===null?null:cumulative-lastTokens;lastTokens=cumulative;const ops=reply.proposal?.command.operations??[],scopeOk=ops.every((op:any)=>op.type!=='replace-scene'&&op.type!=='replace-structure');
   const row={id,scenario:scenario.id,flat:scenario.flat,arm,rep,turn:turn+1,request,seconds,...telemetry,total_tokens:telemetry.tokens===null||telemetry.visual?.tokens===null?null:telemetry.tokens+(telemetry.visual?.tokens??0),outcome:reply.type,editor_accepted:accepted,scope_ok:scopeOk,technical_pass:scenario.expect==='answer'?reply.type==='decline'&&ops.length===0:accepted===true&&scopeOk,visual_pass:null,reply,result,validation,conversationId};rows.push(row);save(id+'.json',row);save(id+'-after.json',{scene:store.scene});save('rows.json',rows);
   console.log(JSON.stringify({id,outcome:row.outcome,accepted,seconds:Math.round(seconds),tokens:row.total_tokens}));
   if(/usage limit/i.test(reply.message??'')){limited=true;stop();}if(!conversationId)break;
  }catch(error){rows.push({id,scenario:scenario.id,arm,rep,turn:turn+1,outcome:'setup_error',technical_pass:false,visual_pass:null,error:String(error)});save('rows.json',rows);console.log(JSON.stringify({id,error:String(error)}));break;}
 }
}}
try{await Promise.all(Array.from({length:4},()=>worker()));save('completed.json',{finished_at:new Date().toISOString(),limited,planned_turns:jobs.reduce((n,j)=>n+j.scenario.turns.length,0),rows:rows.length});}finally{clearInterval(watchdog);stop();}
