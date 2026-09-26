import type {CatalogAsset} from '../../../apps/editor/src/contracts.js';
import type {CatalogInput,CatalogQuery} from './catalog.js';
import {SceneAnalysisCache} from './fast-path.js';
import type {Scene} from './scene.js';
import {editorKindOf} from './editor-bridge.js';
import {validateBytes} from 'gltf-validator';

const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
export class SearchCache {
 private entries=new Map<string,{expires:number;value:any}>();
 private pending=new Map<string,Promise<any>>();
 readonly stats={hits:0,misses:0,coalesced:0,upstream_ms:0};
 constructor(private upstream:CatalogQuery,private options:{ttlMs?:number;maxEntries?:number;now?:()=>number}={}){}
 get size(){return this.entries.size;}
 clear(){this.entries.clear();}
 async query(input:CatalogInput):Promise<any>{
  const key=JSON.stringify(canonical(input)),now=this.options.now??Date.now,cached=this.entries.get(key);
  if(cached&&cached.expires>now()){this.stats.hits++;this.entries.delete(key);this.entries.set(key,cached);return structuredClone(cached.value);}
  if(this.pending.has(key)){this.stats.coalesced++;return structuredClone(await this.pending.get(key));}
  this.entries.delete(key);this.stats.misses++;const started=performance.now();
  const promise=(async()=>{
   const value:any=await this.upstream(input);
   if(!value||!Array.isArray(value.results)||value.status==='unavailable')throw new Error('Invalid catalog result');
   this.stats.upstream_ms+=performance.now()-started;
   while(this.entries.size>=(this.options.maxEntries??256))this.entries.delete(this.entries.keys().next().value!);
   this.entries.set(key,{expires:now()+(this.options.ttlMs??300000),value:structuredClone(value)});
   return value;
  })();this.pending.set(key,promise);
  try{return structuredClone(await promise);}finally{this.pending.delete(key);}
 }
}
export interface RawProduct {id:string;kind:string;name?:string;size_m:number[];size_status?:string;price:number;currency:string;styles?:string[];style_astra?:string[];glb_url?:string;preview_url?:string;wd_swapped?:boolean;[key:string]:unknown}
function valid(r:RawProduct){return r.size_status==='confirmed'&&!r.wd_swapped&&r.currency==='AMD'&&Number.isSafeInteger(r.price)&&r.price>=0&&r.size_m?.length===3&&r.size_m.every(v=>Number.isFinite(v)&&v>=.01&&v<=20)&&!!r.glb_url;}
/** Quantile selection preserves the whole price range; insufficient evidence means fewer than 20. */
export async function curate(rows:RawProduct[],kind:string,style:string,verify:(url:string)=>Promise<boolean>,limit=20):Promise<RawProduct[]>{
 const eligible=[...new Map(rows.filter(r=>r.kind===kind&&valid(r)&&(style==='any'||[...r.styles??[],...r.style_astra??[]].some(s=>s.toLowerCase()===style.toLowerCase()))).map(r=>[r.id,r])).values()].sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));
 const sound:RawProduct[]=[];
 for(let i=0;i<eligible.length;i+=2){const group=eligible.slice(i,i+2);const good=await Promise.all(group.map(r=>verify(r.glb_url!)));sound.push(...group.filter((_,j)=>good[j]));}
 if(sound.length<=limit)return sound;
 return Array.from({length:limit},(_,i)=>sound[Math.round(i*(sound.length-1)/(limit-1))]!);
}
export interface FitContext {room_id?:string;remake?:boolean;remove_ids?:string[]}
export function fitScene(scene:Scene,context:FitContext):Scene {
 const {room_id,remake,remove_ids=[]}=context;
 if((remake||remove_ids.length)&&!scene.rooms.some(r=>r.id===room_id))throw new Error('Removal fitting requires a known room');
 for(const id of remove_ids){const item=scene.items.find(i=>i.id===id);if(!item||item.keep||item.room_id!==room_id)throw new Error('Cannot remove kept, fixed or other-room inventory');}
 const remove=scene.items.filter(i=>i.room_id===room_id&&!i.keep&&(remake||remove_ids.includes(i.id)));
 const ids=new Set(remove.map(i=>i.id));
 return structuredClone({...scene,items:scene.items.filter(i=>!ids.has(i.id))});
}
export function compatibleProduct(row:RawProduct,catalog:readonly CatalogAsset[]):boolean {
 return catalog.some(a=>a.id===row.id&&(a.kind===row.kind||a.kind===editorKindOf[row.kind])&&a.price===row.price&&row.currency==='AMD'&&row.size_m?.length===3&&a.dimensions.every((d,i)=>Math.abs(d-[row.size_m[0]!,row.size_m[2]!,row.size_m[1]!][i]!)<1e-7));
}
const slotCache=new SceneAnalysisCache();
/** Candidates are physical checked slots, never just a room bounding box. */
export function fitProducts(scene:Scene,rows:RawProduct[],roomId?:string,maxChecks=2,catalog:readonly CatalogAsset[]=[]):any[]{
 const rooms=scene.rooms.filter(r=>!roomId||r.id===roomId),result:any[]=[];
 for(const row of rows.slice(0,20)){
  if(!row.size_m?.every(v=>Number.isFinite(v)&&v>0)||!['sofa','chair','table','desk','bed','cabinet','wardrobe','dresser','lamp','plant','rug','shelf','decor','wall_art','mirror'].includes(row.kind)&&!editorKindOf[row.kind])continue;
  const asset:CatalogAsset={id:row.id,name:row.name??row.id,kind:(catalog.find(a=>a.id===row.id)?.kind??(['desk','wardrobe','dresser'].includes(row.kind)?row.kind:editorKindOf[row.kind]??row.kind)) as CatalogAsset['kind'],category:row.kind,dimensions:[row.size_m[0]!,row.size_m[2]!,row.size_m[1]!],price:row.price,color:'#888888',source:{type:'gltf',url:row.glb_url??''}};
  const assets=catalog.length?catalog:[asset];
  const slots=rooms.flatMap(room=>slotCache.slots(scene,assets,{roomId:room.id,catalogId:asset.id,maxChecks,solidHeadboard:row.kind==='bed'}).slice(0,2).map(slot=>({id:slot.id,room_id:room.id,ops:slot.ops,score:slot.score})));
  if(slots.length)result.push({...row,fit_slots:slots});
 }
 return result;
}
/** Structural GLB check. Rendered previews remain the visual quality evidence. */
export function soundGlb(data:Uint8Array):boolean {
 try{
  const b=Buffer.from(data);if(b.length<28||b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length||b.readUInt32LE(16)!==0x4e4f534a)return false;
  const size=b.readUInt32LE(12);if(size+20>b.length)return false;
  const doc=JSON.parse(b.toString('utf8',20,20+size));
  if(!doc.scenes?.[doc.scene??0]?.nodes?.length||!doc.meshes?.length||doc.buffers?.some((v:any)=>v.uri&&!v.uri.startsWith('data:')))return false;
  return doc.meshes.every((mesh:any)=>mesh.primitives?.length&&mesh.primitives.every((p:any)=>{
   const a=doc.accessors?.[p.attributes?.POSITION];return a&&a.count>=3&&a.type==='VEC3'&&a.min?.length===3&&a.max?.length===3&&[...a.min,...a.max].every(Number.isFinite)&&a.max.some((v:number,i:number)=>v>a.min[i]);
  }));
 }catch{return false;}
}
export async function verifiedGlb(data:Uint8Array):Promise<boolean>{
 if(!soundGlb(data))return false;
 try{return (await validateBytes(data,{maxIssues:100,externalResourceFunction:async()=>{throw new Error('External model resources are not curated');}})).issues.numErrors===0;}catch{return false;}
}
