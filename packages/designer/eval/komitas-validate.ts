/** Approve each real shell through the product's replace-scene path, then bridge it. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialScene } from '../../../apps/editor/src/core/initial-scene.js';
import { createReconstructionProposal } from '../../../apps/editor/src/core/reconstruction-proposal.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { editorToDesigner } from '../src/editor-bridge.js';
const id=process.argv[2]!;
const root=resolve('packages/designer/eval/komitas');
const result=JSON.parse(readFileSync(resolve(root,id+'.architect.json'),'utf8'));
const final=result.lines?.at(-1);
const metrics:Record<string,unknown>={id,architect_accepted:final?.type==='structure',editor_accepted:false,bridge_accepted:false};
try {
  if(final?.type!=='structure')throw new Error(final?.message??'No final structure');
  const store=new EditorStore(createInitialScene(),[]);
  const proposal=createReconstructionProposal(store.scene,store.revision,final,true,id);
  const applied=store.execute(proposal.command,true);
  metrics.editor_result=applied;
  if(!applied.ok)throw new Error(applied.errors.join('; '));
  metrics.editor_accepted=true;
  const scene=structuredClone(store.scene);scene.name=`Komitas Park ${id}`;
  const validation=validateScene(scene,[]);metrics.validation=validation;
  if(!validation.ok)throw new Error(validation.errors.join('; '));
  metrics.rooms=scene.rooms.map(room=>({id:room.id,name:room.name,area_m2:Math.abs(room.polygon.reduce((sum,p,i)=>{const q=room.polygon[(i+1)%room.polygon.length]!;return sum+p[0]*q[1]-q[0]*p[1];},0))/2}));
  metrics.floor_area_m2=(metrics.rooms as {area_m2:number}[]).reduce((sum,r)=>sum+r.area_m2,0);
  metrics.doors=scene.walls.flatMap(w=>w.openings).filter(o=>o.kind==='door').length;
  metrics.windows=scene.walls.flatMap(w=>w.openings).filter(o=>o.kind==='window').length;
  metrics.northDeg=0;
  const converted=editorToDesigner(scene,{northDeg:0,catalog:[]});
  metrics.bridge_accepted=true;
  writeFileSync(resolve(root,id+'.scene.json'),JSON.stringify(scene,null,2)+'\n');
  // BENCH consumes the editor scene and must supply northDeg:0 when calling the bridge/service.
  metrics.designer_rooms=converted.rooms.length;
} catch(error) {metrics.error=String(error);process.exitCode=1;}
writeFileSync(resolve(root,id+'.metrics.json'),JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify(metrics));
