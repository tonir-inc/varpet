import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import sourceScenarios from './scenarios.json';
import {applyOps,parseOps,parseScene} from '../src/adapter.js';
import {checkLayout,scoreLayout} from '../src/layout.js';
import {checkRequest,intentSchema,type Intent} from '../src/request.js';
import {DesignerSession} from '../src/session.js';
import type {Scene} from '../src/scene.js';

type Json=Record<string,any>;
export interface Assertion {type:'open_floor_improves'|'coffee_gap'|'daylight_proxy_improves'|'added_size';kind?:string;size?:number[];price?:number}
export interface Scenario {
  id:string;category:string;scene:string;prompt:string;expectedIntent:Intent;
  outcome:'layout'|'decline'|'impossible';assertions:Assertion[];assumptions:string[];
  injection?:{item_id:string;text:string};
}
export const scenarios=sourceScenarios as Scenario[];
export const EVAL_DIR=dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT=resolve(EVAL_DIR,'..'),REPO_ROOT=resolve(PACKAGE_ROOT,'../..');
export interface RunRecord {scenario_id:string;transcript:string|null;error?:string;status?:string;seconds?:number}
export interface Grade {
  scenario_id:string;category:string;outcome:string;errors:string[];assumptions:string[];
  tiers:{hard:string;trajectory:string;preferences:string;human:string;engine:string};
  request:{ok:boolean|null;errors:unknown[]};metrics:ReturnType<typeof scoreLayout>|null;
  model:string|null;recorded_at:string|null;
  rounds:number|null;seconds:number|null;tokens:Record<string,number>|null;transcript:string|null;
}
const object=(value:unknown):Json=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Json:{};
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Json)[key])).join(',')+'}';
  return JSON.stringify(value)??'undefined';
}
export function loadScenarioScene(scenario:Scenario):Scene {
  const path=resolve(PACKAGE_ROOT,scenario.scene.includes('/')?scenario.scene:'test/fixtures/'+scenario.scene);
  if(!path.startsWith(resolve(PACKAGE_ROOT,'test/fixtures')+'/'))throw new Error('Scenario scene must use a designer fixture');
  const scene=parseScene(JSON.parse(readFileSync(path,'utf8')));
  if(scenario.injection){
    const item=scene.items.find(item=>item.id===scenario.injection!.item_id);
    if(!item)throw new Error(`Unknown injection item ${scenario.injection.item_id}`);
    item.name=scenario.injection.text;
  }
  return scene;
}
function fresh(scenario:Scenario,transcript:string|null):Grade {
  return {scenario_id:scenario.id,category:scenario.category,outcome:'not_run',errors:[],assumptions:scenario.assumptions,
    tiers:{hard:'not_evaluated',trajectory:'not_evaluated',preferences:'not_evaluated',human:'not_evaluated',engine:'unavailable'},
    request:{ok:null,errors:[]},metrics:null,model:null,recorded_at:null,rounds:null,seconds:null,tokens:null,transcript};
}
function measuredAssertions(scenario:Scenario,before:Scene,after:Scene,metrics:ReturnType<typeof scoreLayout>):string[] {
  const errors:string[]=[];
  for(const assertion of scenario.assertions){
    if(assertion.type==='open_floor_improves'){
      const area=(side:typeof metrics.before)=>side.space.rooms.filter(room=>room.room_id===scenario.expectedIntent.room_id)
        .reduce((sum,room)=>sum+(room.largest_free_rectangle?.area_m2??0),0);
      if(area(metrics.after)<=area(metrics.before)+1e-7)errors.push('Largest usable free rectangle did not improve');
    }else if(assertion.type==='daylight_proxy_improves'){
      if(metrics.after.daylight_for_work.score<=metrics.before.daylight_for_work.score+1e-7)errors.push('Desk daylight geometry proxy did not improve');
    }else if(assertion.type==='coffee_gap'){
      const gap=metrics.after.function_clearances.find(value=>value.function==='sofa_coffee'&&value.item_id==='sofa'&&value.other_item_id==='coffee_table');
      if(!gap||gap.clearance_m<.36-1e-7||gap.clearance_m>.46+1e-7)errors.push('Sofa-to-coffee-table gap is not within 0.36–0.46 m');
    }else if(assertion.type==='added_size'){
      const additions=after.items.filter(item=>!before.items.some(original=>original.id===item.id)&&item.kind===assertion.kind);
      if(additions.length!==1||canonical(additions[0]!.size)!==canonical(assertion.size)||additions[0]!.price!==assertion.price)
        errors.push(`Added ${assertion.kind} must match the scenario's explicit dimensions and price`);
    }else errors.push(`Unknown scenario assertion ${(assertion as Assertion).type}`);
  }
  return errors;
}

