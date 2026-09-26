import {test,expect} from 'vitest';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {editorToDesigner} from '../src/editor-bridge.js';
const modules=import.meta.glob('../src/catalog-editor-fit.ts',{eager:true});
test('catalog offers only slots accepted by the editor bridge and approval contract',()=>{
 const api=Object.values(modules)[0] as any;expect(api).toBeDefined();
 const editor={...structuredClone(demoScene),objects:[]};
 const scene=editorToDesigner(editor,{catalog:localCatalog,catalogCurrency:'AMD',groupPolicy:'move-together'}),asset=localCatalog.find(a=>a.kind==='sofa')!;
 const item={id:'new-sofa',name:asset.name,kind:'sofa',room_id:'room-living',pos:[-2,0],rot:0,size:[asset.dimensions[0],asset.dimensions[2],asset.dimensions[1]],sku:asset.id,price:asset.price,keep:false};
 const rows=[{id:asset.id,fit_slots:[{id:'outside',room_id:'room-living',ops:[{type:'add',item:{...item,pos:[100,100]}}]},{id:'inside',room_id:'room-living',ops:[{type:'add',item}]}]}];
 const result=api.editorFitRows(editor,scene,localCatalog,rows,[]);
 expect(result).toHaveLength(1);expect(result[0].fit_slots.map((s:any)=>s.id)).toEqual(['inside']);
 expect(editor.objects).toEqual([]);
});

test('catalog fit retains the exact request door overrides in the source fingerprint',()=>{
 const api=Object.values(modules)[0] as any;
 const editor={...structuredClone(demoScene),objects:[]};
 const door=editor.walls.flatMap(w=>w.openings).find(o=>o.kind==='door')!;
 const options={catalog:localCatalog,catalogCurrency:'AMD' as const,groupPolicy:'move-together' as const,doorSwings:{[door.id]:'out-right' as const},northDeg:37};
 const scene=editorToDesigner(editor,options),asset=localCatalog.find(a=>a.kind==='sofa')!;
 const item={id:'new-sofa',name:asset.name,kind:'sofa',room_id:'room-living',pos:[-2,0],rot:0,size:[asset.dimensions[0],asset.dimensions[2],asset.dimensions[1]],sku:asset.id,price:asset.price,keep:false};
 const rows=[{id:asset.id,fit_slots:[{id:'inside',room_id:'room-living',ops:[{type:'add',item}]}]}];
 expect(api.editorFitRows(editor,scene,localCatalog,rows,[],options)).toHaveLength(1);
});
