import {searchCatalog,type CatalogQuery,type CatalogProduct} from '../catalog.js';
import {roomPrograms} from '../../knowledge/room-programs.js';
import {styles,stylePalette,styleMatches} from '../../knowledge/styles/index.js';
export async function searchRoomCatalog(program:string,styleIds:string[],query?:CatalogQuery,fitForComposition=false){
 const knowledge=roomPrograms[program];if(!knowledge)throw new Error(`Unknown room program: ${program}`);
 for(const id of styleIds)if(!styles[id])throw new Error(`Unknown style: ${id}`);
 const palette=stylePalette(styleIds);
 const lookup=async(kind:string)=>{
  const fit:Record<string,object>={sofa:{max_w:2.8,max_d:1.2},chair:{max_w:1.1,max_d:1.15},table:{max_w:1.5,max_d:.85,max_h:.6},lamp:{max_w:.65,max_d:.65},shelf:{max_w:1.4,max_d:.5}};
  const terms:Record<string,string>={rug:'large area rug 8 feet',lamp:'floor lamp',table:'coffee table',sofa:'upholstered sofa',chair:'upholstered accent chair',shelf:'bookcase shelf'};
  const primary=styleIds.includes('classic')?'Traditional':styleIds.includes('boho')?'Bohemian':styleIds.includes('industrial')?'Industrial':'Modern';
  const result=await searchCatalog({kind,styles:[primary],text:program==='bedroom'?({table:'nightstand bedside table',bed:'platform bed',cabinet:'wardrobe',lamp:'floor lamp'} as Record<string,string>)[kind]??terms[kind]:terms[kind],...(program==='living'&&fitForComposition?fit[kind]:{}),limit:20},query);
  const products=result.results.filter(p=>!styleIds.length||(styleMatches([...p.styles,...p.styles_inferred??[]],styleIds)&&p.colors_image.some(c=>palette.includes(c.toLowerCase()))));
  products.sort((a,b)=>Number(b.size_status==='confirmed')-Number(a.size_status==='confirmed'));
  return {kind,result,products};
 };
 const groups:Awaited<ReturnType<typeof lookup>>[]=[];
 for(let i=0;i<knowledge.search_kinds.length;i+=2)groups.push(...await Promise.all(knowledge.search_kinds.slice(i,i+2).map(lookup)));
 const products:Record<string,CatalogProduct[]>=Object.fromEntries(groups.map(g=>[g.kind,g.products]));
 return {program,styles:styleIds,palette,products,missing_kinds:groups.filter(g=>!g.products.length).map(g=>g.kind),unavailable_kinds:groups.filter(g=>g.result.status==='unavailable').map(g=>g.kind),note:'Catalog styles and colors_image are required evidence. Empty matches are gaps, not permission to substitute unrelated products. Confirmed dimensions rank first; prices retain their catalog provenance.'};
}
