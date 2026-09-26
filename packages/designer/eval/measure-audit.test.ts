import { expect, test } from 'vitest';
import { measure, type Scenario } from './measure.js';
import type { Item, Scene } from '../src/scene.js';

const scene: Scene = {rooms:[{id:'room',polygon:[[0,0],[6,0],[6,6],[0,6]]}],walls:[],openings:[],
  items:[{id:'bed',kind:'bed',name:'Bed',room_id:'room',size:[1.6,2,.5],pos:[1.5,2],rot:0,keep:true}],fixed:[]};
const addition: Item = {id:'table',kind:'table',name:'Table',room_id:'room',size:[.4,.4,.5],pos:[2.6,2],rot:0,keep:false,sku:'shop-table',price:100};
const scenario: Scenario = {id:'catalog-add',category:'add-function',scene:'test',request:'Add a bedside table from the sized, priced catalog.',
  expected_intent:{add:[{kinds:['table'],count:1}],budget_dram:100},expect:{kind:'proposal'}};
const proposal = (item: Item) => ({id:'p',ops:[{type:'add',item}],checks:{ok:true},request_check:{ok:true}});
const catalog = [{name:'search_catalog',result:{status:'available',results:[{sku:'shop-table',kind:'table',size:[.4,.4,.5],price:100}]}}];

test('catalog requests reject invented SKU, size and price even if propose accepted them', () => {
  expect(measure({scene,scenario,proposal:proposal(addition)}).pass).toBe(false);
  for (const changed of [{sku:'invented'},{size:[.3,.3,.3] as [number,number,number]},{price:1}]) {
    expect(measure({scene,scenario,proposal:proposal({...addition,...changed}),tool_calls:catalog}).pass).toBe(false);
  }
});

test('catalog evidence and a reachable bedside surface can satisfy the requested function', () => {
  expect(measure({scene,scenario,proposal:proposal(addition),tool_calls:catalog}).pass).toBe(true);
  const far = measure({scene,scenario,proposal:proposal({...addition,pos:[5,5]}),tool_calls:catalog});
  expect(far.pass).toBe(false);
  expect(far.reasons.join(' ')).toMatch(/bedside/i);
});

test('an incidental negative word does not make an actual paint recommendation a scope decline', () => {
  const scope: Scenario = {...scenario,category:'out-of-scope',request:'Choose paint.',expect:{kind:'decline',decline_reason:'out_of_scope'}};
  expect(measure({scene,scenario:scope,final:"I don't recommend red; choose Brand X blue paint."}).pass).toBe(false);
  expect(measure({scene,scenario:scope,final:"I cannot choose paint colours; I can help with furniture layout."}).pass).toBe(true);
});
