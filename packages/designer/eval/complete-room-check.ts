/** Grade deterministic diagnostic plans with the unchanged independent eval code. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {DesignerSession} from '../src/session.js';
import {proposalToEditor,withProposalAssets} from '../src/editor-bridge.js';
import {createHttpCatalogItems} from '../src/catalog.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {grade} from './komitas-grade.js';
import {scopeFailures,hasPlaySquare} from './taste-komitas-grade.js';
const recordings=process.env.COMPLETE_RECORDINGS;if(!recordings)throw new Error('Set COMPLETE_RECORDINGS to the preserved typed-tools runs directory');
const root=process.env.COMPLETE_OUTPUT??'/tmp/complete-room-diagnosis',prefix=process.argv[2]??'search',rows=[];
for(const file of readdirSync(root).filter(s=>s.startsWith(prefix+'-')&&s.endsWith('.json'))){
 const flat=file.slice(prefix.length+1).replace(/-(living|bedroom|kids)\.json$/,''),kind=file.match(/-(living|bedroom|kids)\.json$/)?.[1];if(!kind)continue;
 const {scene,request,plan}=JSON.parse(readFileSync(root+'/'+file,'utf8'));
 const initial=JSON.parse(readFileSync(`${recordings}/after-portal-${flat}-1/initial.json`,'utf8'));
 const run=JSON.parse(readFileSync(`${recordings}/after-portal-${flat}-1/run.json`,'utf8'));
 try{
 const session=new DesignerSession(scene);session.setIntent(plan.intent);const check=session.propose(plan.ops,plan.reason);if(!check.ok)throw new Error(JSON.stringify(check.errors));
 const catalog=await withProposalAssets(check.proposal,initial.catalog,createHttpCatalogItems({url:'http://localhost:8765/mcp'}));
 const proposal=proposalToEditor(check.proposal,initial.scene,0,{catalog,catalogCurrency:'AMD',northDeg:0,groupPolicy:'move-together'});
 const store=new EditorStore(initial.scene,catalog),accepted=store.execute(proposal.command,true).ok,reply={type:'proposal',proposal};
 const g=grade(kind,initial.scene,store.scene,catalog,reply,accepted,run.roles);
 g.reasons.push(...scopeFailures(initial.scene,store.scene,kind,request.room_id,g.inventory,reply));if(kind==='kids'&&!hasPlaySquare(store.scene,catalog,request.room_id))g.reasons.push('missing_play_space');g.pass=g.reasons.length===0;
 const row={flat,kind,complete:plan.complete,...g};rows.push(row);writeFileSync(root+'/'+file.replace('.json','-editor.json'),JSON.stringify({before:initial.scene,after:store.scene,catalog,reply,accepted,description:plan.reason,...row}));console.log(JSON.stringify({flat,kind,complete:plan.complete,pass:g.pass,reasons:g.reasons,failures:g.new_failures.map(f=>f.key)}));
 }catch(e){rows.push({flat,kind,error:String(e)});console.log(JSON.stringify({flat,kind,error:String(e)}));}
}
writeFileSync(root+'/'+prefix+'-grades.json',JSON.stringify(rows,null,2));
