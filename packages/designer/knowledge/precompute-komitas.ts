/** Offline per-flat recipes; publish only complete candidates accepted by BENCH and EditorStore. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {editorToDesigner,proposalToEditor} from '../src/editor-bridge.js';
import {prepareFastRequest,selectFastCandidate,sceneFingerprint,FAST_VERSION,SceneAnalysisCache} from '../src/fast-path.js';
import {grade,requests,flatContext,groundTruthForFlat} from '../eval/komitas-grade.js';
const root=new URL('./',import.meta.url),truth=JSON.parse(readFileSync(new URL('../eval/komitas/ground-truth.json',root),'utf8'));
const paths=['b20-t11','b21-t13','b25-t72','b28-t31','b30-t35','b31-t46'],rows:any[]=[];
mkdirSync(new URL('./layouts/',root),{recursive:true});
for(const flat of paths){
 const initial=JSON.parse(readFileSync(new URL(`../eval/fast-runs/matrix-after-restored/${flat}/initial.json`,root),'utf8'));
 const options={catalog:initial.catalog,catalogCurrency:'AMD' as const,northDeg:0,groupPolicy:'move-together' as const},scene=editorToDesigner(initial.scene,options),context=flatContext(initial.scene,groundTruthForFlat(truth,flat));
 for(const kind of ['living','bedroom','paint'] as const){
  const request=requests.find(r=>r[0]===kind)![1],started=performance.now(),prepared=prepareFastRequest(scene,request,initial.catalog,new SceneAnalysisCache(),{maxChecks:2});
  const record:any={flat,kind,request,seconds:(performance.now()-started)/1000,type:prepared.type,grades:[]};
  if(prepared.type==='candidates'){
   for(const candidate of prepared.candidates){
    const result=selectFastCandidate(scene,prepared,{slot_id:candidate.id,catalog_ids:candidate.catalog_ids},initial.catalog);
    if(!result.ok){record.grades.push({id:candidate.id,pass:false,errors:result.errors});continue;}
    try{const proposal=proposalToEditor(result.proposal,initial.scene,0,options),store=new EditorStore(initial.scene,initial.catalog),accepted=store.execute(proposal.command,true).ok;
    record.grades.push({id:candidate.id,...grade(kind,initial.scene,store.scene,initial.catalog,{type:'proposal',proposal},accepted,context.roles)});}catch(error){record.grades.push({id:candidate.id,pass:false,error:String(error)});}
   }
   if(record.grades.length&&record.grades.every((g:any)=>g.pass)){
    const key=createHash('sha256').update(JSON.stringify([FAST_VERSION,sceneFingerprint(scene,initial.catalog),request])).digest('hex');
    writeFileSync(new URL(`layouts/${key}.json`,root),JSON.stringify({key,prepared},null,2)+'\n');record.key=key;
   }
  }else record.reason=prepared.reason;
  rows.push(record);writeFileSync(new URL('precomputed-komitas.json',root),JSON.stringify({version:FAST_VERSION,basis:'offline, frozen accepted Komitas snapshots, unchanged BENCH grader and explicit EditorStore acceptance',rows},null,2)+'\n');console.log(JSON.stringify({flat,kind,seconds:record.seconds,type:record.type,published:!!record.key}));
 }
}
