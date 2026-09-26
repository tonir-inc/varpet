import {searchCatalog,mapLimited,CATALOG_CONCURRENCY,type CatalogQuery,type CatalogInput} from './catalog.js';
import {searchRoomCatalog} from './taste/catalog.js';
import {resolveStyles,styleMatchesKind,stylePalette} from '../knowledge/styles/index.js';

/** Supplemental searches change only fit/price bounds, never catalog sizes or IDs. */
export async function roomCatalog(program:string,style:string|undefined,budget:number|undefined,query?:CatalogQuery){
 const explicit=resolveStyles(style??''),ids=explicit.length?explicit:['modern'];
 const base=await searchRoomCatalog(program,ids,query,true,budget);
 const requests:CatalogInput[]=program==='living'?[
  {kind:'table',text:'small round coffee cocktail table',max_w:.8,max_d:.8,max_h:.6},
  {kind:'table',text:'compact side end table',max_w:.45,max_d:.45,max_h:.65},
  {kind:'cabinet',text:'TV stand media console',max_w:1.5,max_d:.5,max_h:.9},
 ]:program==='bedroom'?[
  {kind:'bed',text:'compact double full bed',max_w:1.5,max_d:2.05,allow_rotate:false},
  {kind:'nightstand',text:'narrow bedside nightstand',max_w:.35,max_d:.4,max_h:.7,allow_rotate:false},
  {kind:'nightstand',text:'compact bedside nightstand',max_w:.45,max_d:.4,max_h:.7},
  {kind:'lamp',text:'small floor reading lamp',max_w:.25,max_d:.25},
  // Table lamps stand on the nightstands (furniture support), leaving the bedside floor free.
  {kind:'lamp',text:'bedside table lamp',max_w:.35,max_d:.35,max_h:.7},
 ]:program==='kids'&&budget!==undefined?[
  {kind:'bed',text:'single twin bed',max_w:1.2,max_d:2.2,price_max:Math.floor(budget*.62)},
  {kind:'desk',text:'writing study desk',max_w:1.2,max_d:.65,price_max:Math.floor(budget*.3)},
  {kind:'chair',text:'child study chair',max_w:.6,max_d:.65,price_max:Math.floor(budget*.08)},
  {kind:'shelf',text:'small book storage',max_w:1,max_d:.45,price_max:Math.floor(budget*.08)},
  {kind:'lamp',text:'small reading lamp',max_w:.3,max_d:.3,price_max:Math.floor(budget*.04)},
  {kind:'lamp',text:'desk table lamp',max_w:.35,max_d:.4,max_h:.7,price_max:Math.floor(budget*.07)},
 ]:program==='balcony'?[
  {kind:'chair',text:'outdoor patio bistro chair',max_w:.6,max_d:.65},
  {kind:'bench',text:'small bench',max_w:1.2,max_d:.45},
  {kind:'table',text:'small round side table',max_w:.6,max_d:.6,max_h:.8},
  {kind:'plant',text:'potted plant',max_w:.45,max_d:.45},
 ]:[];
 const extra=await mapLimited(requests,CATALOG_CONCURRENCY,async input=>({input,result:await searchCatalog({...input,limit:20,...explicit.length?{styles:ids}:{},...budget!==undefined?{price_max:Math.min(input.price_max??budget,budget)}:{}},query)}));
 const palette=stylePalette(ids);
 for(const {input,result} of extra){
  const pool=base.products[input.kind!]??=[];
  for(const p of result.results){
   if(explicit.length&&(!styleMatchesKind(p.kind,[...p.styles,...p.styles_inferred??[]],ids,program)||!p.colors_image.some(c=>palette.includes(c.toLowerCase()))))continue;
   if(!pool.some(v=>v.sku===p.sku))pool.push(p);
  }
 }
 return {...base,compact_searches:extra.map(({input,result})=>({input,status:result.status,returned:result.results.length})),style_basis:explicit.length?'customer':'modern preference; compact alternatives may use other catalog styles'};
}
