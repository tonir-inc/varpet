import {test,expect} from 'vitest';
import {createEditorDemoInput} from '../eval/editor-demo.js';
import {prepareFastRequest,selectFastCandidate} from '../src/fast-path.js';
import scenarios from '../eval/avani-benchmark-scenarios.json';
test('equivalent rotations above a full turn cannot create a no-op move',()=>{
  const {scene,catalog}=createEditorDemoInput('grouped-v2');
  for(const item of scene.items)item.rot+=1080;
  const prepared=prepareFastRequest(scene,scenarios.find(s=>s.id==='avani-grouped-lounge')!.request,catalog);
  expect(prepared.type).toBe('candidates');
  if(prepared.type==='candidates')for(const c of prepared.candidates)expect(selectFastCandidate(scene,prepared,{slot_id:c.id,catalog_ids:c.catalog_ids}).ok).toBe(true);
},15000);
