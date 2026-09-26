import type {CatalogAsset} from '../../../apps/editor/src/contracts.js';
import {catalogProduct} from '../../../apps/editor/src/adapters/database-catalog.js';
import {createHttpCatalogItems} from '../src/catalog.js';
/** Mirror editor by-id hydration at the eval boundary; preserve registered identities. */
export async function proposalCatalog(proposal:any,catalog:CatalogAsset[],fetchItems:(ids:string[])=>Promise<unknown[]>=createHttpCatalogItems({url:'http://localhost:8765/mcp'})):Promise<CatalogAsset[]> {
  const known=new Set(catalog.map(a=>a.id));
  const missing:string[]=[...new Set<string>(proposal.command.operations.filter((op:any)=>op.type==='add').map((op:any)=>String(op.object.assetId)).filter((id:string)=>!known.has(id)))];
  if(!missing.length)return catalog;
  const records=await fetchItems(missing);
  const found=records.map(catalogProduct).flatMap(p=>p&&missing.includes(p.asset.id)?[p.asset]:[]);
  if(missing.some(id=>!found.some(a=>a.id===id)))throw new Error('Proposed catalog product unavailable');
  return [...catalog,...found];
}
