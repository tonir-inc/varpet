import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OpeningAssetLoader } from './opening-assets';
import type { Opening, Wall } from '../contracts';
import { disposeObject } from './assets';
import stockUrl from '../../../../catalog/openings/window-pvc-tilt-turn.glb?url';
const host = document.querySelector<HTMLElement>('#view')!, status = document.querySelector<HTMLOutputElement>('#status')!;
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(host.clientWidth, host.clientHeight); renderer.setClearColor('#e6e4de'); host.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(34,host.clientWidth/host.clientHeight,.01,100); camera.position.set(0,2.1,10.8); camera.lookAt(0,.9,0);
scene.add(new THREE.HemisphereLight('#ffffff','#a0a09a',3)); const sun = new THREE.DirectionalLight('#ffffff',3); sun.position.set(-4,8,6); scene.add(sun);
const source = (await new GLTFLoader().loadAsync(stockUrl)).scene; const loader = new OpeningAssetLoader();
const wall: Wall = { id:'wall',start:[0,0],end:[6,0],height:2.8,thickness:.2,color:'#eee',openings:[] };
const opening = (width:number,height=1.45):Opening=>({id:'window',kind:'window',width,height,sill:.85,offset:0});
const bounds = (object:THREE.Object3D) => new THREE.Box3().setFromObject(object);
const near = (value:number,expected:number,label:string) => { if(Math.abs(value-expected)>1e-5) throw new Error(`${label}: ${value} != ${expected}`); };
let assertions=0;
for(const width of [.2,.6,1.2,1.5,1.8,2.4,2.7,3.6]) for(const height of [.2,.8,1.45,2.1]) {
  const input=opening(width,height), original=JSON.stringify(input);
  const asset=(await loader.load(wall,input,{}))!; asset.group.updateMatrixWorld(true);
  const frame=bounds(asset.group.getObjectByName('frame')!).getSize(new THREE.Vector3());
  near(frame.x,.065*Math.min(1,width/.6),'frame width'); near(frame.y,height,'frame height');
  const all=bounds(asset.group); near(all.min.x,-.04,'sill left'); near(all.max.x,width+.04,'sill right');
  const glass=asset.group.getObjectByName('sash-l-glass') as THREE.Mesh;
  const points=glass.geometry.getAttribute('position');
  const a=new THREE.Vector3().fromBufferAttribute(points,0).applyMatrix4(glass.matrixWorld), b=new THREE.Vector3().fromBufferAttribute(points,points.count-1).applyMatrix4(glass.matrixWorld);
  const distance=a.distanceTo(b), closed=glass.matrixWorld.clone();
  asset.setAngle(Math.PI/2);
  near(new THREE.Vector3().fromBufferAttribute(points,0).applyMatrix4(glass.matrixWorld).distanceTo(new THREE.Vector3().fromBufferAttribute(points,points.count-1).applyMatrix4(glass.matrixWorld)),distance,'rigid sash');
  asset.setAngle(0); if(glass.matrixWorld.elements.some((v,i)=>Math.abs(v-closed.elements[i]!)>1e-7)) throw new Error('close did not restore pose');
  if(JSON.stringify(input)!==original)throw new Error('aperture changed');
  assertions+=7;disposeObject(asset.group);
}
let before:THREE.Group|undefined, after:Awaited<ReturnType<OpeningAssetLoader['load']>>, opened=false, currentWidth=2.7;
async function show(width:number) {
  currentWidth=width;opened=false;if(before){scene.remove(before);disposeObject(before)}if(after){scene.remove(after.group);disposeObject(after.group)}
  before=source.clone(true);before.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone()}});
  before.position.set(-2,0,0);before.scale.set(width/1.5,1,1);scene.add(before);
  after=(await loader.load(wall,opening(width),{}))!;after.group.position.x=2;scene.add(after.group);
  status.textContent=`PASS: ${assertions} checks across 32 aperture sizes. Frames stay 65 mm at ordinary sizes; panels stay rigid while opening; aperture data unchanged.\nShowing ${width.toFixed(1)} × 1.45 m: before frame ${(65*width/1.5).toFixed(0)} mm → after 65 mm.`;
  renderer.render(scene,camera);
}
document.querySelector<HTMLButtonElement>('#normal')!.onclick=()=>void show(1.2);
document.querySelector<HTMLButtonElement>('#wide')!.onclick=()=>void show(2.7);
document.querySelector<HTMLButtonElement>('#open')!.onclick=()=>{opened=!opened;after?.setAngle(opened?Math.PI/2:0);renderer.render(scene,camera);};
window.addEventListener('resize',()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.render(scene,camera)});
await show(currentWidth);
