/** Replay real captured shells: designer consumers + placement + editor approval, no model stubs. */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { localCatalog } from '../../../apps/editor/src/core/demo.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { editorToDesigner, proposalToEditor } from '../src/editor-bridge.js';
import { sceneSummary } from '../src/adapter.js';
import { sun } from '../src/metrics/sun.js';
import { spaceMetrics } from '../src/metrics/space.js';
import { place } from '../src/place.js';
import { DesignerSession } from '../src/session.js';
const root=resolve('packages/designer/eval/komitas');
const ids=process.argv.slice(2);if(!ids.length)ids.push('b20-t11','b25-t72','b31-t46','b21-t13','b28-t31','b30-t35');
for(const id of ids) {
 const start=performance.now();
 rmSync(resolve(root,id+'.scene.json'),{force:true});
 try {
  const editor=JSON.parse(readFileSync(resolve(root,id+'.rejected.json'),'utf8'));
  const options={catalog:localCatalog,catalogCurrency:'AMD' as const,northDeg:0,geometryPolicy:'reconcile' as const};
  const gate=validateScene(editor,localCatalog);if(!gate.ok)throw new Error(gate.errors.join('; '));
  const scene=editorToDesigner(editor,options);sceneSummary(scene);
  const sunlight=sun(scene),access=spaceMetrics(scene);
  const chair=localCatalog.find(a=>a.kind==='chair')!;
  let proof:unknown;
  const attempts:unknown[]=[];
  for(const room of [...scene.rooms].sort((a,b)=>Number(/living/i.test(b.name??''))-Number(/living/i.test(a.name??'')))) {
   if(/bath|wc|balcon|kitchen|hall/i.test(room.name??''))continue;
   const candidate=place(scene,{room_id:room.id,item:{id:'komitas-proof-chair',kind:'chair',name:chair.name,size:[chair.dimensions[0],chair.dimensions[2],chair.dimensions[1]],sku:chair.id,price:chair.price},relations:[{type:'centered'}]});
   attempts.push({room_id:room.id,candidates:candidate.candidates.length,reason:candidate.reason,rejections:candidate.rejections});
   for(const choice of candidate.candidates) {
    const session=new DesignerSession(scene);session.setIntent({room_id:room.id,add:[{kinds:['chair'],count:1}],budget_dram:chair.price});
    const proposed=session.propose([choice.op],'A checked chair placement in the reconstructed apartment.');
    if(!proposed.ok){attempts.push(proposed);continue;}
    try {
     const translated=proposalToEditor(proposed.proposal,editor,0,options),store=new EditorStore(editor,localCatalog);
     const accepted=store.execute(translated.command,true);if(!accepted.ok)throw new Error(accepted.errors.join('; '));
     proof={room_id:room.id,op:choice.op,editor_result:accepted,proposal_id:proposed.proposal_id,baseline_notes:proposed.proposal.checks.notes};break;
    }catch(error){attempts.push({translation_error:String(error)});}
   }
   if(proof)break;
  }
  const record={id,accepted:!!proof,seconds:(performance.now()-start)/1000,model_tokens:0,editor_accepted:true,summary:true,sun_status:sunlight.status,sun_windows:sunlight.windows.length,access:{rooms:access.rooms.length,baseline_failed_paths:access.rooms.flatMap(r=>r.walkways).filter(w=>w.status==='fail').length},geometry_audit:scene.geometry_audit,fixed_obstacles:scene.fixed.length,placement:proof,attempts};
  writeFileSync(resolve(root,id+'.designer-check.json'),JSON.stringify(record,null,2)+'\n');
  if(!proof)throw new Error('No placement passed both designer and editor; see designer-check.json');
  writeFileSync(resolve(root,id+'.scene.json'),JSON.stringify(editor,null,2)+'\n');
  console.log(JSON.stringify({id,accepted:true,seconds:record.seconds,fixed:scene.fixed.length,adjustments:scene.geometry_audit?.adjustments.length}));
 }catch(error){console.log(JSON.stringify({id,accepted:false,error:String(error)}));process.exitCode=1;}
}
