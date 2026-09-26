/** Re-grade actual accepted editor scenes with QUALITY's unchanged room-program scorer. */
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {editorToDesigner} from '../src/editor-bridge.js';
import {scoreComposition} from '../src/taste/composition.js';
const [beforeRoot,afterRoot,output]=process.argv.slice(2);
if(!beforeRoot||!afterRoot||!output)throw new Error('Usage: complete-room-composition.ts <before runs> <after runs> <output.json>');
const results:Record<string,unknown>={};
for(const [phase,root] of [['before',beforeRoot],['after',afterRoot]] as const)for(const flat of ['avani','balcony','b21-t13'])for(const repeat of [1,2,3]){
 const folder=join(root,`after-portal-${flat}-${repeat}`),run=JSON.parse(readFileSync(join(folder,'run.json'),'utf8'));
 if(!run.finished_at)throw new Error(`Incomplete run: ${folder}`);
 for(const kind of ['living','bedroom','kids']){
  const row=run.rows.find((r:{kind:string})=>r.kind===kind);if(!row)throw new Error(`Missing ${kind}: ${folder}`);
  const after=JSON.parse(readFileSync(join(folder,kind+'-after.json'),'utf8'));
  try{
   const scene=editorToDesigner(after.scene,{catalog:after.catalog,catalogCurrency:'AMD',northDeg:0,groupPolicy:'move-together',geometryPolicy:'reconcile'});
   const score=scoreComposition(scene,run.roles[kind],{program:kind});
   results[`${phase}/${flat}/${repeat}/${kind}`]={pass:row.editor_accepted===true&&score.issues.length===0,score:score.score,issues:score.issues};
  }catch(error){results[`${phase}/${flat}/${repeat}/${kind}`]={pass:false,error:String(error)};}
 }
}
writeFileSync(output,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(['before','after'].map(phase=>[phase,Object.fromEntries(['living','bedroom','kids'].map(kind=>[kind,Object.entries(results).filter(([key,value])=>key.startsWith(phase+'/')&&key.endsWith('/'+kind)&&(value as {pass:boolean}).pass).length]))])),null,2));
