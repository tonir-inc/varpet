/** Catalog evidence is independent of generator output and joined only on exact SKU. */
export async function enrichTasteEvidence(metadata:Record<string,any>,ids:readonly string[],query:(name:string,args:Record<string,any>)=>Promise<any>,save:()=>void=()=>{}){
 const missing=ids.filter(id=>!metadata[id]);
 for(let i=0;i<missing.length;i+=4){
  await Promise.all(missing.slice(i,i+4).map(async id=>{metadata[id]=await query('get_item',{item_id:id});}));save();
 }
 // Compute after fetching: new products also need image-derived style evidence on this pass.
 const missingStyles=Object.entries(metadata).filter(([,m])=>m.styles_inferred===undefined&&m.style_astra===undefined);
 for(const [id,m] of missingStyles){
  const found=await query('search_furniture',{kind:m.kind,text:m.name,limit:20});
  const exact=found.results?.find((r:any)=>r.id===id);
  if(exact)metadata[id]={...m,styles_inferred:exact.style_astra??[],style_evidence:'search_furniture.style_astra (inferred)'};
  save();
 }
}
