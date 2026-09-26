import {test,expect} from 'vitest';
import {prepareFastRequest} from '../src/fast-path.js';
import bedroom from './fixtures/bedroom.json';
import {parseScene} from '../src/adapter.js';
import scenarios from '../eval/benchmark-scenarios.json';
test('area contradiction from the fixed eval is proved without model or catalog and names a feasible direction',()=>{
  const request=scenarios.find(s=>s.id==='i01-one-hundred-beds')!.request;
  const result=prepareFastRequest(parseScene(bedroom),request);
  expect(result.type).toBe('decline');
  if(result.type==='decline'){
    expect(result.reason).toContain('320');expect(result.reason).toContain('14');
    expect(result.alternative).toMatch(/fewer|smaller/i);expect(result.proof).toMatch(/area/i);
  }
  const possible=request.replace('100 additional','1 additional');
  expect(prepareFastRequest(parseScene(bedroom),possible).type).toBe('fallback');
});
