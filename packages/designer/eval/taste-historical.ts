/** Replay the supplied live log's exact final furniture poses on Avani's shell. */
import {demoScene} from '../../../apps/editor/src/core/demo.js';
import {readFileSync,writeFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('./taste-runs/input-catalog.json',import.meta.url),'utf8'));
const scene=structuredClone(demoScene);scene.name='Ashot live failure — logged furniture replay';scene.objects=[];
for(const [id,sku,x,y] of [['lounge-chair-1','abo:B071FMSYCH',-3.85,-1.2],['lounge-chair-2','abo:B071FMSYCH',-3.85,1.2],['wood-side-table','abo:B075Z8TDQ6',-3.85,0]] as const){const asset=catalog.find((a:any)=>a.id===sku);if(!asset)throw new Error(sku);scene.objects.push({id,assetId:sku,name:asset.name.slice(0,120),position:[x,0,-y],rotation:Math.PI/2,scale:[1,1,1]});}
writeFileSync(new URL('./taste-runs/historical/ashot-live.json',import.meta.url),JSON.stringify({scene,catalog,provenance:'Derived replay of final ops in Ashot supplied ashot-minimalist-cozy.txt. Furniture poses exact; unrecorded paint segmentation not reconstructed.'},null,2));
