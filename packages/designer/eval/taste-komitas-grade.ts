/** Independent post-grading of saved HTTP/editor evidence, shared by both product revisions. */
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {editorToDesigner} from '../src/editor-bridge.js';
import {rasterizeRoom} from '../src/metrics/space.js';
import {grade} from './komitas-grade.js';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function hasPlaySquare(editor:any,catalog:any[],roomId:string):boolean{
 const scene=editorToDesigner(editor,{catalog,catalogCurrency:'AMD',northDeg:0,groupPolicy:'move-together'}),room=scene.rooms.find(r=>r.id===roomId);if(!room)return false;
 const grid=rasterizeRoom(scene,room,.1),n=12,stride=grid.width+1,prefix=new Uint32Array(stride*(grid.height+1));
 for(let y=1;y<=grid.height;y++)for(let x=1;x<=grid.width;x++)prefix[y*stride+x]=grid.occupied[(y-1)*grid.width+x-1]!+prefix[(y-1)*stride+x]!+prefix[y*stride+x-1]!-prefix[(y-1)*stride+x-1]!;
 for(let y=n;y<=grid.height;y++)for(let x=n;x<=grid.width;x++)if(prefix[y*stride+x]!-prefix[(y-n)*stride+x]!-prefix[y*stride+x-n]!+prefix[(y-n)*stride+x-n]===0)return true;
 return false;
}
function main(){
 const root=resolve(process.argv[2]!);const rows:any[]=[];
 for(const name of readdirSync(root)){
  const directory=join(root,name);if(!existsSync(join(directory,'run.json')))continue;
  const run=read(join(directory,'run.json')),initial=read(join(directory,'initial.json'));
  for(const row of run.rows){
   const body=read(join(directory,`${row.kind}-request.json`)),after=read(join(directory,`${row.kind}-after.json`));
   const grading=grade(row.kind,body.scene,after.scene,after.catalog,row.reply,row.editor_accepted,run.roles);
   if(row.kind==='sofa'){
    grading.request_match=row.editor_accepted===true&&grading.inventory.some((i:any)=>i.kind==='sofa'&&i.room_id===run.roles.living&&!body.scene.objects.some((o:any)=>o.id===i.id));
    grading.reasons=grading.reasons.filter(r=>r!=='request_mismatch');if(!grading.request_match)grading.reasons.push('request_mismatch');
   }
   if(row.kind==='kids'&&row.editor_accepted===true&&!hasPlaySquare(after.scene,after.catalog,run.roles.kids))grading.reasons.push('missing_play_space');
   if(hash(body.scene)!==hash(initial.scene))grading.reasons.push('nonfresh_scene');
   const catalogUnchanged=hash(body.catalog)===hash(initial.catalog);
   if(!catalogUnchanged)grading.reasons.push('changed_input_catalog');
   if(row.actual_profile?.model!=='gpt-6-astra'||row.actual_profile?.effort!=='low'||row.actual_profile?.placement!=='without-place'||row.actual_profile?.context!=='compact-base')grading.reasons.push('profile_unverified');
   if(row.fast_path_env!==run.fast_path_env)grading.reasons.push('fast_path_unverified');
   grading.pass=grading.reasons.length===0;
   rows.push({flat:run.id,path:row.fast_path_env==='1'?'fast':'normal',kind:row.kind,request:row.request,source:run.source,seconds:row.seconds,...grading,input_catalog_unchanged:catalogUnchanged});
  }
 }
 const groups=['living','bedroom','kids','sofa'].flatMap(kind=>['normal','fast'].map(path=>{
  const group=rows.filter(r=>r.kind===kind&&r.path===path),times=group.map(r=>r.seconds).sort((a,b)=>a-b),n=times.length;
  return {kind,path,passed:group.filter(r=>r.pass).length,total:n,median_seconds:n?(times[Math.floor((n-1)/2)]!+times[Math.ceil((n-1)/2)]!)/2:null,p90_seconds:n?times[Math.ceil(n*.9)-1]:null};
 }));
 const result={measured_at:new Date().toISOString(),groups,rows};writeFileSync(join(root,'grades.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(groups,null,2));
}
if(process.argv[1]?.endsWith('taste-komitas-grade.ts'))main();