/** Cached traces are evidence, never an oracle: ignore model-written checks, scores and intent. */
export function gradeScenario(scenario:Scenario,jsonl:string|null,transcript:string|null=null,runError?:string,runStatus?:string):Grade {
  const row=fresh(scenario,transcript);
  if(runError)row.errors.push(runError);
  if(jsonl===null){if(runStatus&&runStatus!=='not_run')row.outcome='incomplete';return row;}
  try{
    const records=jsonl.split(/\r?\n/).filter(line=>line.trim()).map(line=>object(JSON.parse(line)));
    if(!records.length)throw new Error('Empty transcript');
    const scene=loadScenarioScene(scenario),start=records.find(record=>record.kind==='conversation');
    if(!start||canonical(parseScene(start.scene))!==canonical(scene))throw new Error('Initial transcript scene does not match scenario source and injection');
    row.model=typeof start.model==='string'?start.model:null;
    row.recorded_at=typeof start.timestamp==='string'?start.timestamp:null;
    const user=records.find(record=>record.kind==='user');
    if(!user||user.text!==scenario.prompt)throw new Error('Initial user prompt does not match this scenario');
    const events=records.filter(record=>record.kind==='sdk').map(record=>object(record.event));
    const summaries=records.filter(record=>record.kind==='turn_summary');
    const last=summaries.at(-1);
    const durations=summaries.map(summary=>summary.seconds).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0);
    row.seconds=durations.length?durations.reduce((sum,value)=>sum+value,0):null;
    row.tokens={};
    let hasTokens=false;
    for(const summary of summaries)for(const [key,value] of Object.entries(object(summary.usage)))if(typeof value==='number'&&Number.isFinite(value)&&value>=0){row.tokens[key]=(row.tokens[key]??0)+value;hasTokens=true;}
    if(!hasTokens){
      const observed=object(events.filter(event=>event.method==='thread/tokenUsage/updated').at(-1)?.payload).tokenUsage?.total;
      const entries=Object.entries(object(observed)).filter((entry):entry is [string,number]=>typeof entry[1]==='number'&&Number.isFinite(entry[1])&&entry[1]>=0);
      row.tokens=entries.length?Object.fromEntries(entries):null;
    }
    // Model inference rounds are derived from distinct cumulative-token notifications.
    const rounds=new Set(events.filter(event=>event.method==='thread/tokenUsage/updated').map(event=>canonical(object(event.payload).tokenUsage?.total)));
    row.rounds=rounds.size||null;
    const sdkFailed=events.some(event=>event.method==='turn/completed'&&object(object(event.payload).turn).status!=='completed');
    const usageLimited=records.some(record=>record.kind==='stderr'&&typeof record.text==='string'&&/usage limit/i.test(record.text));
    if(runError||(runStatus&&runStatus!=='completed')||!last||last.status!=='completed'||summaries.some(summary=>summary.status!=='completed')||sdkFailed||usageLimited){
      row.outcome='incomplete';row.errors.push('Run did not complete successfully; any intermediate accepted proposal is not a fulfilled run');return row;
    }
    const completed=events.filter(event=>event.method==='item/completed').map(event=>object(object(event.payload).item));
    const calls=completed.filter(item=>item.type==='mcpToolCall'&&item.server==='varpet-designer'&&item.tool==='propose'&&item.status==='completed');
    const accepted:{item:Json;result:Json}[]=[];
    for(const item of calls){
      const result=object(item.result);
      if(item.error||result.isError)continue;
      const blocks=Array.isArray(result.content)?result.content:[];
      for(const block of blocks){
        if(block.type!=='text'||typeof block.text!=='string')continue;
        let data:Json;
        try{data=object(JSON.parse(block.text));}catch{throw new Error('Malformed propose tool result');}
        if(data.ok===true&&typeof data.proposal_id==='string')accepted.push({item,result:data});
      }
    }
    const finalText=completed.filter(item=>item.type==='agentMessage'&&item.phase==='final_answer').at(-1)?.text;
    if(!accepted.length){
      row.outcome='unresolved';
      if(scenario.outcome==='decline'&&typeof finalText==='string'&&/paint|colou?r/i.test(finalText)&&/furniture|layout|rearrang/i.test(finalText)&&/can.?t|cannot|only|outside.*scope|out of scope|do not|don.t|rather than|focus on|speciali[sz]e in|\bnot (?:paint|colou?r)/i.test(finalText))row.outcome='expected_decline';
      else if(scenario.outcome==='impossible')row.errors.push('No accepted layout; impossibility response remains unresolved pending human confirmation');
      else row.errors.push('No accepted completed varpet-designer propose tool result');
      return row;
    }
    if(scenario.outcome==='decline'){row.outcome='failed';row.errors.push('An out-of-scope request produced a layout proposal');return row;}
    const selected=accepted.at(-1)!,args=object(selected.item.arguments),payload=object(selected.result.proposal);
    if(payload.id!==selected.result.proposal_id)row.errors.push('Recorded proposal ID does not match the accepted result');
    if(object(payload.checks).ok!==true)row.errors.push('Recorded proposal physical checks did not pass');
    if(object(payload.request_check).ok!==true)row.errors.push('Recorded proposal request check did not pass');
    if(payload.requires_user_acceptance!==true||payload.application_status!=='not_applied')row.errors.push('Recorded proposal does not preserve required user acceptance before application');
    const ops=parseOps(args.ops);
    if(canonical(payload.ops)!==canonical(ops))throw new Error('Accepted proposal ops disagree with tool arguments');
    if(!ops.length){row.outcome='failed';row.errors.push('No-op proposal cannot fulfil a layout request');return row;}
    const layout=checkLayout(scene,ops),intent=intentSchema.parse(scenario.expectedIntent);
    let after:Scene;
    try{after=applyOps(scene,ops);}catch(error){
      row.outcome='failed';row.tiers.hard='failed';row.request={ok:false,errors:layout.errors};
      row.errors.push(...layout.errors.map(error=>error.message));
      if(!row.errors.length)row.errors.push(String(error));
      return row;
    }
    const request=checkRequest(scene,after,ops,intent,layout.price.cost_dram);
    row.request=request;row.tiers.preferences=request.errors.some(error=>error.check==='preference')?'failed':'passed';
    row.tiers.hard=layout.ok?'passed':'failed';
    row.errors.push(...layout.errors.filter(error=>error.severity==='hard').map(error=>error.message),...request.errors.map(error=>error.message));
    if(canonical(scene)===canonical(after))row.errors.push('Operations made no actual scene change');
    row.metrics=scoreLayout(scene,ops);
    const assertionErrors=measuredAssertions(scenario,scene,after,row.metrics);
    row.errors.push(...assertionErrors);
    if(assertionErrors.length)row.tiers.preferences='failed';
    const session=new DesignerSession(scene);session.setIntent(intent);
    const replay=session.propose(ops,'Evaluation replay against the scenario request.');
    if(!replay.ok&&!row.errors.length)row.errors.push(...replay.errors.map(error=>error.message));
    row.outcome=layout.ok&&request.ok&&replay.ok&&row.errors.length===0?'passed':'failed';
    return row;
  }catch(error){row.outcome='invalid';row.errors.push(error instanceof Error?error.message:String(error));return row;}
}

