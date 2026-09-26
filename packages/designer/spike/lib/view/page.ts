// @ts-nocheck -- browser-only glue served by the editor Vite server.
// One long-lived editor viewport; each render swaps the scene so parsed GLBs stay cached in its AssetLoader.
import {AssetLoader} from '/src/render/assets.ts';
import {createViewport} from '/src/render/viewport.ts';
import {EditorStore} from '/src/core/store.ts';
import * as THREE from 'three';
import {StudioRenderer} from '/src/render/studio-renderer.ts';
// Explicit camera poses: the viewport owns its cameras, so the pose is applied to the camera the studio renderer draws with.
window.viewPose=null;
const studioRender=StudioRenderer.prototype.render;
StudioRenderer.prototype.render=function(camera){
 const pose=window.viewPose;
 if(pose&&camera&&camera.isPerspectiveCamera){camera.position.fromArray(pose.position);camera.up.set(0,1,0);camera.lookAt(new THREE.Vector3(...pose.target));if(pose.fov&&camera.fov!==pose.fov){camera.fov=pose.fov;camera.zoom=1;camera.updateProjectionMatrix();}camera.updateMatrixWorld(true);}
 return studioRender.call(this,camera);
};
window.viewErrors=[];window.viewPending=0;window.viewLoaded=new Set();window.viewFailed=new Set();
const load=AssetLoader.prototype.load;
AssetLoader.prototype.load=async function(asset){window.viewPending++;try{const model=await load.call(this,asset);window.viewLoaded.add(asset.id);return model;}catch(e){window.viewFailed.add(asset.id);window.viewErrors.push(asset.id+': '+String(e));throw e;}finally{window.viewPending--;}};
let viewport;
window.viewRender=({scene,catalog,roomId,view,walls,pose,time})=>{
 window.viewErrors=[];window.viewPose=null;
 const store=new EditorStore({...scene,objects:[]},catalog);
 const doc={...store.scene,objects:scene.objects};
 if(!viewport)viewport=createViewport(document.querySelector('#viewport'),{onSelect(){},onTransform(){},onInteraction(){},onError(e){window.viewErrors.push(String(e))}});
 viewport.setScene(doc,catalog);
 viewport.setView(view);viewport.setWalls(walls);viewport.setQuality('high');
 // Day: afternoon sun, practical lights off. Evening: after dusk, every light on at its set brightness.
 viewport.setSun({timeOfDay:time==='evening'?20.5:13});
 window.viewExpected=[...new Set(doc.objects.map(o=>o.assetId))].filter(id=>catalog.find(a=>a.id===id)?.source.type==='gltf');
 viewport.focus(roomId);
 // Stills: a natural lens comes with the pose; walking in opens every door, a photograph shows them shut.
 if(view==='inside')for(const wall of doc.walls)for(const opening of wall.openings)if(opening.kind==='door')viewport.setDoorAngle(opening.id,0);
 window.viewPose=pose??null;
 return true;
};
window.viewReady=true;
