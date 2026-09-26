/** Approve a real shell through product replace-scene and bridge gates; diagnose rejected drafts separately. */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialScene } from '../../../apps/editor/src/core/initial-scene.js';
import { createReconstructionProposal } from '../../../apps/editor/src/core/reconstruction-proposal.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { editorToDesigner } from '../src/editor-bridge.js';
const id=process.argv[2]!;
const root=resolve(process.argv[3]??'packages/designer/eval/komitas');
for(const suffix of ['.scene.json','.rejected.json'])rmSync(resolve(root,id+suffix),{force:true});
const result=JSON.parse(readFileSync(resolve(root,id+'.architect.json'),'utf8'));
const final=result.lines?.at(-1);
const metrics:Record<string,unknown>={id,architect_accepted:final?.type==='structure',editor_accepted:false,bridge_accepted:false,accepted:false};
try {
  const draft=resolve(root,id+'.shell.json');
  const structure=final?.type==='structure'?final:existsSync(draft)?JSON.parse(readFileSync(draft,'utf8')):null;
  if(!structure)throw new Error(final?.message??'No final structure');
  if(final?.type!=='structure')metrics.architect_error=final?.message??'No final structure';
  const store=new EditorStore(createInitialScene(),[]);
  const proposal=createReconstructionProposal(store.scene,store.revision,structure,true,id);
  const operation=proposal.command.operations[0]!;
  if(operation.type!=='replace-scene')throw new Error('Expected product replace-scene');
  const scene=structuredClone(operation.scene);scene.name=`Komitas Park ${id}`;
  metrics.rooms=scene.rooms.map(room=>({id:room.id,name:room.name,area_m2:Math.abs(room.polygon.reduce((sum,p,i)=>{const q=room.polygon[(i+1)%room.polygon.length]!;return sum+p[0]*q[1]-q[0]*p[1];},0))/2}));
  metrics.floor_area_m2=(metrics.rooms as {area_m2:number}[]).reduce((sum,r)=>sum+r.area_m2,0);
  metrics.doors=scene.walls.flatMap(w=>w.openings).filter(o=>o.kind==='door').length;
  metrics.windows=scene.walls.flatMap(w=>w.openings).filter(o=>o.kind==='window').length;
  metrics.northDeg=0;
  const applied=store.execute(proposal.command,true);
  metrics.editor_result=applied;
  const validation=validateScene(scene,[]);metrics.validation=validation;
  metrics.editor_accepted=applied.ok&&validation.ok;
  try {
    const converted=editorToDesigner(scene,{northDeg:0,catalog:[]});
    metrics.bridge_accepted=true;metrics.designer_rooms=converted.rooms.length;
  } catch(error) {metrics.bridge_error=String(error);}
  metrics.accepted=metrics.architect_accepted&&metrics.editor_accepted&&metrics.bridge_accepted;
  // Rejected drafts are diagnostics, NEVER exposed under BENCH's accepted .scene.json name.
  const suffix=metrics.accepted?'.scene.json':'.rejected.json';
  writeFileSync(resolve(root,id+suffix),JSON.stringify(scene,null,2)+'\n');
  if(!metrics.accepted)process.exitCode=1;
} catch(error) {metrics.error=String(error);process.exitCode=1;}
writeFileSync(resolve(root,id+'.metrics.json'),JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify(metrics));
