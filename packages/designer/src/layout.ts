import { applyOps } from './adapter.js';
import { checkLocalLayout } from './local-checks.js';
import { functionClearances, type FunctionClearance } from './metrics/function.js';
import { spaceMetrics, type SpaceMetrics } from './metrics/space.js';
import { sun, type SunResult } from './metrics/sun.js';
import type { Op, Scene, Vec2 } from './scene.js';

export interface LayoutIssue {
  check: string; severity: 'hard'|'soft'; message: string; item_ids: string[]; at: Vec2;
  deficit_m?: number; overlap_depth_m?: number;
  /** If true, at is only a finite serialization sentinel, not a measured location. */
  location_unknown?: true;
}
export interface LayoutPrice {
  cost_dram:number|null; currency:'AMD'; basis:'incremental_purchases'; errors:LayoutIssue[];
}
export interface LayoutMetrics {
  space:SpaceMetrics; daylight:SunResult; function_clearances:FunctionClearance[]; cost_dram:number|null;
}
export interface CheckStatus {
  check:string; status:'passed'|'failed'|'warning'|'unavailable'; reason?:string;
}
export interface LayoutCheck {
  ok:boolean; errors:LayoutIssue[]; checks:CheckStatus[]; price:LayoutPrice; metrics?:LayoutMetrics;
}
const engine:CheckStatus={check:'engine',status:'unavailable',reason:'Engine scene, check and price APIs are unavailable; local temporary-scene checks run instead.'};

function location(point:unknown):Pick<LayoutIssue,'at'|'location_unknown'> {
  return Array.isArray(point)&&point.length===2&&point.every(value=>typeof value==='number'&&Number.isFinite(value))
    ? {at:[point[0],point[1]]} : {at:[0,0],location_unknown:true};
}

function operationLocation(scene:Scene,ops:readonly Op[],message:string):Pick<LayoutIssue,'at'|'location_unknown'|'item_ids'> {
  const candidates=Array.isArray(ops)?ops.filter(op=>op&&typeof op==='object').map(op=>({
    id:op.type==='add'?op.item?.id:op.id,
    pos:op.type==='add'?op.item?.pos:op.type==='move'?op.pos:undefined,
  })):[];
  const candidate=candidates.find(candidate=>typeof candidate.id==='string'&&message.includes(candidate.id))??(candidates.length===1?candidates[0]:undefined);
  const target=[...(scene.items??[]),...(scene.fixed??[])].find(item=>item.id===candidate?.id);
  const proposed=location(candidate?.pos),actual=location(target?.pos);
  return {...(proposed.location_unknown?actual:proposed),item_ids:typeof candidate?.id==='string'?[candidate.id]:[]};
}

/** Charge every add, even if later removed; owned removals never create an assumed refund. */
export function layoutPrice(ops:readonly Op[]):LayoutPrice {
  const errors:LayoutIssue[]=[],adds=Array.isArray(ops)?ops.filter(op=>op && op.type==='add'):[];
  let total=0;
  for(const op of adds) {
    const value=op.item?.price;
    if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0) errors.push({check:'price',severity:'hard',item_ids:typeof op.item?.id==='string'?[op.item.id]:[],...location(op.item?.pos),message:`${op.item?.id??'Added item'} needs a known, whole, nonnegative dram purchase price`});
    else total+=value;
  }
  if(!Number.isSafeInteger(total)) errors.push({check:'price',severity:'hard',item_ids:[],...location(undefined),message:'Purchase total exceeds the safe whole-dram numeric range'});
  return {cost_dram:errors.length?null:total,currency:'AMD',basis:'incremental_purchases',errors};
}

function metrics(scene:Scene,cost:number|null,space?:SpaceMetrics):LayoutMetrics {
  return {space:space??spaceMetrics(scene),daylight:sun(scene),function_clearances:functionClearances(scene),cost_dram:cost};
}

/** Preview only: all mutations pass through the adapter's validated copy. Soft guidance does not fail ok. */
export function checkLayout(scene:Scene,ops:readonly Op[]=[]):LayoutCheck {
  const price=layoutPrice(ops);
  let after:Scene;
  try { after=applyOps(scene,ops); }
  catch(error) {
    const message=error instanceof Error?error.message:String(error);
    const issue:LayoutIssue={check:'operations',severity:'hard',message,...operationLocation(scene,ops,message)};
    return {ok:false,errors:[issue,...price.errors],checks:[{check:'operations',status:'failed'},engine],price};
  }
  const local=checkLocalLayout(after),scored=metrics(after,price.cost_dram,local.metrics);
  const errors:LayoutIssue[]=local.errors.map(error=>({
    ...error,check:error.check==='inside'?'containment':error.check==='overlap'?'collision':error.check,severity:'hard',
    ...(error.check==='overlap'?{overlap_depth_m:error.deficit_m}:{}),
  }));
  errors.push(...price.errors);
  for(const metric of scored.function_clearances) if(metric.status==='warn') errors.push({check:'function_clearance',severity:'soft',item_ids:[metric.item_id,...metric.other_item_id?[metric.other_item_id]:[]],at:metric.at,deficit_m:metric.deficit_m,
    message:`${metric.item_id} ${metric.function} ${metric.side}: ${metric.clearance_m.toFixed(2)} m; preferred ${metric.minimum_m.toFixed(2)}${metric.maximum_m===undefined?' m minimum':`–${metric.maximum_m.toFixed(2)} m`}`});
  for(const room of local.metrics.rooms) for(const path of room.walkways) if(path.status==='warn') errors.push({check:'walkway',severity:'soft',item_ids:[path.from,path.to].filter(id=>id.startsWith('item:')).map(id=>id.slice(5)),at:path.narrowest,deficit_m:Math.max(0,0.75-path.width_m),message:`${path.from} to ${path.to}: ${path.width_m.toFixed(2)} m path; 0.75 m preferred, 0.90 m good`});
  const names=['operations','containment','collision','door_swing','walkway','price','function_clearance'];
  const checks:CheckStatus[]=names.map(check=>({check,status:errors.some(error=>error.check===check&&error.severity==='hard')?'failed':errors.some(error=>error.check===check)?'warning':'passed'}));
  checks.push(engine);
  return {ok:!errors.some(error=>error.severity==='hard'),errors,checks,price,metrics:scored};
}

export function scoreLayout(scene:Scene,ops:readonly Op[]=[]):{before:LayoutMetrics;after:LayoutMetrics;cost_dram:number|null;price:LayoutPrice} {
  const before=applyOps(scene,[]),after=applyOps(scene,ops),price=layoutPrice(ops);
  return {before:metrics(before,0),after:metrics(after,price.cost_dram),cost_dram:price.cost_dram,price};
}
