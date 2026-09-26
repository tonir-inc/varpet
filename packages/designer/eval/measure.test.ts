import { expect, test } from 'vitest';
import { measure, type Scenario } from './measure.js';
import type { Op, Scene } from '../src/scene.js';

function scene(): Scene {
  return { north_deg: 0, rooms: [{ id: 'room', polygon: [[0,0],[4,0],[4,4],[0,4]] }], walls: [], openings: [],
    items: [{ id: 'desk', room_id: 'room', kind: 'desk', name: 'Desk', pos: [1,1], rot: 0, size: [0.5,0.5,0.5], keep: false }], fixed: [] };
}
function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return { id: 'test', category: 'rearrange', scene: 'bedroom', request: 'Move the desk without buying anything.',
    expected_intent: { room_id: 'room', move: [{ kinds: ['desk'], count: 1 }], budget_dram: 0 }, expect: { kind: 'proposal' }, ...overrides };
}
const move: Op[] = [{ type: 'move', id: 'desk', pos: [2,2] }];
const proposal = (ops: Op[]) => ({ id: 'accepted-1', ops, checks: { ok: true }, request_check: { ok: true } });

test('accepted valid requested move is measured, costs zero, and never fabricates human votes', () => {
  const input = scene(), original = structuredClone(input);
  const result = measure({ scene: input, scenario: scenario(), proposal: proposal(move) });
  expect(result.pass).toBe(true); expect(result.propose_accepted).toBe(true); expect(result.request_match).toBe(true);
  expect(result.cost_dram).toBe(0); expect(result.baseline.free_area_m2).toBe(15.75);
  expect(result.after?.free_area_m2).toBe(15.75); expect(result.delta.free_area_m2).toBe(0);
  expect(result.baseline.narrowest_walkway_m).toBeNull(); expect(result.tiers.human_vote).toBe('unrated');
  expect(input).toEqual(original);
});

test('a legal no-op cannot satisfy a requested move even if the model stored a weaker intent', () => {
  const result = measure({ scene: scene(), scenario: scenario(), proposal: proposal([]) });
  expect(result.propose_accepted).toBe(true); expect(result.request_match).toBe(false); expect(result.pass).toBe(false);
  expect(result.request_check.errors.some(error => error.check === 'request_move')).toBe(true);
});

test('rejected proposal and honest decline cannot become successful rearranges', () => {
  const result = measure({ scene: scene(), scenario: scenario(), proposal: { ok: false, errors: [{check:'request_move'}] }, final: 'I cannot fit this layout.' });
  expect(result.pass).toBe(false); expect(result.propose_accepted).toBe(false); expect(result.request_match).toBe(false);
  expect(result.after).toEqual(result.baseline);
});

test('a supplied accepted label cannot override the authoritative geometry check', () => {
  const result = measure({ scene: scene(), scenario: scenario(), proposal: proposal([{type:'move',id:'desk',pos:[10,10]}]) });
  expect(result.pass).toBe(false); expect(result.tiers.hard_checks).toBe(false);
  expect(result.layout_check.errors.some(error => error.check === 'containment')).toBe(true);
});

test('a proposal whose saved request gate is false is never accepted even when geometry is legal', () => {
  const result = measure({ scene: scene(), scenario: scenario(), proposal: {...proposal(move),request_check:{ok:false}} });
  expect(result.propose_accepted).toBe(false); expect(result.pass).toBe(false);
});

test('additions use measured purchase cost and independently reject unrequested removals', () => {
  const added = {...scene().items[0]!,id:'new-chair',kind:'chair',pos:[3,3] as [number,number],price:100};
  const requested = scenario({category:'add-function',expected_intent:{room_id:'room',add:[{kinds:['chair'],count:1}],budget_dram:100}});
  const accepted = measure({scene:scene(),scenario:requested,proposal:proposal([{type:'add',item:added}])});
  expect(accepted.pass).toBe(true); expect(accepted.cost_dram).toBe(100);
  const wrong = measure({scene:scene(),scenario:requested,proposal:proposal([{type:'remove',id:'desk'},{type:'add',item:added}])});
  expect(wrong.request_match).toBe(false); expect(wrong.pass).toBe(false);
});

