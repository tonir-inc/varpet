import {test,expect} from 'vitest';
import {createEditorDemoInput} from '../eval/editor-demo.js';
import {prepareFastRequest} from '../src/fast-path.js';
test('furnishing retains an owned double bed before checking the remaining catalog needs',()=>{
  const {scene}=createEditorDemoInput();
  scene.items=scene.items.filter(i=>i.id==='bed');
  const result=prepareFastRequest(scene,'Furnish the bedroom: a double bed, two nightstands and a wardrobe',[]);
  expect(result.type).toBe('decline');
  if(result.type==='decline')expect(result.reason).toMatch(/wardrobe/);
});
