/** Recheck saved conversation state and independent grades without another model call. */
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {grade} from './komitas-grade.js';
const directory=resolve(process.argv[2]!);
const read=(name:string)=>JSON.parse(readFileSync(join(directory,name),'utf8'));
const run=read('run.json'),initial=read('initial.json'),store=new EditorStore(initial.scene,initial.catalog);
let cid:string|undefined;
for(const row of run.rows){
  const body=read(`${row.kind}-request.json`);assert.deepEqual(body.scene,store.scene);assert.equal(body.revision,store.revision);
  if(cid)assert.equal(body.conversationId,cid);
  const before=structuredClone(store.scene);let accepted:boolean|null=null;
  if(row.reply.type==='proposal')accepted=store.execute(row.reply.proposal.command,true).ok;
  assert.deepEqual(store.scene,read(`${row.kind}-after.json`).scene);
  Object.assign(row,grade(row.kind,before,store.scene,initial.catalog,row.reply,accepted,run.roles));
  const events=readFileSync(join(directory,`${row.kind}-sdk.events.jsonl`),'utf8').split('\n').filter(Boolean).map(v=>JSON.parse(v));
  const telemetry=events.reverse().find(v=>v.kind==='turn_telemetry');
  row.actual_profile=telemetry?{model:telemetry.model,effort:telemetry.effort,...telemetry.profile}:null;
  if(row.actual_profile?.model!=='gpt-6-astra'||row.actual_profile?.effort!=='low'||row.actual_profile?.placement!=='without-place'||row.actual_profile?.context!=='compact-base'){row.pass=false;row.reasons.push('profile_unverified');}
  cid=row.conversationId;
  console.log(`${row.kind}: ${row.pass?'PASS':'FAIL'}; revision ${store.revision}; ${row.reasons.join(', ')}`);
}
if(process.argv.includes('--write'))writeFileSync(join(directory,'run.json'),JSON.stringify(run,null,2)+'\n');
console.log(`Replay verified ${run.rows.length} sequential turns and their editor snapshots`);
