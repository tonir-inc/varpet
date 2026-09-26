/** Curated design priors, not measured customer preferences. Catalog tags remain evidence. */
export interface StyleKnowledge {
  aliases: string[]; catalog_styles: string[]; colors: string[];
  composition?: {program:string;identity_styles:string[];roles:Record<string,{catalog_styles:string[];search_style:string}>;signatures:{kind:string;catalog_styles:string[];count:number}[]};
  piece_count: {living: [number,number]; bedroom: [number,number]};
  anchor: string; materials: string[]; textiles: string[]; lighting: string[];
}
export const styles: Record<string,StyleKnowledge> = {
  minimalist: {aliases:['minimalist','minimalistic','minimalism'],catalog_styles:['Minimalist','Scandinavian','Modern','Contemporary'],colors:['white','beige','grey','black','brown'],piece_count:{living:[5,8],bedroom:[5,7]},anchor:'One generous, simple sofa; fewer complete groups, never an empty room',materials:['light wood','matte finishes','linen'],textiles:['one large quiet rug','soft upholstery'],lighting:['diffuse ambient light','one reading light per seating zone']},
  cozy: {aliases:['cozy','cosy','hygge'],catalog_styles:['Scandinavian','Modern','Transitional','Rustic','Contemporary'],colors:['beige','white','brown','grey','green'],piece_count:{living:[6,10],bedroom:[5,9]},anchor:'Inviting upholstered sofa or intimate facing seats',materials:['warm wood','wool','linen'],textiles:['large soft rug','tactile upholstery','layered throws when supported'],lighting:['warm diffuse light','reachable reading lamps','avoid a single harsh overhead source']},
  scandinavian: {aliases:['scandinavian','scandi','nordic'],catalog_styles:['Scandinavian','Mid-Century Modern','Modern'],colors:['white','beige','grey','brown','green'],piece_count:{living:[6,9],bedroom:[5,8]},anchor:'Light upholstered sofa with visible wood legs',materials:['pale oak','ash','wool'],textiles:['light woven rug','linen upholstery'],lighting:['soft shaded floor lamp','daylight with low furniture']},
  modern: {aliases:['modern','contemporary'],catalog_styles:['Modern','Contemporary','Mid-Century Modern'],colors:['white','black','grey','beige','brown'],piece_count:{living:[5,9],bedroom:[5,8]},anchor:'Clean-lined sofa and a defined focal shelf',materials:['wood','metal','glass'],textiles:['plain or geometric rug','solid upholstery'],lighting:['sculptural floor lamp','layered task light']},
  classic: {aliases:['classic','traditional'],catalog_styles:['Traditional','Classic','Transitional'],colors:['beige','brown','white','blue','red'],piece_count:{living:[6,10],bedroom:[5,9]},anchor:'Balanced upholstered sofa with paired supporting pieces',materials:['dark wood','brass','velvet'],textiles:['patterned rug','rich upholstery'],lighting:['paired shaded lamps','warm ambient light']},
  japandi: {aliases:['japandi'],catalog_styles:['Scandinavian','Minimalist','Modern','Asian'],colors:['beige','brown','white','black','grey'],piece_count:{living:[5,8],bedroom:[5,7]},anchor:'Low quiet sofa, natural wood focal storage',materials:['oak','walnut','linen','bamboo'],textiles:['natural flatweave rug','textured neutral upholstery'],lighting:['diffuse shaded light','low glare reading lamp']},
  industrial: {composition:{program:'living',identity_styles:['Industrial'],roles:{
    sofa:{catalog_styles:['Industrial','Modern','Rustic'],search_style:'Industrial'},
    chair:{catalog_styles:['Modern','Rustic'],search_style:'Modern'},
    rug:{catalog_styles:['Modern','Rustic'],search_style:'Modern'},
    lamp:{catalog_styles:['Industrial','Modern'],search_style:'Modern'},
    table:{catalog_styles:['Industrial'],search_style:'Industrial'},
    shelf:{catalog_styles:['Industrial'],search_style:'Industrial'},
  },signatures:[{kind:'table',catalog_styles:['Industrial'],count:1},{kind:'shelf',catalog_styles:['Industrial'],count:1}]},aliases:['industrial','loft'],catalog_styles:['Industrial','Rustic','Modern'],colors:['black','brown','grey','beige'],piece_count:{living:[5,9],bedroom:[5,8]},anchor:'Substantial upholstered or leather sofa softened by a rug',materials:['black steel','reclaimed wood','leather'],textiles:['large textured rug','soft seating to balance metal'],lighting:['metal reading lamp','warm rather than bare harsh light']},
  boho: {composition:{program:'living',identity_styles:['Bohemian'],roles:{
    sofa:{catalog_styles:['Modern','Rustic','Bohemian'],search_style:'Modern'},
    chair:{catalog_styles:['Modern','Rustic','Bohemian'],search_style:'Rustic'},
    rug:{catalog_styles:['Bohemian'],search_style:'Bohemian'},
    lamp:{catalog_styles:['Modern','Rustic','Bohemian'],search_style:'Modern'},
    table:{catalog_styles:['Rustic','Bohemian'],search_style:'Rustic'},
    shelf:{catalog_styles:['Rustic','Bohemian'],search_style:'Rustic'},
  },signatures:[{kind:'rug',catalog_styles:['Bohemian'],count:1},{kind:'shelf',catalog_styles:['Rustic','Bohemian'],count:1}]},aliases:['boho','bohemian'],catalog_styles:['Bohemian','Boho','Eclectic','Rustic'],colors:['beige','brown','green','orange','red','white'],piece_count:{living:[6,11],bedroom:[5,10]},anchor:'Relaxed upholstered sofa with one woven accent seat',materials:['rattan','wood','cotton','jute'],textiles:['patterned woven rug','tactile mixed fabrics in one palette'],lighting:['woven or shaded lamps','warm pools of light']},
};
export function resolveStyles(text:string):string[] {
 const words=text.toLowerCase();
 return Object.entries(styles).filter(([,style])=>style.aliases.some(alias=>new RegExp(`\\b${alias}\\b`,'i').test(words))).map(([id])=>id);
}
export function stylePalette(ids:readonly string[]):string[] {
 const selected=ids.map(id=>styles[id]).filter((s):s is StyleKnowledge=>!!s);
 if(!selected.length)return [];
 return selected[0]!.colors.filter(color=>selected.every(style=>style.colors.includes(color)));
}
export function styleMatches(tags:readonly string[],ids:readonly string[]):boolean {
 const families=styleFamilies(tags);
 return ids.length>0&&ids.every(id=>styles[id]&&styleFamilies(styles[id]!.catalog_styles).some(family=>families.includes(family)));
}
/** Compatible furniture families; unrelated color/type tags are never styles. */
export function styleFamilies(tags:readonly string[]):string[]{
 return [...new Set(tags.flatMap(tag=>{
  const t=tag.trim().toLowerCase();
  if(['modern','modern/casual','contemporary','scandinavian','minimalist','mid-century modern','mid century modern','mid-century','modern/sleek','asian'].includes(t))return ['modern'];
  if(['classic','traditional','transitional'].includes(t))return ['classic'];
  if(['bohemian','boho','eclectic'].includes(t))return ['boho'];
  if(['industrial'].includes(t))return ['industrial'];
  if(['rustic','farmhouse'].includes(t))return ['rustic'];
  return [];
 }))];
}

/** Supporting neutral pieces are allowed only by an explicit role recipe, never by product names. */
export function styleMatchesKind(kind:string,tags:readonly string[],ids:readonly string[],program='living'):boolean {
 const families=styleFamilies(tags);
 return ids.length>0&&ids.every(id=>{
  const style=styles[id];if(!style)return false;
  const recipe=style.composition?.program===program?style.composition:undefined;
  return styleFamilies(recipe?.roles[kind]?.catalog_styles??style.catalog_styles).some(f=>families.includes(f));
 });
}
export function searchStyleForKind(kind:string,ids:readonly string[],program='living'):string {
 const role=ids.map(id=>styles[id]?.composition?.program===program?styles[id]!.composition!.roles[kind]:undefined).find(Boolean);
 return role?.search_style??(ids.includes('classic')?'Traditional':ids.includes('boho')?'Bohemian':ids.includes('industrial')?'Industrial':'Modern');
}
