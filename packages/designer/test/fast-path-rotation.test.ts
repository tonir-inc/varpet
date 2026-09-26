import {test,expect} from 'vitest';
import {createEditorDemoInput} from '../eval/editor-demo.js';
import {prepareFastRequest,selectFastCandidate} from '../src/fast-path.js';
import scenarios from '../eval/avani-benchmark-scenarios.json';
test('every offered group slot is a real move even when the source angle is negative',()=>{
  const {scene,catalog}=createEditorDemoInput('grouped-v2');
  const prepared=prepareFastRequest(scene,scenarios.find(s=>s.id==='avani-grouped-lounge')!.request,catalog);
  expect(prepared.type).toBe('candidates');
  if(prepared.type==='candidates')for(const candidate of prepared.candidates){
    expect(selectFastCandidate(scene,prepared,{slot_id:candidate.id,catalog_ids:[]}).ok,candidate.id).toBe(true);
  }
},15000);
