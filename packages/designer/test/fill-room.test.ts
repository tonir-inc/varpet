import {expect,test} from 'vitest';
import {planIncrementally} from '../src/incremental-room.js';
import {wallPoses} from '../src/fill-room.js';
import {DesignerSession} from '../src/session.js';
import {applyOps} from '../src/adapter.js';
import {scoreComposition} from '../src/taste/composition.js';
import {editorToDesigner,proposalToEditor} from '../src/editor-bridge.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import type {CatalogAsset,SceneDocument} from '../../../apps/editor/src/contracts.js';
import type {Op,Scene} from '../src/scene.js';

const polygon:[number,number][]=[[0,0],[6,0],[6,5],[0,5]];
const room:Scene={rooms:[{id:'r',name:'Living room',polygon}],walls:polygon.map((a,i)=>({id:`w${i}`,room_id:'r',a,b:polygon[(i+1)%4]!,thickness:.1,height:2.7})),
 openings:[{id:'door',wall_id:'w0',kind:'door',offset:4.8,width:.9,height:2.1,sill:0,swing:'none'},{id:'window',wall_id:'w2',kind:'window',offset:2,width:1.5,height:1.4,sill:.9}],items:[],fixed:[],north_deg:0};
const catalog:Record<string,{id:string;name:string;size:[number,number,number];price:number}[]>={
 sofa:[{id:'sofa',name:'Sofa',size:[2,.9,.8],price:200000}],rug:[{id:'rug',name:'Area rug',size:[2.4,1.7,.01],price:50000}],
 table:[{id:'coffee',name:'Coffee table',size:[.6,.6,.4],price:60000},{id:'side',name:'Side table',size:[.45,.45,.55],price:40000}],
 lamp:[{id:'floor-lamp',name:'Floor lamp',size:[.3,.3,1.6],price:16000}],shelf:[{id:'shelf',name:'Bookcase',size:[1,.35,1.2],price:70000}],
 cabinet:[{id:'media',name:'Media console',size:[1.4,.45,.6],price:90000}],chair:[{id:'armchair',name:'Accent armchair',size:[.75,.8,.85],price:70000}],
 ottoman:[{id:'pouf',name:'Round pouf',size:[.5,.5,.4],price:30000}],plant:[{id:'fig',name:'Fiddle-leaf fig',size:[.5,.5,1.4],price:40000}],
 vase:[{id:'vase',name:'Tulips in vase',size:[.2,.2,.4],price:10000}],books:[{id:'books',name:'Coffee table books',size:[.3,.25,.08],price:15000}],
 candle:[{id:'candle',name:'Candle',size:[.1,.1,.12],price:6000}],wall_art:[{id:'print',name:'Framed print',size:[.6,.03,.5],price:13000}],
 curtain:[{id:'curtains',name:'Curtain pair on rod',size:[2,.12,2.3],price:40000}],mattress:[{id:'mattress-140',name:'Made-up double mattress',size:[1.4,2,.3],price:150000}],
 bed:[{id:'frame',name:'Platform bed frame',size:[1.5,2.05,.4],price:200000}],nightstand:[{id:'stand',name:'Nightstand',size:[.4,.35,.55],price:30000}],
 wardrobe:[{id:'wardrobe',name:'Wardrobe',size:[1.2,.55,1.9],price:180000}],
};
const query=async(p:{kind?:string})=>({results:(catalog[p.kind!]??[]).map(x=>({...x,kind:p.kind,size_m:x.size,currency:'AMD',size_status:'confirmed',styles:['Modern'],colors_image:['beige']}))});
const addsOf=(ops:Op[])=>ops.flatMap(o=>o.type==='add'?[o.item]:[]);

test('fill mode keeps adding checked optional pieces after the living essentials',async()=>{
 const essentials=await planIncrementally(room,{room_id:'r',program:'living',style:'modern'},query);
 const plan=await planIncrementally(room,{room_id:'r',program:'living',style:'modern',mode:'fill'},query);
 const added=addsOf(plan.ops);
 expect(added.length).toBeGreaterThan(addsOf(essentials.ops).length+3);
 expect(added.some(i=>i.kind==='plant')).toBe(true);
 expect(added.some(i=>i.on!==undefined&&['vase','books','candle'].includes(i.kind))).toBe(true);
 expect(added.some(i=>i.kind==='wall_art'&&i.mount==='wall')).toBe(true);
 expect(added.some(i=>i.kind==='curtain'&&i.mount==='wall')).toBe(true);
 // Every hard check still passes, and nothing added a composition issue the essentials did not have.
 const checker=new DesignerSession(room);checker.setIntent(plan.intent);expect(checker.propose(plan.ops,plan.reason).ok).toBe(true);
 const before=new Set(scoreComposition(applyOps(room,essentials.ops),'r',{program:'living'}).issues.map(i=>i.code));
 expect(scoreComposition(applyOps(room,plan.ops),'r',{program:'living'}).issues.every(i=>before.has(i.code))).toBe(true);
 expect(plan.reason).toMatch(/Filled the room further/);
 expect((plan.evidence as {fill:{stopped:string}}).fill.stopped).toMatch(/well_furnished|nothing_more_fits/);
},120000);

