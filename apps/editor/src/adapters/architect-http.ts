/// <reference types="vite/client" />
import type {CatalogAsset,EntityMetadata,Room,StructureAdapter,Wall} from '../contracts';
import {demoScene} from '../core/demo';
import {emptyProject} from '../core/renovation';
import {validateScene} from '../core/validation';

/**
 * The architect service (harness: `uv run varpet-harness serve`) reads a developer plan and a few photos
 * into rooms and walls. It streams newline-delimited JSON: progress lines, then one structure or error.
 * The result is only a proposal; main.ts shows it for review before anything is applied.
 */
export interface ArchitectHttpOptions {
  url?:string;
  onProgress?:(message:string)=>void;
  /** Supplies the plan and photos; defaults to a file picker (a file whose name contains "plan" is the plan). */
  pickFiles?:()=>Promise<File[]>;
  fetch?:typeof globalThis.fetch;
}
export class ArchitectServiceError extends Error {readonly name='ArchitectServiceError';}
const MAX_PHOTOS=4,MAX_FILE=12_000_000;

export function pickImages():Promise<File[]>{
  return new Promise((resolve,reject)=>{
    const input=document.createElement('input');
    input.type='file';input.accept='image/*';input.multiple=true;
    input.onchange=()=>resolve([...input.files??[]]);
    input.oncancel=()=>reject(new DOMException('No plan chosen.','AbortError'));
    input.click();
  });
}
export function splitPlan(files:File[]):{plan:File;photos:File[]}{
  if(!files.length)throw new ArchitectServiceError('Choose a floor plan image, and optionally up to four photos.');
  const plan=files.find(file=>/plan/i.test(file.name))??files[0]!;
  return {plan,photos:files.filter(file=>file!==plan).slice(0,MAX_PHOTOS)};
}
async function encode(file:File):Promise<{name:string;data:string}>{
  if(file.size>MAX_FILE)throw new ArchitectServiceError(`${file.name} is larger than 12 MB.`);
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return {name:file.name,data:btoa(binary)};
}
function structureFrom(line:Record<string,unknown>):Awaited<ReturnType<StructureAdapter['reconstruct']>>{
  const {rooms,walls,notes,metadata}=line;
  if(!Array.isArray(rooms)||!Array.isArray(walls))throw new ArchitectServiceError('The architect returned no rooms or walls.');
  const result={rooms:rooms as Room[],walls:walls as Wall[],notes:Array.isArray(notes)?notes.map(String):[],
    ...(metadata===undefined?{}:{metadata:metadata as Record<string,EntityMetadata>})};
  // Reuse the editor's metadata bounds and entity-reference checks on this empty shell.
  const checked=validateScene({
    format:'varpet.editor',version:2,id:'architect-structure',name:'Reconstructed apartment',units:'m',upAxis:'Y',
    rooms:result.rooms,walls:result.walls,objects:[],
    project:{...emptyProject(),metadata:metadata===undefined?{}:result.metadata!},
  },[]);
  if(!checked.ok)throw new ArchitectServiceError(`The architect returned an invalid structure: ${checked.errors.join(' ')}`);
  return result;
}

/**
 * Pieces the architect built from photos, as catalog assets with GLB sources (newest run unless named).
 * Register returned products through the editor catalog path before placement.
 */
export async function builtPieces(options:{url?:string;run?:string;fetch?:typeof globalThis.fetch}={}):Promise<{run:string;assets:CatalogAsset[]}>{
  const base=(options.url??import.meta.env.VITE_ARCHITECT_URL??'http://127.0.0.1:8788').replace(/\/$/,'');
  const request=options.fetch??globalThis.fetch.bind(globalThis);
  let run=options.run;
  if(!run){
    const runs=await (await request(`${base}/runs`)).json() as {run:string;pieces:number}[];
    if(!Array.isArray(runs)||!runs.length)throw new ArchitectServiceError('The architect has not built any pieces yet.');
    run=runs[0]!.run;
  }
  const response=await request(`${base}/pieces?run=${encodeURIComponent(run)}`);
  if(!response.ok)throw new ArchitectServiceError(`No built pieces for ${run} (HTTP ${response.status}).`);
  const assets=await response.json() as CatalogAsset[];
  if(!Array.isArray(assets))throw new ArchitectServiceError('The architect returned no piece list.');
  return {run,assets};
}

