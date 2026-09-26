/** Real-catalog program extension; separate from the fixed 13 conversational cases. */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {editorToDesigner,proposalToEditor} from '../src/editor-bridge.js';
import {DesignerSession} from '../src/session.js';
import {searchCatalog,type CatalogQuery} from '../src/catalog.js';
import {designRoom} from '../src/taste/design.js';
const root=process.argv[2],catalogPath=process.argv[3];if(!root||!catalogPath)throw Error('Supply output directory and editor catalog snapshot');
mkdirSync(root,{recursive:true});
const payload=JSON.parse(readFileSync(catalogPath,'utf8')),remote=payload.assets??payload;
const catalog=[...localCatalog,...remote.filter((a:any)=>!localCatalog.some(b=>b.id===a.id))];
const rows=[];
for(const [id,roomName,request,expected] of [
 ['bedroom-wardrobe','Bedroom','Scandinavian bedroom with a wardrobe',['bed','nightstand','nightstand','wardrobe','lamp','lamp']],
 ['bedroom-dresser','Bedroom','modern bedroom with a dresser',['bed','nightstand','nightstand','dresser','lamp','lamp']],
 ['office-desk','Office','modern office with a desk',['desk','chair','lamp','shelf']],
] as const){
 const input=structuredClone(demoScene);input.objects=[];input.rooms.find(r=>r.id==='room-bedroom')!.name=roomName;
 const scene=editorToDesigner(input,{catalog,catalogCurrency:'AMD',northDeg:0}),queries:any[]=[];
 const query:CatalogQuery=async p=>{const result=await searchCatalog(p);queries.push({request:p,result});return {results:result.results.map(r=>({...r,id:r.sku,size_m:r.size,style_astra:r.styles_inferred}))};};
 const started=performance.now(),result=await designRoom(scene,{room_id:'room-bedroom',style_request:request,remake:true},query);
 writeFileSync(`${root}/${id}-plan.json`,JSON.stringify({request,queries,result},null,2));
 const candidates=[];
 for(const c of result.candidates){
  const session=new DesignerSession(scene,[request]);session.setIntent(c.intent);const checked=session.propose(c.ops,'A complete checked room program.');
  if(!checked.ok){candidates.push({id:c.id,accepted:false,checked});continue;}
  const proposal=proposalToEditor(checked,input,0,{catalog,catalogCurrency:'AMD',northDeg:0}),store=new EditorStore(input,catalog),accepted=store.execute(proposal.command,true);
  const kinds=c.ops.flatMap(op=>op.type==='add'?[op.item.kind]:[]),remaining=[...kinds];const program=expected.every(k=>{const index=remaining.indexOf(k);if(index<0)return false;remaining.splice(index,1);return true;});
  candidates.push({id:c.id,accepted:accepted.ok,program,score:c.composition.score,kinds,render_kinds:store.scene.objects.map(o=>catalog.find(a=>a.id===o.assetId)?.kind)});
  if(c.id===result.selected_id)writeFileSync(`${root}/${id}.json`,JSON.stringify({id,request,focus_room:'room-bedroom',scene:store.scene,catalog,candidate:c,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_note:'native program working tree; real catalog search; office uses unchanged bedroom shell renamed Office'},null,2));
 }
 const row={id,pass:candidates.length===2&&candidates.every(c=>c.accepted&&'program' in c&&c.program),seconds:(performance.now()-started)/1000,candidates,reason:result.reason};rows.push(row);console.log(JSON.stringify(row));
}
const coverage=[];for(const kind of ['desk','wardrobe','dresser','nightstand','stool','ottoman','bench']){const result=await searchCatalog({kind,limit:20});coverage.push({kind,products:result.results});console.log(kind,result.results.length);}
writeFileSync(`${root}/native-coverage.json`,JSON.stringify(coverage,null,2));
writeFileSync(`${root}/native-grades.json`,JSON.stringify(rows,null,2));
if(rows.some(r=>!r.pass)||coverage.some(r=>!r.products.some(p=>p.kind===r.kind)))process.exitCode=1;
