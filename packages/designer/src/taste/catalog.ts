import {searchCatalog,type CatalogQuery,type CatalogProduct} from '../catalog.js';
import {roomPrograms} from '../../knowledge/room-programs.js';
import {styles,stylePalette,styleMatches} from '../../knowledge/styles/index.js';
export async function searchRoomCatalog(program:string,styleIds:string[],query?:CatalogQuery){
 const knowledge=roomPrograms[program];if(!knowledge)throw new Error(`Unknown room program: ${program}`);
 for(const id of styleIds)if(!styles[id])throw new Error(`Unknown style: ${id}`);
 const palette=stylePalette(styleIds),tags=[...new Set(styleIds.flatMap(id=>styles[id]!.catalog_styles))];
 const groups=await Promise.all(knowledge.search_kinds.map(async kind=>{
  const result=await searchCatalog({kind,styles:tags,colors:palette,limit:20},query);
  const products=result.results.filter(p=>!styleIds.length||(styleMatches(p.styles,styleIds)&&p.colors_image.some(c=>palette.includes(c.toLowerCase()))));
  products.sort((a,b)=>Number(b.size_status==='confirmed')-Number(a.size_status==='confirmed')||a.sku.localeCompare(b.sku));
  return {kind,result,products};
 }));
 const products:Record<string,CatalogProduct[]>=Object.fromEntries(groups.map(g=>[g.kind,g.products]));
 return {program,styles:styleIds,palette,products,missing_kinds:groups.filter(g=>!g.products.length).map(g=>g.kind),unavailable_kinds:groups.filter(g=>g.result.status==='unavailable').map(g=>g.kind),note:'Catalog styles and colors_image are required evidence. Empty matches are gaps, not permission to substitute unrelated products. Confirmed dimensions rank first; prices retain their catalog provenance.'};
}
