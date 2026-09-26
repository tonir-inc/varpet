/** Read-only preflight of SERVICE diagnostics. Never publishes or furnishes rejected drafts. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateScene} from '../../../apps/editor/src/core/validation.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {createInitialScene} from '../../../apps/editor/src/core/initial-scene.js';
import {editorToDesigner} from '../src/editor-bridge.js';
import {flatContext} from './komitas-grade.js';
const root='packages/designer/eval/komitas';
const truth=JSON.parse(readFileSync(join(root,'ground-truth.json'),'utf8'));
const rows=truth.map((entry:any)=>{
  const start=performance.now(),path=join(root,entry.id+'.rejected.json'),scene=JSON.parse(readFileSync(path,'utf8'));
  const validation=validateScene(scene,[]),store=new EditorStore(createInitialScene(),[]);
  const editor=store.execute({id:`intake-${entry.id}`,label:'Validate diagnostic architect draft',source:'architect',baseRevision:0,operations:[{type:'replace-scene',scene}]},true);
  let bridgeError:string|null=null;try{editorToDesigner(scene,{northDeg:0,catalog:[]});}catch(error){bridgeError=String(error);}
  const error=validation.errors.join('; ')||bridgeError||'';
  const cause=/polygon points/.test(error)?'room_polygon_limit':/opening|Door.*intersects/.test(error)?'opening_collision':bridgeError?'wall_room_boundary':'none';
  return {id:entry.id,input:path,accepted_scene_published:existsSync(join(root,entry.id+'.scene.json')),ground_truth:entry,...flatContext(scene,entry),validation,editor,bridge_accepted:bridgeError===null,bridge_error:bridgeError,cause,seconds:(performance.now()-start)/1000,designer_requests_run:0,model_tokens:0};
});
const output={measured_at:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Input preflight only; no designer calls, furnishing, scene modification, or accepted scene publication.',rows};
writeFileSync('packages/designer/eval/komitas-intake.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({flats:rows.length,editor_accepted:rows.filter((r:any)=>r.editor.ok&&r.validation.ok).length,bridge_accepted:rows.filter((r:any)=>r.bridge_accepted).length,published:rows.filter((r:any)=>r.accepted_scene_published).length,eligible_customer_requests:rows.reduce((n:number,r:any)=>n+(r.kids_required?7:6),0),causes:rows.reduce((counts:any,r:any)=>(counts[r.cause]=(counts[r.cause]??0)+1,counts),{})}));
