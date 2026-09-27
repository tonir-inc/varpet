import { flatsApi, type FlatMeta } from '../adapters/flats-http';
import { restoreApartment } from './session';
import type { SceneDocument } from '../contracts';
import type { CatalogProduct } from '../adapters/database-catalog';
export interface TeamStartup {scene:SceneDocument;catalog:CatalogProduct[];flat:FlatMeta}
export let teamStartup:TeamStartup|null=null;
export function setTeamStartup(startup:TeamStartup){teamStartup=startup;}
export async function restoreTeamFlat(id:string,api:Pick<typeof flatsApi,'get'>=flatsApi):Promise<TeamStartup>{
 const flat=await api.get(id);
 const restored=restoreApartment({ ...flat, scene:{...flat.scene,name:flat.name}, version:flat.revision,updatedAt:flat.updated_at,templateId:null });
 return {...restored,flat};
}