export function createArchitectHttpAdapter(options:ArchitectHttpOptions={}):StructureAdapter{
  const base=(options.url??import.meta.env.VITE_ARCHITECT_URL??'http://127.0.0.1:8788').replace(/\/$/,'');
  const request=options.fetch??globalThis.fetch.bind(globalThis);
  return {
    async reconstruct(signal){
      const {plan,photos}=splitPlan(await (options.pickFiles??pickImages)());
      options.onProgress?.(`Sending ${plan.name} and ${photos.length} photo${photos.length===1?'':'s'} to the architect`);
      const body=JSON.stringify({plan:await encode(plan),photos:await Promise.all(photos.map(encode))});
      const response=await request(`${base}/structure`,{method:'POST',headers:{'Content-Type':'application/json'},body,signal});
      if(!response.ok||!response.body)throw new ArchitectServiceError(`Architect service answered HTTP ${response.status}.`);
      const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer='';
      for(;;){
        const {value,done}=await reader.read();
        buffer+=value??'';
        let cut:number;
        while((cut=buffer.indexOf('\n'))>=0){
          const raw=buffer.slice(0,cut).trim();buffer=buffer.slice(cut+1);
          if(!raw)continue;
          const line=JSON.parse(raw) as Record<string,unknown>;
          if(line.type==='progress')options.onProgress?.(String(line.message));
          else if(line.type==='structure')return structureFrom(line);
          else if(line.type==='error')throw new ArchitectServiceError(String(line.message));
        }
        if(done)throw new ArchitectServiceError('The architect service closed without a structure.');
      }
    },
  };
}

/**
 * Legacy startup merge for consumers with a fixed catalog. The interactive editor registers built
 * products at runtime instead. Any failure keeps the base catalog and warns in the console.
 */
export async function withBuiltPieces(base:CatalogAsset[],url?:string,run?:string,fetcher?:typeof globalThis.fetch):Promise<CatalogAsset[]>{
  if(!url?.trim())return base;
  try{
    const {assets}=await builtPieces({url,run:run?.trim()||undefined,fetch:fetcher});
    const merged=[...base.filter(asset=>!assets.some(built=>built.id===asset.id)),...assets];
    const checked=validateScene(demoScene,merged);
    if(!checked.ok)throw new Error(checked.errors.join(' '));
    return merged;
  }catch(error){
    console.warn('Built pieces unavailable, using the catalog without them',error);
    return base;
  }
}

/**
 * Scene loading: ids starting "built-" are pieces the architect built from photos; they resolve from the
 * architect service, everything else from the catalog database as before.
 */
export function withBuiltPieceResolver<P>(resolve:(ids:string[])=>Promise<P[]>,wrap:(asset:CatalogAsset)=>P,url?:string,fetcher?:typeof globalThis.fetch):(ids:string[])=>Promise<P[]>{
  return async ids=>{
    const built=ids.filter(id=>id.startsWith('built-'));
    const others=await resolve(ids.filter(id=>!id.startsWith('built-')));
    if(!built.length)return others;
    const base=(url??import.meta.env.VITE_ARCHITECT_URL??'http://127.0.0.1:8788').replace(/\/$/,'');
    const request=fetcher??globalThis.fetch.bind(globalThis);
    const runs=await (await request(`${base}/runs`)).json() as {run:string}[];
    const found=new Map<string,CatalogAsset>();
    for(const {run} of runs.filter(({run})=>built.some(id=>id.startsWith(`built-${run}-`)))){
      const {assets}=await builtPieces({url:base,run,fetch:request});
      for(const asset of assets)found.set(asset.id,asset);
    }
    const missing=built.filter(id=>!found.has(id));
    if(missing.length)throw new ArchitectServiceError(`The architect service does not have ${missing.join(', ')}.`);
    return [...others,...built.map(id=>wrap(found.get(id)!))];
  };
}
