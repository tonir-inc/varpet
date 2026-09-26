/** Isolated real GPU regression, never loads or saves an application apartment. */
import * as THREE from 'three';
import type { CatalogAsset, SceneDocument } from '../contracts';
import { createViewport } from './viewport';

const scene: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'sun-qa', name: 'Window room', units: 'm', upAxis: 'Y', objects: [],
  rooms: [{ id: 'room', name: 'Window room', color: '#bda88c', polygon: [[0,0],[6,0],[6,5],[0,5]] }],
  walls: [
    { id: 'north', start: [0,0], end: [6,0], height: 3, thickness: .2, color: '#f0e8dc', openings: [{ id: 'window', kind: 'window', offset: 2, width: 2, height: 1.6, sill: .8 }] },
    { id: 'east', start: [6,0], end: [6,5], height: 3, thickness: .2, color: '#f0e8dc', openings: [] },
    { id: 'south', start: [6,5], end: [0,5], height: 3, thickness: .2, color: '#f0e8dc', openings: [] },
    { id: 'west', start: [0,5], end: [0,0], height: 3, thickness: .2, color: '#f0e8dc', openings: [] },
  ],
};
const original = THREE.Mesh.prototype.onBeforeRender;
let renderer: THREE.WebGLRenderer | undefined, world: THREE.Scene | undefined, frames = 0;
THREE.Mesh.prototype.onBeforeRender = function (...args) {
  original.apply(this, args);
  if (args[1] instanceof THREE.Scene && args[1].background) { renderer = args[0]; world = args[1]; frames++; }
};
const errors: string[] = [];
const viewport = createViewport(document.querySelector('#view')!, { onSelect() {}, onInteraction() {}, onTransform() {}, onError: error => errors.push(error) });
// This page exercises scene illumination; normal Top view now defaults to unlit.
viewport.setTopLighting(true);
viewport.setScene(scene, []); viewport.setView('top'); viewport.setSun({ azimuth: 0, elevation: 35 });
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const status = document.querySelector('#status')!, results = document.querySelector('#results')!;
const lines: string[] = [];
function check(ok: unknown, message: string): void { if (!ok) throw new Error(message); lines.push(`PASS ${message}`); results.textContent = lines.join('\n'); }
const probeCamera = new THREE.OrthographicCamera(-3, 3, 2.5, -2.5, .1, 30);
probeCamera.position.set(3,12,2.5); probeCamera.up.set(0,0,-1); probeCamera.lookAt(3,0,2.5); probeCamera.updateMatrixWorld(true);
const target = new THREE.WebGLRenderTarget(360,300);
function capture(): Uint8Array {
  if (!renderer || !world) throw new Error('Renderer has not produced a frame');
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target); renderer.render(world, probeCamera);
  const pixels = new Uint8Array(360*300*4); renderer.readRenderTargetPixels(target,0,0,360,300,pixels);
  renderer.setRenderTarget(previous); return pixels;
}
function sample(pixels: Uint8Array, x: number, z: number): number {
  const p = new THREE.Vector3(x,0,z).project(probeCamera);
  const px = Math.round((p.x + 1) * 180), py = Math.round((p.y + 1) * 150);
  let total = 0;
  for (let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
    const offset = ((py+dy)*360+px+dx)*4; total += (pixels[offset]!+pixels[offset+1]!+pixels[offset+2]!)/3;
  }
  return total / 9;
}
async function sunPixels(azimuth: number, elevation: number, enabled = true) {
  viewport.setSun({ azimuth, elevation, enabled, intensity: 100 }); await delay(120); return capture();
}
document.querySelector<HTMLButtonElement>('#low')!.onclick=()=>viewport.setSun({enabled:true,azimuth:0,elevation:20});
document.querySelector<HTMLButtonElement>('#high')!.onclick=()=>viewport.setSun({enabled:true,azimuth:0,elevation:60});
document.querySelector<HTMLButtonElement>('#away')!.onclick=()=>viewport.setSun({enabled:true,azimuth:180,elevation:35});
document.querySelector<HTMLButtonElement>('#inside')!.onclick=()=>viewport.setView('inside');
document.querySelector<HTMLButtonElement>('#top')!.onclick=()=>viewport.setView('top');
document.querySelector<HTMLButtonElement>('#run')!.onclick=async event=>{
  const button = event.currentTarget as HTMLButtonElement; button.disabled=true; status.textContent='Running'; lines.length=0;
  try {
    viewport.setView('top'); viewport.setWalls('cutaway'); await delay(550);
    const before = JSON.stringify(scene), dark = await sunPixels(0,35,false), north = await sunPixels(0,35);
    const gain=(image:Uint8Array,x:number,z:number)=>sample(image,x,z)-sample(dark,x,z);
    check(gain(north,2.45,2)>25, `Direct sun passes through glass onto floor (+${gain(north,2.45,2).toFixed(1)})`);
    check(Math.abs(gain(north,.7,2))<3, `Opaque wall blocks direct sun (+${gain(north,.7,2).toFixed(1)})`);
    check(gain(north,3,2)<gain(north,2.45,2)*.5, 'Window mullion casts a shadow inside the patch');
    viewport.setWalls('hidden'); await delay(350); const hidden=await sunPixels(0,35);
    check(gain(hidden,2.45,2)>25 && Math.abs(gain(hidden,.7,2))<3,'Hiding walls retains the window-shaped sunlight patch');
    viewport.setWalls('full'); await delay(350);
    const south=await sunPixels(180,35);
    check(Math.abs(gain(south,2.45,2))<3,'Rotating sun to the solid opposite wall removes the patch');
    const low=await sunPixels(0,20), high=await sunPixels(0,60);
    check(gain(low,2.45,3.8)>25 && gain(high,2.45,3.8)<3,'Low sun reaches farther into the room');
    check(gain(high,2.45,1)>25 && gain(low,2.45,1)<3,'High sun creates a shorter patch below the window');
    check(Math.abs(gain(high,.7,1))<3,'Hidden roof prevents direct light from flooding the whole room');
    const cabinet: CatalogAsset = { id: 'blocker', name: 'Shadow cabinet', category: 'QA', kind: 'cabinet', dimensions: [.6,1.2,.6], color: '#999999', price: 0, source: { type: 'procedural' } };
    viewport.setScene({ ...scene, objects: [{ id: 'blocker-object', name: 'Shadow cabinet', assetId: cabinet.id, position: [2.6,0,1.8], rotation: 0, scale: [1,1,1] }] }, [cabinet]);
    await delay(550); const furnished=await sunPixels(0,35);
    check(gain(north,2.45,2.6)>25 && gain(furnished,2.45,2.6)<3,'Furniture casts its own shadow into the window light');
    viewport.setScene(scene, []); await delay(350); await sunPixels(0,60);
    const copy=viewport.getSun(); copy.azimuth=210;
    check(viewport.getSun().azimuth===0,'Reading sun settings cannot mutate the viewport');
    viewport.setLightingMood('evening'); check(!viewport.getSun().enabled,'Evening ceiling preview reports direct sun off');
    viewport.setSun({enabled:true,azimuth:0,elevation:35}); viewport.setView('inside'); await delay(200);
    check(world?.getObjectByName('Sun') instanceof THREE.DirectionalLight && (world.getObjectByName('Sun') as THREE.DirectionalLight).intensity>0,'Inside uses the same adjustable sun');
    viewport.setView('top'); viewport.setWalls('cutaway'); await delay(650);
    check(JSON.stringify(scene)===before,'Sun controls and camera changes leave the apartment document unchanged');
    check(errors.length===0,`No rendering errors (${errors.length})`);
    const stopped=frames; await delay(220); check(stopped===frames,'Sunlight returns to idle after the controls settle');
    status.textContent=`PASS ${lines.length} GPU/browser checks`;
  } catch(error) { lines.push(`FAIL ${error instanceof Error ? error.message : String(error)}`); results.textContent=lines.join('\n'); status.textContent='FAILED'; }
  finally { button.disabled=false; }
};
window.addEventListener('pagehide',()=>{ viewport.dispose(); target.dispose(); THREE.Mesh.prototype.onBeforeRender=original; },{once:true});
