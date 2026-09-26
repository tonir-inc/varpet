import {test,expect,vi} from 'vitest';
import {planIncrementally,pieceOps} from '../src/incremental-room.js';
import {SceneAnalysisCache} from '../src/fast-path.js';
import {functionClearances} from '../src/metrics/function.js';
import {applyOps} from '../src/adapter.js';
import {DesignerSession} from '../src/session.js';
import type {Scene,Item} from '../src/scene.js';
import type {CatalogProduct} from '../src/catalog.js';
const scene:Scene={rooms:[{id:'r',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]]}],walls:[],openings:[],items:[],fixed:[]};
const product=(kind:string,size:[number,number,number],sku=kind):CatalogProduct=>({sku,kind,name:kind,size,price:100,currency:'AMD',vendor:null,source:null,price_source:null,size_status:'confirmed',size_evidence:null,wd_swapped:false,colors_listing:[],colors_image:['beige'],styles:['Scandinavian'],item:{id:sku,kind,name:kind,size,sku,price:100}});
const bed:Item={id:'bed',room_id:'r',kind:'bed',name:'bed',pos:[4,4],rot:0,size:[1.5,2,.5],keep:true};
test('nightstands at both sides are within 0.60 m reach without reducing 0.60 m bed access',()=>{
 let current={...scene,items:[bed]};
 for(let side=0;side<2;side++){
  const op=pieceOps(current,product('nightstand',[.4,.35,.55]),'r',new SceneAnalysisCache(),'nightstands',bed,side).next().value!;
  expect(op.type).toBe('add');if(op.type!=='add')throw new Error('Expected add');
  expect(Math.abs(op.item.pos[0]-bed.pos[0])-bed.size[0]/2-op.item.size[0]/2).toBeCloseTo(.6,6);
  current=applyOps(current,[op]);
 }
 expect(functionClearances(current).filter(c=>c.function==='bed_side').every(c=>c.clearance_m>=.6)).toBe(true);
 const check=new DesignerSession({...scene,items:[bed]});check.setIntent({keeps:['bed']});
 expect(check.propose([{type:'add',item:{...current.items[1]!,id:'too-close',pos:[4-1.34,4]}}],'Must reject lost bed access.').ok).toBe(false);
});
test('a fitting smaller coffee table is tried after an oversized first match, preserving real dimensions',async()=>{
 const sizes:Record<string,[number,number,number]>={sofa:[2,.9,.8],rug:[3,2,.02],lamp:[.2,.2,1.4],shelf:[1,.3,1.2]};
 const query=async(p:{kind?:string})=>({results:(p.kind==='table'?[{id:'oversized',size:[12,12,.4]},{id:'compact',size:[.45,.45,.4]}]:sizes[p.kind!]? [{id:p.kind,size:sizes[p.kind!]}]:[]).map(x=>({id:x.id,kind:p.kind,name:p.kind==='table'?'Coffee table':p.kind,size_m:x.size,price:100,currency:'AMD',styles:['Scandinavian'],colors_image:['beige']}))});
 const plan=await planIncrementally(scene,{room_id:'r',program:'living',style:'Scandinavian'},query);
 expect(plan.complete).toBe(true);expect(plan.products.some(p=>p.sku==='compact')).toBe(true);expect(plan.products.some(p=>p.sku==='oversized')).toBe(false);
 expect(plan.ops.find(o=>o.type==='add'&&o.item.sku==='compact')).toMatchObject({item:{size:[.45,.45,.4]}});
});
test('later role failure retries a different checked anchor instead of returning the first partial',async()=>{
 const sizes:Record<string,[number,number,number]>={sofa:[2,.9,.8],rug:[3,2,.02],table:[.45,.45,.4],lamp:[.2,.2,1.4],shelf:[1,.3,1.2]};
 const query=async(p:{kind?:string})=>({results:sizes[p.kind!]? [{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind!],price:100,currency:'AMD',styles:['Scandinavian'],colors_image:['beige']}]:[]});
 const slots=vi.spyOn(SceneAnalysisCache.prototype,'slots').mockImplementation((_scene,assets,q)=>q.catalogId==='sofa'?[.5,3].map((y,i)=>({id:'anchor'+i,catalog_ids:['sofa'],ops:[{type:'add',item:{id:'anchor',room_id:'r',kind:'sofa',name:'sofa',pos:[4,y],rot:0,size:sizes.sofa!,sku:'sofa',price:100,keep:false}}],score:2-i,scores:{daylight:0,zoning:0,facing:0,open_floor:0},description:'Checked anchor candidate'})):[]);
 try{const plan=await planIncrementally(scene,{room_id:'r',program:'living',style:'Scandinavian'},query);expect(plan.complete).toBe(true);expect(plan.ops.find(o=>o.type==='add'&&o.item.kind==='sofa')).toMatchObject({item:{pos:[4,3]}});}finally{slots.mockRestore();}
});
test('room placement accepts an 0.80 m secondary route and refuses a new 0.70 m route',async()=>{
 const sizes:Record<string,[number,number,number]>={sofa:[2,.9,.8],rug:[3,2,.02],table:[.45,.45,.4],lamp:[.2,.2,1.4],shelf:[1,.3,1.2]};
 const query=async(p:{kind?:string})=>({results:sizes[p.kind!]? [{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind!],price:100,currency:'AMD',styles:['Scandinavian'],colors_image:['beige']}]:[]});
 for(const width of [.8,.7]){
  const input:Scene={...scene,walls:[{id:'south',room_id:'r',a:[0,0],b:[8,0]}],openings:[{id:'entry',wall_id:'south',kind:'passage',offset:4,width,height:2,sill:0}]};
  const plan=await planIncrementally(input,{room_id:'r',program:'living',style:'Scandinavian'},query);
  if(width===.8){expect(plan.complete).toBe(true);expect(plan.reason).toContain('Secondary access');const checker=new DesignerSession(input);checker.setIntent(plan.intent);const result=checker.propose(plan.ops,plan.reason);expect(result.ok).toBe(true);if(result.ok)expect(result.proposal.checks.metrics!.space.rooms[0]!.walkways.every(w=>w.reachable&&w.width_m>=.75)).toBe(true);}
  else {expect(plan.complete).toBe(false);expect(plan.ops).toHaveLength(0);}
 }
},60000);
test('budget reserves only missing roles when the rest of the program is already owned',async()=>{
 const sizes:Record<string,[number,number,number]>={sofa:[2,.9,.8],rug:[3,2,.02],table:[.45,.45,.4],lamp:[.2,.2,1.4],shelf:[1,.3,1.2]};
 const query=async(p:{kind?:string})=>({results:sizes[p.kind!]? [{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind!],price:100,currency:'AMD',styles:['Scandinavian'],colors_image:['beige']}]:[]});
 const initial=await planIncrementally(scene,{room_id:'r',program:'living',style:'Scandinavian'},query);expect(initial.complete).toBe(true);
 const owned=applyOps(scene,initial.ops.filter(o=>o.type!=='add'||o.item.kind!=='table'));
 const edit=await planIncrementally(owned,{room_id:'r',program:'living',style:'Scandinavian',budget:100},query);
 expect(edit.complete).toBe(true);expect(edit.ops).toHaveLength(1);expect(edit.products.map(p=>p.kind)).toEqual(['table']);expect(edit.products.reduce((sum,p)=>sum+p.price,0)).toBe(100);
});
