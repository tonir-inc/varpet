/** Capture real catalog and initial editor views. Developer plan files stay external. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {readFileSync} from 'node:fs';
const base='/tmp/designer-vision-eval';mkdirSync(base,{recursive:true});
const response=await fetch('http://localhost:8765/editor/assets');if(!response.ok)throw new Error(`Catalog ${response.status}`);
const remote=await response.json();if(!Array.isArray(remote)||!remote.length)throw new Error('Empty catalog');
writeFileSync(base+'/catalog-response.json',JSON.stringify(remote));
const catalog=[...localCatalog,...remote.filter((a:any)=>!localCatalog.some(b=>b.id===a.id))];
for(const id of ['avani','b20-t11','b28-t31']){
 const scene=id==='avani'?demoScene:JSON.parse(readFileSync(`packages/designer/eval/komitas/${id}.scene.json`,'utf8'));
 const input=base+'/'+id+'.json';writeFileSync(input,JSON.stringify({scene,catalog}));
 const result=spawnSync('uv',['run','--no-project','--with','playwright','python','harness/designer_vision_render.py','--input',input,'--output',base+'/'+id+'-images'],{stdio:['ignore','inherit','inherit'],timeout:60000});if(result.status!==0)throw new Error(`Render ${id} failed`);
}
console.log(`Prepared ${remote.length} catalog products and 3 real editor views in ${base}`);
