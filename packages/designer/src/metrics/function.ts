import { wallSolidPolygons } from '../wall-geometry.js';
import { parseScene } from '../adapter.js';
import { outsidePoint } from '../local-checks.js';
import { physicalDoorSwingPolygon, itemPolygon, isFloorRug, polygonsOverlap } from './space.js';
import { onFloor, type Item, type Scene, type Vec2 } from '../scene.js';

export interface FunctionClearance {
  item_id: string;
  other_item_id?: string;
  function: 'bed_side' | 'chair_pullout' | 'storage_front' | 'table_wall' | 'sofa_coffee';
  side: 'left' | 'right' | 'front' | 'back';
  clearance_m: number;
  minimum_m: number;
  maximum_m?: number;
  deficit_m: number;
  excess_m?: number;
  status: 'good' | 'warn';
  at: Vec2;
}
type Side = FunctionClearance['side'];
const EPS = 1e-7;
const rounded = (value: number) => Math.round(value * 1e6) / 1e6;

function edge(item: Item, side: Side): { a: Vec2; b: Vec2; outward: Vec2 } {
  const polygon = itemPolygon(item);
  const indices = {front:[0,1],right:[1,2],back:[2,3],left:[3,0]} as const;
  const [i,j] = indices[side], a = polygon[i]!, b = polygon[j]!;
  const length = Math.hypot(b[0]-a[0],b[1]-a[1]);
  return {a,b,outward:[(b[1]-a[1])/length,-(b[0]-a[0])/length]};
}

/** Sweep the entire edge, including its corners. A centre ray misses offset obstructions. */
function clearance(scene: Scene, item: Item, side: Side, wallsOnly = false): number {
  const polygon = scene.rooms.find(room => room.id === item.room_id)!.polygon;
  const {a,b,outward:n} = edge(item,side);
  const obstacles = [...wallSolidPolygons(scene,item.size[2]).map(s=>s.polygon), ...(wallsOnly ? [] : [
    ...[...scene.items,...scene.fixed].filter(other => other.id !== item.id && other.room_id === item.room_id && !other.structure && !isFloorRug(other) && onFloor(other)).map(itemPolygon),
    // A door owned by the adjacent room may swing into this access strip.
    ...scene.openings.map(opening=>physicalDoorSwingPolygon(scene,opening)).filter((p): p is Vec2[] => p !== null),
  ])];
  let low = 0, high = Math.max(...polygon.map(point=>Math.hypot(point[0]-item.pos[0],point[1]-item.pos[1]))) + Math.max(...item.size) + 1;
  for (let iteration=0;iteration<45;iteration++) {
    const distance=(low+high)/2;
    const strip:Vec2[]=[a,b,[b[0]+n[0]*distance,b[1]+n[1]*distance],[a[0]+n[0]*distance,a[1]+n[1]*distance]];
    if (outsidePoint(strip,polygon) || obstacles.some(obstacle=>polygonsOverlap(strip,obstacle))) high=distance;
    else low=distance;
  }
  return rounded(low);
}

function result(item: Item, side: Side, fn: FunctionClearance['function'], value: number, minimum: number, maximum?: number, other?: string): FunctionClearance {
  const {a,b} = edge(item,side), deficit=rounded(Math.max(0,minimum-value));
  const excess=maximum === undefined ? undefined : rounded(Math.max(0,value-maximum));
  return {item_id:item.id, ...(other===undefined?{}:{other_item_id:other}),function:fn,side,clearance_m:value,minimum_m:minimum,
    ...(maximum===undefined?{}:{maximum_m:maximum,excess_m:excess}),deficit_m:deficit,status:deficit>EPS||(excess??0)>EPS?'warn':'good',at:[(a[0]+b[0])/2,(a[1]+b[1])/2]};
}

/** Smallest forward gap from a sofa's complete front edge to an aligned coffee table. */
function coffeeGap(sofa:Item,table:Item):number|undefined {
  const {a,b,outward:n}=edge(sofa,'front'),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const tangent:Vec2=[(b[0]-a[0])/length,(b[1]-a[1])/length];
  let polygon=itemPolygon(table).map(point=>[(point[0]-a[0])*tangent[0]+(point[1]-a[1])*tangent[1],(point[0]-a[0])*n[0]+(point[1]-a[1])*n[1]] as Vec2);
  // Clip against the complete front span before taking the nearest forward depth.
  for(const [axis,limit,sign] of [[0,0,1],[0,length,-1],[1,0,1]] as const) {
    const output:Vec2[]=[];
    for(let i=0;i<polygon.length;i++) {
      const p=polygon[i]!,q=polygon[(i+1)%polygon.length]!,pin=sign*(p[axis]-limit)>=-EPS,qin=sign*(q[axis]-limit)>=-EPS;
      if(pin) output.push(p);
      if(pin!==qin) { const t=(limit-p[axis])/(q[axis]-p[axis]);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]); }
    }
    polygon=output;
  }
  return polygon.length ? rounded(Math.max(0,Math.min(...polygon.map(point=>point[1])))) : undefined;
}

/** Function guidance is a soft preference. Physical paths and door swings stay hard checks. */
export function functionClearances(input:Scene):FunctionClearance[] {
  const scene=parseScene(input);
  return scene.items.flatMap(item=>itemFunctionClearances(scene,item));
}

/** One item's function clearances in an already parsed scene (the same rules as functionClearances). */
export function itemFunctionClearances(scene:Scene,item:Item):FunctionClearance[] {
  const metrics:FunctionClearance[]=[];
  {
    const kind=item.kind.toLowerCase().replace(/[ -]/g,'_');
    if(kind==='bed') for(const side of ['left','right'] as const) metrics.push(result(item,side,'bed_side',clearance(scene,item,side),0.6));
    if(['chair','desk_chair','dining_chair','office_chair'].includes(kind)) metrics.push(result(item,'back','chair_pullout',clearance(scene,item,'back'),0.6));
    if(['wardrobe','chest','chest_of_drawers','dresser'].includes(kind)) metrics.push(result(item,'front','storage_front',clearance(scene,item,'front'),0.9));
    if(['table','dining_table'].includes(kind)) for(const side of ['left','right','front','back'] as const) metrics.push(result(item,side,'table_wall',clearance(scene,item,side,true),0.9));
    if(kind==='sofa') {
      const candidates=scene.items.filter(other=>other.room_id===item.room_id&&other.kind.toLowerCase().replace(/[ -]/g,'_')==='coffee_table')
        .map(table=>({table,gap:coffeeGap(item,table)})).filter((candidate):candidate is {table:Item;gap:number}=>candidate.gap!==undefined)
        .sort((a,b)=>a.gap-b.gap||a.table.id.localeCompare(b.table.id));
      const nearest=candidates[0];
      if(nearest) metrics.push(result(item,'front','sofa_coffee',nearest.gap,0.36,0.46,nearest.table.id));
    }
  }
  return metrics;
}
