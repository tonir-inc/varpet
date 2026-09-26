import { expect, test } from 'vitest';
import { checkDemoReply } from './demo-e2e.js';

const proposal = (operations: unknown[]) => ({type:'proposal',conversationId:'test',proposal:{id:'test',title:'Sage',description:'Paint the bedroom wall soft sage green.',
  command:{id:'test',label:'Sage',source:'designer',baseRevision:0,operations}}});

test('a real editor colour command must pass the store and validateScene', () => {
  const result = checkDemoReply('colour', proposal([{type:'update-wall',id:'wall-bedroom',patch:{color:'#a6b49e'}}]));
  expect(result.pass).toBe(true);
  expect(result.store_result?.ok).toBe(true);
  expect(result.validation_after?.ok).toBe(true);
  expect(result.scene_after?.walls.find(wall=>wall.id==='wall-bedroom')?.color).toBe('#a6b49e');
});

test('unknown catalog assets and empty commands do not pass as proposals', () => {
  const missing = proposal([{type:'add',object:{id:'new-chair',name:'Chair',assetId:'missing-catalog-id',position:[0,0,0],rotation:0,scale:[1,1,1]}}]);
  expect(checkDemoReply('catalog',missing).pass).toBe(false);
  expect(checkDemoReply('rearrange',proposal([])).pass).toBe(false);
});

test('cozier needs a question rather than a decline, empty question or error', () => {
  expect(checkDemoReply('question',{type:'question',question:'Which feeling matters most?',options:['Reading','Conversation']}).pass).toBe(true);
  for(const reply of [{type:'question',question:'',options:[]},{type:'decline',message:'I cannot help.'},{type:'error',message:'Failed'}])
    expect(checkDemoReply('question',reply).pass).toBe(false);
});

test('wall demolition needs a polite scope refusal, not a claimed structural change', () => {
  expect(checkDemoReply('decline',{type:'decline',message:'Moving walls is outside my scope; I can help with furniture layout instead.'}).pass).toBe(true);
  expect(checkDemoReply('decline',{type:'decline',message:'I knocked down the wall.'}).pass).toBe(false);
  expect(checkDemoReply('decline',{type:'proposal'}).pass).toBe(false);
});
