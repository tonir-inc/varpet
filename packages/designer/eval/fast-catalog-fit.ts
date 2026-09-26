import {readFileSync,writeFileSync} from 'node:fs';
import {editorToDesigner,proposalToEditor} from '../src/editor-bridge.js';
import {DesignerSession} from '../src/session.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
const kind=process.argv[2]??'sofa';
const broker=JSON.parse(readFileSync('/tmp/fast-catalog-live-v2.log','utf8').split('\n')[0]!).url;
const source=JSON.parse(readFileSync(new URL('./fast-runs/matrix-after-restored/b20-t11/initial.json',import.meta.url),'utf8'));
const options={catalog:source.catalog,catalogCurrency:'AMD' as const,northDeg:0,groupPolicy:'move-together' as const},scene=editorToDesigner(source.scene,options);
async function call(action:string,data:any){const response=await fetch(broker+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});return response.json();}
const context=await call('context',{scene,catalog:source.catalog,editor_scene:source.scene}),rows=[];
for(let repetition=1;repetition<=3;repetition++){
 const started=performance.now(),result=await call('search',{context:context.id,room_id:'living',query:{kind,limit:20}}),seconds=(performance.now()-started)/1000,checks=[];
 for(const row of result.results??[])for(const slot of row.fit_slots??[]){
  const session=new DesignerSession(scene);session.setIntent({room_id:slot.room_id,add:[{kinds:[kind],count:1}],remove:[]});
  const proposal=session.propose(slot.ops,'Add this checked catalog sofa.');let editorAccepted=false,error;
  try{
  if(proposal.ok){const p=proposalToEditor(proposal.proposal,source.scene,0,options);editorAccepted=new EditorStore(source.scene,source.catalog).execute(p.command,true).ok;}
  }catch(e){error=String(e);}
  checks.push({error,catalog_id:row.id,slot:slot.id,propose:proposal.ok,editor_accepted:editorAccepted});
 }
 rows.push({repetition,seconds,result,checks});
 writeFileSync(new URL(`./fast-runs/catalog-fit-${kind}-live.json`,import.meta.url),JSON.stringify({measured_at:new Date().toISOString(),rows},null,2)+'\n');console.log(JSON.stringify({repetition,seconds,count:result.results?.length,truncated:result.fit_budget_exhausted,accepted:checks.filter(c=>c.editor_accepted).length}));
}
