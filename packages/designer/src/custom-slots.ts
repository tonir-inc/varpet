import { link, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CatalogAsset } from '../../../apps/editor/src/contracts.js';
import type { Op } from './scene.js';

const safeId=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/);
const dimension=z.number().finite().min(.05).max(10);
export const reserveSlotSchema=z.object({kind:z.enum(['cabinet','table','shelf']),size_wdh_m:z.tuple([dimension,dimension,dimension]),note:z.string().trim().min(1).max(1600)}).strict();
export const buildPieceSchema=z.object({slotId:z.string().regex(/^custom-[a-zA-Z0-9-]+-\d+$/).max(100)}).strict();
export interface SlotOptions {buildsDir:string;conversationId:string;turnId:string}
export interface CustomSlot {
  slotId:string;conversationId:string;turnId:string;source:'custom';kind:'cabinet'|'table'|'shelf';size_wdh_m:[number,number,number];note:string;
  asset:CatalogAsset;item:{id:string;sku:string;kind:string;name:string;size:[number,number,number];price:number;vendor:string};
  estimate:{amount_dram:number;price_source:'mock';basis:'assumed';label:string;rate_dram_per_m3:number};proposed:boolean;
}
async function readJson<T>(path:string):Promise<T>{return JSON.parse(await readFile(path,'utf8')) as T;}
async function atomic(path:string,value:unknown){const temporary=path+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value),{flag:'wx',mode:0o600});await rename(temporary,path);}
/** Per-conversation files survive MCP restarts; only service code sees this private directory. */
export class CustomSlots {
  private tail:Promise<unknown>=Promise.resolve();
  private searched=new Set<string>();
  constructor(private readonly options:SlotOptions){safeId.parse(options.conversationId);safeId.parse(options.turnId);}
  searchedCatalog(kind?:string){this.searched.add(kind??'*');}
  private async locked<T>(action:()=>Promise<T>):Promise<T>{const pending=this.tail.then(action);this.tail=pending.catch(()=>{});return pending;}
  private directory(name:string){return join(this.options.buildsDir,name);}
  private async list():Promise<CustomSlot[]>{
    await mkdir(this.directory('slots'),{recursive:true,mode:0o700});
    const names=(await readdir(this.directory('slots'))).filter(name=>/^custom-[a-zA-Z0-9-]+-\d+\.json$/.test(name));
    const slots=await Promise.all(names.map(name=>readJson<CustomSlot>(join(this.directory('slots'),name))));
    if(slots.some(slot=>slot.conversationId!==this.options.conversationId))throw new Error('Slot directory belongs to another conversation');
    return slots;
  }
  async reserve(input:unknown):Promise<CustomSlot>{return this.locked(async()=>{
    const request=reserveSlotSchema.parse(input);
    if(!this.searched.has(request.kind)&&!this.searched.has('*'))throw new Error('Search the catalog for this kind first; reserve only when no product fits size and style.');
    const slots=await this.list();
    if(slots.filter(slot=>slot.turnId===this.options.turnId).length>=3)throw new Error('At most three custom pieces per turn; use catalog products for the rest.');
    const next=1+Math.max(0,...slots.map(slot=>Number(slot.slotId.split('-').at(-1))));
    const slotId=`custom-${this.options.conversationId}-${next}`;
    const [w,d,h]=request.size_wdh_m;
    // Assumed sample rate, no local workshop quote. QUALITY can replace the estimate at this boundary.
    const rate=150000,price=Math.max(1,Math.round(w*d*h*rate)),name=`Custom ${request.kind}`;
    const asset:CatalogAsset={id:slotId,name,category:'Custom — workshop estimate',kind:request.kind,dimensions:[w,h,d],color:'#9299a3',price,source:{type:'procedural'}};
    const slot:CustomSlot={slotId,conversationId:this.options.conversationId,turnId:this.options.turnId,source:'custom',...request,asset,
      item:{id:slotId,sku:slotId,kind:request.kind,name,size:[w,d,h],price,vendor:'Example workshop — not a confirmed partner'},
      estimate:{amount_dram:price,price_source:'mock',basis:'assumed',rate_dram_per_m3:rate,label:'estimate, the workshop confirms'},proposed:false};
    await atomic(join(this.directory('slots'),slotId+'.json'),slot);return structuredClone(slot);
  });}
  async validateOps(ops:Op[]):Promise<CatalogAsset[]>{
    const slots=await this.list(),assets:CatalogAsset[]=[];
    for(const op of ops){if(op.type!=='add'||!op.item.sku?.startsWith('custom-'))continue;
      const slot=slots.find(candidate=>candidate.slotId===op.item.sku);
      if(!slot)throw new Error(`Unknown private custom slot ${op.item.sku}`);
      if(op.item.kind!==slot.kind||op.item.price!==slot.asset.price||op.item.size.some((size,i)=>Math.abs(size-slot.size_wdh_m[i]!)>1e-7))throw new Error(`Custom slot ${slot.slotId}: use its stored kind, size and estimate unchanged.`);
      if(assets.some(asset=>asset.id===slot.slotId))throw new Error('Reserve a separate slot for each custom piece.');
      assets.push(slot.asset);
    }
    return structuredClone(assets);
  }
  async markProposed(assets:CatalogAsset[]){await this.locked(async()=>{
    for(const asset of assets){const path=join(this.directory('slots'),asset.id+'.json'),slot=await readJson<CustomSlot>(path);await atomic(path,{...slot,proposed:true});}
  });}
  async queue(slotId:string){return this.locked(async()=>{
    buildPieceSchema.parse({slotId});const slot=(await this.list()).find(slot=>slot.slotId===slotId);
    if(!slot)throw new Error('Unknown slot in this conversation');
    if(slot.turnId!==this.options.turnId)throw new Error('Build only slots reserved in the current turn; reserve a new slot to retry an older piece.');
    if(!slot.proposed)throw new Error('Propose and pass the layout checks with this slot before building it.');
    await mkdir(this.directory('requests'),{recursive:true,mode:0o700});
    const path=join(this.directory('requests'),slotId+'.json');
    const temporary=path+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,JSON.stringify({slotId,conversationId:slot.conversationId,turnId:slot.turnId}),{flag:'wx',mode:0o600});
    try{await link(temporary,path);}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    finally{await unlink(temporary);}
    return {slotId,state:'queued' as const};
  });}
}
