import {z} from 'zod';
import {applyOps,parseScene} from './adapter.js';
import {checkLayout,scoreLayout} from './layout.js';
import {place,placeInputSchema,type PlacementCandidate,type PlaceRequest} from './place.js';
import type {Op,Scene} from './scene.js';

export const placementsSchema=z.array(placeInputSchema).min(1).max(6);
export interface BatchCandidate {
  ops:Op[];
  clearances:{item_id:string;values:PlacementCandidate['clearances']}[];
  score:ReturnType<typeof scoreLayout>;
}
export interface BatchResult {candidates:BatchCandidate[];reason?:string;search:{beam_width:number;max_pieces:number;exhaustive:false}}

/** Temporarily lift the requested movable pieces, then place them on copies as a bounded beam.
 * Only full-scene checked combinations are returned; no temporary removals escape as ops. */
export function placeBatch(input:Scene,requests:PlaceRequest[],options:{compareBaseline?:boolean}={}):BatchResult {
  const scene=parseScene(input),placements=placementsSchema.parse(requests),ids=new Set<string>();
  const prepared=placements.map(request=>{
    if((request.item_id===undefined)===(request.item===undefined)) throw new Error('Supply one item_id or sized item per placement');
    const id=request.item_id??request.item!.id;
    if(ids.has(id)) throw new Error(`Duplicate placement: ${id}`);
    ids.add(id);
    if(!request.item_id) {
      if([...scene.items,...scene.fixed,...scene.rooms,...scene.walls,...scene.openings].some(item=>item.id===id)) throw new Error(`Duplicate item id: ${id}`);
      return request;
    }
    const existing=scene.items.find(item=>item.id===id);
    if(!existing) throw new Error(`Unknown or fixed item: ${id}`);
    if(existing.keep) throw new Error(`Kept item cannot move: ${id}`);
    const {id:itemId,kind,name,size,sku,price,vendor}=existing;
    return {...request,item_id:undefined,item:{id:itemId,kind,name,size,sku,price,vendor}};
  });
  const lifted=new Set(placements.flatMap(request=>request.item_id?[request.item_id]:[]));
  const start={...scene,items:scene.items.filter(item=>!lifted.has(item.id))};
  let beam:{scene:Scene;ops:Op[];clearances:BatchCandidate['clearances']}[]=[{scene:start,ops:[],clearances:[]}];
  const failures:string[]=[];
  for(let index=0;index<prepared.length;index++) {
    const next:typeof beam=[];
    for(const state of beam) {
      let found:ReturnType<typeof place>;
      try {found=place(state.scene,prepared[index]!,scene);}
      catch(error) {failures.push(error instanceof Error?error.message:String(error));continue;}
      if(found.reason) failures.push(found.reason);
      for(const candidate of found.candidates) {
        const original=placements[index]!;
        const op:Op=original.item_id?{type:'move',id:original.item_id,pos:candidate.item.pos,rot:candidate.item.rot,room_id:candidate.item.room_id}:candidate.op;
        next.push({scene:applyOps(state.scene,[candidate.op]),ops:[...state.ops,op],clearances:[...state.clearances,{item_id:candidate.item.id,values:candidate.clearances}]});
      }
    }
    beam=next.slice(0,8);
    if(!beam.length) break;
  }
  const candidates:BatchCandidate[]=beam.filter(state=>state.ops.length===placements.length&&checkLayout(scene,state.ops,{compareBaseline:options.compareBaseline??false}).ok)
    .map(state=>({ops:state.ops,clearances:state.clearances,score:scoreLayout(scene,state.ops)}))
    .sort((a,b)=>b.score.after.space.rooms.reduce((sum,room)=>sum+(room.largest_free_rectangle?.area_m2??0),0)-a.score.after.space.rooms.reduce((sum,room)=>sum+(room.largest_free_rectangle?.area_m2??0),0))
    .slice(0,3);
  return {candidates,...candidates.length?{}:{reason:`No fully checked batch candidate found. ${[...new Set(failures)].slice(0,3).join(' ')} Bounded search does not prove infeasibility; try another relation or placement order.`},search:{beam_width:8,max_pieces:6,exhaustive:false}};
}
