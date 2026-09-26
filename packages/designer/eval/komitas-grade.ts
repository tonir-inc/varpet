/** Independent customer rubric; semantic subtypes come from catalog titles, not model intent. */
import {editorToDesigner} from '../src/editor-bridge.js';
import {checkLayout} from '../src/layout.js';
import {checkRequest} from '../src/request.js';
import type {Scene,Item} from '../src/scene.js';

export function semanticKind(asset:any):string {
  const name=asset.name.toLowerCase();
  if (['cabinet','table'].includes(asset.kind) && /night\s*stand|bedside/.test(name)) return 'nightstand';
  if (asset.kind==='cabinet' && /wardrobe|armoire/.test(name)) return 'wardrobe';
  if (asset.kind==='table' && /\bdesk\b|workstation/.test(name)) return 'desk';
  if (asset.kind==='table' && /coffee|cocktail/.test(name)) return 'coffee_table';
  return asset.kind;
}
export function warmWhite(color:string):boolean {
  if(!/^#[0-9a-f]{6}$/i.test(color))return false;
  const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  return r!>=230&&g!>=220&&b!>=205&&r!>=g!&&g!>=b!&&r!-b!>=3&&r!-b!<=35;
}
export function worsened(before:any[],after:any[]):any[] {
  const baseline=new Map(before.map(v=>[v.key,v.deficit]));
  return after.filter(v=>v.deficit>1e-6&&v.deficit>(baseline.get(v.key)??0)+1e-6);
}
export function budgetHeld(cost:number|null,limit:number):boolean {return cost!==null&&Number.isSafeInteger(cost)&&cost>=0&&cost<=limit;}
export const requests = [
  ['living','Furnish the living room'],
  ['bedroom','Furnish the bedroom: a double bed, two nightstands and a wardrobe'],
  ['sofa','Move the sofa so it faces the window'],
  ['desk','Add a desk by the window for working from home'],
  ['paint','Paint the bedroom walls warm white'],
  ['kids',"Furnish the second bedroom as a kids' room under 300,000 ֏"],
  ['structural','Knock down the wall between the kitchen and the living room'],
] as const;
export function roomRoles(scene:any) {
  const bedrooms=scene.rooms.filter((r:any)=>/bedroom|bed room|children|kids|nursery|ննջ|спаль|детск/i.test(r.name??''));
  return {living:scene.rooms.find((r:any)=>/living|հյուր|гостин/i.test(r.name??''))?.id,bedroom:bedrooms[0]?.id,kids:bedrooms[1]?.id};
}
export function groundTruthForFlat(truth:any,id:string):any {
  const rows=Array.isArray(truth)?truth:Array.isArray(truth.flats)?truth.flats:null;
  if(rows){const row=rows.find((row:any)=>row.id===id);if(!row)throw new Error(`Missing ground truth for ${id}`);return row;}
  return truth[id]??truth;
}
export function flatContext(scene:any,truth:any={}) {
  const roles={...roomRoles(scene),...(truth.room_roles??{})};
  const explicit=[truth.marketed_room_count,truth.room_count,truth.rooms_count,truth.rooms].find(v=>typeof v==='number');
  const inferred=scene.rooms.filter((r:any)=>/living|bedroom|bed room|children|kids|nursery|հյուր|ննջ|гостин|спаль|детск/i.test(r.name??'')).length;
  const count=explicit??inferred;
  return {roles,marketed_room_count:count,kids_required:count>=3,eligibility_basis:explicit===undefined?'assumed from named living/bedrooms':'ground truth room count'};
}
function deficits(scene:Scene) {
  const result=checkLayout(scene),m=result.metrics!;
  return [
    ...m.function_clearances.map(v=>({key:`clearance:${v.item_id}:${v.function}:${v.side}:${v.other_item_id??''}`,deficit:Math.max(v.deficit_m,v.excess_m??0),measurement:v})),
    ...m.space.rooms.flatMap(r=>r.walkways.map(w=>({key:`walkway:${r.room_id}:${[w.from,w.to].sort().join(':')}`,deficit:w.reachable?Math.max(0,.75-w.width_m):.75,measurement:w}))),
  ];
}
export function facesWindow(scene:Scene,item:Item) {
  const angle=item.rot*Math.PI/180,front=[Math.sin(angle),-Math.cos(angle)];
  return scene.openings.filter(o=>o.kind==='window').some(o=>{
    const wall=scene.walls.find(w=>w.id===o.wall_id&&w.room_id===item.room_id);if(!wall)return false;
    const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
    const endpoint=(offset:number)=>[wall.a[0]+(wall.b[0]-wall.a[0])*offset/length-item.pos[0],wall.a[1]+(wall.b[1]-wall.a[1])*offset/length-item.pos[1]];
    const a=endpoint(o.offset),b=endpoint(o.offset+o.width),edge=[b[0]!-a[0]!,b[1]!-a[1]!];
    const cross=(u:number[],v:number[])=>u[0]!*v[1]!-u[1]!*v[0]!;
    const denominator=cross(front,edge);
    if(Math.abs(denominator)>1e-9){
      const distance=cross(a,edge)/denominator,along=cross(a,front)/denominator;
      if(distance>=0&&along>=0&&along<=1)return true;
    }
    // If the centre ray misses, the smallest angular error is at a span endpoint.
    return [a,b].some(v=>(front[0]!*v[0]!+front[1]!*v[1]!)/Math.hypot(...v)>=Math.cos(Math.PI/12));
  });
}
export function grade(kind:string,before:any,after:any,catalog:any[],reply:any,accepted:boolean|null,roles=roomRoles(before)) {
  const reasons:string[]=[],added=after.objects.filter((o:any)=>!before.objects.some((v:any)=>v.id===o.id));
  const charged=accepted&&reply.type==='proposal'?reply.proposal.command.operations.filter((op:any)=>op.type==='add').map((op:any)=>op.object):[];
  const purchases=charged.map((o:any)=>({object_id:o.id,...catalog.find(a=>a.id===o.assetId)}));
  const cost=purchases.every((a:any)=>Number.isSafeInteger(a.price))?purchases.reduce((n:number,a:any)=>n+a.price,0):null;
  const a=editorToDesigner(before,{catalog,catalogCurrency:'AMD',northDeg:0,groupPolicy:'move-together'}),b=editorToDesigner(after,{catalog,catalogCurrency:'AMD',northDeg:0,groupPolicy:'move-together'});
  // Restore only subtypes evidenced by catalog metadata, on private measurement copies.
  for(const scene of [a,b])for(const item of scene.items){
    const asset=catalog.find(asset=>asset.id===item.sku);if(asset)item.kind=semanticKind(asset);
  }
  const inventory=b.items.map(item=>({...item,semantic:semanticKind(catalog.find(asset=>asset.id===item.sku)??{kind:item.kind,name:item.name})}));
  const room=kind==='kids'?roles.kids:kind==='living'?roles.living:roles.bedroom;
  const inRoom=inventory.filter(item=>item.room_id===room),count=(type:string)=>inRoom.filter(i=>i.semantic===type).length;
  let requestMatch=false;
  if(kind==='structural') {
    const text=reply.message??'';
    requestMatch=reply.type==='decline'&&/can.?t|cannot|unable|not (?:able|remove|demolish|knock|wall (?:demolition|removal))|outside (?:my|the) scope/i.test(text)&&!/\bidiot|stupid\b/i.test(text)&&JSON.stringify(before)===JSON.stringify(after);
  } else if(reply.type==='proposal'&&accepted) {
    if(kind==='living')requestMatch=!!room&&count('sofa')>=1&&count('table')+count('coffee_table')>=1;
    if(kind==='bedroom')requestMatch=!!room&&inRoom.some(i=>i.semantic==='bed'&&i.size[0]>=1.35&&i.size[1]>=1.8)&&count('nightstand')===2&&count('wardrobe')===1&&count('bed')===1;
    if(kind==='sofa')requestMatch=inventory.some(i=>i.kind==='sofa'&&a.items.some(old=>old.id===i.id&&(JSON.stringify(old.pos)!==JSON.stringify(i.pos)||old.rot!==i.rot))&&facesWindow(b,i));
    if(kind==='desk')requestMatch=inventory.some(i=>i.semantic==='desk'&&added.some((o:any)=>o.id===i.id)&&checkRequest(b,b,[],{preferences:[{type:'near_window',item_id:i.id,max_distance_m:1.5}]},0).ok);
    if(kind==='paint') {const walls=b.walls.filter(w=>w.room_id===room&&!w.open);requestMatch=!!room&&walls.length>0&&walls.every(w=>warmWhite(w.color??''))&&walls.some(w=>a.walls.find(old=>old.id===w.id)?.color!==w.color);}
    if(kind==='kids')requestMatch=!!room&&count('bed')>=1&&count('desk')>=1&&inRoom.some(i=>['wardrobe','cabinet','shelf'].includes(i.semantic))&&budgetHeld(cost,300000);
  }
  if(kind!=='structural'&&reply.type!=='proposal')reasons.push(`outcome:${reply.type}`);
  if(accepted===false)reasons.push('editor_rejected');
  if(!requestMatch)reasons.push('request_mismatch');
  const measurementsBefore=deficits(a),measurementsAfter=deficits(b);
  const newFailures=worsened(measurementsBefore,measurementsAfter);
  if(newFailures.length)reasons.push('new_or_worsened_clearance');
  if(purchases.some((a:any)=>!a.id?.startsWith('abo:')))reasons.push('non_catalog_purchase');
  return {pass:reasons.length===0,request_match:requestMatch,reasons,editor_accepted:accepted,new_failures:newFailures,measurements_before:measurementsBefore,measurements_after:measurementsAfter,catalog_pieces:purchases,cost_dram:cost,inventory:inventory.map(i=>({id:i.id,room_id:i.room_id,kind:i.semantic}))};
}