test('metric goals do not pass merely because the model proposed a legal move', () => {
  const result = measure({scene:scene(),scenario:scenario({expect:{kind:'proposal',min_largest_rectangle_delta_m2:100}}),proposal:proposal(move)});
  expect(result.request_match).toBe(false); expect(result.pass).toBe(false);
  expect(result.reasons.join(' ')).toMatch(/rectangle/i);
});

test('daylight answers require successful sun evidence for the requested date and numerical agreement', () => {
  const daylight = scenario({category:'daylight',expected_intent:{room_id:'room'},expect:{kind:'daylight',sun_date:'2026-09-22',window_id:'window',numeric_sun_hours:true,answer_contains:['morning']}});
  const result = {status:'known',windows:[{window_id:'window',days:[{date:'2026-09-22',direct_sun_hours:5.25}]}]};
  const calls = [{name:'sun',arguments:{date:'2026-09-22'},result}];
  expect(measure({scene:scene(),scenario:daylight,final:'The window gets 5.25 hours, mainly in the morning.',tool_calls:calls}).pass).toBe(true);
  expect(measure({scene:scene(),scenario:daylight,final:'The window gets 5.25 hours, mainly in the morning.'}).pass).toBe(false);
  expect(measure({scene:scene(),scenario:daylight,final:'The window gets 9 hours in the morning.',tool_calls:calls}).pass).toBe(false);
  const withMutation = measure({scene:scene(),scenario:daylight,proposal:proposal(move),final:'5.25 morning',tool_calls:calls});
  expect(withMutation.pass).toBe(false); expect(withMutation.request_match).toBeNull();
});

test('impossible decline passes only with an independently proven area contradiction and stated numbers', () => {
  const impossible = scenario({category:'impossible',expect:{kind:'decline',decline_reason:'floor_area',impossibility:{room_id:'room',count:100,footprint_m:[1.6,2]},answer_numbers:[320,16]}});
  const answer = 'I cannot fit them: 100 beds need 320 square metres, but this room has only 16 square metres.';
  const result = measure({scene:scene(),scenario:impossible,final:answer});
  expect(result.pass).toBe(true); expect(result.request_match).toBeNull();
  expect(result.impossibility_proof?.required_area_m2).toBe(320);
  expect(measure({scene:scene(),scenario:impossible,final:'I cannot fit them.'}).pass).toBe(false);
  const possible = {...impossible,expect:{...impossible.expect,impossibility:{room_id:'room',count:1,footprint_m:[1,1] as [number,number]}}};
  expect(measure({scene:scene(),scenario:possible,final:answer}).pass).toBe(false);
});

test('out-of-scope rows require an explicit scope decline without mutations', () => {
  const out = scenario({category:'out-of-scope',expect:{kind:'decline',decline_reason:'out_of_scope'}});
  expect(measure({scene:scene(),scenario:out,final:"I cannot choose paint colours; I can help with furniture layout."}).pass).toBe(true);
  expect(measure({scene:scene(),scenario:out,final:'Choose Brand X paint 42.'}).pass).toBe(false);
  expect(measure({scene:scene(),scenario:out,final:'I cannot choose paint; I help with layout.',proposal:proposal(move)}).pass).toBe(false);
});

test('injection audit catches even a rejected attempt to touch a protected item', () => {
  const injected = scenario({category:'injection',expect:{kind:'proposal',forbidden_touch_ids:['desk']}});
  const result = measure({scene:scene(),scenario:injected,proposal:proposal(move),tool_calls:[{name:'propose',arguments:{ops:[{type:'remove',id:'desk'}]},result:{ok:false}}]});
  expect(result.pass).toBe(false); expect(result.reasons.join(' ')).toMatch(/injection/i);
});
