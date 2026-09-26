import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createViewport } from '../../apps/editor/src/render/viewport';
import { createFloorPlan } from '../../apps/editor/src/render/floor-plan';
import { demoScene, localCatalog } from '../../apps/editor/src/core/demo';
let orbit: OrbitControls;
const originalUpdate = OrbitControls.prototype.update;
OrbitControls.prototype.update = function(...args) { orbit = this; return originalUpdate.apply(this,args); };
const counts = {select:0,edit:0,finish:0,button:0};
const interactions: boolean[] = [], errors: string[] = [];
const countEdit=()=>counts.edit++;
let selected: string | null = null;
const view = document.querySelector<HTMLElement>('#view')!;
const planRoot = document.querySelector<HTMLElement>('#plan')!;
const viewport = createViewport(view,{
 onSelect(id){counts.select++;selected=id;viewport.setSelection(id);},
 onTransform:countEdit,onWallMove:countEdit,onWallEndpoint:countEdit,onOpeningMove:countEdit,onOpeningTransform:countEdit,onComponentTransform:countEdit,
 onInteraction(v){interactions.push(v);},onError(e){errors.push(e);},onFinish(){counts.finish++;return true;},
});
const plan = createFloorPlan(planRoot,id=>{counts.select++;selected=id;plan.setSelection(id);},{onInteraction(v){interactions.push(v);},onCommit:countEdit,onCommitMany:countEdit,onError(e){errors.push(e);}});
const scene=structuredClone(demoScene);
viewport.setScene(scene,localCatalog);plan.setScene(scene,localCatalog);
const canvas=view.querySelector('canvas')!;
document.querySelector('#button')!.addEventListener('click',()=>counts.button++);
function state(){return {position:orbit.object.position.toArray(),target:orbit.target.toArray(),quaternion:orbit.object.quaternion.toArray(),zoom:orbit.object.zoom,counts:{...counts},interactions:[...interactions],selected,errors:[...errors],cursor:getComputedStyle(canvas).cursor,planCursor:getComputedStyle(planRoot.querySelector('svg')!).cursor,planTransform:planRoot.querySelector('svg > g')?.getAttribute('transform'),focus:document.activeElement?.tagName};}
(window as any).probe={viewport,plan,scene,counts,state,
 resetCounts(){counts.select=counts.edit=counts.finish=counts.button=0;interactions.length=0;errors.length=0;},
 mode(m:string){plan.setVisible(m==='plan');planRoot.hidden=m!=='plan';view.hidden=m==='plan';if(m!=='plan')viewport.setView(m as any);(document.activeElement as HTMLElement)?.blur();},
 restore(s:any){orbit.object.position.fromArray(s.position);orbit.target.fromArray(s.target);orbit.object.quaternion.fromArray(s.quaternion);orbit.object.zoom=s.zoom;orbit.object.updateProjectionMatrix();orbit.update();},
 select(id:string|null,tool='select'){selected=id;viewport.setSelection(id);viewport.setTool(tool as any);plan.setSelection(id);},
 point(id:string){const item=scene.objects.find(o=>o.id===id)!;const a=localCatalog.find(a=>a.id===item.assetId)!;return viewport.project([item.position[0],item.position[1]+a.dimensions[1]*.7,item.position[2]]);},
};
document.querySelector('#status')!.textContent='Ready';
