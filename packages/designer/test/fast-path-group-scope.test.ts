import {test,expect} from 'vitest';
import {createEditorDemoInput} from '../eval/editor-demo.js';
import {prepareFastRequest} from '../src/fast-path.js';
import scenarios from '../eval/avani-benchmark-scenarios.json';
const request=scenarios.find(s=>s.id==='avani-grouped-lounge')!.request;
test('the exact two-piece group request cannot move an extra group member',()=>{
  const {scene,catalog}=createEditorDemoInput('grouped-v2');
  scene.items.find(i=>i.id==='media-console')!.group_id='living-group';
  expect(prepareFastRequest(scene,request,catalog).type).toBe('fallback');
});
test('another two-piece group cannot substitute for the named lounge chair and living rug',()=>{
  const {scene,catalog}=createEditorDemoInput('grouped-v2');
  delete scene.items.find(i=>i.id==='living-rug')!.group_id;
  scene.items.find(i=>i.id==='media-console')!.group_id='living-group';
  expect(prepareFastRequest(scene,request,catalog).type).toBe('fallback');
});