export function gradeManifest(manifestPath=resolve(EVAL_DIR,'runs/manifest.json')):Grade[]{
  let runs:RunRecord[]=[];
  try{
    if(existsSync(manifestPath)){
      const raw=JSON.parse(readFileSync(manifestPath,'utf8'));
      runs=Array.isArray(raw)?raw:raw.runs;
      if(!Array.isArray(runs))throw new Error('Manifest must contain a runs array');
    }
  }catch(error){return scenarios.map(scenario=>({...fresh(scenario,null),outcome:'invalid',errors:[`Manifest: ${String(error)}`]}));}
  return scenarios.map(scenario=>{
    const matches=runs.filter(run=>run&&run.scenario_id===scenario.id);
    if(matches.length>1)return {...fresh(scenario,null),outcome:'invalid',errors:['Duplicate scenario records in manifest']};
    const run=matches[0];
    if(!run)return gradeScenario(scenario,null);
    const path=run.transcript?isAbsolute(run.transcript)?run.transcript:resolve(REPO_ROOT,run.transcript):null;
    try{
      const row=gradeScenario(scenario,path?readFileSync(path,'utf8'):null,path,run.error,run.status);
      if(typeof run.seconds==='number'&&Number.isFinite(run.seconds)&&run.seconds>=0)row.seconds=run.seconds;
      return row;
    }
    catch(error){return {...fresh(scenario,path),outcome:'invalid',errors:[`Transcript read: ${String(error)}`]};}
  });
}
const cell=(value:unknown)=>String(value??'—').replaceAll('|','\\|').replaceAll('\n',' ');
function metricSummary(row:Grade):string{
  if(!row.metrics)return '—';
  const {before,after,cost_dram}=row.metrics;
  const rectangle=(side:typeof before)=>side.space.rooms.reduce((sum,room)=>sum+(room.largest_free_rectangle?.area_m2??0),0).toFixed(2);
  return `free ${before.space.free_area_m2}→${after.space.free_area_m2} m²; rectangle ${rectangle(before)}→${rectangle(after)} m²; daylight proxy ${before.daylight_for_work.score}→${after.daylight_for_work.score}; ${cost_dram} AMD`;
}
export function renderReport(rows:Grade[]):string{
  const models=[...new Set(rows.flatMap(row=>row.model?[row.model]:[]))];
  const dates=[...new Set(rows.flatMap(row=>row.recorded_at?[row.recorded_at.slice(0,10)]:[]))];
  const lines=['# Designer scenario report','','Assumed: existing living-room and bedroom fixtures are surrogates; the actual demo flat is unavailable. Item dimensions and zero prices in the two addition requests are explicit user-owned scenario assumptions.',
    '',`Measured run metadata: models ${models.join(', ')||'unknown'}; UTC dates ${dates.join(', ')||'unknown'}.`,
    '', 'Measured by deterministic replay: temporary-scene hard checks, the scenario request, geometric preferences, and before/after metrics. Engine validation is unavailable. Motion trajectories and human pairwise judgments are not evaluated. A passed row means the requested static layout passed these local checks, not those unavailable tiers.',
    '', 'Measured: wall seconds and SDK token totals. Derived: inference rounds counted from distinct cumulative-token notifications. Missing evidence stays unknown. Refusals do not fulfil layout requests; impossible requests remain unresolved without human confirmation.',
    '', '| Scenario | Outcome | Hard / request / preferences | Metrics before → after | Rounds | Seconds | Tokens | Transcript |', '|---|---|---|---|---:|---:|---:|---|'];
  for(const row of rows){
    const link=row.transcript?`[JSONL](${relative(EVAL_DIR,row.transcript).split('/').map(encodeURIComponent).join('/')})`:'—';
    lines.push(`| ${cell(row.scenario_id)} | ${cell(row.outcome)} | ${row.tiers.hard} / ${row.request.ok===null?'not evaluated':row.request.ok?'passed':'failed'} / ${row.tiers.preferences} | ${cell(metricSummary(row))} | ${cell(row.rounds)} | ${row.seconds===null?'—':row.seconds.toFixed(2)} | ${cell(row.tokens?.totalTokens)} | ${link} |`);
  }
  lines.push('','All rows: engine = unavailable; trajectory = not evaluated; human = not evaluated. Full token breakdowns, metrics, assumptions and errors are in results.json.','');
  for(const row of rows)if(row.errors.length)lines.push(`- ${row.scenario_id}: ${row.errors.map(cell).join('; ')}`);
  return lines.join('\n')+'\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const rows=gradeManifest(process.argv[2]?resolve(process.argv[2]):undefined);
  writeFileSync(resolve(EVAL_DIR,'report.md'),renderReport(rows));
  const portable=rows.map(row=>({...row,transcript:row.transcript?relative(REPO_ROOT,row.transcript):null}));
  writeFileSync(resolve(EVAL_DIR,'results.json'),JSON.stringify({fixture_scope:'assumed surrogate fixtures; actual demo absent',rows:portable},null,2)+'\n');
  console.log(`Graded ${rows.length} scenarios: ${rows.filter(row=>row.outcome==='passed').length} layouts passed; ${rows.filter(row=>row.outcome==='not_run').length} not run. Wrote eval/report.md and eval/results.json.`);
}