test('fill mode on an already furnished room adds pieces instead of reporting no anchor, and stops at the budget',async()=>{
 const essentials=await planIncrementally(room,{room_id:'r',program:'living',style:'modern'},query);
 const furnished=applyOps(room,essentials.ops);
 const plan=await planIncrementally(furnished,{room_id:'r',program:'living',style:'modern',mode:'fill',budget:60000},query);
 expect(plan.ops.length).toBeGreaterThan(0);
 expect(plan.products.reduce((sum,p)=>sum+p.price,0)).toBeLessThanOrEqual(60000);
 expect((plan.evidence as {fill:{stopped:string}}).fill.stopped).toBe('budget');
},120000);

test('a bare bed frame gets a fitting mattress on it; without one in the catalog the plan says so',async()=>{
 const bedroom:Scene={...room,rooms:[{id:'r',name:'Bedroom',polygon}]};
 const plan=await planIncrementally(bedroom,{room_id:'r',program:'bedroom'},query);
 const bed=addsOf(plan.ops).find(i=>i.kind==='bed')!;
 const mattress=addsOf(plan.ops).find(i=>i.kind==='mattress')!;
 expect(mattress).toMatchObject({on:bed.id,rot:bed.rot});
 // Head end flush with the headboard.
 const t=bed.rot*Math.PI/180,head=(i:typeof bed)=>[i.pos[0]-Math.sin(t)*i.size[1]/2,i.pos[1]+Math.cos(t)*i.size[1]/2];
 expect(head(mattress)[0]).toBeCloseTo(head(bed)[0]!,6);expect(head(mattress)[1]).toBeCloseTo(head(bed)[1]!,6);
 const none=await planIncrementally(bedroom,{room_id:'r',program:'bedroom'},async p=>p.kind==='mattress'?{results:[]}:query(p));
 expect(addsOf(none.ops).some(i=>i.kind==='mattress')).toBe(false);
 expect(none.reason).toMatch(/mattress/);
},120000);

test('wall art hangs over the sofa and the editor accepts it on that wall',()=>{
 const asset=(id:string,kind:CatalogAsset['kind'],dimensions:[number,number,number],price=10000):CatalogAsset=>({id,name:id,category:'Test',kind,dimensions,color:'#888888',price,source:{type:'procedural'}});
 const assets=[asset('sofa','sofa',[2,.8,.9]),asset('print','wall_art',[.6,.5,.03],13000)];
 const editor=():SceneDocument=>({format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',
  rooms:[{id:'room',name:'Living room',polygon:[[0,0],[5,0],[5,5],[0,5]],color:'#ffffff'}],
  walls:[{id:'south',start:[0,0],end:[5,0],height:2.7,thickness:.1,color:'#ffffff',openings:[{id:'door',kind:'door',offset:3.6,width:.9,sill:0,height:2.1}]},
   {id:'west',start:[0,5],end:[0,0],height:2.7,thickness:.1,color:'#ffffff',openings:[]}],
  objects:[{id:'sofa',name:'Sofa',assetId:'sofa',position:[1.5,0,.5],rotation:Math.PI,scale:[1,1,1]}]});
 const scene=editorToDesigner(editor(),{catalog:assets,catalogCurrency:'AMD'});
 const [pose]=wallPoses(scene,'room',{kind:'wall_art',size:[.6,.03,.5]});
 expect(pose!.pos[0]).toBeCloseTo(1.5,1);
 const session=new DesignerSession(scene);session.setIntent({room_id:'room',add:[{kinds:['wall_art'],count:1}]});
 const result=session.propose([{type:'add',item:{id:'art',room_id:'room',kind:'wall_art',name:'Print',pos:pose!.pos,rot:pose!.rot,size:[.6,.03,.5],keep:false,sku:'print',price:13000,mount:'wall'}}],'Art over the sofa.');
 if(!result.ok)throw new Error(JSON.stringify(result.errors));
 const store=new EditorStore(editor(),assets);
 expect(store.execute(proposalToEditor(result.proposal,editor(),0,{catalog:assets,catalogCurrency:'AMD'}).command,true).ok).toBe(true);
 expect(store.scene.objects.find(o=>o.id==='art')?.host?.wallId).toBe('south');
});

test('wall art is never hung where a tall piece stands against the wall or over an opening',()=>{
 const wardrobe={id:'wardrobe',room_id:'r',kind:'wardrobe',name:'Wardrobe',pos:[3,.4] as [number,number],rot:180,size:[5.8,.6,1.9] as [number,number,number],keep:false};
 const poses=wallPoses({...room,items:[wardrobe]},'r',{kind:'wall_art',size:[.6,.03,.5]});
 expect(poses.every(p=>p.pos[1]>.5)).toBe(true);
 // The window spans x 2.5-4.0 on the north wall; 0.3 m half-width plus a 0.15 m margin.
 expect(poses.every(p=>!(p.pos[1]>4.8&&p.pos[0]>2.05&&p.pos[0]<4.45))).toBe(true);
 expect(poses.length).toBeGreaterThan(0);
});
