import { expect, test } from 'vitest';
import { makeFurniture } from '../../../apps/editor/src/render/assets.js';
import type { CatalogAsset } from '../../../apps/editor/src/contracts.js';
test('reserved custom assets render as neutral measured slots, not invented furniture',()=>{
  for(const kind of ['cabinet','table','shelf'] as const){
    const asset:CatalogAsset={id:'custom-c1-1',name:'Custom '+kind,category:'Custom — workshop estimate',kind,dimensions:[.5,.65,.4],color:'#9299a3',price:19500,source:{type:'procedural'}};
    const group=makeFurniture(asset);expect(group.children.length).toBeLessThanOrEqual(2);
    const meshes:any[]=[];group.traverse(node=>{if((node as any).isMesh)meshes.push(node);});expect(meshes).toHaveLength(1);
    const mesh=meshes[0];mesh.geometry.computeBoundingBox();
    const bounds=mesh.geometry.boundingBox;
    ['x','y','z'].forEach((axis,i)=>expect(bounds.max[axis]-bounds.min[axis]).toBeCloseTo(asset.dimensions[i]!,6));
  }
});
