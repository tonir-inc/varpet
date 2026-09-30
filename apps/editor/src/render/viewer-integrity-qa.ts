import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { createViewport } from './viewport';
import { OpeningAssetLoader } from './opening-assets';
import { emptyProject } from '../core/renovation';
import type { SceneDocument } from '../contracts';

const output = document.querySelector<HTMLPreElement>('#result')!;
const status = document.querySelector<HTMLElement>('#status')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const results: string[] = [], errors: string[] = [];
let world: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
let grade = NaN, ao = NaN, projectionDefine = -1, frames = 0;
const originalMesh = THREE.Mesh.prototype.onBeforeRender;
const originalGrade = ShaderPass.prototype.render;
const originalAO = GTAOPass.prototype.render;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  originalMesh.apply(this, args);
  if (args[1].getObjectByName('Sun')) { world = args[1]; renderer = args[0]; camera = args[2] as typeof camera; frames++; }
};
ShaderPass.prototype.render = function (...args) {
  if (this.uniforms.strength) grade = this.uniforms.strength.value;
  originalGrade.apply(this, args);
};
GTAOPass.prototype.render = function (...args) {
  ao = this.blendIntensity; projectionDefine = Number(this.gtaoMaterial.defines.PERSPECTIVE_CAMERA);
  originalAO.apply(this, args);
};
const scene: SceneDocument = {
  format:'varpet.editor', version:2, id:'viewer-integrity',name:'Viewer integrity',units:'m',upAxis:'Y',objects:[],
  rooms:[{id:'room',name:'Room',polygon:[[0,0],[4,0],[4,4],[0,4]],color:'#eeeeee'}],
  walls:[[[0,0],[4,0]],[[4,0],[4,4]],[[4,4],[0,4]],[[0,4],[0,0]]].map((points,index)=>({id:`wall-${index}`,start:points[0] as [number,number],end:points[1] as [number,number],height:3,thickness:.2,color:'#eeeeee',openings:[]})),project:emptyProject(),
};
const viewport = createViewport(document.querySelector('#view')!, {onSelect(){},onInteraction(){},onTransform(){throw new Error('Camera wrote scene');},onError:message=>errors.push(message)});
viewport.setScene(scene,[]);
const delay = (ms=300)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
function check(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);results.push(`PASS ${message}`);output.textContent=results.join('\n');}
function snapshot() {
  const lights:unknown[]=[];
  world.traverseVisible(object=>{if(object instanceof THREE.Light)lights.push([object.uuid,object.intensity,object.color.toArray(),object.getWorldPosition(new THREE.Vector3()).toArray(),object.castShadow]);});
  return JSON.stringify({environment:world.environment?.uuid,background:world.background instanceof THREE.Texture?world.background.uuid:null,
    env:world.environmentIntensity,bg:world.backgroundIntensity,exposure:renderer.toneMappingExposure,tone:renderer.toneMapping,grade,ao,lights,
    roofs:world.getObjectByName('Sun shadow shell')?.children.filter(child=>child.userData.sunRoof).map(child=>child.visible)});
}
function pixelBrightness() {
  const gl=renderer.getContext(),pixel=new Uint8Array(4);
  gl.readPixels(Math.floor(gl.drawingBufferWidth/2),Math.floor(gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  return (pixel[0]!+pixel[1]!+pixel[2]!)/3;
}
button.onclick=async()=>{
  button.disabled=true;results.length=0;errors.length=0;status.textContent='Running';
  try {
    await delay(700);const saved=JSON.stringify(scene);
    for(const sky of ['studio','daylight','overcast'] as const)for(const hour of [12,22]){
      viewport.setView('perspective');viewport.setSkybox(sky);viewport.setSun({timeOfDay:hour,enabled:true});await delay(400);
      const baseline=snapshot();
      for(const view of ['inside','top','perspective'] as const){
        check(viewport.setView(view)!==false,`${sky}/${hour} enters ${view}`);await delay(400);
        check(snapshot()===baseline,`${sky}/${hour} ${view} shares sky, lights, roofs, exposure, grade and AO`);
        check(projectionDefine===(view==='top'?0:1),`${view} AO uses correct camera projection`);
      }
    }
    viewport.setSkybox('studio');viewport.setSun({timeOfDay:22,enabled:true});viewport.setView('inside');await delay(400);
    camera.position.set(2,1.65,2);camera.lookAt(0,1.65,2);viewport.redraw();await delay();
    check(!world.getObjectByName('Evening room lights'),'No invisible room fixtures are created');
    const night=pixelBrightness();check(night<=5,`Unlit midnight wall is dark (${night.toFixed(1)}/255)`);
    viewport.setSun({timeOfDay:12});await delay(400);const day=pixelBrightness();check(day>night+10,`Daylight illuminates the same wall (${day.toFixed(1)}/255)`);
    const loader=new OpeningAssetLoader();
    try{for(const mechanism of ['hinged','double'] as const)for(const hinge of ['left','right'] as const){
      const opening={id:'door',kind:'door' as const,offset:1,width:1.15,height:2.35,sill:0};
      const instance=await loader.load({...scene.walls[0]!,thickness:.35},opening,{mechanism,hinge});
      check(instance && instance.leaves.length>0,`Actual ${mechanism}/${hinge} door GLB loads`);
      for(const leaf of instance.leaves){
        const attribute=leaf.geometry.getAttribute('position');const vertices=[0,Math.floor(attribute.count/3),attribute.count-1].map(index=>new THREE.Vector3().fromBufferAttribute(attribute,index));
        let reference:number[]|undefined;
        for(const angle of [0,.4,Math.PI/2,0]){instance.setAngle(angle);instance.group.updateMatrixWorld(true);const points=vertices.map(vertex=>leaf.localToWorld(vertex.clone()));const distances=[points[0]!.distanceTo(points[1]!),points[1]!.distanceTo(points[2]!),points[2]!.distanceTo(points[0]!)];
          if(!reference)reference=distances;else check(distances.every((value,index)=>Math.abs(value-reference![index]!)<1e-7),`${mechanism}/${hinge} ${leaf.name} keeps dimensions at ${angle.toFixed(2)} rad`);
        }
      }
      instance.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
    }}finally{loader.dispose();}
    check(JSON.stringify(scene)===saved,'Camera and door previews leave scene data unchanged');
    await delay(1000);const idle=frames;await delay(300);check(frames===idle,'Settled renderer returns to idle');
    check(errors.length===0,'No viewport errors');status.textContent=`COMPLETE ${results.length} integrity checks`;
  }catch(error){status.textContent=`FAIL ${String(error)}`;}finally{button.disabled=false;}
};
window.addEventListener('pagehide',()=>{viewport.dispose();THREE.Mesh.prototype.onBeforeRender=originalMesh;ShaderPass.prototype.render=originalGrade;GTAOPass.prototype.render=originalAO;},{once:true});
