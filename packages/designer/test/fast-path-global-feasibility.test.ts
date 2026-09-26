import {test,expect} from 'vitest';
import {createEditorDemoInput} from '../eval/editor-demo.js';
import {prepareFastRequest} from '../src/fast-path.js';
test('a globally absent catalog subtype is proved even when the room is unspecified',()=>{
  const {scene,catalog}=createEditorDemoInput();
  const result=prepareFastRequest(scene,'Add a desk by the window for working from home',catalog);
  expect(result.type).toBe('decline');
  if(result.type==='decline'){
    expect(result.reason).toMatch(/desk/);
    expect(result.proof).toMatch(/catalog/);
    expect(result.alternative).toMatch(/catalog/);
  }
});
