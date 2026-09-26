import {test,expect} from 'vitest';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {editorToDesigner} from '../src/editor-bridge.js';
import {DesignerSession} from '../src/session.js';
import {designRoom} from '../src/taste/design.js';
test('real-size bedroom program survives the authoritative Avani proposal clearance gate',async()=>{
 const input=structuredClone(demoScene);input.objects=[];
 const scene=editorToDesigner(input,{catalog:localCatalog,catalogCurrency:'AMD'});
 // Measured catalog dimensions, metres W/D/H; no fixture or checker changes.
 const sizes:Record<string,number[]>={bed:[1.4719,1.9919,.9398],nightstand:[.4,.36,.47],lamp:[.2242,.2242,1.7525],wardrobe:[1.2898,.5098,1.9098]};
 const result=await designRoom(scene,{room_id:'room-bedroom',style_request:'modern bedroom with a wardrobe',remake:true},async p=>({results:sizes[p.kind!]?[{id:p.kind,kind:p.kind,name:p.kind,size_m:sizes[p.kind!],price:100,currency:'AMD',styles:['Modern'],colors_image:['beige'],size_status:'confirmed'}]:[]}));
 expect(result.candidates).toHaveLength(2);
 for(const candidate of result.candidates){const session=new DesignerSession(scene);session.setIntent(candidate.intent);expect(session.propose(candidate.ops,'A complete bedroom with reachable bedsides and clothes storage.').ok).toBe(true);}
});
