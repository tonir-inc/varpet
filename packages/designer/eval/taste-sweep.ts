import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {editorToDesigner} from '../src/editor-bridge.js';
import {designRoom} from '../src/taste/design.js';
import {writeFileSync,mkdirSync} from 'node:fs';
const input=structuredClone(demoScene);input.objects=[];
const scene=editorToDesigner(input,{catalog:localCatalog,catalogCurrency:'AMD',northDeg:0});
const output=new URL('./taste-runs/catalog-sweep/',import.meta.url);mkdirSync(output,{recursive:true});
for(const style of ['minimalistic cozy','cozy','scandinavian','modern','classic','japandi','industrial','boho']){
 const start=performance.now(),result=await designRoom(scene,{room_id:'room-living',style_request:style,remake:true});
 writeFileSync(new URL(`${style.replaceAll(' ','-')}.json`,output),JSON.stringify(result));
 console.log(JSON.stringify({style,seconds:(performance.now()-start)/1000,count:result.candidates.length,reason:result.reason,rejected_by:'rejected_by' in result?result.rejected_by:undefined}));
}
