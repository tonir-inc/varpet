import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {editorToDesigner,proposalToEditor} from '../src/editor-bridge.js';
import {designRoom} from '../src/taste/design.js';
import {DesignerSession} from '../src/session.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {readFileSync,writeFileSync} from 'node:fs';
const source=JSON.parse(readFileSync(new URL('./taste-runs/catalog-sweep/minimalistic-cozy.json',import.meta.url),'utf8'));
const products=source.catalog.products;
const input=structuredClone(demoScene);input.objects=[];
const scene=editorToDesigner(input,{catalog:localCatalog,catalogCurrency:'AMD',northDeg:0});
const query=async(p:any)=>({results:products[p.kind].map((r:any)=>({...r,id:r.sku,size_m:r.size,style_astra:r.styles_inferred}))});
const start=performance.now();
const result=await designRoom(scene,{room_id:'room-living',style_request:'minimalistic cozy',remake:true},query);
writeFileSync('/tmp/taste-probe.json',JSON.stringify(result));console.log(JSON.stringify({seconds:(performance.now()-start)/1000,reason:result.reason,candidates:result.candidates.map(c=>({id:c.id,score:c.composition.score,items:c.ops.filter(o=>o.type==='add').map(o=>({kind:o.item.kind,pos:o.item.pos,rot:o.item.rot,size:o.item.size}))}))}));

const catalog=JSON.parse(readFileSync(new URL('./taste-runs/input-catalog.json',import.meta.url),'utf8'));
for(const candidate of result.candidates){const session=new DesignerSession(scene);session.setIntent(candidate.intent);const checked=session.propose(candidate.ops,'A coherent living group with layered light.');const proposal=proposalToEditor(checked,input,0,{catalog,catalogCurrency:'AMD',northDeg:0});const store=new EditorStore(input,catalog);console.log('EDITOR',store.execute(proposal.command,true));writeFileSync(`/tmp/taste-${candidate.id}.json`,JSON.stringify({scene:store.scene,catalog}));}
