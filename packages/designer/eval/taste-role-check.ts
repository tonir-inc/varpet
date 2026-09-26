/** Reproducible geometry/application check over a saved real catalog role probe. */
import {readFileSync,writeFileSync} from 'node:fs';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {editorToDesigner,proposalToEditor} from '../src/editor-bridge.js';
import {DesignerSession} from '../src/session.js';
import {designRoom} from '../src/taste/design.js';
const root=process.argv[2];if(!root)throw Error('Supply role probe directory');
const input=structuredClone(demoScene);input.objects=[];
const catalog=JSON.parse(readFileSync(new URL('./taste-runs/input-catalog.json',import.meta.url),'utf8'));
const scene=editorToDesigner(input,{catalog:localCatalog,catalogCurrency:'AMD',northDeg:0});
for(const style of ['industrial','boho']){
 const source=JSON.parse(readFileSync(`${root}/${style}.json`,'utf8'));
 const result=await designRoom(scene,{room_id:'room-living',style_request:style,remake:true},async p=>({results:source[p.kind!].result.results.map((r:any)=>({...r,id:r.sku,size_m:r.size,style_astra:r.styles_inferred}))}));
 writeFileSync(`${root}/${style}-plan.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({style,candidates:result.candidates.length,reason:result.reason,rejected_by:'rejected_by' in result?result.rejected_by:undefined}));
 if(result.candidates.length!==2)throw Error(`${style}: expected two candidates`);
 for(const candidate of result.candidates){const session=new DesignerSession(scene);session.setIntent(candidate.intent);const checked=session.propose(candidate.ops,'A complete composition in the requested style.');if(!checked.ok)throw Error(JSON.stringify(checked));const proposal=proposalToEditor(checked,input,0,{catalog,catalogCurrency:'AMD',northDeg:0});const store=new EditorStore(input,catalog);const accepted=store.execute(proposal.command,true);console.log(style,candidate.id,accepted);if(!accepted.ok)throw Error(JSON.stringify(accepted));writeFileSync(`${root}/${style}-${candidate.id}.json`,JSON.stringify({scene:store.scene,catalog}));}
}
