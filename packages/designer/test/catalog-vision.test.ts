import {expect,test} from 'vitest';
import {candidateSheet} from '../src/catalog-vision.js';
test('passes the catalog image to the model and rejects empty or oversized candidate sets',async()=>{
 const response:any={content:[{type:'text',text:'1. sku-a | chair'},{type:'image',mimeType:'image/jpeg',data:'/9j/AA=='}]};
 const result=await candidateSheet(['sku-a'],async ids=>{expect(ids).toEqual(['sku-a']);return response;});
 expect(result.content.some(c=>c.type==='image')).toBe(true);
 await expect(candidateSheet([],async()=>response)).rejects.toThrow();
 await expect(candidateSheet(Array.from({length:13},(_,i)=>String(i)),async()=>response)).rejects.toThrow();
 await expect(candidateSheet(['a'],async()=>({content:[{type:'text',text:'No known item ids.'}]}))).rejects.toThrow(/image/);
});
