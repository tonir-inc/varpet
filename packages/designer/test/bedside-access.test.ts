import {expect,test} from 'vitest';
import {bedsideAccess,pieceOps} from '../src/incremental-room.js';
import {SceneAnalysisCache} from '../src/fast-path.js';
import type {Item,Op,Scene} from '../src/scene.js';
import type {CatalogProduct} from '../src/catalog.js';

const polygon:[number,number][]=[[0,0],[6,0],[6,4],[0,4]];
const scene:Scene={rooms:[{id:'r',polygon}],walls:polygon.map((a,i)=>({id:`w${i}`,room_id:'r',a,b:polygon[(i+1)%4]!,thickness:.1,height:2.7})),
 openings:[{id:'door',wall_id:'w0',kind:'door',offset:4.6,width:.9,height:2,sill:0,swing:'none'}],items:[],fixed:[],north_deg:0};
const bed=(x:number):Op=>({type:'add',item:{id:'bed',room_id:'r',kind:'bed',name:'Double bed',pos:[x,3],rot:0,size:[1.4,2,.5],keep:false}});

test('a bed pose whose second bedside cannot be reached ranks below one with both sides reachable',()=>{
 expect(bedsideAccess(scene,bed(1.2),'r')).toBeLessThan(.75);
 expect(bedsideAccess(scene,bed(3),'r')).toBeGreaterThanOrEqual(.75);
});

test('the desk chair is first tried pulled up to the desk front, facing it',()=>{
 const desk:Item={id:'desk',room_id:'r',kind:'desk',name:'Desk',pos:[3,.3],rot:180,size:[1,.5,.75],keep:false};
 const chair:CatalogProduct={sku:'chair',kind:'chair',name:'Desk chair',size:[.5,.5,.9],price:100,currency:'AMD',vendor:null,source:null,price_source:null,size_status:'confirmed',size_evidence:null,wd_swapped:false,colors_listing:[],colors_image:[],styles:[],item:{id:'chair',kind:'chair',name:'Desk chair',size:[.5,.5,.9],sku:'chair',price:100}};
 const first=pieceOps({...scene,items:[desk]},chair,'r',new SceneAnalysisCache(),'work_seat',desk,0,true).next().value!;
 expect(first.type).toBe('add');if(first.type!=='add')throw new Error('Expected add');
 expect(first.item.rot).toBe(0);
 expect(first.item.pos[1]-.25-(desk.pos[1]+.25)).toBeCloseTo(.05,6);
});
