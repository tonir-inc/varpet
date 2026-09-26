import {expect,test} from 'vitest';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {createDesignerHttpAdapter} from '../../../apps/editor/src/adapters/designer-http.js';
const image={name:'idea.png',dataUrl:'data:image/png;base64,iVBORw0KGgo='};
test('optional inspiration image travels on an arbitrary conversation turn',async()=>{
 let sent:any;
 const adapter=createDesignerHttpAdapter({catalog:localCatalog,conversationId:'second-turn',image,fetch:async(_u,init)=>{sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({type:'message',conversationId:'second-turn',message:'Light palette'})+'\n',{headers:{'content-type':'application/x-ndjson'}});}});
 await expect(adapter.propose(demoScene,2)).rejects.toThrow('Light palette');expect(sent.image).toEqual(image);expect(sent.conversationId).toBe('second-turn');
});
test('oversize inspiration is rejected before network',async()=>{
 let calls=0;
 const adapter=createDesignerHttpAdapter({catalog:localCatalog,image:{...image,dataUrl:'data:image/png;base64,'+'A'.repeat(350000)},fetch:async()=>{calls++;throw new Error('network');}});
 await expect(adapter.propose(demoScene,0)).rejects.toThrow(/image|256/i);expect(calls).toBe(0);
});
import {endDesignerConversation} from '../../../apps/editor/src/adapters/designer-http.js';
test('ending a conversation deletes only its private service scope',async()=>{
 let target='',method='';await endDesignerConversation('private-c1',{baseUrl:'http://127.0.0.1:8799',fetch:async(url,init)=>{target=String(url);method=init!.method!;return new Response('{"ok":true}');}});
 expect(target).toBe('http://127.0.0.1:8799/designer/conversations/private-c1');expect(method).toBe('DELETE');
 await expect(endDesignerConversation('../other',{fetch:async()=>{throw new Error('must not send');}})).rejects.toThrow('Invalid conversation');
});
