import {test,expect} from 'vitest';
import {enrichTasteEvidence} from '../eval/taste-evidence.js';
test('first-time catalog items acquire exact inferred style evidence in the same grading run',async()=>{
 const cache:Record<string,any>={};const calls:string[]=[];
 await enrichTasteEvidence(cache,['abo:new'],async(name,args)=>{calls.push(name);return name==='get_item'?{id:args.item_id,kind:'table',name:'Wood table',styles:[],colors_image:['brown']}:{results:[{id:'abo:other',style_astra:['Modern']},{id:'abo:new',style_astra:['Rustic']}]};});
 expect(cache['abo:new'].styles_inferred).toEqual(['Rustic']);expect(calls).toEqual(['get_item','search_furniture']);
 await enrichTasteEvidence(cache,['abo:new'],async()=>{throw Error('known evidence must be cached');});
});
test('similar catalog results never supply another product’s style evidence',async()=>{
 const cache:Record<string,any>={};
 await enrichTasteEvidence(cache,['abo:new'],async name=>name==='get_item'?{id:'abo:new',kind:'table',name:'Table',styles:[],colors_image:['brown']}:{results:[{id:'abo:other',style_astra:['Bohemian']}]});
 expect(cache['abo:new'].styles_inferred).toBeUndefined();
});
