/** CPU fitting is isolated and killable; a busy broker never queues unbounded room searches. */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import type {EditorBridgeOptions} from './editor-bridge.js';
import type {Scene} from './scene.js';
import type {CatalogAsset} from '../../../apps/editor/src/contracts.js';
import type {RawProduct} from './catalog-acceleration.js';
interface FitInput {scene:Scene;rows:RawProduct[];catalog:CatalogAsset[];room_id?:string;editor_scene?:unknown;base_scene?:Scene;remove_ids?:string[];bridge_options?:EditorBridgeOptions}
export class FitPool {
 active=0;
 private cache=new Map<string,{expires:number;results:any[]}>();
 private pending=new Map<string,Promise<{results:any[];truncated:boolean}>>();
 constructor(private options:{budgetMs?:number;maxConcurrent?:number}={}){}
 async fit(input:FitInput):Promise<{results:any[];truncated:boolean}>{
  const key=createHash('sha256').update(JSON.stringify(input)).digest('hex'),cached=this.cache.get(key);
  if(cached&&cached.expires>Date.now())return {results:structuredClone(cached.results),truncated:false};
  if(this.pending.has(key))return structuredClone(await this.pending.get(key)!);
  if(this.active>=(this.options.maxConcurrent??2))throw new Error('Catalog fit workers are busy');
  this.active++;
  const promise=new Promise<{results:any[];truncated:boolean}>((resolve,reject)=>{
   const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs',import.meta.url)),fileURLToPath(new URL('./catalog-fit-cli.ts',import.meta.url))],{stdio:['pipe','pipe','ignore'],detached:true});
   let pending='',truncated=false,failed=false;const results:any[]=[];
   const kill=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}};
   const timer=setTimeout(()=>{truncated=true;kill();},this.options.budgetMs??4000);
   child.stdout.on('data',chunk=>{pending+=String(chunk);let end:number;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);try{results.push(JSON.parse(line));}catch{failed=true;kill();}}});
   child.stdin.on('error',()=>{});
   child.on('error',()=>{failed=true;});
   child.on('close',code=>{
    clearTimeout(timer);this.active--;
    if(failed||(code!==0&&!truncated)){reject(new Error('Catalog fit worker failed'));return;}
    if(!truncated){while(this.cache.size>=64)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,{expires:Date.now()+300000,results:structuredClone(results)});}
    resolve({results,truncated});
   });
   child.stdin.end(JSON.stringify(input));
  });
  this.pending.set(key,promise);
  try{return structuredClone(await promise);}finally{this.pending.delete(key);}
 }
}
