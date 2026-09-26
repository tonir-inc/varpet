import type {CatalogAsset} from '../../../apps/editor/src/contracts.js';

/** Refine only furniture functions with explicit catalog evidence and clearance
 * rules. Editable scene labels are not evidence. Native editor kinds win;
 * generic tables are never promoted to desks just from a marketing name. */
export function catalogFunction(asset: Pick<CatalogAsset,'kind'|'name'>): string {
  const name=asset.name.toLowerCase();
  if(['cabinet','table'].includes(asset.kind)&&/\bnight\s*stand\b|\bbedside\b/.test(name))return 'nightstand';
  if(asset.kind==='cabinet'&&/\bwardrobe\b|\barmoire\b/.test(name))return 'wardrobe';
  if(asset.kind==='table'&&/\bcoffee\b|\bcocktail\b/.test(name))return 'coffee_table';
  return asset.kind;
}
