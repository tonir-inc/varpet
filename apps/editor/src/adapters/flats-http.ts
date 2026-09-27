import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from './database-catalog';
export type FlatKind = 'template' | 'upload' | 'blank' | 'other';
export interface FlatMeta { id: string; name: string; kind: FlatKind; designed: boolean; summary: Record<string, unknown>; revision: number; created_at: string; updated_at: string; updated_by?: string; has_thumbnail: boolean }
export interface Flat extends FlatMeta {scene: SceneDocument; catalog: CatalogProduct[]}
export interface FlatSnapshot {scene: SceneDocument; catalog: CatalogProduct[]; designed?: boolean; summary?: Record<string, unknown>; thumbnail?: string; updated_by?: string}
export interface FlatVersion {revision: number; saved_at: string; bytes: number; updated_by?: string}
export class FlatsError extends Error {
 constructor(public status: number, public details: Record<string, unknown>) {super(typeof details.message === 'string' ? details.message : `Team save failed (${status})`);}
}
const validId = (id: string) => {if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id))throw new Error('Invalid flat ID.');return id;};
const validRevision = (n: number) => {if(!Number.isSafeInteger(n)||n<1)throw new Error('Invalid revision.');return n;};
export function createFlatsApi(fetcher: typeof fetch = fetch) {
 async function request<T>(path: string, method='GET', body?: unknown): Promise<T> {
  const response=await fetcher(`/api/flats${path}`,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(35000)});
  if(response.status===204)return undefined as T;
  const data=await response.json();
  if(!response.ok)throw new FlatsError(response.status,data.error??{message:'Invalid team save response.'});
  return data as T;
 }
 return {
  list:async()=> (await request<{flats:FlatMeta[]}>('?include_deleted=0')).flats,
  create:(body:FlatSnapshot & {name:string;kind:FlatKind})=>request<FlatMeta>('','POST',body),
  get:(id:string)=>request<Flat>(`/${validId(id)}`),
  save:(id:string,body:FlatSnapshot & {base_revision:number})=>request<{revision:number;updated_at:string}>(`/${validId(id)}`,'PUT',{...body,base_revision:validRevision(body.base_revision)}),
  rename:(id:string,name:string)=>request<FlatMeta>(`/${validId(id)}`,'PATCH',{name}),
  delete:(id:string)=>request<void>(`/${validId(id)}`,'DELETE'),
  versions:async(id:string)=>(await request<{versions:FlatVersion[]}>(`/${validId(id)}/versions`)).versions,
  version:(id:string,revision:number)=>request<Pick<Flat,'scene'|'catalog'|'revision'>>(`/${validId(id)}/versions/${validRevision(revision)}`),
  restore:(id:string,revision:number)=>request<{revision:number}>(`/${validId(id)}/restore`,'POST',{revision:validRevision(revision)}),
  thumbnail:(id:string)=>`/api/flats/${validId(id)}/thumbnail`,
 };
}
export const flatsApi=createFlatsApi();
