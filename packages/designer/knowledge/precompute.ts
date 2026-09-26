/** Offline only: immutable known-flat recipes, independently graded before publication. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createEditorDemoInput} from '../eval/editor-demo.js';
import {measure,type Scenario} from '../eval/measure.js';
import {prepareFastRequest,selectFastCandidate,sceneFingerprint,FAST_VERSION} from '../src/fast-path.js';
const here=dirname(fileURLToPath(import.meta.url));
const scenarios:Scenario[]=JSON.parse(readFileSync(join(here,'../eval/avani-benchmark-scenarios.json'),'utf8'));
mkdirSync(join(here,'layouts'),{recursive:true});
const rows=[];
for(const scenario of scenarios){
  const source=createEditorDemoInput(scenario.scene_variant),started=performance.now();
  const prepared=prepareFastRequest(source.scene,scenario.request,source.catalog);
  const seconds=(performance.now()-started)/1000;
  if(prepared.type!=='candidates')throw new Error(`${scenario.id}: ${prepared.type}`);
  const grades=prepared.candidates.map(candidate=>{
    const result=selectFastCandidate(source.scene,prepared,{slot_id:candidate.id,catalog_ids:candidate.catalog_ids});
    if(!result.ok)return {id:candidate.id,pass:false,errors:result.errors};
    const grade=measure({...source,scenario,proposal:result.proposal});
    return {id:candidate.id,pass:grade.pass,reasons:grade.reasons};
  });
  // A failed batch is diagnostic evidence, not a new source of filtered candidates.
  if(grades.some(g=>!g.pass))throw new Error(JSON.stringify({scenario:scenario.id,grades}));
  const key=createHash('sha256').update(JSON.stringify([FAST_VERSION,sceneFingerprint(source.scene,source.catalog),scenario.request])).digest('hex');
  writeFileSync(join(here,'layouts',`${key}.json`),JSON.stringify({key,prepared},null,2)+'\n');
  rows.push({scenario:scenario.id,key,seconds,grades,scene_fingerprint:sceneFingerprint(source.scene),catalog_fingerprint:createHash('sha256').update(JSON.stringify(source.catalog)).digest('hex')});
  console.log(JSON.stringify(rows[rows.length-1]));
}
writeFileSync(join(here,'precomputed.json'),JSON.stringify({version:FAST_VERSION,basis:'code candidates, unchanged independent Avani grader and EditorStore; no model timing',rows},null,2)+'\n');
