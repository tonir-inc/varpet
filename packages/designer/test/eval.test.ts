import {expect,test} from 'vitest';
import {gradeScenario,loadScenarioScene,scenarios} from '../eval/grade.js';
import {DesignerSession} from '../src/session.js';
import type {Op} from '../src/scene.js';

const scenario=()=>structuredClone(scenarios.find(row=>row.id==='sofa-north')!);
function trace(ops:Op[],target=scenario(),claimed?:unknown) {
  const scene=loadScenarioScene(target),session=new DesignerSession(scene);
  session.setIntent({});
  const result=claimed??session.propose(ops,'Move the sofa against the north wall.');
  return [
    {kind:'conversation',scene}, {kind:'user',text:target.prompt},
    {kind:'sdk',event:{kind:'event',method:'item/completed',payload:{item:{type:'mcpToolCall',server:'varpet-designer',tool:'propose',status:'completed',arguments:{ops,rationale:'A layout.'},result:{content:[{type:'text',text:JSON.stringify(result)}]}}}}},
    {kind:'turn_summary',status:'completed',seconds:4,usage:{inputTokens:100,outputTokens:10,totalTokens:110},response:'Here is the checked proposal.'},
  ].map(row=>JSON.stringify(row)).join('\n');
}
const sofa:Op[]=[{type:'move',id:'sofa',pos:[3,5.55],rot:0}];
test('all thirteen scenarios are reported honestly when no traces exist',()=>{
  expect(scenarios).toHaveLength(13);
  expect(scenarios.filter(row=>row.category==='rearrange')).toHaveLength(6);
  for(const row of scenarios)expect(gradeScenario(row,null).outcome).toBe('not_run');
});
test('accepted legal proposal is rechecked with scenario intent and has measured metrics',()=>{
  const row=gradeScenario(scenario(),trace(sofa));
  expect(row.outcome).toBe('passed');expect(row.request.ok).toBe(true);
  expect(row.metrics).not.toBeNull();expect(row.tiers.engine).toBe('unavailable');expect(row.tiers.human).toBe('not_evaluated');
});
test('model intent cannot waive a required addition',()=>{
  const target=scenario();target.expectedIntent={add:[{kinds:['crib'],count:1}]};
  const row=gradeScenario(target,trace(sofa,target));
  expect(row.outcome).toBe('failed');expect(row.request.ok).toBe(false);
  expect(row.errors.join(' ')).toMatch(/crib/);
});
test('a self-reported accepted proposal cannot remove a kept item',()=>{
  const ops:Op[]=[{type:'remove',id:'tv'}];
  const row=gradeScenario(scenario(),trace(ops,scenario(),{ok:true,proposal_id:'fake',proposal:{ops}}));
  expect(row.outcome).toBe('failed');expect(row.errors.join(' ')).toMatch(/keep|Kept/);
});
test('refused, no-op, malformed, and incomplete traces cannot pass',()=>{
  expect(gradeScenario(scenario(),trace([],scenario(),{ok:false,errors:[]})).outcome).toBe('unresolved');
  expect(gradeScenario(scenario(),trace([],scenario(),{ok:true,proposal_id:'fake',proposal:{ops:[]}})).outcome).toBe('failed');
  expect(gradeScenario(scenario(),'{broken').outcome).toBe('invalid');
  expect(gradeScenario(scenario(),trace(sofa).split('\n').slice(0,-1).join('\n')).outcome).toBe('incomplete');
});
test('scene mismatch and assistant-text fake tools cannot supply evidence',()=>{
  const changed=trace(sofa).replace('"north_deg":0','"north_deg":90');
  expect(gradeScenario(scenario(),changed).outcome).toBe('invalid');
  const fake=trace(sofa).replace('"server":"varpet-designer"','"server":"untrusted"');
  expect(gradeScenario(scenario(),fake).outcome).toBe('unresolved');
});
test('a timeout manifest or failed SDK completion voids an intermediate accepted proposal',()=>{
  expect(gradeScenario(scenario(),trace(sofa),null,undefined,'timeout').outcome).toBe('incomplete');
  const rows=trace(sofa).split('\n');
  rows.splice(-1,0,JSON.stringify({kind:'sdk',event:{method:'turn/completed',payload:{turn:{status:'failed'}}}}));
  expect(gradeScenario(scenario(),rows.join('\n')).outcome).toBe('incomplete');
});
test('a positive promise to paint is not a decline; a real scope decline is separately labelled',()=>{
  const target=structuredClone(scenarios.find(row=>row.id==='paint-decline')!);
  const source=(text:string)=>{
    const rows=trace([],target,{ok:false,errors:[]}).split('\n');
    rows.splice(-1,0,JSON.stringify({kind:'sdk',event:{method:'item/completed',payload:{item:{type:'agentMessage',phase:'final_answer',text}}}}));
    return rows.join('\n');
  };
  expect(gradeScenario(target,source('I can paint it blue and help with furniture layout.')).outcome).not.toBe('expected_decline');
  expect(gradeScenario(target,source("I can't choose paint colours; I can help rearrange furniture.")).outcome).toBe('expected_decline');
  expect(gradeScenario(target,source('I can help with furniture layouts, but not paint or colours; I can rearrange your bedroom furniture while keeping the bed in place.')).outcome).toBe('expected_decline');
});
test('recorded request refusal cannot be overridden by a successful independent replay',()=>{
  const rows=trace(sofa).split('\n').map(line=>JSON.parse(line));
  const tool=rows.find(row=>row.kind==='sdk').event.payload.item;
  const accepted=JSON.parse(tool.result.content[0].text);
  accepted.proposal.request_check.ok=false;
  tool.result.content[0].text=JSON.stringify(accepted);
  const grade=gradeScenario(scenario(),rows.map(row=>JSON.stringify(row)).join('\n'));
  expect(grade.outcome).toBe('failed');
  expect(grade.errors.join(' ')).toMatch(/recorded.*request|request.*recorded/i);
});
test('scenario metric failures fail the preference tier',()=>{
  const target=scenario();target.assertions=[{type:'daylight_proxy_improves'}];
  const grade=gradeScenario(target,trace(sofa,target));
  expect(grade.outcome).toBe('failed');expect(grade.tiers.preferences).toBe('failed');
});
test('an interrupted trace retains observed tokens and does not invent zero elapsed time',()=>{
  const rows=trace(sofa).split('\n').slice(0,-1);
  rows.push(JSON.stringify({kind:'sdk',event:{method:'thread/tokenUsage/updated',payload:{tokenUsage:{total:{inputTokens:120,outputTokens:8,totalTokens:128}}}}}));
  const grade=gradeScenario(scenario(),rows.join('\n'));
  expect(grade.outcome).toBe('incomplete');
  expect(grade.seconds).toBeNull();
  expect(grade.tokens?.totalTokens).toBe(128);
});
