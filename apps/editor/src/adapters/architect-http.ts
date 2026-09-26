/// <reference types="vite/client" />
import type {Room,StructureAdapter,Wall} from '../contracts';

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
function structureFrom(line:Record<string,unknown>):{rooms:Room[];walls:Wall[];notes:string[]}{
  const {rooms,walls,notes}=line;
  if(!Array.isArray(rooms)||!Array.isArray(walls))throw new ArchitectServiceError('The architect returned no rooms or walls.');
  // Full validation happens when the proposal is applied (store.execute validates the scene).
  return {rooms:rooms as Room[],walls:walls as Wall[],notes:Array.isArray(notes)?notes.map(String):[]};
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
