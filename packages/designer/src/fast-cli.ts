/** Private worker protocol. Model input never crosses this boundary as operations. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prepareFastRequest, selectFastCandidate, sceneFingerprint, FAST_VERSION } from './fast-path.js';
const input=JSON.parse(readFileSync(process.argv[2]??0,'utf8')),started=performance.now();
function save(path:string,data:unknown){const temp=`${path}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(data),{mode:0o600});renameSync(temp,path);}
if(input.action==='prepare'){
  const key=createHash('sha256').update(JSON.stringify([FAST_VERSION,sceneFingerprint(input.scene,input.catalog??[]),input.request])).digest('hex');
  let prepared,cacheHit=false;
  // Cache is a performance hint, never authority: selection always rechecks the source snapshot.
  for(const directory of [input.cache_dir,input.knowledge_dir].filter(Boolean)){
    const file=join(directory,`${key}.json`);
    if(existsSync(file)){try{const cached=JSON.parse(readFileSync(file,'utf8'));if(cached.key===key){prepared=cached.prepared;cacheHit=true;break;}}catch{/* Regenerate damaged cache. */}}
  }
  prepared??=prepareFastRequest(input.scene,input.request,input.catalog??[]);
  if(input.cache_dir&&prepared.type==='candidates'&&!cacheHit){
    mkdirSync(input.cache_dir,{recursive:true});
    const entries=readdirSync(input.cache_dir).filter(p=>/^[a-f0-9]{64}\.json$/.test(p));
    if(entries.length>=32)unlinkSync(join(input.cache_dir,entries[0]!));
    save(join(input.cache_dir,`${key}.json`),{key,prepared});
  }
  process.stdout.write(JSON.stringify({prepared,key,cache_hit:cacheHit,prepare_ms:performance.now()-started}));
}else if(input.action==='select'){
  const result=selectFastCandidate(input.scene,input.prepared,input.selection,input.catalog??[]);
  if(result.ok&&input.proposals_dir){mkdirSync(input.proposals_dir,{recursive:true});save(join(input.proposals_dir,`${result.proposal_id}.json`),result.proposal);}
  process.stdout.write(JSON.stringify({result,checks_ms:performance.now()-started}));
}else throw new Error('Unknown fast worker action');
