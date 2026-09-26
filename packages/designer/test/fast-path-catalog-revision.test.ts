import {test,expect} from 'vitest';
import {createEditorDemoInput} from '../eval/editor-demo.js';
import {prepareFastRequest,selectFastCandidate} from '../src/fast-path.js';
import scenarios from '../eval/avani-benchmark-scenarios.json';
test('selection invalidates the complete scene/catalog fingerprint after a catalog price edit',()=>{
  const {scene,catalog}=createEditorDemoInput();
  const prepared=prepareFastRequest(scene,scenarios.find(s=>s.id==='avani-wall-blue')!.request,catalog);
  expect(prepared.type).toBe('candidates');
  if(prepared.type!=='candidates')return;
  const changed=structuredClone(catalog);changed[0]!.price++;
  const choice={slot_id:prepared.candidates[0]!.id,catalog_ids:[]};
  expect(()=>selectFastCandidate(scene,prepared,choice,changed)).toThrow(/catalog|fingerprint/i);
});
