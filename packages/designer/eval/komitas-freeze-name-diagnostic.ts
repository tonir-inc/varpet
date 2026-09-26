/** Read-only counterfactual: isolate the saved 122-character desk name failures. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {proposalToEditor} from '../src/editor-bridge.js';
const root='packages/designer/eval',results:any[]=[];
for(const name of readdirSync(join(root,'komitas-runs')).filter(n=>/-freeze-(on|off)$/.test(n))){
 const dir=join(root,'komitas-runs',name),run=JSON.parse(readFileSync(join(dir,'run.json'),'utf8'));
 for(const row of run.rows.filter((r:any)=>r.outcome==='error')){
  const body=JSON.parse(readFileSync(join(dir,`${row.kind}-request.json`),'utf8'));
  const events=readFileSync(join(dir,`${row.kind}-sdk.events.jsonl`),'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s));
  const saved=events.filter(e=>e.kind==='saved_proposal').at(-1).proposal;
  const options={catalog:body.catalog,catalogCurrency:'AMD' as const,northDeg:0,groupPolicy:'move-together' as const};
  const check=(proposal:any)=>{try{proposalToEditor(proposal,body.scene,body.revision,options);return{ok:true};}catch(error){return{ok:false,error:String(error)};}};
  const copy=structuredClone(saved),candidate=copy.proposal??copy;
  const names=candidate.ops.filter((op:any)=>op.type==='add').map((op:any)=>({id:op.item.id,characters:op.item.name.length}));
  for(const op of candidate.ops)if(op.type==='add')op.item.name=op.item.name.slice(0,120);
  results.push({run:name,request:row.kind,names,original:check(saved),only_display_name_bounded:check(copy)});
 }
}
writeFileSync(join(root,'komitas-freeze-name-diagnostic.json'),JSON.stringify({measurement:'offline counterfactual; no source artifacts, grades or product code changed',results},null,2)+'\n');
console.log(JSON.stringify(results));
