import {editorFitRows} from './catalog-editor-fit.js';
import {fitProducts} from './catalog-acceleration.js';
let body='';for await(const chunk of process.stdin)body+=chunk;
const input=JSON.parse(body);
// Generate inside the editor's actual floor, even when the bridge reconciled a wall gap.
// The unchanged source scene remains the final proposal/bridge authority.
const candidateScene=input.editor_scene?{...input.scene,rooms:input.scene.rooms.map((room:any)=>{
 const floor=input.editor_scene.rooms.find((r:any)=>r.id===room.id);
 return floor?{...room,polygon:floor.polygon.map(([x,z]:[number,number])=>[x,-z])}:room;
})}:input.scene;
for(const row of input.rows){
 const fitted=fitProducts(candidateScene,[row],input.room_id,2,input.catalog);
 const accepted=input.editor_scene?editorFitRows(input.editor_scene,input.base_scene??input.scene,input.catalog,fitted,input.remove_ids,input.bridge_options):fitted;
 for(const result of accepted)process.stdout.write(JSON.stringify(result)+'\n');
}
